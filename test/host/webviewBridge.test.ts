// Unit tests for src/host/webviewBridge.ts (M2 plan test note 7; host-webview-protocol.md
// sections 5 and 6). Fake port, recording logger, spy reveal. The bridge never throws, answers
// every ready with config then agentList, pushes only while ready, reveals only live host-listed
// agents, and never logs a payload. E1 adds the third answer to ready (progress), saveProgress
// (validated, then handed to the store), and postConfig (only while ready).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { WebviewBridge } from '../../src/host/webviewBridge';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';
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

const GAME_CONFIG: ConfigSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  enemiesEnabled: true,
  killsPerStage: 30,
  maxEnemies: 6,
};
/** Distinct from GAME_CONFIG so a test can tell which snapshot was posted. */
const FALLBACK_CONFIG: ConfigSnapshot = { ...GAME_CONFIG, killsPerStage: 20, maxEnemies: 4 };
const FALLBACK_MESSAGE = { type: 'config', config: FALLBACK_CONFIG };
const CONFIG_MESSAGE = { type: 'config', config: GAME_CONFIG };
const PROGRESS: Progress = {
  schemaVersion: 1,
  stageIndex: 2,
  killsInStage: 7,
  totalKills: 57,
  bossesDefeated: 1,
  cycle: 0,
};
const PROGRESS_MESSAGE = { type: 'progress', progress: DEFAULT_PROGRESS };

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
  /** Every Progress the bridge handed to deps.saveProgress. */
  saves: Progress[];
}

function harness(
  options: {
    agents?: readonly AgentInfo[];
    reveal?: boolean;
    getAgents?: () => readonly AgentInfo[];
    getConfig?: () => ConfigSnapshot;
    getFallbackConfig?: () => ConfigSnapshot;
    revealImpl?: (agentId: string) => void;
    getProgress?: () => Progress;
    saveImpl?: (progress: Progress) => void;
  } = {},
): Harness {
  const logger = new RecordingLogger();
  const reveals: string[] = [];
  const agents = options.agents ?? [];
  const getAgents = options.getAgents ?? ((): readonly AgentInfo[] => agents);
  const config = options.getConfig ?? ((): ConfigSnapshot => GAME_CONFIG);
  const saves: Progress[] = [];
  const deps: WebviewBridgeDeps = {
    getAgents,
    getConfig: config,
    getFallbackConfig: options.getFallbackConfig ?? ((): ConfigSnapshot => FALLBACK_CONFIG),
    revealAgentTerminal:
      options.reveal === false
        ? null
        : (agentId: string): void => {
            reveals.push(agentId);
            options.revealImpl?.(agentId);
          },
    getProgress: options.getProgress ?? ((): Progress => DEFAULT_PROGRESS),
    saveProgress: (progress: Progress): void => {
      saves.push(progress);
      options.saveImpl?.(progress);
    },
    logger,
  };
  const bridge = new WebviewBridge(deps);
  return { bridge, port: new FakePort(), logger, reveals, saves };
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
  ['a progress message sent the wrong way', { type: 'progress', progress: DEFAULT_PROGRESS }],
  ['saveProgress without progress', { type: 'saveProgress' }],
  [
    'saveProgress with stageIndex 0',
    { type: 'saveProgress', progress: { ...PROGRESS, stageIndex: 0 } },
  ],
  [
    'saveProgress with a string counter',
    { type: 'saveProgress', progress: { ...PROGRESS, totalKills: SECRET } },
  ],
  [
    'saveProgress with an extra progress key',
    { type: 'saveProgress', progress: { ...PROGRESS, agentId: SECRET } },
  ],
  [
    'saveProgress with an extra top-level key',
    { type: 'saveProgress', progress: PROGRESS, text: SECRET },
  ],
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

  void it('answers ready with exactly [config, agentList, progress] in that order and becomes ready', () => {
    const { bridge, port, logger } = harness();
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    assert.equal(bridge.state, 'ready');
    assert.deepEqual(port.posts, [
      CONFIG_MESSAGE,
      { type: 'agentList', agents: [] },
      PROGRESS_MESSAGE,
    ]);
    for (const message of port.posts) {
      assert.deepEqual(parseHostMessage(structuredClone(message)), message);
    }
    assert.deepEqual(logger.all(), []);
  });

  void it('answers a second ready with the three messages again', () => {
    const { bridge, port } = harness();
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    bridge.handleMessage({ type: 'ready' });
    assert.deepEqual(port.types(), [
      'config',
      'agentList',
      'progress',
      'config',
      'agentList',
      'progress',
    ]);
  });

  void it('accepts a structured-cloned ready (what VS Code delivers)', () => {
    const { bridge, port } = harness();
    bridge.attach(port);
    bridge.handleMessage(structuredClone({ type: 'ready' }));
    assert.equal(bridge.state, 'ready');
    assert.equal(port.posts.length, 3);
  });

  void it('snapshots the host agent list through the creators (allow-listed keys only)', () => {
    const leaky = { ...SIM_1, text: SECRET, cwd: `/home/${SECRET}` } as AgentInfo;
    const { bridge, port } = harness({ agents: [leaky] });
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    assert.deepEqual(port.posts[1], { type: 'agentList', agents: [SIM_1] });
    assert.equal(port.posts[2]?.type, 'progress');
    assert.ok(!JSON.stringify(port.posts).includes(SECRET));
  });

  void it('bounds every answer: ready spam yields three messages each, at most 64 agents', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...SIM_1, id: `a${i}` }));
    const { bridge, port } = harness({ agents: many });
    bridge.attach(port);
    for (let i = 0; i < 50; i += 1) {
      bridge.handleMessage({ type: 'ready' });
    }
    assert.equal(port.posts.length, 150);
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
    assert.deepEqual(port.types(), ['config', 'agentList', 'progress', 'agentState']);
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
    assert.deepEqual(second.types(), ['config', 'agentList', 'progress', 'agentState']);
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
      const { bridge, port, logger, reveals, saves } = readyHarness({ agents: [SIM_1] });
      assert.doesNotThrow(() => bridge.handleMessage(raw));
      assert.deepEqual(port.posts, []);
      assert.deepEqual(reveals, []);
      assert.deepEqual(saves, [], 'nothing reaches the store');
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
    assert.deepEqual(logger.errors, ['webview bridge error: Error']);
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
  void it('getConfig throwing: one error logged, then fallback config, agentList and progress are posted', () => {
    const { bridge, port, logger } = harness({
      agents: [SIM_1],
      getConfig: () => {
        throw new RangeError('config broke');
      },
    });
    bridge.attach(port);
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    assert.deepEqual(port.posts, [
      FALLBACK_MESSAGE,
      { type: 'agentList', agents: [SIM_1] },
      PROGRESS_MESSAGE,
    ]);
    assert.deepEqual(logger.errors, ['webview bridge error: RangeError']);
  });

  void it('getFallbackConfig throwing after getConfig throwing still posts agentList and progress, two name-only errors', () => {
    const { bridge, port, logger } = harness({
      agents: [SIM_1],
      getConfig: () => {
        throw new RangeError(`config ${SECRET}`);
      },
      getFallbackConfig: () => {
        throw new TypeError(`fallback ${SECRET}`);
      },
    });
    bridge.attach(port);
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    assert.deepEqual(port.posts, [{ type: 'agentList', agents: [SIM_1] }, PROGRESS_MESSAGE]);
    assert.deepEqual(logger.errors, [
      'webview bridge error: RangeError',
      'webview bridge error: TypeError',
    ]);
  });

  void it('a marker inside any dependency error message appears in no log line', () => {
    const boom = (): never => {
      throw new Error(`/home/user/.claude/${SECRET}`);
    };
    const cases: Parameters<typeof harness>[0][] = [
      { getConfig: boom, getFallbackConfig: boom },
      { getAgents: boom },
      { getProgress: boom },
    ];
    for (const options of cases) {
      const { bridge, port, logger } = harness(options);
      bridge.attach(port);
      bridge.handleMessage({ type: 'ready' });
      assert.ok(logger.errors.length >= 1);
      for (const line of logger.all()) {
        assert.ok(!line.includes(SECRET), line);
      }
    }
    const saving = readyHarness({ saveImpl: boom, revealImpl: boom, agents: [SIM_1] });
    saving.bridge.handleMessage({ type: 'saveProgress', progress: PROGRESS });
    saving.bridge.handleMessage({ type: 'focusAgent', agentId: 'sim-1' });
    assert.equal(saving.logger.errors.length, 2);
    for (const line of saving.logger.all()) {
      assert.ok(!line.includes(SECRET), line);
    }
  });

  void it('getConfig throwing never suppresses agentList (Core invariant 4)', () => {
    const { bridge, port } = harness({
      agents: [SIM_1],
      getConfig: () => {
        throw new Error('settings broke');
      },
    });
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    assert.ok(port.types().includes('agentList'));
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
    assert.deepEqual(logger.errors, ['webview bridge error: Error']);
  });

  void it('getProgress throwing: config and agentList are still posted, one error, no progress', () => {
    const { bridge, port, logger } = harness({
      getProgress: () => {
        throw new Error('store broke');
      },
    });
    bridge.attach(port);
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'ready' }));
    assert.deepEqual(port.types(), ['config', 'agentList']);
    assert.deepEqual(logger.errors, ['webview bridge error: Error']);
    assert.equal(bridge.state, 'ready');
  });

  void it('an invalid stored progress is refused with a fixed line and never posted', () => {
    const { bridge, port, logger } = harness({
      getProgress: () => ({ ...PROGRESS, stageIndex: 0 }),
    });
    bridge.attach(port);
    bridge.handleMessage({ type: 'ready' });
    assert.deepEqual(port.types(), ['config', 'agentList']);
    assert.deepEqual(logger.errors, ['refused to post progress: invalid fields']);
  });

  void it('saveProgress throwing in the store never escapes the bridge', () => {
    const { bridge, logger } = readyHarness({
      saveImpl: () => {
        throw new Error('disk gone');
      },
    });
    assert.doesNotThrow(() => bridge.handleMessage({ type: 'saveProgress', progress: PROGRESS }));
    assert.deepEqual(logger.errors, ['webview bridge error: Error']);
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
    // Exactly three lines: the config post throws (logged), the fallback post throws (logged by
    // its own guard), the agentList post throws and is logged by handleMessage's outer guard, so
    // the progress answer is never attempted. Nothing escapes and no message text is logged.
    assert.deepEqual(logger.errors, [
      'webview bridge error: Error',
      'webview bridge error: Error',
      'webview bridge error: Error',
    ]);
    assert.ok(logger.errors.every((e) => !e.includes('port threw')));
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
    assert.deepEqual(logger.traces, [
      'post failed: view gone',
      'post failed: view gone',
      'post failed: view gone',
    ]);
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
    assert.deepEqual(logger.traces, [
      'post failed: view gone',
      'post failed: view gone',
      'post failed: view gone',
    ]);
  });
});

void describe('WebviewBridge: saveProgress (E1, ADR 0012)', () => {
  void it('hands a valid save to deps.saveProgress once, as a new object, and posts nothing back', () => {
    const { bridge, port, saves, logger } = readyHarness();
    const raw = { type: 'saveProgress', progress: { ...PROGRESS } };
    bridge.handleMessage(raw);
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0], PROGRESS);
    assert.notEqual(saves[0], raw.progress);
    assert.deepEqual(port.posts, []);
    assert.deepEqual(logger.all(), []);
    assert.equal(bridge.state, 'ready');
  });

  void it('accepts a structured-cloned save (what VS Code delivers)', () => {
    const { bridge, saves } = readyHarness();
    bridge.handleMessage(structuredClone({ type: 'saveProgress', progress: PROGRESS }));
    assert.deepEqual(saves, [PROGRESS]);
  });

  void it('does not touch the reveal path and cannot name an agent', () => {
    const { bridge, reveals, saves } = readyHarness({ agents: [SIM_1] });
    bridge.handleMessage({ type: 'saveProgress', progress: PROGRESS });
    bridge.handleMessage({ type: 'saveProgress', progress: PROGRESS, agentId: 'sim-1' });
    assert.deepEqual(reveals, []);
    assert.equal(saves.length, 1, 'the second message had an extra key and was dropped');
  });

  void it('is ignored while detached', () => {
    const { bridge, saves } = harness();
    bridge.handleMessage({ type: 'saveProgress', progress: PROGRESS });
    assert.deepEqual(saves, []);
  });

  void it('a rejected save logs only a fixed trace and never the payload', () => {
    const { bridge, logger, saves } = readyHarness();
    bridge.handleMessage({ type: 'saveProgress', progress: { ...PROGRESS, totalKills: SECRET } });
    assert.deepEqual(saves, []);
    assert.deepEqual(logger.traces, ['dropped webview message: invalid']);
    assert.ok(logger.all().every((line) => !line.includes(SECRET)));
  });
});

void describe('WebviewBridge: postConfig (E1 setting changes)', () => {
  void it('re-posts the current config only while ready', () => {
    const { bridge, port } = readyHarness();
    bridge.postConfig();
    assert.deepEqual(port.posts, [CONFIG_MESSAGE]);
  });

  void it('posts nothing while detached or loading (a hidden view gets it with the next ready)', () => {
    const { bridge, port } = harness();
    bridge.postConfig();
    bridge.attach(port);
    bridge.postConfig();
    assert.deepEqual(port.posts, []);
    bridge.handleMessage({ type: 'ready' });
    port.posts.length = 0;
    bridge.markHidden();
    bridge.postConfig();
    assert.deepEqual(port.posts, []);
  });

  void it('uses the live getConfig each time and never throws when it does', () => {
    let killsPerStage = 30;
    const { bridge, port, logger } = readyHarness({
      getConfig: () => ({ ...GAME_CONFIG, killsPerStage }),
    });
    killsPerStage = 45;
    bridge.postConfig();
    const [message] = port.posts;
    assert.ok(message?.type === 'config');
    assert.equal(message.config.killsPerStage, 45);
    const broken = readyHarness({
      getConfig: () => {
        throw new Error('config broke');
      },
    });
    assert.doesNotThrow(() => broken.bridge.postConfig());
    assert.deepEqual(broken.port.posts, []);
    assert.equal(broken.logger.errors.length, 1);
    assert.deepEqual(logger.errors, []);
  });
});
