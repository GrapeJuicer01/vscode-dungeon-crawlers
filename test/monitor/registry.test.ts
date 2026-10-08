// AgentRegistry: emission coalescing, caps, snapshots, listener isolation, disposal
// (M3 plan test note 6). Virtual time only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AgentRegistry,
  MAX_SIMULATED_AGENTS,
  MAX_TRANSCRIPT_AGENTS,
} from '../../src/monitor/AgentRegistry';
import { createAgentListMessage, isAgentInfo, MAX_AGENTS } from '../../src/shared/protocol';
import type { AgentInfo } from '../../src/shared/protocol';
import { FakeTime, RecordingLogger, settle } from '../support/monitorFakes';

function make(debounceMs = 750): {
  time: FakeTime;
  logger: RecordingLogger;
  registry: AgentRegistry;
  events: AgentInfo[];
  at: number[];
} {
  const time = new FakeTime();
  const logger = new RecordingLogger();
  const registry = new AgentRegistry({ clock: time, timers: time, logger }, debounceMs);
  const events: AgentInfo[] = [];
  const at: number[] = [];
  registry.onDidChange((agent) => {
    events.push(agent);
    at.push(time.now());
  });
  return { time, logger, registry, events, at };
}

void describe('AgentRegistry emission', () => {
  void it('the first emission of an agent is immediate', () => {
    const { registry, events } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'spawned', null);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.state, 'spawned');
  });

  void it('tool changes every 100 ms for 3 s emit at most once per 750 ms, ending on the last value', async () => {
    const { time, registry, events, at } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Tool0');
    for (let i = 1; i <= 30; i += 1) {
      await time.advance(100);
      registry.upsert('a', 'transcript', 'Agent a', 'working', `Tool${i}`);
    }
    await time.advance(2000);
    for (let i = 1; i < at.length; i += 1) {
      assert.ok(
        (at[i] ?? 0) - (at[i - 1] ?? 0) >= 750,
        `gap ${i}: ${(at[i] ?? 0) - (at[i - 1] ?? 0)}`,
      );
    }
    assert.ok(events.length <= 6, `emitted ${events.length} times`);
    assert.equal(events.at(-1)?.toolName, 'Tool30');
  });

  void it('re-upserting an identical snapshot does not emit', async () => {
    const { time, registry, events } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Bash');
    await time.advance(5000);
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Bash');
    await time.advance(5000);
    assert.equal(events.length, 1);
  });

  void it('a change that is reverted before the debounce fires emits nothing', async () => {
    const { time, registry, events } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Bash');
    await time.advance(100);
    registry.upsert('a', 'transcript', 'Agent a', 'idle', 'Bash');
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Bash');
    await time.advance(2000);
    assert.equal(events.length, 1);
    assert.equal(time.pendingTimers, 0);
  });

  void it('despawned is immediate, cancels a pending emission, and removes the agent', async () => {
    const { time, registry, events } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Bash');
    await time.advance(100);
    registry.upsert('a', 'transcript', 'Agent a', 'idle', 'Bash');
    assert.equal(time.pendingTimers, 1);
    registry.upsert('a', 'transcript', 'Agent a', 'despawned', 'Bash');
    assert.equal(events.at(-1)?.state, 'despawned');
    assert.equal(time.pendingTimers, 0);
    assert.equal(registry.has('a'), false);
    assert.deepEqual(registry.snapshot(), []);
    await time.advance(5000);
    assert.equal(events.length, 2, 'spawn-time working and despawned only');
  });

  void it('despawning an unknown agent emits nothing', () => {
    const { registry, events } = make();
    assert.equal(registry.upsert('nope', 'transcript', 'Agent n', 'despawned', null), true);
    assert.equal(events.length, 0);
  });

  void it('debounceMs 0 emits every change at once', () => {
    const { registry, events } = make(0);
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'T1');
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'T2');
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'T3');
    assert.deepEqual(
      events.map((e) => e.toolName),
      ['T1', 'T2', 'T3'],
    );
  });

  void it('timestamps never decrease and equal the clock at the change', async () => {
    const { time, registry, events } = make(0);
    registry.upsert('a', 'transcript', 'Agent a', 'spawned', null);
    const t0 = time.now();
    await time.advance(1234);
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Bash');
    const t1 = time.now();
    time.set(t0 - 10_000); // the clock goes backwards
    registry.upsert('a', 'transcript', 'Agent a', 'idle', 'Bash');
    assert.deepEqual(
      events.map((e) => e.timestamp),
      [t0, t1, t1],
    );
  });

  void it('the timestamp alone never triggers an emission', async () => {
    const { time, registry, events } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'idle', 'Bash');
    await time.advance(10_000);
    registry.upsert('a', 'transcript', 'Agent a', 'idle', 'Bash');
    assert.equal(events.length, 1);
  });
});

void describe('AgentRegistry caps', () => {
  void it('refuses the 49th transcript agent and the 17th simulated agent, with one trace each', () => {
    const { registry, logger } = make(0);
    for (let i = 0; i < MAX_TRANSCRIPT_AGENTS; i += 1) {
      assert.equal(registry.upsert(`t-${i}`, 'transcript', 'Agent t', 'working', null), true);
    }
    assert.equal(registry.upsert('t-extra', 'transcript', 'Agent t', 'working', null), false);
    assert.equal(registry.upsert('t-extra2', 'transcript', 'Agent t', 'working', null), false);
    for (let i = 0; i < MAX_SIMULATED_AGENTS; i += 1) {
      assert.equal(registry.upsert(`sim-${i}-0`, 'simulator', 'Sim x', 'working', null), true);
    }
    assert.equal(registry.upsert('sim-99-0', 'simulator', 'Sim x', 'working', null), false);
    assert.equal(MAX_TRANSCRIPT_AGENTS + MAX_SIMULATED_AGENTS, MAX_AGENTS);
    assert.equal(registry.count('transcript'), 48);
    assert.equal(registry.count('simulator'), 16);
    assert.equal(registry.snapshot().length, MAX_AGENTS);
    assert.equal(
      logger.messages('trace').filter((m) => m.includes('cap reached (transcript)')).length,
      1,
      'rate-limited to one line',
    );
    assert.equal(
      logger.messages('trace').filter((m) => m.includes('cap reached (simulator)')).length,
      1,
    );
  });

  void it('a refused agent is not in the snapshot; a freed slot can be reused', () => {
    const { registry } = make(0);
    for (let i = 0; i < MAX_TRANSCRIPT_AGENTS; i += 1) {
      registry.upsert(`t-${i}`, 'transcript', 'Agent t', 'working', null);
    }
    registry.upsert('late', 'transcript', 'Agent t', 'working', null);
    assert.equal(registry.has('late'), false);
    registry.upsert('t-0', 'transcript', 'Agent t', 'despawned', null);
    assert.equal(registry.upsert('late', 'transcript', 'Agent t', 'working', null), true);
  });

  void it('refuses fields that fail the protocol rules instead of emitting them', () => {
    const { registry, events } = make(0);
    assert.equal(registry.upsert('bad id!', 'transcript', 'Agent a', 'working', null), false);
    assert.equal(registry.upsert('ok', 'transcript', '', 'working', null), false);
    assert.equal(events.length, 0);
  });

  void it('an invalid tool name is normalized to null, not emitted', () => {
    const { registry, events } = make(0);
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'Not valid');
    assert.equal(events[0]?.toolName, null);
  });
});

void describe('AgentRegistry snapshot', () => {
  void it('is frozen, in insertion order, valid, and survives createAgentListMessage unchanged', () => {
    const { registry } = make(0);
    for (const id of ['c', 'a', 'b']) {
      registry.upsert(id, 'transcript', `Agent ${id}`, 'working', 'Bash');
    }
    const snapshot = registry.snapshot();
    assert.ok(Object.isFrozen(snapshot));
    assert.deepEqual(
      snapshot.map((a) => a.id),
      ['c', 'a', 'b'],
    );
    for (const agent of snapshot) {
      assert.ok(isAgentInfo(agent));
      assert.ok(Object.isFrozen(agent));
    }
    assert.deepEqual(createAgentListMessage(snapshot).agents, [...snapshot]);
  });

  void it('is cached until something changes', () => {
    const { registry } = make(0);
    registry.upsert('a', 'transcript', 'Agent a', 'working', null);
    assert.equal(registry.snapshot(), registry.snapshot());
    const before = registry.snapshot();
    registry.upsert('a', 'transcript', 'Agent a', 'idle', null);
    assert.notEqual(registry.snapshot(), before);
  });

  void it('holds what was last emitted, not a pending change (reload rebuild equals the stream)', async () => {
    const { time, registry, events } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'T0');
    await time.advance(100);
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'T1');
    assert.equal(registry.snapshot()[0]?.toolName, 'T0');
    await time.advance(1000);
    assert.equal(registry.snapshot()[0]?.toolName, 'T1');
    assert.deepEqual([...registry.snapshot()], [events.at(-1)]);
  });

  void it('ids and count are per origin', () => {
    const { registry } = make(0);
    registry.upsert('a', 'transcript', 'Agent a', 'working', null);
    registry.upsert('sim-0-0', 'simulator', 'Sim Ada', 'working', null);
    assert.deepEqual(registry.ids('transcript'), ['a']);
    assert.deepEqual(registry.ids('simulator'), ['sim-0-0']);
    assert.equal(registry.count('transcript'), 1);
  });
});

void describe('AgentRegistry listeners and disposal', () => {
  void it('a throwing listener does not stop the next listener and is not rethrown; the error log carries a code only', () => {
    const { registry, logger } = make(0);
    const seen: string[] = [];
    registry.onDidChange(() => {
      throw new Error('LISTENER_SECRET_TEXT');
    });
    registry.onDidChange((agent) => seen.push(agent.id));
    assert.doesNotThrow(() => registry.upsert('a', 'transcript', 'Agent a', 'working', null));
    assert.deepEqual(seen, ['a']);
    assert.ok(logger.messages('error').some((m) => m.includes('(Error)')));
    assert.ok(!logger.text().includes('LISTENER_SECRET_TEXT'));
  });

  void it('a disposed subscription receives nothing more', () => {
    const { registry } = make(0);
    const seen: string[] = [];
    const subscription = registry.onDidChange((agent) => seen.push(agent.id));
    registry.upsert('a', 'transcript', 'Agent a', 'working', null);
    subscription.dispose();
    registry.upsert('b', 'transcript', 'Agent b', 'working', null);
    assert.deepEqual(seen, ['a']);
  });

  void it('after dispose nothing is emitted and no timer is pending', async () => {
    const { time, registry, events } = make();
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'T0');
    await time.advance(10);
    registry.upsert('a', 'transcript', 'Agent a', 'working', 'T1');
    assert.equal(time.pendingTimers, 1);
    registry.dispose();
    assert.equal(time.pendingTimers, 0);
    const count = events.length;
    assert.equal(registry.upsert('b', 'transcript', 'Agent b', 'working', null), false);
    await time.advance(10_000);
    await settle();
    assert.equal(events.length, count);
    assert.doesNotThrow(() => registry.dispose());
  });

  void it('a throwing logger never escapes the registry', () => {
    const { registry, logger } = make(0);
    logger.throws = true;
    registry.onDidChange(() => {
      throw new Error('x');
    });
    assert.doesNotThrow(() => registry.upsert('a', 'transcript', 'Agent a', 'working', null));
  });
});
