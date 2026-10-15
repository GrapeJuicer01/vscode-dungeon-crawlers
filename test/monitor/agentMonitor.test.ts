// AgentMonitor composition: no I/O before start, reveal wiring, terminal independence, disposal
// (M3 plan test notes 8 and 14). Virtual time only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SESSION_A, SESSION_B, toolUseLine, userLine } from '../support/monitorFakes';
import { monitorRig, sessionFile } from '../support/monitorRig';

const SECOND = 1000;
const HOUR = 3_600_000;

void describe('AgentMonitor startup', () => {
  void it('constructing it does no I/O and schedules no timer until start()', () => {
    const rig = monitorRig({ start: false, config: { simulator: 'on' } });
    assert.deepEqual(rig.fs.calls, []);
    assert.equal(rig.time.pendingTimers, 0);
    assert.equal(rig.terminals.listenerCount, 2, 'only the terminal listeners exist, no scan yet');
    assert.deepEqual(rig.monitor.getAgents(), []);
  });

  void it('start() twice does not double-poll', async () => {
    const rig = monitorRig({ start: false });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.monitor.start();
    rig.monitor.start();
    await rig.time.advance(3 * SECOND);
    assert.equal(rig.fs.maxConcurrentCalls, 1);
    assert.equal(rig.changes.filter((c) => c.state === 'spawned').length, 1);
  });
});

void describe('AgentMonitor reveal (focusAgent path)', () => {
  void it('a session that starts while a terminal is active is revealed exactly once via focusAgent', async () => {
    const rig = monitorRig({ config: { debounceMs: 100 } });
    rig.terminals.openTerminal(1, true);
    await rig.time.advance(2 * SECOND);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(3 * SECOND);
    assert.equal(rig.monitor.getAgents().length, 1);
    rig.bridge.handleMessage({ type: 'focusAgent', agentId: SESSION_A });
    assert.deepEqual(rig.terminals.shows, [1]);
  });

  void it('a session already present at startup has no terminal, so nothing is revealed', async () => {
    const rig = monitorRig({ start: false });
    rig.terminals.openTerminal(1, true);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.bridge.handleMessage({ type: 'ready' });
    rig.monitor.start();
    await rig.time.advance(3 * SECOND);
    rig.bridge.handleMessage({ type: 'focusAgent', agentId: SESSION_A });
    assert.deepEqual(rig.terminals.shows, []);
  });

  void it('focusAgent for a simulated or unknown agent reveals nothing', async () => {
    const rig = monitorRig({ config: { simulator: 'on' } });
    rig.terminals.openTerminal(1, true);
    await rig.time.advance(5 * SECOND);
    rig.bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-0-0' });
    rig.bridge.handleMessage({ type: 'focusAgent', agentId: 'unknown' });
    assert.deepEqual(rig.terminals.shows, []);
  });

  void it('a terminal closed after the link is made reveals nothing and the agent stays alive', async () => {
    const rig = monitorRig();
    rig.terminals.openTerminal(1, true);
    await rig.time.advance(2 * SECOND);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(3 * SECOND);
    const states = rig.changes.map((c) => c.state);
    rig.terminals.closeTerminal(1);
    await rig.time.advance(5 * SECOND);
    assert.deepEqual(
      rig.changes.map((c) => c.state),
      states,
      'closing a terminal changes no agent state',
    );
    assert.equal(rig.monitor.getAgents()[0]?.state, 'working');
    rig.bridge.handleMessage({ type: 'focusAgent', agentId: SESSION_A });
    assert.deepEqual(rig.terminals.shows, []);
  });

  void it('two sessions on one terminal: only the first is linked', async () => {
    const rig = monitorRig();
    rig.terminals.openTerminal(1, true);
    await rig.time.advance(2 * SECOND);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.addFile(sessionFile(SESSION_B), userLine());
    await rig.time.advance(3 * SECOND);
    rig.bridge.handleMessage({ type: 'focusAgent', agentId: SESSION_A });
    rig.bridge.handleMessage({ type: 'focusAgent', agentId: SESSION_B });
    assert.equal(rig.terminals.shows.length, 1);
  });

  void it('without a terminal port, focusAgent is a safe no-op', async () => {
    const rig = monitorRig({ withTerminals: false });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(3 * SECOND);
    assert.doesNotThrow(() => rig.bridge.handleMessage({ type: 'focusAgent', agentId: SESSION_A }));
  });

  void it('a throwing terminal port does not escape and does not change agents', async () => {
    const rig = monitorRig();
    rig.terminals.openTerminal(1, true);
    await rig.time.advance(2 * SECOND);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(3 * SECOND);
    rig.terminals.showThrows = true;
    const before = JSON.stringify(rig.monitor.getAgents());
    assert.doesNotThrow(() => rig.monitor.revealAgentTerminal(SESSION_A));
    assert.equal(JSON.stringify(rig.monitor.getAgents()), before);
  });
});

void describe('AgentMonitor hero lifecycle comes only from sessions', () => {
  void it('events a hero would see are exactly spawned, working, idle, despawned from the transcript', async () => {
    const rig = monitorRig({ config: { debounceMs: 100 } });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(3 * SECOND);
    rig.fs.append(sessionFile(SESSION_A), toolUseLine('Bash'));
    await rig.time.advance(3 * SECOND);
    rig.fs.remove(sessionFile(SESSION_A));
    await rig.time.advance(3 * SECOND);
    assert.deepEqual(
      rig.changes.map((c) => [c.state, c.toolName]),
      [
        ['spawned', null],
        ['working', null],
        ['working', 'Bash'],
        ['despawned', 'Bash'],
      ],
    );
  });

  void it('config updates (thresholds) never spawn or despawn an agent by themselves', async () => {
    const rig = monitorRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(3 * SECOND);
    const count = rig.changes.length;
    rig.monitor.updateConfig({
      simulator: 'off',
      simulatorAgentCount: 3,
      projectScope: 'workspace',
      transcriptPath: '',
      idleTimeoutMs: 600_000,
      toolTimeoutMs: 600_000,
      sessionEndTimeoutMs: 3_600_000,
      debounceMs: 100,
      pollIntervalMs: 1000,
    });
    await rig.time.advance(5 * SECOND);
    assert.equal(rig.changes.length, count);
  });
});

void describe('AgentMonitor disposal', () => {
  void it('after start with every source active: zero pending timers, zero terminal listeners, no fs calls for an hour', async () => {
    const rig = monitorRig({ config: { simulator: 'on', simulatorAgentCount: 4 } });
    rig.terminals.openTerminal(1, true);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(20 * SECOND);
    assert.ok(rig.time.pendingTimers > 0);
    assert.equal(rig.terminals.listenerCount, 2);
    rig.monitor.dispose();
    assert.equal(rig.time.pendingTimers, 0);
    assert.equal(rig.terminals.listenerCount, 0);
    assert.equal(rig.terminals.disposed, false, 'the port belongs to extension.ts');
    const calls = rig.fs.calls.length;
    const changes = rig.changes.length;
    rig.fs.append(sessionFile(SESSION_A), toolUseLine('Bash'));
    await rig.time.advance(HOUR);
    assert.equal(rig.fs.calls.length, calls);
    assert.equal(rig.changes.length, changes);
    assert.equal(rig.time.pendingTimers, 0);
  });

  void it('double dispose is harmless and later calls are inert', async () => {
    const rig = monitorRig();
    rig.monitor.dispose();
    assert.doesNotThrow(() => rig.monitor.dispose());
    assert.doesNotThrow(() => rig.monitor.start());
    assert.doesNotThrow(() => rig.monitor.updateWorkspaceFolders([]));
    assert.doesNotThrow(() => rig.monitor.revealAgentTerminal(SESSION_A));
    await rig.time.advance(10 * SECOND);
    assert.equal(rig.time.pendingTimers, 0);
    assert.deepEqual(rig.monitor.getAgents(), []);
  });

  void it('dispose during an in-flight poll leaves nothing behind', async () => {
    const rig = monitorRig({ start: false });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.pause();
    rig.monitor.start();
    await rig.time.advance(SECOND);
    rig.monitor.dispose();
    rig.fs.resume();
    await rig.time.advance(10 * SECOND);
    assert.equal(rig.time.pendingTimers, 0);
    assert.deepEqual(rig.changes, []);
  });
});
