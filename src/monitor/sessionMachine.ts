// Pure state machine for one transcript session (agent-detection.md section 4). Turns transcript
// signals and elapsed silence into spawned, working, idle, and despawned. Every `now` is the
// monitor clock, passed in, so the machine is deterministic under test.
//
// Core invariant 2: these inputs come only from transcript activity, silence thresholds, file
// removal, and scope changes; nothing from the webview or the game reaches this module.
import { assertNever } from '../shared/assertNever';
import type { AgentState } from '../shared/protocol';

export type ActivityKind = 'prompt' | 'assistant' | 'toolUse' | 'toolResult' | 'turnEnd';
export type EndReason = 'fileRemoved' | 'outOfScope';

export interface SessionTimings {
  readonly debounceMs: number;
  readonly idleTimeoutMs: number;
  readonly toolTimeoutMs: number;
  readonly sessionEndTimeoutMs: number;
}

export interface SessionSnapshot {
  readonly state: AgentState;
  readonly toolName: string | null;
  readonly lastActivityAt: number;
  readonly toolPending: boolean;
  readonly turnEnded: boolean;
  readonly spawnedAt: number;
}

export interface DiscoverInput {
  readonly type: 'discover';
  readonly now: number;
  readonly lastActivityAt: number;
  readonly toolName: string | null;
  readonly toolPending: boolean;
  readonly turnEnded: boolean;
}

export type SessionInput =
  | {
      readonly type: 'activity';
      readonly now: number;
      readonly kind: ActivityKind;
      readonly toolName: string | null;
    }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'end'; readonly now: number; readonly reason: EndReason };

function silenceOf(session: SessionSnapshot, now: number): number {
  return Math.max(0, now - session.lastActivityAt);
}

/**
 * state 'spawned', or null if the file is stale (silence >= sessionEndTimeout).
 * A future lastActivityAt (clock skew) is clamped to `now`, so it counts as zero silence.
 */
export function createSession(
  input: DiscoverInput,
  timings: SessionTimings,
): SessionSnapshot | null {
  const lastActivityAt = Math.min(input.lastActivityAt, input.now);
  if (input.now - lastActivityAt >= timings.sessionEndTimeoutMs) {
    return null;
  }
  return {
    state: 'spawned',
    toolName: input.toolName,
    lastActivityAt,
    toolPending: input.toolPending,
    turnEnded: input.turnEnded,
    spawnedAt: input.now,
  };
}

function sameSnapshot(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.state === b.state &&
    a.toolName === b.toolName &&
    a.lastActivityAt === b.lastActivityAt &&
    a.toolPending === b.toolPending &&
    a.turnEnded === b.turnEnded &&
    a.spawnedAt === b.spawnedAt
  );
}

function applyActivity(
  session: SessionSnapshot,
  now: number,
  kind: ActivityKind,
  toolName: string | null,
): SessionSnapshot {
  // Activity never moves a session out of `spawned`; the first tick after the debounce does.
  const resumed: AgentState = session.state === 'idle' ? 'working' : session.state;
  switch (kind) {
    case 'prompt':
    case 'toolResult':
      return {
        ...session,
        state: resumed,
        lastActivityAt: now,
        toolPending: false,
        turnEnded: false,
      };
    case 'assistant':
      return { ...session, state: resumed, lastActivityAt: now, turnEnded: false };
    case 'toolUse':
      return {
        ...session,
        state: resumed,
        lastActivityAt: now,
        toolPending: true,
        turnEnded: false,
        toolName: toolName ?? session.toolName,
      };
    case 'turnEnd':
      return { ...session, lastActivityAt: now, toolPending: false, turnEnded: true };
    default:
      return assertNever(kind);
  }
}

function applyTick(
  session: SessionSnapshot,
  now: number,
  timings: SessionTimings,
): SessionSnapshot {
  const silence = silenceOf(session, now);
  if (silence >= timings.sessionEndTimeoutMs) {
    return { ...session, state: 'despawned' };
  }
  const idleThreshold = session.toolPending ? timings.toolTimeoutMs : timings.idleTimeoutMs;
  switch (session.state) {
    case 'spawned': {
      if (now - session.spawnedAt < timings.debounceMs) {
        return session;
      }
      const working = !session.turnEnded && silence < idleThreshold;
      return { ...session, state: working ? 'working' : 'idle' };
    }
    case 'working': {
      const quietAfterTurn = session.turnEnded && silence >= timings.debounceMs;
      const silent = !session.turnEnded && silence >= idleThreshold;
      return quietAfterTurn || silent ? { ...session, state: 'idle' } : session;
    }
    case 'idle':
    case 'despawned':
      return session;
    default:
      return assertNever(session.state);
  }
}

/** Pure; switch on input.type ends in assertNever. Returns a new snapshot (or the same one if nothing changed). */
export function nextSession(
  session: SessionSnapshot,
  input: SessionInput,
  timings: SessionTimings,
): SessionSnapshot {
  if (session.state === 'despawned') {
    return session;
  }
  let next: SessionSnapshot;
  switch (input.type) {
    case 'activity':
      next = applyActivity(session, input.now, input.kind, input.toolName);
      break;
    case 'tick':
      next = applyTick(session, input.now, timings);
      break;
    case 'end':
      next = { ...session, state: 'despawned' };
      break;
    default:
      return assertNever(input);
  }
  return sameSnapshot(next, session) ? session : next;
}
