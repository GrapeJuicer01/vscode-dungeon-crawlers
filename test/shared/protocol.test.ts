// Unit tests for src/shared/protocol.ts and src/shared/assertNever.ts (M2 plan test notes 1, 2,
// 3, 5, and 6; host-webview-protocol.md section 4). Validators must be total (never throw),
// accept only exact plain objects, return new objects, and reject oversized strings fast.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { assertNever } from '../../src/shared/assertNever';
import {
  AGENT_ID_PATTERN,
  AGENT_INFO_KEYS,
  AGENT_STATES,
  createAgentListMessage,
  createAgentStateMessage,
  createConfigMessage,
  createProgressMessage,
  createSaveProgressMessage,
  HOST_TO_WEBVIEW_TYPES,
  isAgentId,
  isAgentInfo,
  isAgentState,
  MAX_AGENT_ID_LENGTH,
  MAX_AGENT_NAME_LENGTH,
  MAX_AGENTS,
  MAX_TOOL_NAME_LENGTH,
  parseHostMessage,
  parseWebviewMessage,
  PROTOCOL_VERSION,
  TOOL_NAME_PATTERN,
  toAgentInfo,
  WEBVIEW_TO_HOST_TYPES,
} from '../../src/shared/protocol';
import type { AgentInfo, ConfigSnapshot } from '../../src/shared/protocol';
import { DEFAULT_PROGRESS, MAX_PROGRESS_COUNT, MAX_STAGE_INDEX } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';

/** A valid config snapshot (E1: protocol version 2 and the three game settings). */
const CONFIG: ConfigSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  enemiesEnabled: true,
  killsPerStage: 30,
  maxEnemies: 6,
};

/** A valid non-default progress value. */
const PROGRESS: Progress = {
  schemaVersion: 1,
  stageIndex: 2,
  killsInStage: 7,
  totalKills: 57,
  bossesDefeated: 1,
  cycle: 0,
};

const AGENT: AgentInfo = {
  id: 'sim-1',
  name: 'Sim one',
  state: 'working',
  toolName: 'Bash',
  timestamp: 1_700_000_000_000,
};

function agent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...AGENT, ...overrides };
}

function without(key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...AGENT };
  delete copy[key];
  return copy;
}

function agentState(agentValue: unknown): Record<string, unknown> {
  return { type: 'agentState', agent: agentValue };
}

function agentList(agents: unknown): Record<string, unknown> {
  return { type: 'agentList', agents };
}

function withNonEnumerable<T extends object>(target: T, key: string): T {
  Object.defineProperty(target, key, { value: 'SECRET', enumerable: false });
  return target;
}

function throwingGetter(key: string): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  Object.defineProperty(target, key, {
    enumerable: true,
    get(): never {
      throw new Error('getter');
    },
  });
  return target;
}

function throwingOwnKeysProxy(base: object): unknown {
  return new Proxy(base, {
    ownKeys(): never {
      throw new Error('ownKeys');
    },
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function timed<T>(fn: () => T): { result: T; ms: number } {
  const started = performance.now();
  const result = fn();
  return { result, ms: performance.now() - started };
}

/** An array with a hole between the given entries (length = entries + 1). */
function holey(entries: readonly unknown[]): unknown[] {
  const result: unknown[] = [];
  entries.forEach((entry, index) => {
    result[index === 0 ? 0 : index + 1] = entry;
  });
  return result;
}

class ReadyLike {
  readonly type = 'ready';
}

/** Generic container and key attacks; `valid` is a message that the parser accepts. */
function shapeAttacks(valid: Record<string, unknown>): [string, unknown][] {
  const type = valid.type as string;
  return [
    ['undefined', undefined],
    ['null', null],
    ['0', 0],
    ['NaN', Number.NaN],
    ['empty string', ''],
    ['the type as a bare string', type],
    ['true', true],
    ['a function', () => valid],
    ['a symbol', Symbol(type)],
    ['a bigint', 1n],
    ['an empty array', []],
    ['an array holding the message', [valid]],
    ['an empty object', {}],
    ['type in another case', { ...valid, type: type.toUpperCase() }],
    ['type capitalised', { ...valid, type: type.charAt(0).toUpperCase() + type.slice(1) }],
    ['type with a leading space', { ...valid, type: ` ${type}` }],
    ['type with a trailing NUL', { ...valid, type: `${type}\u0000` }],
    ['type not a string', { ...valid, type: 1 }],
    ['an extra key', { ...valid, extra: 1 }],
    ['a symbol key', { ...valid, [Symbol('x')]: 1 }],
    ['a non-enumerable extra own key', withNonEnumerable({ ...valid }, 'hidden')],
    [
      'an own __proto__ key from JSON',
      JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(valid).slice(1)}`),
    ],
    ['a constructor key', { ...valid, constructor: 1 }],
    ['a class instance', Object.assign(new ReadyLike(), valid)],
    ['an inherited type key', Object.create(valid) as unknown],
    ['a Map', new Map(Object.entries(valid))],
    ['a Date', new Date()],
    ['a boxed String', new String(type)],
    ['a throwing type getter', throwingGetter('type')],
    ['a Proxy whose ownKeys throws', throwingOwnKeysProxy({ ...valid })],
    [
      'a Proxy of the valid message whose get throws',
      new Proxy(
        { ...valid },
        {
          get: () => {
            throw new Error('get');
          },
        },
      ),
    ],
    ['a frozen object with an extra key', Object.freeze({ ...valid, extra: 1 })],
  ];
}

/** Progress values the parsers must reject, as [label, value] (E1 test note 2 and 3). */
function progressAttacks(): [string, unknown][] {
  const withValue = (key: string, value: unknown): unknown => ({ ...PROGRESS, [key]: value });
  const without = (key: string): unknown => {
    const copy: Record<string, unknown> = { ...PROGRESS };
    delete copy[key];
    return copy;
  };
  const counters = ['stageIndex', 'killsInStage', 'totalKills', 'bossesDefeated', 'cycle'];
  const attacks: [string, unknown][] = [
    ['an extra key', { ...PROGRESS, agentId: 'a' }],
    ['a string-named extra key', { ...PROGRESS, name: 'SECRET' }],
    ['a symbol key', { ...PROGRESS, [Symbol('x')]: 1 }],
    ['a non-enumerable extra key', withNonEnumerable({ ...PROGRESS }, 'hidden')],
    ['an array', [1, 1, 0, 0, 0, 0]],
    ['a string', JSON.stringify(PROGRESS)],
    ['a number', 1],
    ['an inherited shape', Object.create(PROGRESS) as unknown],
    ['a class instance', Object.assign(new (class P {})(), PROGRESS)],
    ['schemaVersion 0', withValue('schemaVersion', 0)],
    ['schemaVersion 2', withValue('schemaVersion', 2)],
    ['schemaVersion "1"', withValue('schemaVersion', '1')],
    ['stageIndex 0', withValue('stageIndex', 0)],
    [`stageIndex ${MAX_STAGE_INDEX + 1}`, withValue('stageIndex', MAX_STAGE_INDEX + 1)],
    [
      'a throwing getter',
      Object.assign(throwingGetter('cycle'), {
        schemaVersion: 1,
        stageIndex: 1,
        killsInStage: 0,
        totalKills: 0,
        bossesDefeated: 0,
      }),
    ],
  ];
  for (const key of ['schemaVersion', ...counters]) {
    attacks.push([`missing ${key}`, without(key)]);
  }
  for (const key of counters) {
    for (const [label, value] of [
      ['a string', '1'],
      ['a float', 1.5],
      ['a negative', -1],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['null', null],
      ['a bigint', 1n],
      ['above the cap', MAX_PROGRESS_COUNT + 1],
      ['an unsafe integer', 2 ** 53],
    ] as const) {
      attacks.push([`${key} ${label}`, withValue(key, value)]);
    }
  }
  return attacks;
}

void describe('protocol: exhaustive message and state lists (note 1)', () => {
  void it('lists exactly the host-to-webview types', () => {
    assert.deepEqual([...HOST_TO_WEBVIEW_TYPES], ['config', 'agentList', 'agentState', 'progress']);
  });

  void it('lists exactly the webview-to-host types (ready, reveal-only focusAgent, saveProgress)', () => {
    assert.deepEqual([...WEBVIEW_TO_HOST_TYPES], ['ready', 'focusAgent', 'saveProgress']);
  });

  void it('lists exactly the four agent states', () => {
    assert.deepEqual([...AGENT_STATES], ['spawned', 'working', 'idle', 'despawned']);
  });

  void it('isAgentState accepts exactly the four states', () => {
    for (const state of AGENT_STATES) {
      assert.equal(isAgentState(state), true);
    }
    for (const value of ['dead', 'downed', 'Working', '', ' idle', null, undefined, 0, {}]) {
      assert.equal(isAgentState(value), false, JSON.stringify(value) ?? 'undefined');
    }
  });

  void it('PROTOCOL_VERSION is 2 (E1 added the game settings and the progress messages)', () => {
    assert.equal(PROTOCOL_VERSION, 2);
  });
});

void describe('assertNever (note 1)', () => {
  void it('throws TypeError("Unexpected variant") without the value', () => {
    assert.throws(
      () => assertNever('secret-text' as never),
      (error: unknown) =>
        error instanceof TypeError &&
        error.message === 'Unexpected variant' &&
        !String(error.stack).includes('secret-text'),
    );
  });

  void it('does not include an object value either', () => {
    assert.throws(
      () => assertNever({ type: 'secret-text' } as never),
      (error: unknown) => error instanceof TypeError && !error.message.includes('secret'),
    );
  });
});

void describe('protocol: limits and patterns', () => {
  void it('has the planned limits', () => {
    assert.deepEqual(
      [MAX_AGENT_ID_LENGTH, MAX_AGENT_NAME_LENGTH, MAX_TOOL_NAME_LENGTH, MAX_AGENTS],
      [128, 64, 128, 64],
    );
  });

  void it('id and tool-name patterns allow no whitespace, so free text cannot ride in them', () => {
    for (const pattern of [AGENT_ID_PATTERN, TOOL_NAME_PATTERN]) {
      assert.equal(pattern.test('a b'), false);
      assert.equal(pattern.test('a\tb'), false);
      assert.equal(pattern.test('a\nb'), false);
    }
  });

  void it('isAgentId: 1..128 chars, alphanumeric start, then [A-Za-z0-9._:-]', () => {
    for (const id of [
      'a',
      'sim-1',
      'A.b_c:d-e',
      '0',
      'a'.repeat(128),
      'f3b2c1d0-1234-5678-9abc-def012345678',
    ]) {
      assert.equal(isAgentId(id), true, id);
    }
    for (const id of [
      '',
      '-abc',
      '.a',
      '_a',
      'a b',
      'a\u0000',
      'a/b',
      'a'.repeat(129),
      'é',
      1,
      null,
      undefined,
    ]) {
      assert.equal(isAgentId(id), false, String(id));
    }
  });
});

void describe('parseWebviewMessage: rejections (note 2)', () => {
  const cases: [string, unknown][] = [
    ...shapeAttacks({ type: 'ready' }),
    ['ready with a symbol key', { type: 'ready', [Symbol('x')]: 1 }],
    ['ready with a constructor key', { type: 'ready', constructor: 1 }],
    ['focusAgent without agentId', { type: 'focusAgent' }],
    ['focusAgent with a numeric agentId', { type: 'focusAgent', agentId: 1 }],
    ['focusAgent with a null agentId', { type: 'focusAgent', agentId: null }],
    ['focusAgent with an empty agentId', { type: 'focusAgent', agentId: '' }],
    ['focusAgent with a 129-char agentId', { type: 'focusAgent', agentId: 'a'.repeat(129) }],
    ['focusAgent with a leading dash', { type: 'focusAgent', agentId: '-abc' }],
    ['focusAgent with a space', { type: 'focusAgent', agentId: 'a b' }],
    ['focusAgent with a NUL', { type: 'focusAgent', agentId: 'a\u0000' }],
    ['focusAgent with a boxed string agentId', { type: 'focusAgent', agentId: new String('a') }],
    ['focusAgent with an extra command key', { type: 'focusAgent', agentId: 'a', command: 'kill' }],
    ['focusAgent with an extra text key', { type: 'focusAgent', agentId: 'a', text: 'x' }],
    [
      'focusAgent with a non-enumerable extra key',
      withNonEnumerable({ type: 'focusAgent', agentId: 'a' }, 'command'),
    ],
    [
      'focusAgent with a throwing agentId getter',
      Object.assign(throwingGetter('agentId'), { type: 'focusAgent' }),
    ],
    ['stopAgent', { type: 'stopAgent', agentId: 'a' }],
    ['killAgent', { type: 'killAgent', agentId: 'a' }],
    ['sendText', { type: 'sendText', text: 'x' }],
    ['sendInput', { type: 'sendInput', agentId: 'a', input: 'y' }],
    ['executeCommand', { type: 'executeCommand', command: 'workbench.action.terminal.kill' }],
    ['a host message type sent the wrong way', { type: 'agentList', agents: [] }],
    ['config sent the wrong way', { type: 'config', config: CONFIG }],
    ['progress sent the wrong way', { type: 'progress', progress: PROGRESS }],
    ['agentState sent the wrong way', { type: 'agentState', agent: AGENT }],
    ['saveProgress without progress', { type: 'saveProgress' }],
    ['saveProgress with a null progress', { type: 'saveProgress', progress: null }],
    [
      'saveProgress with an extra top-level key',
      { type: 'saveProgress', progress: PROGRESS, agentId: 'a' },
    ],
    ['saveProgress naming an agent', { type: 'saveProgress', progress: PROGRESS, agent: AGENT }],
    ['saveProgress with a progress array', { type: 'saveProgress', progress: [PROGRESS] }],
    [
      'saveProgress with a class-instance progress',
      { type: 'saveProgress', progress: Object.assign(new (class P {})(), PROGRESS) },
    ],
    ...shapeAttacks({ type: 'saveProgress', progress: PROGRESS }).map(
      ([label, raw]): [string, unknown] => [`saveProgress: ${label}`, raw],
    ),
    ...progressAttacks().map(([label, progress]): [string, unknown] => [
      `saveProgress with ${label}`,
      { type: 'saveProgress', progress },
    ]),
  ];

  for (const [label, raw] of cases) {
    void it(`rejects ${label} without throwing`, () => {
      let result: unknown = 'not called';
      assert.doesNotThrow(() => {
        result = parseWebviewMessage(raw);
      });
      assert.equal(result, undefined);
    });
  }

  void it('rejects a 1,000,000-char agentId in under 50 ms', () => {
    const raw = { type: 'focusAgent', agentId: 'a'.repeat(1_000_000) };
    const { result, ms } = timed(() => parseWebviewMessage(raw));
    assert.equal(result, undefined);
    assert.ok(ms < 50, `took ${ms.toFixed(1)} ms`);
  });
});

void describe('parseWebviewMessage: acceptances (note 2)', () => {
  const accepted: [string, Record<string, unknown>, unknown][] = [
    ['ready', { type: 'ready' }, { type: 'ready' }],
    [
      'null-prototype ready',
      Object.assign(Object.create(null) as object, { type: 'ready' }),
      { type: 'ready' },
    ],
    [
      'focusAgent sim-1',
      { type: 'focusAgent', agentId: 'sim-1' },
      { type: 'focusAgent', agentId: 'sim-1' },
    ],
    [
      'focusAgent with a 128-char id',
      { type: 'focusAgent', agentId: 'a'.repeat(128) },
      { type: 'focusAgent', agentId: 'a'.repeat(128) },
    ],
    [
      'a frozen focusAgent',
      Object.freeze({ type: 'focusAgent', agentId: 'x.y:z' }),
      { type: 'focusAgent', agentId: 'x.y:z' },
    ],
    [
      'saveProgress with the default progress',
      { type: 'saveProgress', progress: { ...DEFAULT_PROGRESS } },
      { type: 'saveProgress', progress: { ...DEFAULT_PROGRESS } },
    ],
    [
      'saveProgress with a mid-game progress',
      { type: 'saveProgress', progress: { ...PROGRESS } },
      { type: 'saveProgress', progress: { ...PROGRESS } },
    ],
    [
      'saveProgress at the maximum counters',
      {
        type: 'saveProgress',
        progress: {
          ...PROGRESS,
          stageIndex: MAX_STAGE_INDEX,
          killsInStage: MAX_PROGRESS_COUNT,
          totalKills: MAX_PROGRESS_COUNT,
          bossesDefeated: MAX_PROGRESS_COUNT,
          cycle: MAX_PROGRESS_COUNT,
        },
      },
      {
        type: 'saveProgress',
        progress: {
          ...PROGRESS,
          stageIndex: MAX_STAGE_INDEX,
          killsInStage: MAX_PROGRESS_COUNT,
          totalKills: MAX_PROGRESS_COUNT,
          bossesDefeated: MAX_PROGRESS_COUNT,
          cycle: MAX_PROGRESS_COUNT,
        },
      },
    ],
  ];

  for (const [label, raw, expected] of accepted) {
    void it(`accepts ${label} as a new object with exactly the expected keys`, () => {
      const result = parseWebviewMessage(raw);
      assert.deepEqual(result, expected);
      assert.notEqual(result, raw);
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.deepEqual(Object.getOwnPropertyNames(result), Object.keys(expected as object));
    });
  }

  void it('accepts a structured clone (what VS Code delivers)', () => {
    assert.deepEqual(parseWebviewMessage(structuredClone({ type: 'ready' })), { type: 'ready' });
  });

  void it('returns a new progress object (no aliasing of the nested value)', () => {
    const raw = { type: 'saveProgress', progress: { ...PROGRESS } };
    const parsed = parseWebviewMessage(raw);
    assert.ok(parsed?.type === 'saveProgress');
    assert.notEqual(parsed.progress, raw.progress);
    assert.deepEqual(Object.keys(parsed.progress), Object.keys(DEFAULT_PROGRESS));
  });

  void it('does not mutate its input', () => {
    const raw = { type: 'focusAgent', agentId: 'sim-1' };
    const before = JSON.stringify(raw);
    parseWebviewMessage(raw);
    assert.equal(JSON.stringify(raw), before);
  });
});

void describe('parseHostMessage: rejections (note 3)', () => {
  const cases: [string, unknown][] = [
    ...shapeAttacks({ type: 'config', config: CONFIG }).map(([label, raw]): [string, unknown] => [
      `config: ${label}`,
      raw,
    ]),
    ...shapeAttacks(agentList([])).map(([label, raw]): [string, unknown] => [
      `agentList: ${label}`,
      raw,
    ]),
    ...shapeAttacks(agentState(AGENT)).map(([label, raw]): [string, unknown] => [
      `agentState: ${label}`,
      raw,
    ]),
    ...shapeAttacks({ type: 'progress', progress: PROGRESS }).map(
      ([label, raw]): [string, unknown] => [`progress: ${label}`, raw],
    ),
    ...progressAttacks().map(([label, progress]): [string, unknown] => [
      `progress with ${label}`,
      { type: 'progress', progress },
    ]),
    ['progress missing', { type: 'progress' }],
    [
      'progress with an extra top-level key',
      { type: 'progress', progress: PROGRESS, agent: AGENT },
    ],
    // AgentInfo: missing keys
    ...AGENT_INFO_KEYS.map((key): [string, unknown] => [
      `agent missing ${key}`,
      agentState(without(key)),
    ]),
    ...AGENT_INFO_KEYS.map((key): [string, unknown] => [
      `listed agent missing ${key}`,
      agentList([without(key)]),
    ]),
    // AgentInfo: extra keys (privacy allow-list and no hero health, invariants 7 and 1)
    ...['text', 'content', 'message', 'cwd', 'hp', 'prompt', 'transcriptPath', 'health'].map(
      (key): [string, unknown] => [
        `agent with extra key ${key}`,
        agentState(agent({ [key]: 'SECRET' })),
      ],
    ),
    ['agent with a non-enumerable extra key', agentState(withNonEnumerable({ ...AGENT }, 'text'))],
    ['agent with a symbol key', agentState({ ...AGENT, [Symbol('text')]: 'SECRET' })],
    ['agent as a class instance', agentState(Object.assign(new (class Agent {})(), AGENT))],
    ['agent with inherited fields', agentState(Object.create(AGENT) as unknown)],
    ['agent null', agentState(null)],
    ['agent an array', agentState([AGENT])],
    ['agent a throwing getter', agentState(Object.assign(throwingGetter('name'), without('name')))],
    ['agent a Proxy whose ownKeys throws', agentState(throwingOwnKeysProxy({ ...AGENT }))],
    // state
    ['state dead', agentState(agent({ state: 'dead' }))],
    ['state downed', agentState(agent({ state: 'downed' }))],
    ['state Working', agentState(agent({ state: 'Working' }))],
    ['state null', agentState(agent({ state: null }))],
    // toolName
    ['toolName empty', agentState(agent({ toolName: '' }))],
    ['toolName with a space', agentState(agent({ toolName: 'Bash tool' }))],
    ['toolName undefined (present)', agentState(agent({ toolName: undefined }))],
    ['toolName a number', agentState(agent({ toolName: 1 }))],
    ['toolName 129 chars', agentState(agent({ toolName: 'a'.repeat(129) }))],
    ['toolName starting with a dash', agentState(agent({ toolName: '-x' }))],
    ['toolName with a newline', agentState(agent({ toolName: 'Bash\n' }))],
    // name
    ['name empty', agentState(agent({ name: '' }))],
    ['name blank', agentState(agent({ name: '   ' }))],
    ['name only a tab', agentState(agent({ name: '\t' }))],
    ['name 65 chars', agentState(agent({ name: 'n'.repeat(65) }))],
    ['name with a newline', agentState(agent({ name: 'a\nb' }))],
    ['name with NUL', agentState(agent({ name: 'a\u0000' }))],
    ['name with ESC', agentState(agent({ name: '\u001b[31mred' }))],
    ['name with DEL', agentState(agent({ name: 'a\u007f' }))],
    ['name with a C1 control (NEL)', agentState(agent({ name: 'a\u0085' }))],
    ['name with RLO (U+202E)', agentState(agent({ name: 'a‮b' }))],
    ['name with LRE (U+202A)', agentState(agent({ name: 'a‪b' }))],
    ['name with an isolate (U+2066)', agentState(agent({ name: 'a⁦b' }))],
    ['name with PDI (U+2069)', agentState(agent({ name: 'a⁩b' }))],
    ['name a number', agentState(agent({ name: 1 }))],
    ['name null', agentState(agent({ name: null }))],
    // id
    ['id empty', agentState(agent({ id: '' }))],
    ['id with a space', agentState(agent({ id: 'a b' }))],
    ['id 129 chars', agentState(agent({ id: 'a'.repeat(129) }))],
    ['id a number', agentState(agent({ id: 1 }))],
    // timestamp
    ...[-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53, -0.5].map(
      (timestamp): [string, unknown] => [
        `timestamp ${timestamp}`,
        agentState(agent({ timestamp })),
      ],
    ),
    ['timestamp a string', agentState(agent({ timestamp: '1' }))],
    ['timestamp null', agentState(agent({ timestamp: null }))],
    ['timestamp a bigint', agentState(agent({ timestamp: 1n }))],
    // agents
    ['agents an object', agentList({ 0: AGENT, length: 1 })],
    ['agents a string', agentList('[]')],
    ['agents null', agentList(null)],
    ['agents missing', { type: 'agentList' }],
    [
      'agents with 65 entries',
      agentList(Array.from({ length: 65 }, (_, i) => agent({ id: `a${i}` }))),
    ],
    ['agents with duplicate ids', agentList([AGENT, agent({ name: 'Other' })])],
    ['agents with one invalid entry', agentList([AGENT, agent({ id: 'b', state: 'dead' })])],
    ['agents with a hole', agentList(holey([AGENT, agent({ id: 'b' })]))],
    ['agents with a null entry', agentList([null])],
    // config
    [
      'config protocolVersion 1 (the old version)',
      { type: 'config', config: { ...CONFIG, protocolVersion: 1 } },
    ],
    ['config protocolVersion 3', { type: 'config', config: { ...CONFIG, protocolVersion: 3 } }],
    ['config protocolVersion "2"', { type: 'config', config: { ...CONFIG, protocolVersion: '2' } }],
    ['config with only the old key', { type: 'config', config: { protocolVersion: 2 } }],
    ['config with an extra key', { type: 'config', config: { ...CONFIG, sound: true } }],
    ...(['protocolVersion', 'enemiesEnabled', 'killsPerStage', 'maxEnemies'] as const).map(
      (key): [string, unknown] => {
        const partial: Record<string, unknown> = { ...CONFIG };
        delete partial[key];
        return [`config missing ${key}`, { type: 'config', config: partial }];
      },
    ),
    [
      'config enemiesEnabled a string',
      { type: 'config', config: { ...CONFIG, enemiesEnabled: 'true' } },
    ],
    ['config enemiesEnabled 1', { type: 'config', config: { ...CONFIG, enemiesEnabled: 1 } }],
    ...[4, 501, 0, -1, 30.5, Number.NaN, Number.POSITIVE_INFINITY, '30', null].map(
      (killsPerStage): [string, unknown] => [
        `config killsPerStage ${String(killsPerStage)}`,
        { type: 'config', config: { ...CONFIG, killsPerStage } },
      ],
    ),
    ...[0, 13, -1, 6.5, Number.NaN, Number.POSITIVE_INFINITY, '6', null].map(
      (maxEnemies): [string, unknown] => [
        `config maxEnemies ${String(maxEnemies)}`,
        { type: 'config', config: { ...CONFIG, maxEnemies } },
      ],
    ),
    ['config empty', { type: 'config', config: {} }],
    ['config missing', { type: 'config' }],
    ['config null', { type: 'config', config: null }],
    ['config an array', { type: 'config', config: [1] }],
    [
      'config with an inherited protocolVersion',
      { type: 'config', config: Object.create(CONFIG) as unknown },
    ],
    // wrong direction and unknown types
    ['ready sent the wrong way', { type: 'ready' }],
    ['focusAgent sent the wrong way', { type: 'focusAgent', agentId: 'a' }],
    ['saveProgress sent the wrong way', { type: 'saveProgress', progress: PROGRESS }],
    ['an unknown type', { type: 'agentHealth', agent: AGENT }],
  ];

  for (const [label, raw] of cases) {
    void it(`rejects ${label} without throwing`, () => {
      let result: unknown = 'not called';
      assert.doesNotThrow(() => {
        result = parseHostMessage(raw);
      });
      assert.equal(result, undefined);
    });
  }

  for (const [field, value] of [
    ['id', 'a'.repeat(1_000_000)],
    ['name', 'n'.repeat(1_000_000)],
    ['toolName', 't'.repeat(1_000_000)],
  ] as const) {
    void it(`rejects a 1,000,000-char ${field} in under 50 ms`, () => {
      const raw = agentList([agent({ [field]: value })]);
      const { result, ms } = timed(() => parseHostMessage(raw));
      assert.equal(result, undefined);
      assert.ok(ms < 50, `took ${ms.toFixed(1)} ms`);
    });
  }
});

void describe('parseHostMessage: acceptances (note 3)', () => {
  void it('accepts a config with protocolVersion 2 and the three game settings', () => {
    assert.deepEqual(parseHostMessage({ type: 'config', config: { ...CONFIG } }), {
      type: 'config',
      config: CONFIG,
    });
  });

  void it('accepts the config range boundaries', () => {
    for (const config of [
      { ...CONFIG, killsPerStage: 5, maxEnemies: 1, enemiesEnabled: false },
      { ...CONFIG, killsPerStage: 500, maxEnemies: 12 },
    ]) {
      assert.deepEqual(parseHostMessage({ type: 'config', config }), { type: 'config', config });
    }
  });

  void it('accepts a progress message (default, mid-game, and the maximum stage)', () => {
    for (const progress of [
      DEFAULT_PROGRESS,
      PROGRESS,
      { ...PROGRESS, stageIndex: MAX_STAGE_INDEX },
    ]) {
      assert.deepEqual(parseHostMessage({ type: 'progress', progress: { ...progress } }), {
        type: 'progress',
        progress,
      });
    }
  });

  void it('accepts a null-prototype progress and a frozen one', () => {
    const nullProto = Object.assign(Object.create(null) as object, PROGRESS);
    assert.deepEqual(parseHostMessage({ type: 'progress', progress: nullProto }), {
      type: 'progress',
      progress: PROGRESS,
    });
    assert.deepEqual(
      parseHostMessage(deepFreeze({ type: 'progress', progress: { ...PROGRESS } })),
      {
        type: 'progress',
        progress: PROGRESS,
      },
    );
  });

  void it('accepts an empty agentList and one with 64 agents', () => {
    assert.deepEqual(parseHostMessage(agentList([])), { type: 'agentList', agents: [] });
    const agents = Array.from({ length: 64 }, (_, i) => agent({ id: `a${i}` }));
    assert.deepEqual(parseHostMessage(agentList(agents)), { type: 'agentList', agents });
  });

  void it('accepts every state, toolName null, and the boundary values', () => {
    for (const state of AGENT_STATES) {
      assert.deepEqual(
        parseHostMessage(agentState(agent({ state }))),
        agentState(agent({ state })),
      );
    }
    const boundaries = [
      agent({ toolName: null }),
      agent({ toolName: 'mcp__server__tool' }),
      agent({ toolName: 't'.repeat(128) }),
      agent({ name: 'n'.repeat(64) }),
      agent({ name: ' padded name ' }),
      agent({ name: 'Ünïcödé 名前 🐉' }),
      agent({ id: 'a'.repeat(128) }),
      agent({ timestamp: 0 }),
      agent({ timestamp: Number.MAX_SAFE_INTEGER }),
    ];
    for (const value of boundaries) {
      assert.deepEqual(
        parseHostMessage(agentState(value)),
        agentState(value),
        JSON.stringify(value),
      );
    }
  });

  void it('accepts null-prototype containers at every level', () => {
    const nullProto = <T extends object>(value: T): T =>
      Object.assign<object, T>(Object.create(null) as object, value);
    const raw = nullProto({ type: 'agentState', agent: nullProto({ ...AGENT }) });
    assert.deepEqual(parseHostMessage(raw), agentState(AGENT));
  });

  void it('returns new objects at every level and does not alias or mutate the input', () => {
    const rawAgent = { ...AGENT };
    const rawList = { type: 'agentList', agents: [rawAgent] };
    const before = JSON.stringify(rawList);
    const parsed = parseHostMessage(rawList);
    assert.ok(parsed?.type === 'agentList');
    assert.notEqual(parsed, rawList);
    assert.notEqual(parsed.agents, rawList.agents);
    assert.notEqual(parsed.agents[0], rawAgent);
    assert.deepEqual(Object.keys(parsed.agents[0] ?? {}), [...AGENT_INFO_KEYS]);
    assert.equal(JSON.stringify(rawList), before);
    rawAgent.name = 'changed later';
    assert.equal(parsed.agents[0]?.name, AGENT.name, 'later input changes do not leak in');

    const rawConfig = { type: 'config', config: { ...CONFIG } };
    const config = parseHostMessage(rawConfig);
    assert.ok(config?.type === 'config');
    assert.notEqual(config.config, rawConfig.config);

    const rawState = agentState({ ...AGENT });
    const state = parseHostMessage(rawState);
    assert.ok(state?.type === 'agentState');
    assert.notEqual(state.agent, rawState.agent);

    const rawProgress = { type: 'progress', progress: { ...PROGRESS } };
    const progress = parseHostMessage(rawProgress);
    assert.ok(progress?.type === 'progress');
    assert.notEqual(progress.progress, rawProgress.progress);
  });

  void it('strips extra properties on the agents array (only validated entries are copied)', () => {
    const agents = Object.assign([{ ...AGENT }], { extra: 'SECRET' });
    const parsed = parseHostMessage(agentList(agents));
    assert.deepEqual(parsed, agentList([AGENT]));
    assert.ok(
      !JSON.stringify(Object.getOwnPropertyNames((parsed as { agents: object }).agents)).includes(
        'extra',
      ),
    );
  });

  void it('works on deeply frozen input', () => {
    const raw = deepFreeze(agentList([{ ...AGENT }]));
    assert.deepEqual(parseHostMessage(raw), agentList([AGENT]));
  });
});

void describe('protocol: cross-realm objects (node:vm)', () => {
  // Decision: rejecting cross-realm plain objects does not matter in the real webview, because
  // postMessage structured-clones event.data into the receiving realm. These tests pin the
  // behaviour so a change to isPlainObject is deliberate, and show the clone path is accepted.
  const realm = vm.createContext({});
  const foreign = (expression: string): unknown => vm.runInContext(`(${expression})`, realm);

  void it('rejects a plain object built in another realm (its Object.prototype differs)', () => {
    assert.equal(parseWebviewMessage(foreign(`{ type: 'ready' }`)), undefined);
    assert.equal(
      parseHostMessage(foreign(`{ type: 'config', config: ${JSON.stringify(CONFIG)} }`)),
      undefined,
    );
    assert.equal(isAgentInfo(foreign(JSON.stringify(AGENT))), false);
  });

  void it('accepts the same data once structured-cloned into this realm (what postMessage does)', () => {
    assert.deepEqual(parseWebviewMessage(structuredClone(foreign(`{ type: 'ready' }`))), {
      type: 'ready',
    });
    const list = foreign(`{ type: 'agentList', agents: [${JSON.stringify(AGENT)}] }`);
    assert.deepEqual(parseHostMessage(structuredClone(list)), agentList([AGENT]));
  });

  void it('accepts a null-prototype object from another realm (no realm-specific prototype)', () => {
    assert.deepEqual(
      parseWebviewMessage(foreign(`Object.assign(Object.create(null), { type: 'ready' })`)),
      { type: 'ready' },
    );
  });
});

void describe('creators and the privacy allow-list (note 5)', () => {
  const leaky = {
    ...AGENT,
    text: 'SECRET-TEXT',
    content: 'SECRET-CONTENT',
    prompt: 'SECRET-PROMPT',
    cwd: '/home/SECRET-CWD',
    transcriptPath: '/home/SECRET-PATH.jsonl',
  };

  void it('AGENT_INFO_KEYS is exactly the five allow-listed keys, in order', () => {
    assert.deepEqual([...AGENT_INFO_KEYS], ['id', 'name', 'state', 'toolName', 'timestamp']);
  });

  void it('toAgentInfo copies exactly the five keys, in AGENT_INFO_KEYS order, into a new object', () => {
    const reordered = { timestamp: 5, toolName: null, state: 'idle', name: 'N', id: 'z', extra: 1 };
    const copy = toAgentInfo(reordered as unknown as AgentInfo);
    assert.deepEqual(Object.keys(copy ?? {}), [...AGENT_INFO_KEYS]);
    assert.notEqual(copy, reordered);
    const fromLeaky = toAgentInfo(leaky);
    assert.deepEqual(Object.keys(fromLeaky ?? {}), [...AGENT_INFO_KEYS]);
    assert.deepEqual(fromLeaky, AGENT);
  });

  void it('toAgentInfo does not repair or truncate: an invalid source yields undefined', () => {
    for (const bad of [
      agent({ name: 'n'.repeat(65) }),
      agent({ toolName: 'Bash tool' }),
      agent({ state: 'dead' }),
      agent({ timestamp: -1 }),
      agent({ id: '' }),
      without('name'),
    ]) {
      assert.equal(toAgentInfo(bad as unknown as AgentInfo), undefined, JSON.stringify(bad));
    }
  });

  void it('toAgentInfo never throws (throwing getter, null, Proxy)', () => {
    const throwing = Object.assign(throwingGetter('name'), without('name'));
    for (const source of [throwing, null, undefined]) {
      let result: unknown = 'not called';
      assert.doesNotThrow(() => {
        result = toAgentInfo(source as unknown as AgentInfo);
      });
      assert.equal(result, undefined);
    }
    // The creator reads the five keys by name, so a Proxy whose ownKeys throws still copies.
    assert.deepEqual(toAgentInfo(throwingOwnKeysProxy({ ...AGENT }) as AgentInfo), AGENT);
  });

  void it('no extra value reaches the wire through any creator', () => {
    const wire = [
      JSON.stringify(createAgentListMessage([leaky])),
      JSON.stringify(createAgentStateMessage(leaky)),
    ].join('\n');
    assert.ok(!wire.includes('SECRET'), wire);
  });

  void it('createConfigMessage copies exactly the four config keys', () => {
    const message = createConfigMessage({ ...CONFIG, sound: true } as unknown as ConfigSnapshot);
    assert.deepEqual(message, { type: 'config', config: CONFIG });
    assert.deepEqual(Object.keys(message.config), [
      'protocolVersion',
      'enemiesEnabled',
      'killsPerStage',
      'maxEnemies',
    ]);
  });

  void it('createProgressMessage and createSaveProgressMessage copy exactly the six progress keys', () => {
    const leakyProgress = { ...PROGRESS, agentId: 'SECRET', name: 'SECRET' } as unknown as Progress;
    const host = createProgressMessage(leakyProgress);
    const web = createSaveProgressMessage(leakyProgress);
    assert.deepEqual(host, { type: 'progress', progress: PROGRESS });
    assert.deepEqual(web, { type: 'saveProgress', progress: PROGRESS });
    assert.ok(!JSON.stringify([host, web]).includes('SECRET'));
    assert.notEqual(host?.progress, leakyProgress);
  });

  void it('the progress creators return undefined for an invalid value and never throw', () => {
    const bad = [
      { ...PROGRESS, stageIndex: 0 },
      { ...PROGRESS, totalKills: -1 },
      { ...PROGRESS, killsInStage: 1.5 },
      { ...PROGRESS, schemaVersion: 2 },
      null,
      undefined,
      throwingGetter('stageIndex'),
    ];
    for (const value of bad) {
      assert.doesNotThrow(() => createProgressMessage(value as unknown as Progress));
      assert.equal(createProgressMessage(value as unknown as Progress), undefined);
      assert.equal(createSaveProgressMessage(value as unknown as Progress), undefined);
    }
  });

  void it('createAgentListMessage drops invalid entries and keeps the first of duplicate ids', () => {
    const second = agent({ id: 'sim-2', name: 'Second' });
    const message = createAgentListMessage([
      AGENT,
      agent({ state: 'dead', id: 'bad' }) as unknown as AgentInfo,
      agent({ name: 'Duplicate' }) as unknown as AgentInfo,
      second as unknown as AgentInfo,
    ]);
    assert.deepEqual(message, agentList([AGENT, second]));
  });

  void it('createAgentListMessage caps at 64 agents (the first 64 valid ones)', () => {
    const agents = Array.from(
      { length: 100 },
      (_, i) => agent({ id: `a${i}` }) as unknown as AgentInfo,
    );
    const message = createAgentListMessage(agents);
    assert.equal(message.agents.length, MAX_AGENTS);
    assert.deepEqual(message.agents, agents.slice(0, MAX_AGENTS));
  });

  void it('createAgentListMessage skips invalid entries before applying the cap', () => {
    const invalid = Array.from({ length: 10 }, () => agent({ id: '' }) as unknown as AgentInfo);
    const valid = Array.from(
      { length: 64 },
      (_, i) => agent({ id: `v${i}` }) as unknown as AgentInfo,
    );
    assert.equal(createAgentListMessage([...invalid, ...valid]).agents.length, 64);
  });

  void it('createAgentStateMessage returns undefined for an invalid agent', () => {
    assert.equal(createAgentStateMessage(agent({ name: '' }) as unknown as AgentInfo), undefined);
  });

  void it('every creator output survives structuredClone and parses back deep-equal', () => {
    const outputs = [
      createConfigMessage(CONFIG),
      createProgressMessage(PROGRESS),
      createAgentListMessage([]),
      createAgentListMessage([leaky, agent({ id: 'x', toolName: null }) as unknown as AgentInfo]),
      createAgentStateMessage(leaky),
      ...AGENT_STATES.map((state) =>
        createAgentStateMessage(agent({ state }) as unknown as AgentInfo),
      ),
    ];
    for (const output of outputs) {
      assert.ok(output !== undefined);
      assert.deepEqual(parseHostMessage(structuredClone(output)), output);
    }
  });
});
