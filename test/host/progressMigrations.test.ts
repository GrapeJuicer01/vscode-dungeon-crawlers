// src/host/progressMigrations.ts (E1 plan test note 2; ADR 0012). The runner is forward-only,
// total (never throws), and reports where the value came from. Version 1 is the first schema, so
// MIGRATIONS is empty today; the chain tests use injected steps and a contrived final step,
// because the runner validates the migrated value with the current isProgress (schemaVersion 1).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MIGRATIONS, migrateProgress } from '../../src/host/progressMigrations';
import type { MigrationStep } from '../../src/host/progressMigrations';
import {
  DEFAULT_PROGRESS,
  MAX_STAGE_INDEX,
  PROGRESS_SCHEMA_VERSION,
} from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';

const V1: Progress = {
  schemaVersion: 1,
  stageIndex: 2,
  killsInStage: 9,
  totalKills: 99,
  bossesDefeated: 1,
  cycle: 0,
};

/** Every stored shape this version of the extension has ever written, by schema version. */
const STORED_BY_VERSION: readonly (readonly [number, Progress])[] = [[1, V1]];

void describe('MIGRATIONS (the registry)', () => {
  void it('has exactly one step per version bump: schema N needs N - 1 steps', () => {
    assert.equal(MIGRATIONS.length, PROGRESS_SCHEMA_VERSION - 1);
  });

  void it('every step is a function', () => {
    for (const step of MIGRATIONS) {
      assert.equal(typeof step, 'function');
    }
  });

  void it('a value stored by every prior schema version loads to the current schema', () => {
    for (const [version, stored] of STORED_BY_VERSION) {
      const outcome = migrateProgress(stored);
      assert.equal(outcome.progress.schemaVersion, PROGRESS_SCHEMA_VERSION, `from v${version}`);
      assert.equal(outcome.source, version === PROGRESS_SCHEMA_VERSION ? 'stored' : 'migrated');
      assert.deepEqual(
        outcome.progress,
        version === PROGRESS_SCHEMA_VERSION ? stored : outcome.progress,
      );
    }
  });
});

void describe('migrateProgress: sources', () => {
  void it('undefined is a fresh install: the default, source fresh', () => {
    assert.deepEqual(migrateProgress(undefined), { progress: DEFAULT_PROGRESS, source: 'fresh' });
  });

  void it('a valid v1 is returned as a new, equal object, source stored', () => {
    const raw = { ...V1 };
    const outcome = migrateProgress(raw);
    assert.equal(outcome.source, 'stored');
    assert.deepEqual(outcome.progress, V1);
    assert.notEqual(outcome.progress, raw);
  });

  void it('does not mutate its input', () => {
    const raw = Object.freeze({ ...V1 });
    assert.doesNotThrow(() => migrateProgress(raw));
    assert.deepEqual(raw, V1);
  });

  for (const [label, raw] of [
    ['null', null],
    ['a string', 'progress'],
    ['a number', 7],
    ['true', true],
    ['an array', [V1]],
    ['an empty object', {}],
    ['a missing schemaVersion', { ...V1, schemaVersion: undefined }],
    ['schemaVersion 0', { ...V1, schemaVersion: 0 }],
    ['a negative schemaVersion', { ...V1, schemaVersion: -1 }],
    ['a fractional schemaVersion', { ...V1, schemaVersion: 1.5 }],
    ['a string schemaVersion', { ...V1, schemaVersion: '1' }],
    ['a NaN schemaVersion', { ...V1, schemaVersion: Number.NaN }],
    ['a v1 with an extra key', { ...V1, agentId: 'a' }],
    ['a v1 missing a counter', { ...V1, cycle: undefined }],
    ['a v1 with stageIndex 0', { ...V1, stageIndex: 0 }],
    [`a v1 with stageIndex ${MAX_STAGE_INDEX + 1}`, { ...V1, stageIndex: MAX_STAGE_INDEX + 1 }],
    ['a v1 with a string counter', { ...V1, totalKills: '99' }],
    ['a v1 with a negative counter', { ...V1, totalKills: -1 }],
    ['a class instance', Object.assign(new (class Stored {})(), V1)],
    ['inherited fields', Object.create(V1) as unknown],
  ] as [string, unknown][]) {
    void it(`junk (${label}): invalid, the default, never throws`, () => {
      let outcome: ReturnType<typeof migrateProgress> | undefined;
      assert.doesNotThrow(() => {
        outcome = migrateProgress(raw);
      });
      assert.deepEqual(outcome, { progress: DEFAULT_PROGRESS, source: 'invalid' });
    });
  }

  void it('hostile objects (throwing getter, throwing Proxy) are invalid and never throw', () => {
    const getter = { ...V1 };
    Object.defineProperty(getter, 'totalKills', {
      enumerable: true,
      get(): never {
        throw new Error('getter');
      },
    });
    const proxy = new Proxy(
      { ...V1 },
      {
        getPrototypeOf(): never {
          throw new Error('proto');
        },
        ownKeys(): never {
          throw new Error('ownKeys');
        },
      },
    );
    for (const raw of [getter, proxy]) {
      assert.doesNotThrow(() => migrateProgress(raw));
      assert.equal(migrateProgress(raw).source, 'invalid');
    }
  });

  for (const version of [2, 3, 99, Number.MAX_SAFE_INTEGER]) {
    void it(`schemaVersion ${version} is from a newer version: source future, the default`, () => {
      const outcome = migrateProgress({ ...V1, schemaVersion: version });
      assert.deepEqual(outcome, { progress: DEFAULT_PROGRESS, source: 'future' });
    });
  }

  void it('a future value is classified by its version alone, whatever else it holds', () => {
    assert.equal(migrateProgress({ schemaVersion: 99, brandNew: 'field' }).source, 'future');
  });
});

void describe('migrateProgress: the runner with an injected chain', () => {
  // The injected "current" is 3, but isProgress still demands schemaVersion 1 (it checks the
  // PROGRESS_SCHEMA_VERSION constant), so the last step of these contrived chains writes 1. In a
  // real bump the constant and the validator move together.
  const toV2: MigrationStep = (raw) => ({ ...raw, schemaVersion: 2 });
  const toV3: MigrationStep = (raw) => ({ ...raw, schemaVersion: 1 });

  void it('runs the steps in order, one per version, and reports migrated', () => {
    const calls: number[] = [];
    const steps: MigrationStep[] = [
      (raw) => {
        calls.push(Number(raw['schemaVersion']));
        return toV2(raw);
      },
      (raw) => {
        calls.push(Number(raw['schemaVersion']));
        return toV3(raw);
      },
    ];
    const outcome = migrateProgress(V1, steps, 3);
    assert.deepEqual(calls, [1, 2], 'v1 goes through step 1 then v2 through step 2');
    assert.equal(outcome.source, 'migrated');
    assert.deepEqual(outcome.progress, V1);
  });

  void it('a value already at an intermediate version only runs the remaining steps', () => {
    const calls: string[] = [];
    const steps: MigrationStep[] = [
      (raw) => {
        calls.push('v1->v2');
        return toV2(raw);
      },
      (raw) => {
        calls.push('v2->v3');
        return toV3(raw);
      },
    ];
    const outcome = migrateProgress({ ...V1, schemaVersion: 2 }, steps, 3);
    assert.deepEqual(calls, ['v2->v3']);
    assert.equal(outcome.source, 'migrated');
  });

  void it('a value already at the injected current is stored and runs no step', () => {
    let ran = 0;
    const counting: MigrationStep = (raw) => {
      ran += 1;
      return { ...raw };
    };
    const outcome = migrateProgress(V1, [counting, counting], 1);
    assert.equal(outcome.source, 'stored');
    assert.equal(ran, 0);
  });

  void it('a value newer than the injected current is future and runs no step', () => {
    let ran = 0;
    const outcome = migrateProgress(
      { ...V1, schemaVersion: 4 },
      [
        (raw) => {
          ran += 1;
          return raw;
        },
      ],
      3,
    );
    assert.equal(outcome.source, 'future');
    assert.equal(ran, 0);
  });

  void it('a step that throws gives invalid, the default, and nothing escapes', () => {
    const steps: MigrationStep[] = [
      toV2,
      () => {
        throw new Error('step broke SECRET');
      },
    ];
    let outcome: ReturnType<typeof migrateProgress> | undefined;
    assert.doesNotThrow(() => {
      outcome = migrateProgress(V1, steps, 3);
    });
    assert.deepEqual(outcome, { progress: DEFAULT_PROGRESS, source: 'invalid' });
  });

  for (const [label, bad] of [
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['an invalid shape', { schemaVersion: 1, stageIndex: 0 }],
    ['an object with an extra key', { ...V1, extra: 1 }],
  ] as [string, unknown][]) {
    void it(`a step returning ${label} gives invalid`, () => {
      const outcome = migrateProgress(V1, [toV2, () => bad as Record<string, unknown>], 3);
      assert.deepEqual(outcome, { progress: DEFAULT_PROGRESS, source: 'invalid' });
    });
  }

  void it('a missing step in the chain gives invalid (a gap is never skipped)', () => {
    assert.deepEqual(migrateProgress(V1, [toV2], 3), {
      progress: DEFAULT_PROGRESS,
      source: 'invalid',
    });
    assert.deepEqual(migrateProgress(V1, [], 2), { progress: DEFAULT_PROGRESS, source: 'invalid' });
  });

  void it('a step cannot mutate the stored value it was given', () => {
    const raw = { ...V1 };
    const outcome = migrateProgress(
      raw,
      [
        (copy) => {
          (copy as Record<string, unknown>)['stageIndex'] = 9;
          return { ...copy, schemaVersion: 1 };
        },
      ],
      2,
    );
    assert.equal(raw.stageIndex, 2, 'the caller’s object is untouched');
    assert.equal(outcome.progress.stageIndex, 9);
  });
});
