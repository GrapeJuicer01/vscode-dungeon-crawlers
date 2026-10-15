// The monitor's agent records, emission coalescing, agent caps, and the AgentInfo snapshot
// (agent-detection.md section 5). Every record is built through the protocol's toAgentInfo, so
// nothing but the five allow-listed fields can leave (Core invariant 7).
//
// The snapshot holds what was last emitted per agent, not pending changes, so a webview rebuilt
// from snapshot() always equals one that saw every emission (Core invariant 4, reload rebuild).
import { MAX_AGENTS, toAgentInfo } from '../shared/protocol';
import type { AgentInfo, AgentState } from '../shared/protocol';
import { normalizeToolName } from './agentNames';
import {
  createSafeLogger,
  LOG_RATE_LIMIT_MS,
  RateLimitedLogger,
  safeErrorCode,
} from './monitorLog';
import type { Clock, MonitorDisposable, MonitorLogger, TimerPort } from './ports';

/** Per-origin caps; together they equal the protocol's MAX_AGENTS (agent-detection.md section 9). */
export const MAX_TRANSCRIPT_AGENTS = 48;
export const MAX_SIMULATED_AGENTS = 16;

export type AgentOrigin = 'transcript' | 'simulator';

export interface AgentRegistryDeps {
  readonly clock: Clock;
  readonly timers: TimerPort;
  readonly logger: MonitorLogger;
}

interface AgentRecord {
  readonly origin: AgentOrigin;
  /** Latest known values (validated). */
  current: AgentInfo;
  /** Last emitted values; what snapshot() reports. */
  emitted: AgentInfo;
  lastEmitAt: number;
  cancelPending: (() => void) | null;
}

const NO_AGENTS: readonly AgentInfo[] = Object.freeze([]);

function capOf(origin: AgentOrigin): number {
  return origin === 'transcript' ? MAX_TRANSCRIPT_AGENTS : MAX_SIMULATED_AGENTS;
}

/**
 * Same displayed values. Assumption: a name change also counts as a change to emit (names only
 * change if a project label changes); the timestamp alone never triggers an emission.
 */
function sameDisplay(a: AgentInfo, b: AgentInfo): boolean {
  return a.state === b.state && a.toolName === b.toolName && a.name === b.name;
}

function frozenInfo(info: AgentInfo): AgentInfo | undefined {
  const copy = toAgentInfo(info);
  return copy === undefined ? undefined : Object.freeze(copy);
}

export class AgentRegistry implements MonitorDisposable {
  readonly #clock: Clock;
  readonly #timers: TimerPort;
  readonly #log: MonitorLogger;
  readonly #limited: RateLimitedLogger;
  readonly #records = new Map<string, AgentRecord>();
  readonly #listeners = new Set<(agent: AgentInfo) => void>();
  #debounceMs: number;
  #cache: readonly AgentInfo[] | null = null;
  #lastGood: readonly AgentInfo[] = NO_AGENTS;
  #disposed = false;

  constructor(deps: AgentRegistryDeps, debounceMs: number) {
    this.#clock = deps.clock;
    this.#timers = deps.timers;
    this.#log = createSafeLogger(deps.logger);
    this.#limited = new RateLimitedLogger(deps.logger, deps.clock, LOG_RATE_LIMIT_MS);
    this.#debounceMs = Math.max(0, debounceMs);
  }

  /** Insert or update; 'despawned' emits immediately and removes. Refuses (trace, rate-limited) beyond the per-origin cap. Returns false if refused. */
  upsert(
    id: string,
    origin: AgentOrigin,
    name: string,
    state: AgentState,
    toolName: string | null,
  ): boolean {
    if (this.#disposed) {
      return false;
    }
    const now = this.#clock.now();
    const tool = normalizeToolName(toolName);
    const record = this.#records.get(id);
    if (record === undefined) {
      return this.#insert(id, origin, name, state, tool, now);
    }
    if (state === 'despawned') {
      this.#remove(id, record, now);
      return true;
    }
    const current = record.current;
    const changed = state !== current.state || tool !== current.toolName;
    const next = frozenInfo({
      id,
      name,
      state,
      toolName: tool,
      timestamp: changed ? Math.max(now, current.timestamp) : current.timestamp,
    });
    if (next === undefined) {
      this.#limited.trace('monitor: agent refused (invalid fields)');
      return false;
    }
    if (sameDisplay(next, record.emitted)) {
      // Back to what the webview already shows: nothing to emit.
      record.current = record.emitted;
      this.#cancelPending(record);
      return true;
    }
    record.current = next;
    this.#scheduleEmit(id, record, now);
    return true;
  }

  has(id: string): boolean {
    return this.#records.has(id);
  }

  count(origin: AgentOrigin): number {
    let total = 0;
    for (const record of this.#records.values()) {
      if (record.origin === origin) {
        total += 1;
      }
    }
    return total;
  }

  ids(origin: AgentOrigin): readonly string[] {
    const out: string[] = [];
    for (const [id, record] of this.#records) {
      if (record.origin === origin) {
        out.push(id);
      }
    }
    return out;
  }

  /** Cached frozen array built through toAgentInfo; insertion order; never throws. */
  snapshot(): readonly AgentInfo[] {
    try {
      if (this.#cache === null) {
        this.#cache = Object.freeze([...this.#records.values()].map((record) => record.emitted));
        this.#lastGood = this.#cache;
      }
      return this.#cache;
    } catch {
      return this.#lastGood;
    }
  }

  onDidChange(listener: (agent: AgentInfo) => void): MonitorDisposable {
    const entry = (agent: AgentInfo): void => listener(agent);
    this.#listeners.add(entry);
    return {
      dispose: () => {
        this.#listeners.delete(entry);
      },
    };
  }

  setDebounce(debounceMs: number): void {
    this.#debounceMs = Math.max(0, debounceMs);
  }

  /** Cancels pending emissions; emits nothing afterwards. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const record of this.#records.values()) {
      this.#cancelPending(record);
    }
    this.#listeners.clear();
  }

  #insert(
    id: string,
    origin: AgentOrigin,
    name: string,
    state: AgentState,
    toolName: string | null,
    now: number,
  ): boolean {
    if (state === 'despawned') {
      return true;
    }
    if (this.count(origin) >= capOf(origin) || this.#records.size >= MAX_AGENTS) {
      this.#limited.trace('monitor: agent cap reached (' + origin + ')');
      return false;
    }
    const info = frozenInfo({ id, name, state, toolName, timestamp: now });
    if (info === undefined) {
      this.#limited.trace('monitor: agent refused (invalid fields)');
      return false;
    }
    // The first emission of a record is immediate.
    this.#records.set(id, {
      origin,
      current: info,
      emitted: info,
      lastEmitAt: now,
      cancelPending: null,
    });
    this.#cache = null;
    this.#dispatch(info);
    return true;
  }

  #remove(id: string, record: AgentRecord, now: number): void {
    this.#cancelPending(record);
    this.#records.delete(id);
    this.#cache = null;
    const info = frozenInfo({
      id,
      name: record.current.name,
      state: 'despawned',
      toolName: record.current.toolName,
      timestamp: Math.max(now, record.current.timestamp),
    });
    if (info !== undefined) {
      this.#dispatch(info);
    }
  }

  #scheduleEmit(id: string, record: AgentRecord, now: number): void {
    if (record.cancelPending !== null) {
      // A trailing emission is already scheduled; it will carry the latest values.
      return;
    }
    const wait = record.lastEmitAt + this.#debounceMs - now;
    if (this.#debounceMs === 0 || wait <= 0) {
      this.#emit(record);
      return;
    }
    record.cancelPending = this.#timers.setTimeout(() => {
      try {
        record.cancelPending = null;
        if (!this.#disposed && this.#records.get(id) === record) {
          this.#emit(record);
        }
      } catch (error: unknown) {
        this.#log.error('monitor: emission failed (' + safeErrorCode(error) + ')');
      }
    }, wait);
  }

  #emit(record: AgentRecord): void {
    this.#cancelPending(record);
    if (sameDisplay(record.current, record.emitted)) {
      return;
    }
    record.emitted = record.current;
    record.lastEmitAt = this.#clock.now();
    this.#cache = null;
    this.#dispatch(record.emitted);
  }

  #cancelPending(record: AgentRecord): void {
    const cancel = record.cancelPending;
    record.cancelPending = null;
    if (cancel !== null) {
      try {
        cancel();
      } catch (error: unknown) {
        this.#log.error('monitor: timer cancel failed (' + safeErrorCode(error) + ')');
      }
    }
  }

  #dispatch(agent: AgentInfo): void {
    if (this.#disposed) {
      return;
    }
    const tool = agent.toolName === null ? '' : ' (' + agent.toolName + ')';
    this.#log.trace('monitor: agent ' + agent.id + ' ' + agent.state + tool);
    for (const listener of [...this.#listeners]) {
      try {
        listener(agent);
      } catch (error: unknown) {
        this.#log.error('monitor: agent listener failed (' + safeErrorCode(error) + ')');
      }
    }
  }
}
