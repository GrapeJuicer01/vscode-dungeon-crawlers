// Unit tests for src/host/webviewBridge.ts (M2 plan test note 7; host-webview-protocol.md
// sections 5 and 6). Fake port, recording logger, spy reveal. The bridge never throws, answers
// every ready with config then agentList, pushes only while ready, reveals only live host-listed
// agents, and never logs a payload.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { WebviewBridge } from '../../src/host/webviewBridge';
import type { BridgeLogger, WebviewBridgeDeps, WebviewPort } from '../../src/host/webviewBridge';
import {
  AGENT_INFO_KEYS,
  MAX_AGENTS,
  parseHostMessage,
  PROTOCOL_VERSION,
} from '../../src/shared/protocol';
import type { AgentInfo, ConfigSnapshot, HostToWebviewMessage } from '../../src/shared/protocol';

const SECRET = 'SECRET-PAYLOAD-7f3a';

const SIM_1: AgentInfo = {
  id: 'sim-1',
  name: 'Sim one',
  state: 'working',
  toolName: 'Bash',
  timestamp: 1_700_000_000_000,
};
const SIM_GONE: AgentInfo = { ...SIM_1, id: 'sim-gone', state: 'despawned' };

const CONFIG_MESSAGE = { type: 'config', config: { protocolVersion: PROTOCOL_VERSION } };

class FakePort implements WebviewPort {
  readonly posts: HostToWebviewMessage[] = [];
  behavior: 'resolve' | 'reject' | 'throw' = 'resolve';

  postMessage(message: HostToWebviewMessage): PromiseLike<boolean> {
    this.posts.push(message);
    if (this.behavior === 'throw') {
      throw new Error('port threw');
    }
    return this.behavior === 'resolve'
      ? Promise.resolve(true)
      : Promise.reject(new Error(`rejected ${SECRET}`));
  }

  types(): string[] {
    return this.posts.map((message) => message.type);
  }
}

class RecordingLogger implements BridgeLogger {
  readonly traces: string[] = [];
  readonly errors: string[] = [];
  throws = false;

  trace(message: string): void {
    this.traces.push(message);
    if (this.throws) {
      throw new Error('logger trace failed');
    }
  }

  error(message: string): void {
    this.errors.push(message);
    if (this.throws) {
      throw new Error('logger error failed');
    }
  }

  all(): string[] {
    return [...this.traces, ...this.errors];
  }
}

interface Harness {
  bridge: WebviewBridge;
  port: FakePort;
  logger: RecordingLogger;
  reveals: string[];
}

function harness(
  options: {
    agents?: readonly AgentInfo[];
    reveal?: boolean;
    getAgents?: () => readonly AgentInfo[];
    getConfig?: () => ConfigSnapshot;
    revealImpl?: (agentId: string) => void;
  } = {},
): Harness {
  const logger = new RecordingLogger();
  const reveals: string[] = [];
  const agents = options.agents ?? [];
  const getAgents = options.getAgents ?? ((): readonly AgentInfo[] => agents);
  const config =
    options.getConfig ?? ((): ConfigSnapshot => ({ protocolVersion: PROTOCOL_VERSION }));
  const deps: WebviewBridgeDeps = {
    getAgents,
    getConfig: config,
    revealAgentTerminal:
      options.reveal === false
        ? null
        : (agentId: string): void => {
            reveals.push(agentId);
            options.revealImpl?.(agentId);
          },
    logger,
  };
  const bridge = new WebviewBridge(deps);
  return { bridge, port: new FakePort(), logger, reveals };
}

function readyHarness(options: Parameters<typeof harness>[0] = {}): Harness {
  const h = harness(options);
  h.bridge.attach(h.port);
  h.bridge.handleMessage({ type: 'ready' });
  h.port.posts.length = 0;
  // Start each test with an empty log (a throwing getAgents logs while answering this ready).
  h.logger.traces.length = 0;
  h.logger.errors.length = 0;
  return h;
}

/** Lets every pending promise reaction (and an unhandledRejection check) run. */
async function settle(): Promise<void> {
  await new Promise<void>((done) => setImmediate(done));
  await new Promise<void>((done) => setImmediate(done));
}

const INVALID_MESSAGES: [string, unknown][] = [
  ['stopAgent', { type: 'stopAgent', agentId: SECRET }],
  ['sendText', { type: 'sendText', text: SECRET }],
  ['ready with extra text', { type: 'ready', text: SECRET }],
  ['focusAgent with a command', { type: 'focusAgent', agentId: 'sim-1', command: SECRET }],
  ['focusAgent with a bad id', { type: 'focusAgent', agentId: `${SECRET} x` }],
  ['a string', SECRET],
  ['null', null],
  ['undefined', undefined],
  ['an array', [{ type: 'ready' }]],
  ['a host message', { type: 'agentList', agents: [] }],
];

void describe('WebviewBridge: lifecycle and handshake', () => {
  void it('starts detached and ignores messages until attached', () => {
    const { bridge, port, logger } = harness();
    assert.equal(bridge.state, 'detached');
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    assert.equal(bridge.state, 'detached');
    assert.deepEqual(port.posts, []);
    assert.deepEqual(logger.all(), []);
  });

  void it('is loading after attach and drops pushes', () => {
    const { bridge, port } = harness();
    bridge.attach(port);
    assert.equal(bridge.state, 'loading');
    bridge.postAgentState(SIM_1);
    assert.deepEqual(port.posts, []);
  });

  void it('answers ready with exactly [config, agentList] in that order and becomes ready', () => {
    const { bridge, port, logger } = harness();
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    assert.equal(bridge.state, 'ready');
    assert.deepEqual(port.posts, [CONFIG_MESSAGE, { type: 'agentList', agents: [] }]);
    for (const message of port.posts) {
      assert.deepEqual(parseHostMessage(structuredClone(message)), message);
    }
    assert.deepEqual(logger.all(), []);
  });

  void it('answers a second ready with the pair again', () => {
    const { bridge, port } = harness();
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    bridge.handleMessage({ type: 'ready' });
    assert.deepEqual(port.types(), ['config', 'agentList', 'config', 'agentList']);
  });

  void it('accepts a structured-cloned ready (what VS Code delivers)', () => {
    const { bridge, port } = harness();
    bridge.attach(port);
    bridge.handleMessage(structuredClone({ type: 'ready' }));
    assert.equal(bridge.state, 'ready');
    assert.equal(port.posts.length, 2);
  });

  void it('snapshots the host agent list through the creators (allow-listed keys only)', () => {
    const leaky = { ...SIM_1, text: SECRET, cwd: `/home/${SECRET}` } as AgentInfo;
    const { bridge, port } = harness({ agents: [leaky] });
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    assert.deepEqual(port.posts[1], { type: 'agentList', agents: [SIM_1] });
    assert.ok(!JSON.stringify(port.posts).includes(SECRET));
  });

  void it('bounds every answer: ready spam yields one config and at most 64 agents each', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...SIM_1, id: `a${i}` }));
    const { bridge, port } = harness({ agents: many });
    bridge.attach(port);
    for (let i = 0; i < 50; i += 1) {
      bridge.handleMessage({ type: 'ready' });
    }
    assert.equal(port.posts.length, 100);
    for (const message of port.posts) {
      if (message.type === 'agentList') {
        assert.equal(message.agents.length, MAX_AGENTS);
      }
    }
  });

  void it('markHidden returns to loading, drops pushes, and the next ready restores', () => {
    const { bridge, port } = readyHarness();
    bridge.markHidden();
    assert.equal(bridge.state, 'loading');
    bridge.postAgentState(SIM_1);
    assert.deepEqual(port.posts, []);
    bridge.handleMessage({ type: 'ready' });
    assert.equal(bridge.state, 'ready');
    bridge.postAgentState(SIM_1);
    assert.deepEqual(port.types(), ['config', 'agentList', 'agentState']);
  });

  void it('markHidden while detached stays detached', () => {
    const { bridge } = harness();
    bridge.markHidden();
    assert.equal(bridge.state, 'detached');
  });

  void it('detach drops the port: nothing is posted and nothing throws afterwards', () => {
    const { bridge, port } = readyHarness();
    bridge.detach();
    assert.equal(bridge.state, 'detached');
    for (const [, raw] of [['ready', { type: 'ready' }], ...INVALID_MESSAGES] as [
      string,
      unknown,
    ][]) {
      assert.doesNotThrow(() => bridge.handleMessage(raw));
    }
    bridge.postAgentState(SIM_1);
    assert.deepEqual(port.posts, []);
  });

  void it('attaching a second port sends every later post only to the new port', () => {
    const { bridge, port: first } = readyHarness();
    const second = new FakePort();
    bridge.attach(second);
    assert.equal(bridge.state, 'loading');
    bridge.postAgentState(SIM_1);
    bridge.handleMessage({ type: 'ready' });
    bridge.postAgentState(SIM_1);
    assert.deepEqual(first.posts, []);
    assert.deepEqual(second.types(), ['config', 'agentList', 'agentState']);
  });
});

void describe('WebviewBridge: postAgentState', () => {
  void it('posts one agentState with exactly the allow-listed keys when ready', () => {
    const { bridge, port } = readyHarness();
    bridge.postAgentState({ ...SIM_1, transcript: SECRET } as AgentInfo);
    assert.equal(port.posts.length, 1);
    const [message] = port.posts;
    assert.ok(message?.type === 'agentState');
    assert.deepEqual(Object.keys(message), ['type', 'agent']);
    assert.deepEqual(Object.keys(message.agent), [...AGENT_INFO_KEYS]);
    assert.deepEqual(message.agent, SIM_1);
  });

  void it('posts each state in the order given', () => {
    const { bridge, port } = readyHarness();
    for (const state of ['spawned', 'working', 'idle', 'despawned'] as const) {
      bridge.postAgentState({ ...SIM_1, state });
    }
    assert.deepEqual(
      port.posts.map((message) =>
        message.type === 'agentState' ? message.agent.state : message.type,
      ),
      ['spawned', 'working', 'idle', 'despawned'],
    );
  });

  void it('refuses an invalid agent: posts nothing and logs one error without the agent’s data', () => {
    const { bridge, port, logger } = readyHarness();
    bridge.postAgentState({ ...SIM_1, name: `${SECRET}\n` });
    assert.deepEqual(port.posts, []);
    assert.deepEqual(logger.errors, ['refused to post agent: invalid fields']);
    assert.ok(logger.all().every((line) => !line.includes(SECRET)));
  });

  void it('never throws, even with a throwing getter or a throwing logger', () => {
    const { bridge, logger } = readyHarness();
    logger.throws = true;
    const hostile = Object.defineProperty({ ...SIM_1 }, 'name', {
      get(): never {
        throw new Error(SECRET);
      },
    });
    assert.doesNotThrow(() => bridge.postAgentState(hostile));
    assert.doesNotThrow(() => bridge.postAgentState({ ...SIM_1, id: '' }));
    assert.doesNotThrow(() => bridge.postAgentState(null as unknown as AgentInfo));
  });
});

void describe('WebviewBridge: invalid and unknown messages', () => {
  for (const [label, raw] of INVALID_MESSAGES) {
    void it(`drops ${label}: no post, no reveal, no throw, one payload-free trace`, () => {
      const { bridge, port, logger, reveals } = readyHarness({ agents: [SIM_1] });
      assert.doesNotThrow(() => bridge.handleMessage(raw));
      assert.deepEqual(port.posts, []);
      assert.deepEqual(reveals, []);
      assert.deepEqual(logger.traces, ['dropped webview message: invalid']);
      assert.deepEqual(logger.errors, []);
      assert.equal(bridge.state, 'ready', 'an invalid message does not change the state');
    });
  }

  void it('drops invalid messages while loading too', () => {
    const { bridge, port, logger } = harness();
    bridge.attach(port);
    bridge.handleMessage({ type: 'stopAgent' });
    assert.equal(bridge.state, 'loading');
    assert.deepEqual(port.posts, []);
    assert.deepEqual(logger.traces, ['dropped webview message: invalid']);
  });
});

void describe('WebviewBridge: focusAgent is reveal-only (invariant 3)', () => {
  void it('with no reveal capability (M2): no call, no post, one fixed trace', () => {
    const { bridge, port, logger } = readyHarness({ agents: [SIM_1], reveal: false });
    bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' });
    assert.deepEqual(port.posts, []);
    assert.deepEqual(logger.traces, ['dropped focusAgent: reveal unavailable']);
  });

  void it('reveals a live host-listed agent exactly once and posts nothing back', () => {
    const { bridge, port, reveals, logger } = readyHarness({ agents: [SIM_1] });
    bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' });
    assert.deepEqual(reveals, ['sim-1']);
    assert.deepEqual(port.posts, []);
    assert.deepEqual(logger.all(), []);
    assert.equal(bridge.state, 'ready');
  });

  for (const state of ['spawned', 'working', 'idle'] as const) {
    void it(`reveals an agent in state ${state}`, () => {
      const { bridge, reveals } = readyHarness({ agents: [{ ...SIM_1, state }] });
      bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' });
      assert.deepEqual(reveals, ['sim-1']);
    });
  }

  void it('does not reveal an unknown agent', () => {
    const { bridge, reveals, logger } = readyHarness({ agents: [SIM_1] });
    bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-2' });
    assert.deepEqual(reveals, []);
    assert.deepEqual(logger.traces, ['dropped focusAgent: unknown agent']);
  });

  void it('does not reveal a despawned agent', () => {
    const { bridge, reveals } = readyHarness({ agents: [SIM_1, SIM_GONE] });
    bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-gone' });
    assert.deepEqual(reveals, []);
  });

  void it('matches ids exactly (no prefix, case, or whitespace match)', () => {
    const { bridge, reveals } = readyHarness({ agents: [SIM_1] });
    for (const agentId of ['sim', 'SIM-1', 'sim-10', 'sim-1.']) {
      bridge.handleMessage({ type: 'focusAgent', agentId });
    }
    assert.deepEqual(reveals, []);
  });

  void it('checks the live host list at message time, not a stale copy', () => {
    let agents: readonly AgentInfo[] = [];
    const { bridge, reveals } = readyHarness({ getAgents: () => agents });
    bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' });
    agents = [SIM_1];
    bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' });
    agents = [{ ...SIM_1, state: 'despawned' }];
    bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' });
    assert.deepEqual(reveals, ['sim-1']);
  });

  void it('a throwing reveal is contained and logged once', () => {
    const { bridge, logger } = readyHarness({
      agents: [SIM_1],
      revealImpl: () => {
        throw new Error('terminal gone');
      },
    });
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' }));
    assert.deepEqual(logger.errors, ['webview bridge error: Error: terminal gone']);
  });

  void it('getAgents throwing during focusAgent: no reveal, no throw, one error', () => {
    const { bridge, reveals, logger } = readyHarness({
      getAgents: () => {
        throw new Error('monitor broke');
      },
    });
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' }));
    assert.deepEqual(reveals, []);
    assert.equal(logger.errors.length, 1);
  });
});

void describe('WebviewBridge: dependency failures (invariant 4)', () => {
  void it('getConfig throwing: no post, no throw, exactly one error with name and message', () => {
    const { bridge, port, logger } = harness({
      getConfig: () => {
        throw new RangeError('config broke');
      },
    });
    bridge.attach(port);
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    assert.deepEqual(port.posts, []);
    assert.deepEqual(logger.errors, ['webview bridge error: RangeError: config broke']);
  });

  void it('getAgents throwing while answering ready: only config is posted, exactly one error', () => {
    const { bridge, port, logger } = harness({
      getAgents: () => {
        throw new Error('agents broke');
      },
    });
    bridge.attach(port);
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    assert.deepEqual(port.posts, [CONFIG_MESSAGE]);
    assert.deepEqual(logger.errors, ['webview bridge error: Error: agents broke']);
  });

  void it('a non-Error throw is logged as "non-error thrown", never the value', () => {
    const { bridge, logger } = harness({
      getAgents: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- this test needs a non-Error throw.
        throw SECRET;
      },
    });
    bridge.attach(new FakePort());
    bridge.handleMessage({ type: 'ready' });
    assert.deepEqual(logger.errors, ['webview bridge error: non-error thrown']);
  });

  void it('a port that throws synchronously is contained', () => {
    const { bridge, port, logger } = harness();
    port.behavior = 'throw';
    bridge.attach(port);
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    assert.equal(logger.errors.length, 1);
  });

  void it('a logger that throws never escapes handleMessage', () => {
    const { bridge, port, logger } = harness({
      getConfig: () => {
        throw new Error('config broke');
      },
    });
    logger.throws = true;
    bridge.attach(port);
    for (const raw of [
      { type: 'ready' },
      { type: 'stopAgent' },
      { type: 'focusAgent', agentId: 'x' },
    ]) {
      assert.doesNotThrow(() => bridge.handleMessage(raw));
    }
  });

  void it('a logger that throws on every focusAgent trace never escapes', () => {
    const { bridge, logger } = readyHarness({ reveal: false });
    logger.throws = true;
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' }));
  });
});

void describe('WebviewBridge: rejected posts (no unhandled rejection)', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  void it('a rejected postMessage is traced once per post, payload-free', async () => {
    const { bridge, port, logger } = harness();
    port.behavior = 'reject';
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    await settle();
    assert.deepEqual(unhandled, []);
    assert.deepEqual(logger.traces, ['post failed: view gone', 'post failed: view gone']);
    assert.ok(logger.all().every((line) => !line.includes(SECRET)));
  });

  void it('a rejected postMessage with a throwing logger causes no unhandled rejection', async () => {
    const { bridge, port, logger } = readyHarness();
    port.behavior = 'reject';
    logger.throws = true;
    bridge.postAgentState(SIM_1);
    bridge.handleMessage({ type: 'ready' });
    await settle();
    assert.deepEqual(unhandled, []);
  });

  void it('a port returning a bare thenable that rejects is handled too', async () => {
    const { bridge, logger } = harness();
    const thenablePort: WebviewPort = {
      postMessage: () => ({
        then<A, B>(
          _onFulfilled?: ((value: boolean) => A | PromiseLike<A>) | null,
          onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
        ): PromiseLike<A | B> {
          onRejected?.(new Error('gone'));
          return Promise.resolve(undefined as unknown as A | B);
        },
      }),
    };
    bridge.attach(thenablePort);
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    await settle();
    assert.deepEqual(unhandled, []);
    assert.deepEqual(logger.traces, ['post failed: view gone', 'post failed: view gone']);
  });
});
