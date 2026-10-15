// Unit tests for src/shared/progress.ts (E1 plan test note 2; data-model.md section 7). The
// persisted progress is a closed, numeric, versioned shape: exact keys, safe integers within
// range, never a string. The validator and the creator are total.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PROGRESS,
  isProgress,
  MAX_PROGRESS_COUNT,
  MAX_STAGE_INDEX,
  PROGRESS_KEYS,
  PROGRESS_SCHEMA_VERSION,
  toProgress,
} from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';

const MID: Progress = {
  schemaVersion: 1,
  stageIndex: 3,
  killsInStage: 12,
  totalKills: 230,
  bossesDefeated: 2,
  cycle: 1,
};

function counterKeys(): string[] {
  return PROGRESS_KEYS.filter((key) => key !== 'schemaVersion');
}

void describe('progress: constants and defaults', () => {
  void it('is schema version 1 with exactly six keys, in order', () => {
    assert.equal(PROGRESS_SCHEMA_VERSION, 1);
    assert.deepEqual(
      [...PROGRESS_KEYS],
      ['schemaVersion', 'stageIndex', 'killsInStage', 'totalKills', 'bossesDefeated', 'cycle'],
    );
  });

  void it('the default is stage 1 with zero counters, valid, and frozen', () => {
    assert.deepEqual(DEFAULT_PROGRESS, {
      schemaVersion: 1,
      stageIndex: 1,
      killsInStage: 0,
      totalKills: 0,
      bossesDefeated: 0,
      cycle: 0,
    });
    assert.equal(isProgress(DEFAULT_PROGRESS), true);
    assert.equal(Object.isFrozen(DEFAULT_PROGRESS), true);
  });

  void it('the shape holds no string-valued field: nothing about an agent can be stored (invariant 7)', () => {
    for (const value of Object.values(DEFAULT_PROGRESS)) {
      assert.equal(typeof value, 'number');
    }
  });

  void it('the full game has ten stages and a counter cap of one billion', () => {
    assert.equal(MAX_STAGE_INDEX, 10);
    assert.equal(MAX_PROGRESS_COUNT, 1_000_000_000);
  });
});

void describe('isProgress: acceptances', () => {
  void it('accepts the default, a mid-game value, and the maximum', () => {
    assert.equal(isProgress(DEFAULT_PROGRESS), true);
    assert.equal(isProgress(MID), true);
    assert.equal(
      isProgress({
        ...MID,
        stageIndex: MAX_STAGE_INDEX,
        killsInStage: MAX_PROGRESS_COUNT,
        totalKills: MAX_PROGRESS_COUNT,
        bossesDefeated: MAX_PROGRESS_COUNT,
        cycle: MAX_PROGRESS_COUNT,
      }),
      true,
    );
  });

  void it('accepts a null-prototype object and a frozen one', () => {
    assert.equal(isProgress(Object.assign(Object.create(null) as object, MID)), true);
    assert.equal(isProgress(Object.freeze({ ...MID })), true);
  });

  void it('accepts the keys in any order', () => {
    const reordered = {
      cycle: 1,
      bossesDefeated: 2,
      totalKills: 230,
      killsInStage: 12,
      stageIndex: 3,
      schemaVersion: 1,
    };
    assert.equal(isProgress(reordered), true);
  });
});

void describe('isProgress: rejections', () => {
  const cases: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['a string', JSON.stringify(MID)],
    ['a number', 1],
    ['an array', [1, 1, 0, 0, 0, 0]],
    ['an array of the six values', Object.values(MID)],
    ['an empty object', {}],
    ['an extra key', { ...MID, extra: 1 }],
    ['an extra string key', { ...MID, agentId: 'a' }],
    ['a symbol key', { ...MID, [Symbol('x')]: 1 }],
    ['a non-enumerable extra key', Object.defineProperty({ ...MID }, 'hidden', { value: 1 })],
    ['a class instance', Object.assign(new (class Progress1 {})(), MID)],
    ['inherited keys', Object.create(MID) as unknown],
    ['a Map', new Map(Object.entries(MID))],
    ['schemaVersion 0', { ...MID, schemaVersion: 0 }],
    ['schemaVersion 2', { ...MID, schemaVersion: 2 }],
    ['schemaVersion "1"', { ...MID, schemaVersion: '1' }],
    ['stageIndex 0', { ...MID, stageIndex: 0 }],
    [`stageIndex ${MAX_STAGE_INDEX + 1}`, { ...MID, stageIndex: MAX_STAGE_INDEX + 1 }],
  ];
  for (const key of PROGRESS_KEYS) {
    const copy: Record<string, unknown> = { ...MID };
    delete copy[key];
    cases.push([`missing ${key}`, copy]);
  }
  for (const key of counterKeys()) {
    for (const [label, value] of [
      ['a string', '1'],
      ['a float', 1.5],
      ['a negative', -1],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
      ['null', null],
      ['a bigint', 1n],
      ['a boxed number', Object(1) as unknown],
      ['above the cap', MAX_PROGRESS_COUNT + 1],
      ['an unsafe integer', 2 ** 53],
    ] as const) {
      cases.push([`${key} as ${label}`, { ...MID, [key]: value }]);
    }
  }

  for (const [label, value] of cases) {
    void it(`rejects ${label} without throwing`, () => {
      let result: unknown = 'not called';
      assert.doesNotThrow(() => {
        result = isProgress(value);
      });
      assert.equal(result, false);
    });
  }

  void it('never throws for hostile objects (throwing getter, Proxy traps)', () => {
    const getter = { ...MID };
    Object.defineProperty(getter, 'cycle', {
      enumerable: true,
      get(): never {
        throw new Error('getter');
      },
    });
    const ownKeysThrows = new Proxy(
      { ...MID },
      {
        ownKeys(): never {
          throw new Error('ownKeys');
        },
      },
    );
    const protoThrows = new Proxy(
      { ...MID },
      {
        getPrototypeOf(): never {
          throw new Error('getPrototypeOf');
        },
      },
    );
    for (const hostile of [getter, ownKeysThrows, protoThrows]) {
      assert.doesNotThrow(() => isProgress(hostile));
      assert.equal(isProgress(hostile), false);
    }
  });
});

void describe('toProgress', () => {
  void it('copies exactly the six keys, in order, into a new object', () => {
    const leaky = { ...MID, agentId: 'SECRET', name: 'SECRET' } as unknown as Progress;
    const copy = toProgress(leaky);
    assert.deepEqual(copy, MID);
    assert.notEqual(copy, leaky);
    assert.deepEqual(Object.keys(copy ?? {}), [...PROGRESS_KEYS]);
    assert.ok(!JSON.stringify(copy).includes('SECRET'));
  });

  void it('returns undefined for an invalid source and never throws', () => {
    const bad = [
      { ...MID, stageIndex: 0 },
      { ...MID, totalKills: -1 },
      { ...MID, killsInStage: 0.5 },
      { ...MID, schemaVersion: 2 },
      null,
      undefined,
      {},
    ];
    for (const value of bad) {
      assert.doesNotThrow(() => toProgress(value as Progress));
      assert.equal(toProgress(value as Progress), undefined);
    }
    const getter = Object.defineProperty({ ...MID }, 'cycle', {
      get(): never {
        throw new Error('getter');
      },
    });
    assert.equal(toProgress(getter), undefined);
  });

  void it('does not alias or mutate the input', () => {
    const source = { ...MID };
    const copy = toProgress(source);
    assert.notEqual(copy, source);
    assert.deepEqual(source, MID);
  });
});
