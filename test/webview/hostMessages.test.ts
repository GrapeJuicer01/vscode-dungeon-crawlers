// Unit tests for the DOM-free webview protocol modules (M2 plan test note 8):
// src/webview/hostMessages.ts (parse then dispatch), src/webview/hostState.ts (the mirror the M4
// scene reads), and src/webview/hostChannel.ts (the only sender). Only host messages change the
// mirror (invariant 2); a fresh mirror fed the same agentList equals the old one (invariant 4).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AgentInfo, ConfigSnapshot, WebviewToHostMessage } from '../../src/shared/protocol';
import { createHostChannel } from '../../src/webview/hostChannel';
import { handleHostMessage } from '../../src/webview/hostMessages';
import type { HostMessageTarget } from '../../src/webview/hostMessages';
import { HostStateMirror } from '../../src/webview/hostState';

function agent(id: string, overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    name: `Agent ${id}`,
    state: 'working',
    toolName: 'Bash',
    timestamp: 1,
    ...overrides,
  };
}

function list(...agents: AgentInfo[]): unknown {
  return { type: 'agentList', agents };
}

function push(value: AgentInfo): unknown {
  return { type: 'agentState', agent: value };
}

function snapshot(mirror: HostStateMirror): unknown {
  return { config: mirror.config, count: mirror.agentCount, agents: mirror.agents() };
}

function seeded(): HostStateMirror {
  const mirror = new HostStateMirror();
  assert.equal(handleHostMessage({ type: 'config', config: { protocolVersion: 1 } }, mirror), true);
  assert.equal(handleHostMessage(list(agent('a'), agent('b', { state: 'idle' })), mirror), true);
  return mirror;
}

/** Invalid host messages (note 3 shapes). Each must return false and change nothing. */
const INVALID: [string, unknown][] = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'agentList'],
  ['a 1 MB string', 'x'.repeat(1_000_000)],
  ['an array', [list()]],
  ['an unknown type', { type: 'stopAgent', agentId: 'a' }],
  ['a webview message', { type: 'ready' }],
  ['an extra top-level key', { type: 'agentList', agents: [], extra: 1 }],
  ['an agent with an extra key', list({ ...agent('c'), hp: 3 } as AgentInfo)],
  [
    'an agent missing a key',
    { type: 'agentState', agent: { id: 'c', name: 'C', state: 'idle', timestamp: 1 } },
  ],
  ['state dead', push(agent('a', { state: 'dead' as AgentInfo['state'] }))],
  ['toolName with a space', push(agent('a', { toolName: 'Bash tool' }))],
  ['a blank name', push(agent('a', { name: '  ' }))],
  ['a 65-char name', push(agent('a', { name: 'n'.repeat(65) }))],
  ['a name with RLO', push(agent('a', { name: 'a‮b' }))],
  ['a negative timestamp', push(agent('a', { timestamp: -1 }))],
  ['a fractional timestamp', push(agent('a', { timestamp: 1.5 }))],
  ['timestamp 2^53', push(agent('a', { timestamp: 2 ** 53 }))],
  ['agents not an array', { type: 'agentList', agents: {} }],
  ['65 agents', list(...Array.from({ length: 65 }, (_, i) => agent(`a${i}`)))],
  ['duplicate ids', list(agent('a'), agent('a'))],
  ['config version 2', { type: 'config', config: { protocolVersion: 2 } }],
  ['config with an extra key', { type: 'config', config: { protocolVersion: 1, x: 1 } }],
  ['an inherited type', Object.create({ type: 'agentList', agents: [] }) as unknown],
];

void describe('handleHostMessage + HostStateMirror', () => {
  void it('a fresh mirror is empty with no config', () => {
    const mirror = new HostStateMirror();
    assert.equal(mirror.agentCount, 0);
    assert.equal(mirror.config, null);
    assert.deepEqual(mirror.agents(), []);
  });

  void it('config stores the snapshot', () => {
    const mirror = new HostStateMirror();
    assert.equal(
      handleHostMessage({ type: 'config', config: { protocolVersion: 1 } }, mirror),
      true,
    );
    assert.deepEqual(mirror.config, { protocolVersion: 1 });
  });

  void it('agentList replaces the whole set (a previously present agent disappears)', () => {
    const mirror = seeded();
    assert.equal(handleHostMessage(list(agent('c')), mirror), true);
    assert.deepEqual(mirror.agents(), [agent('c')]);
    assert.equal(mirror.getAgent('a'), undefined);
  });

  void it('an empty agentList clears the set', () => {
    const mirror = seeded();
    handleHostMessage(list(), mirror);
    assert.equal(mirror.agentCount, 0);
  });

  void it('agentState working for an unknown id inserts it (a missed spawned is tolerated)', () => {
    const mirror = seeded();
    assert.equal(handleHostMessage(push(agent('new')), mirror), true);
    assert.deepEqual(mirror.getAgent('new'), agent('new'));
    assert.equal(mirror.agentCount, 3);
  });

  void it('agentState idle updates in place, keeping insertion order', () => {
    const mirror = seeded();
    handleHostMessage(push(agent('a', { state: 'idle', toolName: null, timestamp: 9 })), mirror);
    assert.deepEqual(
      mirror.agents().map((value) => [value.id, value.state]),
      [
        ['a', 'idle'],
        ['b', 'idle'],
      ],
    );
    assert.equal(mirror.getAgent('a')?.timestamp, 9);
  });

  void it('agentState despawned deletes; despawned for an unknown id is a no-op', () => {
    const mirror = seeded();
    assert.equal(handleHostMessage(push(agent('a', { state: 'despawned' })), mirror), true);
    assert.equal(mirror.getAgent('a'), undefined);
    handleHostMessage(push(agent('zzz', { state: 'despawned' })), mirror);
    assert.deepEqual(mirror.agents(), [agent('b', { state: 'idle' })]);
  });

  void it('follows a full spawned, working, idle, despawned lifecycle from host messages only', () => {
    const mirror = new HostStateMirror();
    const states: AgentInfo['state'][] = ['spawned', 'working', 'idle', 'working', 'despawned'];
    const seen: (string | undefined)[] = [];
    for (const state of states) {
      handleHostMessage(push(agent('h', { state })), mirror);
      seen.push(mirror.getAgent('h')?.state);
    }
    assert.deepEqual(seen, ['spawned', 'working', 'idle', 'working', undefined]);
  });

  for (const [label, raw] of INVALID) {
    void it(`drops ${label}: returns false and leaves the mirror unchanged`, () => {
      const mirror = seeded();
      const before = snapshot(mirror);
      let result: boolean | undefined;
      assert.doesNotThrow(() => {
        result = handleHostMessage(raw, mirror);
      });
      assert.equal(result, false);
      assert.deepEqual(snapshot(mirror), before);
    });
  }

  void it('never hands the target an object the sender still holds', () => {
    const mirror = new HostStateMirror();
    const raw = { type: 'agentList', agents: [agent('a')] };
    handleHostMessage(raw, mirror);
    (raw.agents[0] as { name: string }).name = 'mutated by sender';
    assert.equal(mirror.getAgent('a')?.name, 'Agent a');
  });

  void it('agents() returns a new array each time, so callers cannot change the mirror', () => {
    const mirror = seeded();
    const first = mirror.agents() as AgentInfo[];
    first.length = 0;
    assert.equal(mirror.agentCount, 2);
    assert.notEqual(mirror.agents(), mirror.agents());
  });

  void it('rebuild: a fresh mirror fed the same agentList equals the old one (webview reload)', () => {
    const snapshotMessage = list(
      agent('a'),
      agent('b', { state: 'idle' }),
      agent('c', { toolName: null }),
    );
    const old = new HostStateMirror();
    handleHostMessage({ type: 'config', config: { protocolVersion: 1 } }, old);
    handleHostMessage(list(agent('x')), old);
    handleHostMessage(push(agent('y')), old);
    handleHostMessage(snapshotMessage, old);

    const fresh = new HostStateMirror();
    handleHostMessage({ type: 'config', config: { protocolVersion: 1 } }, fresh);
    handleHostMessage(snapshotMessage, fresh);
    assert.deepEqual(snapshot(fresh), snapshot(old));
  });

  void it('errors thrown by the target propagate to the caller (main.ts reports them)', () => {
    const target: HostMessageTarget = {
      replaceAgents: () => {
        throw new Error('target failed');
      },
      applyAgent: () => undefined,
      applyConfig: (_config: ConfigSnapshot) => undefined,
    };
    assert.throws(() => handleHostMessage(list(), target), /target failed/);
  });

  void it('dispatches each type to exactly one target method', () => {
    const calls: string[] = [];
    const target: HostMessageTarget = {
      replaceAgents: () => calls.push('replaceAgents'),
      applyAgent: () => calls.push('applyAgent'),
      applyConfig: () => calls.push('applyConfig'),
    };
    handleHostMessage({ type: 'config', config: { protocolVersion: 1 } }, target);
    handleHostMessage(list(agent('a')), target);
    handleHostMessage(push(agent('a')), target);
    handleHostMessage({ type: 'nope' }, target);
    assert.deepEqual(calls, ['applyConfig', 'replaceAgents', 'applyAgent']);
  });
});

void describe('createHostChannel', () => {
  void it('send({ type: "ready" }) calls postMessage once with { type: "ready" }', () => {
    const posted: unknown[] = [];
    const channel = createHostChannel({ postMessage: (message) => posted.push(message) });
    channel.send({ type: 'ready' });
    assert.deepEqual(posted, [{ type: 'ready' }]);
  });

  void it('sends focusAgent unchanged and nothing else', () => {
    const posted: unknown[] = [];
    const channel = createHostChannel({ postMessage: (message) => posted.push(message) });
    const message: WebviewToHostMessage = { type: 'focusAgent', agentId: 'sim-1' };
    channel.send(message);
    assert.deepEqual(posted, [{ type: 'focusAgent', agentId: 'sim-1' }]);
  });

  void it('creating the channel posts nothing', () => {
    const posted: unknown[] = [];
    createHostChannel({ postMessage: (message) => posted.push(message) });
    assert.deepEqual(posted, []);
  });
});
