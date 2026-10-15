// Seeded fuzz for the protocol parsers (M2 plan test note 4). Deterministic PRNG (mulberry32,
// inline, no package). 10,000 iterations per parser over random JSON-like values to depth 3 and
// mutations of valid messages. Each parser result is compared with an independent reference
// oracle written from host-webview-protocol.md section 4, so both false accepts and false
// rejects fail. Accepted values must also equal what the host creators produce. The seed and
// iteration are printed in every failure message.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAgentListMessage,
  createAgentStateMessage,
  createConfigMessage,
  createProgressMessage,
  parseHostMessage,
  parseWebviewMessage,
} from '../../src/shared/protocol';
import type {
  AgentInfo,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from '../../src/shared/protocol';

const SEED = 0x5eed_2002;
const ITERATIONS = 10_000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Gen {
  readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) {
      throw new Error('pick from an empty list');
    }
    return item;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  string(): string {
    const pools = ['abcXYZ019', '._:-', ' \t\n', '\u0000\u001f\u007f\u0085', '‪‮⁦⁩', 'éü名🐉'];
    const length = this.pick([0, 1, 2, 5, 16, 63, 64, 65, 127, 128, 129]);
    let out = '';
    for (let i = 0; i < length; i += 1) {
      // Mostly safe characters, so valid-looking strings are common.
      const pool = this.chance(0.85) ? (pools[0] ?? '') : this.pick(pools);
      out += [...pool][this.int([...pool].length)] ?? 'a';
    }
    return out;
  }

  /** Strings that hit known field values often enough to produce acceptances. */
  interestingString(): string {
    return this.pick([
      'ready',
      'focusAgent',
      'config',
      'agentList',
      'agentState',
      'progress',
      'saveProgress',
      'spawned',
      'working',
      'idle',
      'despawned',
      'dead',
      'sim-1',
      'Bash',
      'mcp__server__tool',
      'Sim one',
      '',
      this.string(),
    ]);
  }

  number(): number {
    return this.pick([
      0,
      1,
      2,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 53,
      Number.MAX_SAFE_INTEGER,
      1_700_000_000_000,
      5,
      6,
      12,
      30,
      500,
      10,
      1_000_000_000,
      1_000_000_001,
      this.int(1_000_000),
    ]);
  }

  key(): string {
    return this.pick([
      'type',
      'agentId',
      'config',
      'protocolVersion',
      'enemiesEnabled',
      'killsPerStage',
      'maxEnemies',
      'progress',
      'schemaVersion',
      'stageIndex',
      'killsInStage',
      'totalKills',
      'bossesDefeated',
      'cycle',
      'agents',
      'agent',
      'id',
      'name',
      'state',
      'toolName',
      'timestamp',
      'text',
      'command',
      'hp',
      '__proto__',
      'constructor',
      this.string(),
    ]);
  }

  value(depth: number): unknown {
    const kinds = depth >= 3 ? 5 : 7;
    switch (this.int(kinds)) {
      case 0:
        return null;
      case 1:
        return this.chance(0.5);
      case 2:
        return this.number();
      case 3:
        return this.interestingString();
      case 4:
        return this.string();
      case 5: {
        const length = this.int(4);
        return Array.from({ length }, () => this.value(depth + 1));
      }
      default: {
        const obj: Record<string, unknown> = {};
        const count = this.int(4);
        for (let i = 0; i < count; i += 1) {
          // defineProperty so a random '__proto__' key becomes an own key, as JSON.parse does.
          Object.defineProperty(obj, this.key(), {
            value: this.value(depth + 1),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        return obj;
      }
    }
  }

  agent(): Record<string, unknown> {
    return {
      id: this.pick(['sim-1', 'sim-2', 'a', `id${this.int(100)}`]),
      name: this.pick(['Sim one', 'A', 'n'.repeat(64)]),
      state: this.pick(['spawned', 'working', 'idle', 'despawned']),
      toolName: this.pick([null, 'Bash', 'Read', 'mcp__server__tool']),
      timestamp: this.pick([0, 1, 1_700_000_000_000]),
    };
  }

  progress(): Record<string, unknown> {
    return {
      schemaVersion: 1,
      stageIndex: this.pick([1, 2, 10]),
      killsInStage: this.pick([0, 7, 30]),
      totalKills: this.pick([0, 57, 1_000_000_000]),
      bossesDefeated: this.pick([0, 1, 3]),
      cycle: this.pick([0, 1, 8]),
    };
  }

  validWebview(): Record<string, unknown> {
    switch (this.int(3)) {
      case 0:
        return { type: 'ready' };
      case 1:
        return { type: 'focusAgent', agentId: this.pick(['sim-1', 'a', 'x.y:z-0']) };
      default:
        return { type: 'saveProgress', progress: this.progress() };
    }
  }

  validHost(): Record<string, unknown> {
    switch (this.int(4)) {
      case 0:
        return {
          type: 'config',
          config: {
            protocolVersion: 2,
            enemiesEnabled: this.chance(0.5),
            killsPerStage: this.pick([5, 30, 500]),
            maxEnemies: this.pick([1, 6, 12]),
          },
        };
      case 3:
        return { type: 'progress', progress: this.progress() };
      case 1: {
        const count = this.int(4);
        return { type: 'agentList', agents: Array.from({ length: count }, () => this.agent()) };
      }
      default:
        return { type: 'agentState', agent: this.agent() };
    }
  }

  /** One random mutation of a nested object somewhere inside `root` (which is modified). */
  mutate(root: Record<string, unknown>): void {
    const containers: Record<string, unknown>[] = [root];
    const visit = (value: unknown): void => {
      if (typeof value === 'object' && value !== null) {
        if (!Array.isArray(value)) {
          containers.push(value as Record<string, unknown>);
        }
        for (const child of Object.values(value)) {
          visit(child);
        }
      }
    };
    for (const child of Object.values(root)) {
      visit(child);
    }
    const target = this.pick(containers);
    const keys = Object.keys(target);
    const key = keys.length > 0 ? this.pick(keys) : 'type';
    switch (this.int(6)) {
      case 0:
        delete target[key];
        return;
      case 1:
        target[this.key()] = this.value(2);
        return;
      case 2:
        target[key] = this.value(2);
        return;
      case 3:
        target[key] = this.pick([
          'ready',
          'focusAgent',
          'config',
          'agentList',
          'agentState',
          'progress',
          'saveProgress',
          'stopAgent',
        ]);
        return;
      case 4:
        target[key] = 'x'.repeat(this.pick([65, 129, 10_000]));
        return;
      default: {
        // Duplicate an agent in a list, or leave things as they are (still a valid case).
        const agents = root.agents;
        if (Array.isArray(agents) && agents.length > 0) {
          agents.push({ ...(agents[0] as object) });
        }
      }
    }
  }
}

// ---- Reference oracle (independent of src/shared/protocol.ts) ----

function plain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function keysAre(obj: object, keys: readonly string[]): boolean {
  const own = Reflect.ownKeys(obj);
  return (
    own.length === keys.length && own.every((key) => typeof key === 'string' && keys.includes(key))
  );
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOOL = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;
// eslint-disable-next-line no-control-regex -- the rule under test is exactly "no control characters".
const FORBIDDEN_NAME = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

function oracleAgent(value: unknown): AgentInfo | undefined {
  if (!plain(value) || !keysAre(value, ['id', 'name', 'state', 'toolName', 'timestamp'])) {
    return undefined;
  }
  const { id, name, state, toolName, timestamp } = value;
  const ok =
    typeof id === 'string' &&
    id.length <= 128 &&
    ID.test(id) &&
    typeof name === 'string' &&
    name.length >= 1 &&
    name.length <= 64 &&
    name.trim() !== '' &&
    !FORBIDDEN_NAME.test(name) &&
    (state === 'spawned' || state === 'working' || state === 'idle' || state === 'despawned') &&
    (toolName === null ||
      (typeof toolName === 'string' && toolName.length <= 128 && TOOL.test(toolName))) &&
    typeof timestamp === 'number' &&
    Number.isSafeInteger(timestamp) &&
    timestamp >= 0;
  return ok ? { id, name, state, toolName, timestamp } : undefined;
}

const PROGRESS_KEYS = [
  'schemaVersion',
  'stageIndex',
  'killsInStage',
  'totalKills',
  'bossesDefeated',
  'cycle',
] as const;

function oracleCount(value: unknown, min = 0, max = 1_000_000_000): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** An independent restatement of the Progress rules (data-model.md section 7). */
function oracleProgress(value: unknown): Record<string, number> | undefined {
  if (!plain(value) || !keysAre(value, PROGRESS_KEYS)) {
    return undefined;
  }
  const ok =
    value.schemaVersion === 1 &&
    oracleCount(value.stageIndex, 1, 10) &&
    oracleCount(value.killsInStage) &&
    oracleCount(value.totalKills) &&
    oracleCount(value.bossesDefeated) &&
    oracleCount(value.cycle);
  if (!ok) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    stageIndex: value.stageIndex as number,
    killsInStage: value.killsInStage as number,
    totalKills: value.totalKills as number,
    bossesDefeated: value.bossesDefeated as number,
    cycle: value.cycle as number,
  };
}

function oracleWebview(raw: unknown): WebviewToHostMessage | undefined {
  if (!plain(raw) || !Object.prototype.hasOwnProperty.call(raw, 'type')) {
    return undefined;
  }
  if (raw.type === 'ready' && keysAre(raw, ['type'])) {
    return { type: 'ready' };
  }
  if (raw.type === 'focusAgent' && keysAre(raw, ['type', 'agentId'])) {
    const id = raw.agentId;
    return typeof id === 'string' && id.length <= 128 && ID.test(id)
      ? { type: 'focusAgent', agentId: id }
      : undefined;
  }
  if (raw.type === 'saveProgress' && keysAre(raw, ['type', 'progress'])) {
    const progress = oracleProgress(raw.progress);
    return progress === undefined
      ? undefined
      : ({ type: 'saveProgress', progress } as unknown as WebviewToHostMessage);
  }
  return undefined;
}

function oracleHost(raw: unknown): HostToWebviewMessage | undefined {
  if (!plain(raw) || !Object.prototype.hasOwnProperty.call(raw, 'type')) {
    return undefined;
  }
  if (raw.type === 'config' && keysAre(raw, ['type', 'config'])) {
    const config = raw.config;
    if (
      plain(config) &&
      keysAre(config, ['protocolVersion', 'enemiesEnabled', 'killsPerStage', 'maxEnemies']) &&
      config.protocolVersion === 2 &&
      typeof config.enemiesEnabled === 'boolean' &&
      oracleCount(config.killsPerStage, 5, 500) &&
      oracleCount(config.maxEnemies, 1, 12)
    ) {
      return {
        type: 'config',
        config: {
          protocolVersion: 2,
          enemiesEnabled: config.enemiesEnabled,
          killsPerStage: config.killsPerStage,
          maxEnemies: config.maxEnemies,
        },
      };
    }
    return undefined;
  }
  if (raw.type === 'progress' && keysAre(raw, ['type', 'progress'])) {
    const progress = oracleProgress(raw.progress);
    return progress === undefined
      ? undefined
      : ({ type: 'progress', progress } as unknown as HostToWebviewMessage);
  }
  if (raw.type === 'agentList' && keysAre(raw, ['type', 'agents'])) {
    const list = raw.agents;
    if (!Array.isArray(list) || list.length > 64) {
      return undefined;
    }
    const agents: AgentInfo[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const entry = oracleAgent(list[i] as unknown);
      if (entry === undefined || agents.some((other) => other.id === entry.id)) {
        return undefined;
      }
      agents.push(entry);
    }
    return { type: 'agentList', agents };
  }
  if (raw.type === 'agentState' && keysAre(raw, ['type', 'agent'])) {
    const agent = oracleAgent(raw.agent);
    return agent === undefined ? undefined : { type: 'agentState', agent };
  }
  return undefined;
}

/** What the host creators produce for the same fields as an accepted message. */
function viaCreators(message: HostToWebviewMessage): HostToWebviewMessage | undefined {
  switch (message.type) {
    case 'config':
      return createConfigMessage(message.config);
    case 'agentList':
      return createAgentListMessage(message.agents);
    case 'agentState':
      return createAgentStateMessage(message.agent);
    case 'progress':
      return createProgressMessage(message.progress);
    default:
      return undefined;
  }
}

function expectedKeys(message: HostToWebviewMessage | WebviewToHostMessage): string[] {
  switch (message.type) {
    case 'ready':
      return ['type'];
    case 'focusAgent':
      return ['type', 'agentId'];
    case 'config':
      return ['type', 'config'];
    case 'agentList':
      return ['type', 'agents'];
    case 'agentState':
      return ['type', 'agent'];
    case 'progress':
    case 'saveProgress':
      return ['type', 'progress'];
    default:
      return [];
  }
}

function describeInput(raw: unknown): string {
  try {
    const text = JSON.stringify(raw) ?? String(raw);
    return text.length > 300 ? `${text.slice(0, 300)}...` : text;
  } catch {
    return '<unserialisable>';
  }
}

interface Stats {
  accepted: number;
  rejected: number;
}

function fuzz<T>(
  parse: (raw: unknown) => T | undefined,
  oracle: (raw: unknown) => T | undefined,
  inputFor: (gen: Gen) => unknown,
  check: (accepted: T, where: string) => void,
): Stats {
  const gen = new Gen(SEED);
  const stats: Stats = { accepted: 0, rejected: 0 };
  for (let i = 0; i < ITERATIONS; i += 1) {
    const raw = inputFor(gen);
    const where = `seed 0x${SEED.toString(16)}, iteration ${i}, input ${describeInput(raw)}`;
    const expected = oracle(raw);
    let actual: T | undefined;
    try {
      actual = parse(raw);
    } catch (error: unknown) {
      assert.fail(`parser threw (${String(error)}) at ${where}`);
    }
    assert.deepEqual(actual, expected, `parser and oracle disagree at ${where}`);
    if (actual === undefined) {
      stats.rejected += 1;
    } else {
      assert.notEqual(actual, raw, `returned its input at ${where}`);
      check(actual, where);
      stats.accepted += 1;
    }
  }
  return stats;
}

function webviewInput(gen: Gen): unknown {
  if (gen.chance(0.4)) {
    return gen.value(0);
  }
  const message = gen.validWebview();
  if (gen.chance(0.8)) {
    gen.mutate(message);
  }
  return message;
}

function hostInput(gen: Gen): unknown {
  if (gen.chance(0.4)) {
    return gen.value(0);
  }
  const message = gen.validHost();
  if (gen.chance(0.8)) {
    gen.mutate(message);
  }
  return message;
}

void describe(`protocol fuzz (seed 0x${SEED.toString(16)}, ${ITERATIONS} iterations per parser)`, () => {
  void it('parseWebviewMessage never throws and matches the reference oracle', () => {
    const stats = fuzz(parseWebviewMessage, oracleWebview, webviewInput, (accepted, where) => {
      assert.deepEqual(Object.keys(accepted), expectedKeys(accepted), `keys at ${where}`);
      if (accepted.type === 'saveProgress') {
        assert.deepEqual(Object.keys(accepted.progress), [...PROGRESS_KEYS], where);
      }
    });
    // Guards against a vacuous run: both outcomes must be exercised substantially.
    assert.ok(stats.accepted > 500, `only ${stats.accepted} acceptances`);
    assert.ok(stats.rejected > 2_000, `only ${stats.rejected} rejections`);
  });

  void it('parseHostMessage never throws, matches the oracle, and equals the creators’ output', () => {
    const stats = fuzz(parseHostMessage, oracleHost, hostInput, (accepted, where) => {
      assert.deepEqual(Object.keys(accepted), expectedKeys(accepted), `keys at ${where}`);
      assert.deepEqual(accepted, viaCreators(accepted), `creators differ at ${where}`);
      if (accepted.type === 'agentList') {
        for (const agent of accepted.agents) {
          assert.deepEqual(
            Object.keys(agent),
            ['id', 'name', 'state', 'toolName', 'timestamp'],
            where,
          );
        }
      }
      if (accepted.type === 'progress') {
        assert.deepEqual(Object.keys(accepted.progress), [...PROGRESS_KEYS], where);
      }
      if (accepted.type === 'config') {
        assert.deepEqual(
          Object.keys(accepted.config),
          ['protocolVersion', 'enemiesEnabled', 'killsPerStage', 'maxEnemies'],
          where,
        );
      }
      if (accepted.type === 'agentState') {
        assert.deepEqual(
          Object.keys(accepted.agent),
          ['id', 'name', 'state', 'toolName', 'timestamp'],
          where,
        );
      }
    });
    assert.ok(stats.accepted > 500, `only ${stats.accepted} acceptances`);
    assert.ok(stats.rejected > 2_000, `only ${stats.rejected} rejections`);
  });

  void it('the oracle agrees with the parsers on hand-picked boundary cases (oracle self-check)', () => {
    const agent = { id: 'a', name: 'A', state: 'idle', toolName: null, timestamp: 0 };
    assert.deepEqual(
      oracleHost({ type: 'agentState', agent }),
      parseHostMessage({ type: 'agentState', agent }),
    );
    assert.equal(oracleHost({ type: 'agentState', agent: { ...agent, name: '‮' } }), undefined);
    assert.equal(oracleWebview({ type: 'ready', x: 1 }), undefined);
    assert.deepEqual(oracleWebview({ type: 'ready' }), { type: 'ready' });
  });
});
