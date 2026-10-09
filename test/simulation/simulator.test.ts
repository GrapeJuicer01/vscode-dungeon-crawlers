// SimulatorSource and its AgentMonitor control (M3 plan test notes 12 and 13). Virtual time.
//
// The integration test at the bottom is the "simulation-driven integration test" of the testing
// strategy (section 6): the SimulatorSource drives full hero lifecycles through AgentMonitor and a
// real WebviewBridge, and the webview-side mirror (HostStateMirror) is asserted to follow host
// events only. Heroes are not drawn until M4; the mirror is what the scene is built from.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SIMULATOR_RESUME_MS } from '../../src/monitor/AgentMonitor';
import { SIMULATED_ID_PREFIX, SIMULATOR_TOOLS } from '../../src/monitor/SimulatorSource';
import { createAgentListMessage, isAgentInfo, parseHostMessage } from '../../src/shared/protocol';
import type { AgentInfo } from '../../src/shared/protocol';
import { HostStateMirror } from '../../src/webview/hostState';
import { handleHostMessage } from '../../src/webview/hostMessages';
import { SESSION_A, userLine } from '../support/monitorFakes';
import { monitorRig, sessionFile } from '../support/monitorRig';
import type { MonitorRig } from '../support/monitorRig';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

function simRig(count = 3, extra: Parameters<typeof monitorRig>[0] = {}): MonitorRig {
  return monitorRig({
    ...extra,
    config: { simulator: 'on', simulatorAgentCount: count, debounceMs: 100, ...extra.config },
  });
}

function sequenceOf(rig: MonitorRig, id: string): AgentInfo[] {
  return rig.changes.filter((c) => c.id === id);
}

void describe('SimulatorSource: determinism and shape', () => {
  void it('the same seed and clock give identical emission sequences; a different seed differs', async () => {
    const run = async (seed: number): Promise<string> => {
      const rig = simRig(3, { seed });
      const t0 = rig.time.now();
      await rig.time.advance(5 * MINUTE);
      return JSON.stringify(rig.changes.map((c) => [c.id, c.state, c.toolName, c.timestamp - t0]));
    };
    const first = await run(1234);
    assert.equal(await run(1234), first);
    assert.notEqual(await run(4321), first);
  });

  void it('ids, names, and tools follow the documented shape and every emission is a valid AgentInfo', async () => {
    const rig = simRig(4);
    await rig.time.advance(5 * MINUTE);
    assert.ok(rig.changes.length > 20);
    for (const change of rig.changes) {
      assert.ok(isAgentInfo(change), JSON.stringify(change));
      assert.match(change.id, /^sim-\d+-\d+$/);
      assert.ok(change.id.startsWith(SIMULATED_ID_PREFIX));
      assert.match(change.name, /^Sim \S/);
      assert.ok(change.toolName === null || SIMULATOR_TOOLS.includes(change.toolName));
    }
  });

  void it('each slot goes spawned, working (tool changes), idle, ... despawned, and respawns with generation + 1', async () => {
    const rig = simRig(2);
    await rig.time.advance(10 * MINUTE);
    for (const slot of [0, 1]) {
      const ids = [
        ...new Set(rig.changes.filter((c) => c.id.startsWith(`sim-${slot}-`)).map((c) => c.id)),
      ];
      assert.deepEqual(
        ids.slice(0, 3),
        [`sim-${slot}-0`, `sim-${slot}-1`, `sim-${slot}-2`],
        'generation increments',
      );
      const first = sequenceOf(rig, `sim-${slot}-0`).map((c) => c.state);
      assert.equal(first[0], 'spawned');
      assert.equal(first.at(-1), 'despawned');
      assert.ok(first.includes('working') && first.includes('idle'));
      assert.equal(first.filter((s) => s === 'despawned').length, 1);
    }
  });

  void it('a working agent changes tools several times while working', async () => {
    const rig = simRig(1);
    await rig.time.advance(60 * SECOND);
    const tools = new Set(
      sequenceOf(rig, 'sim-0-0')
        .map((c) => c.toolName)
        .filter((t) => t !== null),
    );
    assert.ok(tools.size >= 3, [...tools].join());
  });

  void it('slots are staggered: slot 0 spawns at once, slot 1 after 1.5 s', async () => {
    const rig = simRig(2);
    const t0 = rig.time.now();
    await rig.time.advance(SECOND);
    const spawnedIds = (): string[] =>
      rig.changes.filter((c) => c.state === 'spawned').map((c) => c.id);
    assert.deepEqual(spawnedIds(), ['sim-0-0']);
    await rig.time.advance(1000);
    assert.deepEqual(spawnedIds(), ['sim-0-0', 'sim-1-0']);
    const second = rig.changes.find((c) => c.id === 'sim-1-0');
    assert.equal((second?.timestamp ?? 0) - t0, 1500);
  });

  void it('the simulator never models damage, health, or death: only the four lifecycle states appear', async () => {
    const rig = simRig(3);
    await rig.time.advance(10 * MINUTE);
    assert.deepEqual([...new Set(rig.changes.map((c) => c.state))].sort(), [
      'despawned',
      'idle',
      'spawned',
      'working',
    ]);
    for (const change of rig.changes) {
      assert.deepEqual(Object.keys(change).sort(), [
        'id',
        'name',
        'state',
        'timestamp',
        'toolName',
      ]);
    }
  });
});

void describe('AgentMonitor simulator modes', () => {
  void it('on: runs beside real agents', async () => {
    const rig = simRig(2);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(10 * SECOND);
    assert.ok(rig.changes.some((c) => c.id === SESSION_A));
    assert.ok(rig.changes.some((c) => c.id.startsWith('sim-') && c.state === 'working'));
    assert.equal(
      rig.changes.filter((c) => c.id.startsWith('sim-') && c.state === 'despawned').length,
      0,
    );
  });

  void it('off: never runs', async () => {
    const rig = monitorRig({ config: { simulator: 'off' } });
    await rig.time.advance(10 * MINUTE);
    assert.deepEqual(rig.changes, []);
  });

  void it('auto: starts only after the first scan, and only with zero transcript agents', async () => {
    const rig = monitorRig({ config: { simulator: 'auto', debounceMs: 100 } });
    assert.equal(rig.changes.length, 0, 'nothing before the first scan finishes');
    await rig.time.advance(2 * SECOND);
    assert.ok(rig.changes.some((c) => c.id === 'sim-0-0'));
  });

  void it('auto: never starts when a real session exists at startup', async () => {
    const rig = monitorRig({ config: { simulator: 'auto' }, start: false });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.bridge.handleMessage({ type: 'ready' });
    rig.monitor.start();
    await rig.time.advance(2 * MINUTE);
    assert.ok(rig.changes.length > 0);
    assert.ok(rig.changes.every((c) => !c.id.startsWith('sim-')));
  });

  void it('auto: despawns every simulated agent when a real agent spawns, real spawn first', async () => {
    const rig = monitorRig({
      config: { simulator: 'auto', simulatorAgentCount: 3, debounceMs: 100 },
    });
    await rig.time.advance(10 * SECOND);
    const live = rig.monitor.getAgents().filter((a) => a.id.startsWith('sim-'));
    assert.ok(live.length >= 1);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    const mark = rig.changes.length;
    await rig.time.advance(3 * SECOND);
    const after = rig.changes.slice(mark);
    const realSpawn = after.findIndex((c) => c.id === SESSION_A && c.state === 'spawned');
    const firstSimDespawn = after.findIndex(
      (c) => c.id.startsWith('sim-') && c.state === 'despawned',
    );
    assert.ok(
      realSpawn >= 0 && firstSimDespawn > realSpawn,
      'real spawn is observed before simulated agents leave',
    );
    assert.deepEqual(
      rig.monitor.getAgents().filter((a) => a.id.startsWith('sim-')),
      [],
    );
    await rig.time.advance(2 * MINUTE);
    assert.ok(
      rig.changes.slice(mark).every((c) => !c.id.startsWith('sim-') || c.state === 'despawned'),
      'no new simulated spawns while a real agent lives',
    );
  });

  void it('auto: restarts 10 s after the last real agent despawns, not before', async () => {
    const rig = monitorRig({
      config: { simulator: 'auto', simulatorAgentCount: 2, debounceMs: 100 },
      start: false,
    });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.bridge.handleMessage({ type: 'ready' });
    rig.monitor.start();
    await rig.time.advance(5 * SECOND);
    assert.ok(rig.changes.every((c) => !c.id.startsWith('sim-')));
    rig.fs.remove(sessionFile(SESSION_A));
    await rig.time.advance(2 * SECOND);
    const despawn = rig.changes.find((c) => c.id === SESSION_A && c.state === 'despawned');
    assert.ok(despawn !== undefined);
    await rig.time.advance(SIMULATOR_RESUME_MS - 3 * SECOND);
    assert.ok(
      rig.changes.every((c) => !c.id.startsWith('sim-')),
      'still waiting',
    );
    await rig.time.advance(3 * SECOND);
    const firstSim = rig.changes.find((c) => c.id.startsWith('sim-'));
    assert.ok(firstSim !== undefined, 'restarted');
    assert.ok(firstSim.timestamp - despawn.timestamp >= SIMULATOR_RESUME_MS);
  });

  void it('changing simulatorAgentCount restarts with the new count; switching to off despawns all', async () => {
    const rig = simRig(2);
    await rig.time.advance(10 * SECOND);
    assert.equal(rig.monitor.getAgents().length, 2);
    rig.monitor.updateConfig({ ...simConfig(), simulatorAgentCount: 4 });
    await rig.time.advance(10 * SECOND);
    const liveSim = rig.monitor.getAgents().filter((a) => a.id.startsWith('sim-'));
    assert.equal(liveSim.length, 4);
    rig.monitor.updateConfig({ ...simConfig(), simulator: 'off' });
    await rig.time.advance(0);
    assert.deepEqual(rig.monitor.getAgents(), []);
    await rig.time.advance(MINUTE);
    assert.deepEqual(rig.monitor.getAgents(), []);
  });

  void it('start() is idempotent for the same count (no duplicate agents)', async () => {
    const rig = simRig(2);
    await rig.time.advance(10 * SECOND);
    rig.monitor.updateConfig(simConfig());
    rig.monitor.updateConfig(simConfig());
    await rig.time.advance(SECOND);
    assert.equal(
      new Set(rig.changes.filter((c) => c.state === 'spawned').map((c) => c.id)).size,
      2,
    );
  });
});

/** The values simRig(2) starts with, spelled out because the rig does not expose its config. */
function simConfig(): Parameters<MonitorRig['monitor']['updateConfig']>[0] {
  return {
    simulator: 'on',
    simulatorAgentCount: 2,
    projectScope: 'workspace',
    transcriptPath: '',
    idleTimeoutMs: 60_000,
    toolTimeoutMs: 300_000,
    sessionEndTimeoutMs: 1_800_000,
    debounceMs: 100,
    pollIntervalMs: 1000,
  };
}

void describe('SimulatorSource disposal', () => {
  void it('monitor.dispose() emits nothing afterwards and leaves no timer', async () => {
    const rig = simRig(4);
    await rig.time.advance(20 * SECOND);
    const count = rig.changes.length;
    rig.monitor.dispose();
    await rig.time.advance(10 * MINUTE);
    assert.equal(rig.changes.length, count);
    assert.equal(rig.time.pendingTimers, 0);
  });
});

// ---------------------------------------------------------------------------------------------
// Simulation-driven integration test

void describe('simulation integration: hero lifecycle follows host events only', () => {
  const LIFECYCLE = /^SW+(IW+)*I?D?$/;

  void it('ten simulated minutes: every post is valid and each agent follows spawned, working, idle, despawned', async () => {
    const rig = simRig(3);
    await rig.time.advance(10 * MINUTE);
    assert.ok(rig.posts.length > 50);
    for (const post of rig.posts) {
      assert.ok(parseHostMessage(post) !== undefined, JSON.stringify(post));
    }
    const letters = new Map<string, string>();
    for (const post of rig.posts) {
      if (post.type !== 'agentState') {
        continue;
      }
      const letter = { spawned: 'S', working: 'W', idle: 'I', despawned: 'D' }[post.agent.state];
      const so_far = letters.get(post.agent.id) ?? '';
      assert.ok(!so_far.endsWith('D'), `${post.agent.id} posted a state after despawned`);
      letters.set(post.agent.id, so_far + letter);
    }
    assert.ok(letters.size >= 6, 'agents respawn during ten minutes');
    for (const [id, sequence] of letters) {
      assert.match(sequence, LIFECYCLE, id);
    }
    const first = letters.get('sim-0-0') ?? '';
    assert.ok(first.endsWith('D'), 'sim-0-0 completes a full lifecycle');
  });

  void it('the first lifecycle of sim-0-0 equals the golden sequence recorded from the default seed', async () => {
    const rig = monitorRig({
      config: { simulator: 'on', simulatorAgentCount: 3, debounceMs: 100 },
    });
    const t0 = rig.time.now();
    await rig.time.advance(2 * MINUTE);
    const actual = sequenceOf(rig, 'sim-0-0').map((c) => [c.state, c.toolName, c.timestamp - t0]);
    assert.deepEqual(actual, GOLDEN_SIM_0_0);
  });

  void it('after every post a freshly rebuilt mirror equals the mirror fed every post (reload rebuild)', async () => {
    const rig = simRig(3);
    const live = new HostStateMirror();
    for (const post of rig.posts) {
      handleHostMessage(post, live);
    }
    let checks = 0;
    rig.monitor.onDidChangeAgent(() => {
      // The bridge listener was registered first, so rig.posts already holds this change.
      const latest = rig.posts.at(-1);
      handleHostMessage(latest, live);
      const rebuilt = new HostStateMirror();
      handleHostMessage(createAgentListMessage(rig.monitor.getAgents()), rebuilt);
      assert.deepEqual(byId(rebuilt.agents()), byId(live.agents()));
      checks += 1;
    });
    await rig.time.advance(10 * MINUTE);
    assert.ok(checks > 50, `${checks} checks`);
  });

  void it('a second ready at any point posts config, an agentList equal to getAgents(), then progress', async () => {
    const rig = simRig(3);
    for (let i = 0; i < 8; i += 1) {
      await rig.time.advance(37 * SECOND);
      const mark = rig.posts.length;
      rig.ready();
      const answer = rig.posts.slice(mark);
      assert.equal(answer.length, 3);
      assert.equal(answer[0]?.type, 'config');
      assert.deepEqual(answer[1], createAgentListMessage(rig.monitor.getAgents()));
      assert.equal(answer[2]?.type, 'progress');
    }
  });

  void it('webview messages cannot alter agents: control messages are dropped and the list is unchanged', async () => {
    const rig = simRig(3);
    await rig.time.advance(30 * SECOND);
    const before = JSON.stringify(rig.monitor.getAgents());
    const posts = rig.posts.length;
    for (const message of [
      { type: 'stopAgent', agentId: 'sim-0-0' },
      { type: 'despawn', agentId: 'sim-0-0' },
      {
        type: 'agentState',
        agent: { id: 'sim-0-0', name: 'x', state: 'despawned', toolName: null, timestamp: 1 },
      },
      { type: 'sendText', text: 'rm -rf /' },
      { type: 'focusAgent', agentId: 'does-not-exist' },
    ]) {
      rig.bridge.handleMessage(message);
    }
    assert.equal(JSON.stringify(rig.monitor.getAgents()), before);
    assert.equal(rig.posts.length, posts, 'nothing is posted in answer');
    assert.equal(rig.terminals.shows.length, 0);
  });

  void it('a failing consumer of the change stream does not disturb the simulation or other listeners', async () => {
    const rig = simRig(2);
    rig.monitor.onDidChangeAgent(() => {
      throw new Error('scene crashed');
    });
    await rig.time.advance(2 * MINUTE);
    assert.ok(rig.changes.length > 10);
    assert.ok(rig.monitor.getAgents().length >= 1);
  });
});

function byId(agents: readonly AgentInfo[]): AgentInfo[] {
  return [...agents].sort((a, b) => a.id.localeCompare(b.id));
}

/** Recorded once from DEFAULT_SIMULATOR_SEED, 3 agents, debounceMs 100: [state, tool, ms since start]. */
const GOLDEN_SIM_0_0: readonly (readonly [string, string | null, number])[] = [
  ['spawned', null, 0],
  ['working', 'Grep', 1000],
  ['working', 'Write', 3370],
  ['working', 'Bash', 5781],
  ['working', 'Glob', 9812],
  ['working', 'Write', 12046],
  ['working', 'Edit', 14543],
  ['working', 'Glob', 17679],
  ['idle', 'Glob', 19659],
  ['working', 'Task', 31849],
  ['working', 'Bash', 34671],
  ['working', 'Task', 37891],
  ['working', 'Grep', 39984],
  ['working', 'WebFetch', 42790],
  ['working', 'Task', 46088],
  ['working', 'Read', 49176],
  ['working', 'Write', 52238],
  ['working', 'Bash', 55267],
  ['idle', 'Bash', 58989],
  ['working', 'Write', 71818],
  ['working', 'WebFetch', 76346],
  ['working', 'Grep', 78835],
  ['working', 'WebFetch', 81989],
  ['working', 'Task', 85411],
  ['working', 'WebFetch', 90005],
  ['working', 'Glob', 93523],
  ['working', 'Bash', 97757],
  ['idle', 'Bash', 98637],
  ['despawned', 'Bash', 107585],
];
