// The pure session state machine (M3 plan test note 4): explicit `now` values, default timings.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertNever } from '../../src/shared/assertNever';
import { createSession, nextSession } from '../../src/monitor/sessionMachine';
import type {
  ActivityKind,
  SessionInput,
  SessionSnapshot,
  SessionTimings,
} from '../../src/monitor/sessionMachine';
import { DEFAULT_MONITOR_CONFIG } from '../../src/monitor/monitorConfig';

const T: SessionTimings = {
  debounceMs: 750,
  idleTimeoutMs: DEFAULT_MONITOR_CONFIG.idleTimeoutMs,
  toolTimeoutMs: DEFAULT_MONITOR_CONFIG.toolTimeoutMs,
  sessionEndTimeoutMs: DEFAULT_MONITOR_CONFIG.sessionEndTimeoutMs,
};
const T0 = 1_000_000;

function discover(
  now: number,
  lastActivityAt: number,
  extra: { toolPending?: boolean; turnEnded?: boolean; toolName?: string | null } = {},
): SessionSnapshot | null {
  return createSession(
    {
      type: 'discover',
      now,
      lastActivityAt,
      toolName: extra.toolName ?? null,
      toolPending: extra.toolPending ?? false,
      turnEnded: extra.turnEnded ?? false,
    },
    T,
  );
}

function must(session: SessionSnapshot | null): SessionSnapshot {
  assert.ok(session !== null, 'session expected');
  return session;
}

function tick(session: SessionSnapshot, now: number): SessionSnapshot {
  return nextSession(session, { type: 'tick', now }, T);
}

function act(
  session: SessionSnapshot,
  now: number,
  kind: ActivityKind,
  toolName: string | null = null,
): SessionSnapshot {
  return nextSession(session, { type: 'activity', now, kind, toolName }, T);
}

/** A working session whose last activity was at T0 (spawned, then debounce elapsed). */
function working(): SessionSnapshot {
  const spawned = must(discover(T0, T0));
  const next = tick(spawned, T0 + T.debounceMs);
  assert.equal(next.state, 'working');
  return next;
}

void describe('createSession', () => {
  void it('a fresh file starts as spawned', () => {
    const session = must(discover(T0, T0 - 1000));
    assert.equal(session.state, 'spawned');
    assert.equal(session.spawnedAt, T0);
  });

  void it('a file silent for the session-end window or longer is stale (null)', () => {
    assert.equal(discover(T0, T0 - T.sessionEndTimeoutMs), null);
    assert.equal(discover(T0, T0 - T.sessionEndTimeoutMs - 1), null);
    assert.notEqual(discover(T0, T0 - T.sessionEndTimeoutMs + 1), null);
  });

  void it('a future lastActivityAt (clock skew) counts as zero silence', () => {
    const session = must(discover(T0, T0 + 10 * 60_000));
    assert.equal(session.lastActivityAt, T0);
    assert.equal(tick(session, T0 + T.debounceMs).state, 'working');
  });

  void it('carries the tail summary: tool name, pending, turn ended', () => {
    const session = must(discover(T0, T0, { toolName: 'Bash', toolPending: true }));
    assert.equal(session.toolName, 'Bash');
    assert.equal(session.toolPending, true);
  });
});

void describe('spawned', () => {
  void it('stays spawned before the debounce and becomes working at exactly debounceMs', () => {
    const spawned = must(discover(T0, T0));
    assert.equal(tick(spawned, T0 + T.debounceMs - 1), spawned, 'same object when nothing changes');
    assert.equal(tick(spawned, T0 + T.debounceMs).state, 'working');
  });

  void it('a file already silent past the idle timeout goes idle after the debounce', () => {
    const spawned = must(discover(T0, T0 - T.idleTimeoutMs - 5000));
    assert.equal(tick(spawned, T0 + T.debounceMs - 1).state, 'spawned');
    assert.equal(tick(spawned, T0 + T.debounceMs).state, 'idle');
  });

  void it('a discovered turn end goes idle after the debounce', () => {
    const spawned = must(discover(T0, T0, { turnEnded: true }));
    assert.equal(tick(spawned, T0 + T.debounceMs).state, 'idle');
  });

  void it('activity never moves spawned out of spawned; only the tick does', () => {
    const spawned = must(discover(T0, T0));
    for (const kind of ['prompt', 'assistant', 'toolUse', 'toolResult'] as const) {
      assert.equal(act(spawned, T0 + 10, kind, 'Bash').state, 'spawned', kind);
    }
  });
});

void describe('working to idle', () => {
  void it('goes idle at exactly idleTimeout of silence, not 1 ms before', () => {
    const session = working();
    assert.equal(tick(session, T0 + T.idleTimeoutMs - 1).state, 'working');
    assert.equal(tick(session, T0 + T.idleTimeoutMs).state, 'idle');
  });

  void it('a pending tool keeps working until toolTimeout', () => {
    const session = act(working(), T0 + 100, 'toolUse', 'Bash');
    assert.equal(tick(session, T0 + 100 + T.idleTimeoutMs).state, 'working');
    assert.equal(tick(session, T0 + 100 + T.toolTimeoutMs - 1).state, 'working');
    assert.equal(tick(session, T0 + 100 + T.toolTimeoutMs).state, 'idle');
  });

  void it('toolResult clears the pending tool, so the normal idle timeout applies again', () => {
    const pending = act(working(), T0 + 100, 'toolUse', 'Bash');
    const done = act(pending, T0 + 200, 'toolResult');
    assert.equal(done.toolPending, false);
    assert.equal(tick(done, T0 + 200 + T.idleTimeoutMs).state, 'idle');
  });

  void it('turnEnd goes idle after debounceMs of quiet, not before', () => {
    const ended = act(working(), T0 + 5000, 'turnEnd');
    assert.equal(tick(ended, T0 + 5000 + T.debounceMs - 1).state, 'working');
    assert.equal(tick(ended, T0 + 5000 + T.debounceMs).state, 'idle');
  });

  void it('new activity inside the turn-end window cancels it', () => {
    const ended = act(working(), T0 + 5000, 'turnEnd');
    const resumed = act(ended, T0 + 5000 + 400, 'prompt');
    assert.equal(resumed.turnEnded, false);
    assert.equal(tick(resumed, T0 + 5000 + T.debounceMs + 10).state, 'working');
  });
});

void describe('idle', () => {
  function idle(): SessionSnapshot {
    const session = tick(working(), T0 + T.idleTimeoutMs);
    assert.equal(session.state, 'idle');
    return session;
  }

  void it('returns to working on every activity kind except turnEnd', () => {
    const base = idle();
    for (const kind of ['prompt', 'assistant', 'toolUse', 'toolResult'] as const) {
      assert.equal(act(base, T0 + T.idleTimeoutMs + 10, kind, 'Bash').state, 'working', kind);
    }
    assert.equal(act(base, T0 + T.idleTimeoutMs + 10, 'turnEnd').state, 'idle');
  });

  void it('keeps the last tool name', () => {
    const withTool = act(working(), T0 + 10, 'toolUse', 'Grep');
    const done = act(withTool, T0 + 20, 'toolResult');
    assert.equal(tick(done, T0 + 20 + T.idleTimeoutMs).toolName, 'Grep');
  });

  void it('a toolUse with a null name keeps the previous tool name', () => {
    const first = act(working(), T0 + 10, 'toolUse', 'Grep');
    assert.equal(act(first, T0 + 20, 'toolUse', null).toolName, 'Grep');
  });

  void it('ticks alone never leave idle', () => {
    const base = idle();
    assert.equal(tick(base, T0 + T.idleTimeoutMs + 1000), base);
  });
});

void describe('despawn and end', () => {
  void it('despawns at sessionEndTimeout of silence from working and from idle', () => {
    const fromWorking = working();
    assert.equal(tick(fromWorking, T0 + T.sessionEndTimeoutMs - 1).state, 'idle');
    assert.equal(tick(fromWorking, T0 + T.sessionEndTimeoutMs).state, 'despawned');
    const idleSession = tick(working(), T0 + T.idleTimeoutMs);
    assert.equal(tick(idleSession, T0 + T.sessionEndTimeoutMs - 1).state, 'idle');
    assert.equal(tick(idleSession, T0 + T.sessionEndTimeoutMs).state, 'despawned');
  });

  void it('idle does not despawn before the session-end window (idle is not the end)', () => {
    const idleSession = tick(working(), T0 + T.idleTimeoutMs);
    for (let minutes = 2; minutes < 30; minutes += 4) {
      assert.equal(tick(idleSession, T0 + minutes * 60_000).state, 'idle');
    }
  });

  void it('a tick long after spawn despawns even a session that never left spawned', () => {
    const spawned = must(discover(T0, T0));
    assert.equal(tick(spawned, T0 + T.sessionEndTimeoutMs).state, 'despawned');
  });

  void it('end from every live state gives despawned, for both reasons', () => {
    const states: SessionSnapshot[] = [
      must(discover(T0, T0)),
      working(),
      tick(working(), T0 + T.idleTimeoutMs),
    ];
    assert.deepEqual(
      states.map((s) => s.state),
      ['spawned', 'working', 'idle'],
    );
    for (const session of states) {
      for (const reason of ['fileRemoved', 'outOfScope'] as const) {
        const ended = nextSession(session, { type: 'end', now: T0 + 1, reason }, T);
        assert.equal(ended.state, 'despawned');
      }
    }
  });

  void it('despawned is terminal: no input changes it', () => {
    const gone = nextSession(working(), { type: 'end', now: T0, reason: 'fileRemoved' }, T);
    assert.equal(act(gone, T0 + 1, 'prompt'), gone);
    assert.equal(tick(gone, T0 + 2), gone);
  });
});

void describe('SessionInput is exhaustive', () => {
  void it('a switch over input.type ending in assertNever compiles and covers every input', () => {
    const label = (input: SessionInput): string => {
      switch (input.type) {
        case 'activity':
          return 'a';
        case 'tick':
          return 't';
        case 'end':
          return 'e';
        default:
          return assertNever(input);
      }
    };
    assert.equal(label({ type: 'tick', now: 0 }), 't');
  });
});
