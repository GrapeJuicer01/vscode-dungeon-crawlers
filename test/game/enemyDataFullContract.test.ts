// The enemy validator's full contract (E5 plan sections 5.4 and 7 note 2, ADR 0014). Exactly 10 stages,
// exactly 50 rows, 50 unique kebab-case ids, 5 rows per stage, exactly one boss per stage, at least one
// minion per stage, with fixed error texts. These were staged (skipped) until the E5 atomic switch; the
// switch landed, so every case runs and there are no skips.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENEMIES, bossFor, enemiesForStage, validateEnemies } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import type { StageDef } from '../../src/game/data/stages';
import { MAX_STAGE_INDEX } from '../../src/shared/progress';
import { gameRig } from '../support/engineFakes';

const stages: readonly StageDef[] = Array.from({ length: 10 }, (_, i) => ({
  ...STAGES[0]!,
  id: `synthetic-stage-${i + 1}`,
  index: i + 1,
}));
const TIERS = ['minion', 'minion', 'minion', 'elite', 'boss'] as const;
const table: readonly EnemyRow[] = stages.flatMap((s) =>
  TIERS.map((tier, k): EnemyRow => ({
    id: `enemy-${s.index}-${k + 1}`,
    name: `Enemy ${s.index} ${k + 1}`,
    stage: s.index,
    tier,
    gait: 'walk',
    vigor: 1,
    pace: 1,
    drop: 'coin',
  })),
);
const edit = (id: string, patch: Partial<{ -readonly [K in keyof EnemyRow]: EnemyRow[K] }>) =>
  table.map((r) => (r.id === id ? { ...r, ...patch } : r));
const extra = (patch: Partial<{ -readonly [K in keyof EnemyRow]: EnemyRow[K] }>): EnemyRow => ({
  ...table[0]!,
  ...patch,
});

void describe('validateEnemies full contract: crafted tables with exact texts', () => {
  void it('the synthetic reference table is valid', () => {
    assert.equal(table.length, 50);
    assert.equal(new Set(table.map((r) => r.id)).size, 50);
    assert.deepEqual(validateEnemies(table, stages), []);
  });

  void it('nine stages (sliced) and eleven stages (extended)', () => {
    const nine = validateEnemies(table, stages.slice(0, 9));
    assert.ok(nine.includes('expected exactly 10 stages, found 9'), nine.join());
    const eleven = validateEnemies(table, [...stages, { ...stages[0]!, id: 's11', index: 11 }]);
    assert.ok(eleven.includes('expected exactly 10 stages, found 11'), eleven.join());
  });

  void it('a stage-index gap', () => {
    const gap = stages.map((s) => (s.index === 5 ? { ...s, index: 11 } : s));
    const errors = validateEnemies(table, gap);
    assert.ok(errors.includes('stage indexes must be 1 to 10'), errors.join());
  });

  void it('forty-nine and fifty-one rows', () => {
    const short = validateEnemies(table.slice(0, 49), stages);
    assert.ok(short.includes('expected 50 enemies for 10 stages'), short.join());
    const long = validateEnemies([...table, extra({ id: 'extra-one', stage: 2 })], stages);
    assert.ok(long.includes('expected 50 enemies for 10 stages'), long.join());
    assert.ok(long.includes('stage 2: expected exactly 5 enemies, found 6'), long.join());
  });

  void it('a duplicate id gives the per-row text and the unique-count text', () => {
    const errors = validateEnemies(edit('enemy-3-2', { id: 'enemy-1-1' }), stages);
    const at = table.findIndex((r) => r.id === 'enemy-3-2') + 1;
    assert.ok(errors.includes(`enemy ${at}: duplicate id`), errors.join());
    assert.ok(errors.includes('expected 50 unique ids, found 49'), errors.join());
  });

  void it('two bosses in one stage, and no boss in a stage', () => {
    const two = validateEnemies(edit('enemy-4-1', { tier: 'boss' }), stages);
    assert.ok(two.includes('stage 4: expected exactly 1 boss, found 2'), two.join());
    const none = validateEnemies(edit('enemy-6-5', { tier: 'elite' }), stages);
    assert.ok(none.includes('stage 6: expected exactly 1 boss, found 0'), none.join());
  });

  void it('a stage with six rows', () => {
    const errors = validateEnemies([...table, extra({ id: 'sixth-one', stage: 9 })], stages);
    assert.ok(errors.includes('stage 9: expected exactly 5 enemies, found 6'), errors.join());
  });

  void it('a row for stage 11', () => {
    const errors = validateEnemies(edit('enemy-10-1', { stage: 11 }), stages);
    const at = table.findIndex((r) => r.id === 'enemy-10-1') + 1;
    assert.ok(errors.includes(`enemy ${at}: stage does not exist`), errors.join());
    assert.ok(errors.includes('stage 10: expected exactly 5 enemies, found 4'), errors.join());
  });

  void it('a stage with no minion', () => {
    const noMinions = table.map((r) =>
      r.stage === 2 && r.tier === 'minion' ? { ...r, tier: 'elite' as const } : r,
    );
    assert.ok(validateEnemies(noMinions, stages).includes('stage 2: needs at least 1 minion'));
  });

  void it('a prefix of the full game is no longer valid', () => {
    const errors = validateEnemies(table.slice(0, 5), stages.slice(0, 1));
    assert.ok(errors.includes('expected exactly 10 stages, found 1'), errors.join());
    assert.ok(errors.includes('expected 50 enemies for 10 stages'), errors.join());
  });

  void it('junk input returns errors and never throws', () => {
    for (const junk of [null, undefined, 7, 'x', {}, [null], [1, 2], [{}]]) {
      let result: readonly string[] = [];
      assert.doesNotThrow(() => {
        result = validateEnemies(junk as readonly EnemyRow[], stages);
      });
      assert.ok(result.length > 0);
    }
    assert.doesNotThrow(() => validateEnemies(table, null as unknown as readonly StageDef[]));
  });

  void it('is deterministic and does not return its input', () => {
    const a = validateEnemies(table.slice(0, 49), stages);
    assert.deepEqual(a, validateEnemies(table.slice(0, 49), stages));
    assert.notEqual(a, table);
  });
});

void describe('validateEnemies full contract: the shipped tables', () => {
  void it('ENEMIES against STAGES is valid: 50 rows, 10 stages, 50 unique ids', () => {
    assert.equal(ENEMIES.length, 50);
    assert.equal(STAGES.length, 10);
    assert.equal(new Set(ENEMIES.map((r) => r.id)).size, 50);
    assert.deepEqual(validateEnemies(ENEMIES, STAGES), []);
  });

  void it('five rows per stage, exactly one boss, three minions and one elite (table shape)', () => {
    for (const stage of STAGES) {
      const mine = ENEMIES.filter((r) => r.stage === stage.index);
      assert.equal(mine.length, 5, `stage ${stage.index}`);
      assert.equal(mine.filter((r) => r.tier === 'boss').length, 1);
      assert.equal(mine.filter((r) => r.tier === 'minion').length, 3);
      assert.equal(mine.filter((r) => r.tier === 'elite').length, 1);
      assert.equal(enemiesForStage(stage.index).length, 4);
      assert.equal(bossFor(stage.index)?.stage, stage.index);
    }
  });

  void it('guard: STAGES.length === MAX_STAGE_INDEX === 10', () => {
    assert.equal(STAGES.length, MAX_STAGE_INDEX);
    assert.equal(MAX_STAGE_INDEX, 10);
    assert.deepEqual(
      STAGES.map((s) => s.index),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  });

  void it('Game with the shipped table reports no boot error; ENEMIES.slice(0, 49) reports exactly one and combat is disabled', () => {
    const ok = gameRig();
    assert.equal(ok.errors.filter((e) => e.scope === 'boot').length, 0);
    const short = gameRig({ deps: { enemies: ENEMIES.slice(0, 49) } });
    assert.equal(short.errors.length, 1);
    assert.equal(short.errors[0]?.scope, 'boot');
    assert.equal((short.errors[0]?.error as Error).message, 'Enemy data is invalid');
  });
});
