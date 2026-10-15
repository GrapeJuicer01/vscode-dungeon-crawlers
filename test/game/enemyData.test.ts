// The enemy table, its startup validator, the scaling formulas, and the drop table (E1 plan test
// note 1). Since E5 the shipped table is the full 50 rows over 10 stages and the validator enforces
// the full contract (ADR 0014; incremental mode is gone). The exact full-contract texts and the
// synthetic ten-stage tables live in enemyDataFullContract.test.ts; here the shipped table is pinned
// and every crafted fault is applied to it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ABILITY_POWER,
  ABILITY_TARGETS,
  CYCLE_CAP,
  CYCLE_HEALTH_GROWTH,
  ENEMIES,
  ENEMY_IDS,
  ENEMIES_PER_STAGE,
  ENEMY_COUNT,
  HEALTH_GROWTH,
  HEALTH_GROWTH_LATE,
  LATE_GROWTH_FROM_STAGE,
  PARTY_BOSS_GROWTH,
  PARTY_CAP,
  STRIKE_POWER,
  TIER_ATTACK_MS,
  TIER_HEALTH,
  TIER_SHADOW_PX,
  STAGE_COUNT,
  TIER_SPEED_PX_PER_S,
  bossFor,
  enemiesForStage,
  healthOf,
  validateEnemies,
} from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { BOSS_COIN_BURST, DROP_CAPACITY, DROP_CHANCE, DROP_KINDS } from '../../src/game/data/drops';
import { STAGES } from '../../src/game/data/stages';

const rows: readonly EnemyRow[] = ENEMIES;
const [STAGE_1, STAGE_2] = STAGES;
const row = (id: string): EnemyRow => {
  const found = rows.find((r) => r.id === id);
  assert.ok(found, id);
  return found;
};

type Mutable = { -readonly [K in keyof EnemyRow]: EnemyRow[K] };
const edit = (id: string, patch: Partial<Mutable>): readonly EnemyRow[] =>
  rows.map((r) => (r.id === id ? { ...r, ...patch } : r));

void describe('the shipped enemy table (E1 to E5: stages 1 to 10)', () => {
  void it('has fifty rows: ten stages of five, each with four regular rows and exactly one boss', () => {
    assert.equal(rows.length, 50);
    assert.equal(ENEMY_COUNT, 50);
    assert.equal(STAGE_COUNT, 10);
    assert.equal(ENEMIES_PER_STAGE, 5);
    assert.equal(STAGES.length, 10);
    for (const stage of STAGES) {
      const mine = rows.filter((r) => r.stage === stage.index);
      assert.equal(mine.length, 5, `stage ${stage.index}`);
      assert.equal(mine.filter((r) => r.tier === 'boss').length, 1);
      assert.equal(enemiesForStage(stage.index).length, 4);
      assert.equal(bossFor(stage.index)?.stage, stage.index);
      assert.ok(mine.some((r) => r.tier === 'minion'));
    }
  });

  void it('has fifty unique kebab-case ids, exposed as ENEMY_IDS in table order', () => {
    assert.equal(new Set(rows.map((r) => r.id)).size, 50);
    assert.deepEqual(
      ENEMY_IDS,
      rows.map((r) => r.id),
    );
    for (const r of rows) {
      assert.match(r.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  void it('carries exactly the documented default rows', () => {
    assert.deepEqual(
      rows.map((r) => [r.stage, r.id, r.name, r.tier, r.gait, r.vigor, r.pace, r.drop]),
      [
        [1, 'cellar-rat', 'Cellar Rat', 'minion', 'walk', 1.0, 1.1, 'coin'],
        [1, 'cave-bat', 'Cave Bat', 'minion', 'float', 0.8, 1.3, 'coin'],
        [1, 'web-spider', 'Web Spider', 'minion', 'walk', 1.1, 1.0, 'coin'],
        [1, 'crate-mimic', 'Crate Mimic', 'elite', 'hop', 1.0, 0.8, 'gem'],
        [1, 'rat-king', 'Rat King', 'boss', 'walk', 1.0, 0.6, 'chest'],
        [2, 'goblin-miner', 'Goblin Miner', 'minion', 'walk', 1.0, 1.0, 'ore'],
        [2, 'goblin-scout', 'Goblin Scout', 'minion', 'walk', 0.8, 1.3, 'ore'],
        [2, 'ore-beetle', 'Ore Beetle', 'minion', 'walk', 1.3, 0.8, 'ore'],
        [2, 'rock-golem', 'Rock Golem', 'elite', 'walk', 1.2, 0.6, 'gem'],
        [2, 'goblin-foreman', 'Goblin Foreman', 'boss', 'walk', 1.0, 0.6, 'chest'],
        [3, 'green-slime', 'Green Slime', 'minion', 'hop', 1.0, 0.9, 'coin'],
        [3, 'spore-shroom', 'Spore Shroom', 'minion', 'walk', 1.2, 0.8, 'coin'],
        [3, 'toxic-toad', 'Toxic Toad', 'minion', 'hop', 0.9, 1.2, 'coin'],
        [3, 'jelly-cube', 'Jelly Cube', 'elite', 'walk', 1.3, 0.5, 'gem'],
        [3, 'ooze-queen', 'Ooze Queen', 'boss', 'walk', 1.0, 0.6, 'chest'],
        [4, 'bone-soldier', 'Bone Soldier', 'minion', 'walk', 1.0, 1.0, 'coin'],
        [4, 'wailing-ghost', 'Wailing Ghost', 'minion', 'float', 0.8, 1.2, 'coin'],
        [4, 'tomb-scarab', 'Tomb Scarab', 'minion', 'walk', 1.1, 0.9, 'ore'],
        [4, 'crypt-mummy', 'Crypt Mummy', 'elite', 'walk', 1.2, 0.6, 'gem'],
        [4, 'tomb-lich', 'Tomb Lich', 'boss', 'walk', 1.0, 0.6, 'chest'],
        [5, 'thorn-sprout', 'Thorn Sprout', 'minion', 'walk', 1.0, 0.9, 'coin'],
        [5, 'moss-wolf', 'Moss Wolf', 'minion', 'walk', 0.9, 1.3, 'coin'],
        [5, 'bramble-pixie', 'Bramble Pixie', 'minion', 'float', 0.8, 1.1, 'ore'],
        [5, 'ancient-treant', 'Ancient Treant', 'elite', 'walk', 1.3, 0.5, 'gem'],
        [5, 'elder-dryad', 'Elder Dryad', 'boss', 'walk', 0.9, 0.6, 'chest'],
        [6, 'ember-imp', 'Ember Imp', 'minion', 'hop', 1.0, 1.2, 'coin'],
        [6, 'slag-snail', 'Slag Snail', 'minion', 'walk', 1.3, 0.5, 'ore'],
        [6, 'magma-crab', 'Magma Crab', 'minion', 'walk', 1.1, 1.0, 'ore'],
        [6, 'furnace-guard', 'Furnace Guard', 'elite', 'walk', 1.2, 0.5, 'gem'],
        [6, 'molten-colossus', 'Molten Colossus', 'boss', 'walk', 0.8, 0.6, 'chest'],
        [7, 'rime-penguin', 'Rime Penguin', 'minion', 'walk', 0.8, 0.8, 'coin'],
        [7, 'frost-hare', 'Frost Hare', 'minion', 'hop', 0.7, 1.4, 'coin'],
        [7, 'snow-sentry', 'Snow Sentry', 'minion', 'walk', 0.9, 0.7, 'ore'],
        [7, 'snow-yeti', 'Snow Yeti', 'elite', 'walk', 1.0, 0.6, 'gem'],
        [7, 'glacier-mammoth', 'Glacier Mammoth', 'boss', 'walk', 0.6, 0.5, 'chest'],
        [8, 'lantern-wraith', 'Lantern Wraith', 'minion', 'float', 0.6, 1.0, 'coin'],
        [8, 'shard-cluster', 'Shard Cluster', 'minion', 'float', 0.5, 1.3, 'ore'],
        [8, 'mirror-mimic', 'Mirror Mimic', 'minion', 'walk', 0.7, 0.8, 'coin'],
        [8, 'gloom-stag', 'Gloom Stag', 'elite', 'walk', 0.8, 0.8, 'gem'],
        [8, 'eclipse-warden', 'Eclipse Warden', 'boss', 'float', 0.5, 0.6, 'chest'],
        [9, 'drake-whelp', 'Drake Whelp', 'minion', 'walk', 0.6, 0.9, 'coin'],
        [9, 'kobold-sapper', 'Kobold Sapper', 'minion', 'walk', 0.65, 1.0, 'ore'],
        [9, 'gilded-crown', 'Gilded Crown', 'minion', 'float', 0.5, 1.2, 'coin'],
        [9, 'ash-wyvern', 'Ash Wyvern', 'elite', 'float', 0.75, 0.8, 'gem'],
        [9, 'hoard-dragon', 'Hoard Dragon', 'boss', 'walk', 0.5, 0.5, 'chest'],
        [10, 'crescent-drifter', 'Crescent Drifter', 'minion', 'float', 0.5, 1.0, 'coin'],
        [10, 'comet-tadpole', 'Comet Tadpole', 'minion', 'hop', 0.55, 1.4, 'ore'],
        [10, 'eye-strider', 'Eye Strider', 'minion', 'walk', 0.6, 0.8, 'coin'],
        [10, 'obelisk-sentinel', 'Obelisk Sentinel', 'elite', 'float', 0.7, 0.6, 'gem'],
        [10, 'void-sovereign', 'Void Sovereign', 'boss', 'float', 0.5, 0.6, 'chest'],
      ],
    );
  });

  void it('every row has exactly the eight documented fields (all required fields present, none extra)', () => {
    for (const r of rows) {
      assert.deepEqual(Object.keys(r).sort(), [
        'drop',
        'gait',
        'id',
        'name',
        'pace',
        'stage',
        'tier',
        'vigor',
      ]);
    }
  });

  void it('enemy rows carry no health, damage, or hero field: only the formulas turn a row into health', () => {
    for (const r of rows) {
      assert.deepEqual(
        Object.keys(r).filter((k) => /health|hp|damage|attack|speed/i.test(k)),
        [],
      );
    }
  });

  void it('passes validateEnemies against the shipped stages', () => {
    assert.deepEqual(validateEnemies(rows, STAGES), []);
  });

  void it('enemiesForStage and bossFor return nothing for an undelivered stage (0 and 11 or beyond)', () => {
    assert.deepEqual(enemiesForStage(11), []);
    assert.deepEqual(enemiesForStage(12), []);
    assert.deepEqual(enemiesForStage(0), []);
    assert.equal(bossFor(11), undefined);
    assert.equal(bossFor(0), undefined);
    assert.deepEqual(
      enemiesForStage(1).map((r) => r.id),
      ['cellar-rat', 'cave-bat', 'web-spider', 'crate-mimic'],
    );
  });
});

void describe('validateEnemies rejects crafted tables with fixed text', () => {
  const extra = (patch: Partial<Mutable>): EnemyRow => ({ ...row('cellar-rat'), ...patch });

  void it('six enemies in one stage', () => {
    const errors = validateEnemies([...rows, extra({ id: 'sixth-one' })], STAGES);
    assert.ok(errors.includes('stage 1: expected exactly 5 enemies, found 6'), errors.join());
    assert.ok(errors.includes('expected 50 enemies for 10 stages'), errors.join());
  });

  void it('two bosses in one stage', () => {
    const errors = validateEnemies(edit('crate-mimic', { tier: 'boss' }), STAGES);
    assert.ok(errors.includes('stage 1: expected exactly 1 boss, found 2'), errors.join());
  });

  void it('no boss in a stage', () => {
    const errors = validateEnemies(edit('rat-king', { tier: 'elite' }), STAGES);
    assert.ok(errors.includes('stage 1: expected exactly 1 boss, found 0'), errors.join());
  });

  void it('a duplicate id, also across stages', () => {
    const within = validateEnemies(edit('cave-bat', { id: 'cellar-rat' }), STAGES);
    assert.ok(
      within.some((e) => /duplicate id/.test(e)),
      within.join(),
    );
    const across = validateEnemies(edit('goblin-miner', { id: 'cellar-rat' }), STAGES);
    assert.ok(
      across.some((e) => /duplicate id/.test(e)),
      across.join(),
    );
  });

  void it('a row for a stage that does not exist', () => {
    const errors = validateEnemies(edit('goblin-miner', { stage: 11 }), STAGES);
    assert.ok(
      errors.some((e) => /stage does not exist/.test(e)),
      errors.join(),
    );
    assert.ok(errors.includes('stage 2: expected exactly 5 enemies, found 4'));
  });

  void it('a boss row that is not the boss tier counts as a missing boss; a regular row marked boss counts as a second', () => {
    assert.ok(
      validateEnemies(edit('rat-king', { tier: 'minion' }), STAGES).includes(
        'stage 1: expected exactly 1 boss, found 0',
      ),
    );
    assert.ok(
      validateEnemies(edit('web-spider', { tier: 'boss' }), STAGES).includes(
        'stage 1: expected exactly 1 boss, found 2',
      ),
    );
  });

  void it('a stage with no minion', () => {
    const noMinions = rows.map((r) =>
      r.stage === 2 && r.tier === 'minion' ? { ...r, tier: 'elite' as const } : r,
    );
    assert.ok(validateEnemies(noMinions, STAGES).includes('stage 2: needs at least 1 minion'));
  });

  void it('vigor and pace out of range, an unknown tier, gait, drop, and a non-kebab or empty id or name', () => {
    const has = (patch: Partial<Mutable>, pattern: RegExp): void => {
      const errors = validateEnemies(edit('cellar-rat', patch), STAGES);
      assert.ok(
        errors.some((e) => pattern.test(e)),
        `${JSON.stringify(patch)}: ${errors.join()}`,
      );
    };
    has({ vigor: 0.49 }, /vigor is out of range/);
    has({ vigor: 2.01 }, /vigor is out of range/);
    has({ pace: 0.49 }, /pace is out of range/);
    has({ pace: 1.61 }, /pace is out of range/);
    has({ vigor: Number.NaN }, /vigor is out of range/);
    has({ pace: Number.POSITIVE_INFINITY }, /pace is out of range/);
    has({ tier: 'legend' as unknown as EnemyRow['tier'] }, /unknown tier/);
    has({ gait: 'fly' as unknown as EnemyRow['gait'] }, /unknown gait/);
    has({ drop: 'potion' as unknown as EnemyRow['drop'] }, /unknown drop/);
    has({ id: 'Cellar_Rat' }, /id is not kebab-case/);
    has({ id: '' }, /id is not kebab-case/);
    has({ name: '   ' }, /name is empty/);
  });

  void it('boundary values are accepted (vigor 0.5 and 2, pace 0.5 and 1.6)', () => {
    assert.deepEqual(validateEnemies(edit('cellar-rat', { vigor: 0.5, pace: 0.5 }), STAGES), []);
    assert.deepEqual(validateEnemies(edit('cellar-rat', { vigor: 2, pace: 1.6 }), STAGES), []);
  });

  void it('a non-contiguous total: forty-nine or fifty-one rows', () => {
    assert.ok(
      validateEnemies(rows.slice(0, 49), STAGES).includes('expected 50 enemies for 10 stages'),
    );
    assert.ok(
      validateEnemies([...rows, extra({ id: 'extra-one', stage: 2 })], STAGES).includes(
        'expected 50 enemies for 10 stages',
      ),
    );
  });

  void it('an empty table and a shortened stage list are invalid; a prefix of the game is no longer valid (incremental mode is gone)', () => {
    assert.ok(validateEnemies([], STAGES).length > 0);
    assert.ok(validateEnemies(rows, STAGES.slice(0, 1)).length > 0);
    assert.ok(
      validateEnemies(rows, STAGES.slice(0, 8)).includes('expected exactly 10 stages, found 8'),
    );
    assert.ok(validateEnemies(rows.slice(0, 5), STAGES.slice(0, 1)).length > 0);
    assert.ok(validateEnemies(rows.slice(0, 40), STAGES.slice(0, 8)).length > 0);
  });

  void it('never throws on junk and reports a fixed line, never the junk', () => {
    const junk: unknown[] = [null, undefined, 7, 'x', [], {}, [null], [{}], [{ id: 5, tier: {} }]];
    for (const value of junk) {
      let result: readonly string[] = [];
      assert.doesNotThrow(() => {
        result = validateEnemies(value as readonly EnemyRow[], STAGES);
      });
      assert.ok(result.length > 0);
    }
    const hostile = new Proxy([], {
      get(): never {
        throw new Error('SECRET');
      },
    });
    const errors = validateEnemies(hostile, STAGES);
    assert.deepEqual(errors, ['enemy table is malformed']);
    assert.ok(!errors.join().includes('SECRET'));
  });

  void it('is deterministic and does not mutate its inputs', () => {
    const before = JSON.stringify([rows, STAGES.map((s) => s.index)]);
    assert.deepEqual(validateEnemies(rows, STAGES), validateEnemies(rows, STAGES));
    assert.equal(JSON.stringify([rows, STAGES.map((s) => s.index)]), before);
  });
});

void describe('healthOf and the tier formulas', () => {
  const rat = row('cellar-rat');
  const king = row('rat-king');

  void it('has the documented constants', () => {
    assert.deepEqual({ ...TIER_HEALTH }, { minion: 10, elite: 24, boss: 120 });
    assert.equal(HEALTH_GROWTH, 1.35);
    assert.equal(CYCLE_HEALTH_GROWTH, 0.25);
    assert.equal(CYCLE_CAP, 8);
    assert.equal(PARTY_BOSS_GROWTH, 0.35);
    assert.equal(PARTY_CAP, 8);
    assert.deepEqual({ ...TIER_SPEED_PX_PER_S }, { minion: 26, elite: 20, boss: 14 });
    assert.deepEqual({ ...TIER_ATTACK_MS }, { minion: 1800, elite: 2200, boss: 2600 });
    assert.deepEqual({ ...TIER_SHADOW_PX }, { minion: 10, elite: 14, boss: 30 });
    assert.equal(STRIKE_POWER, 1);
    assert.equal(ABILITY_POWER, 2);
    assert.equal(ABILITY_TARGETS, 3);
  });

  void it('spot values at cycle 0: stage 1 minion 10, stage 2 minion 14, boss 120 solo and 414 with eight fighters', () => {
    assert.equal(healthOf(rat, 1, 0, 1), 10);
    assert.equal(healthOf(row('goblin-miner'), 2, 0, 1), 14, '13.5 rounds up');
    assert.equal(healthOf(row('crate-mimic'), 1, 0, 1), 24);
    assert.equal(healthOf(row('rock-golem'), 2, 0, 1), 39);
    assert.equal(healthOf(king, 1, 0, 1), 120);
    assert.equal(healthOf(king, 1, 0, 8), 414);
    assert.equal(healthOf(row('goblin-foreman'), 2, 0, 1), 162);
  });

  void it('E2 spot values at cycle 0, party 1: stage 3 is 18, 22, 16, 57, 219 and stage 4 is 25, 20, 27, 71, 295; bosses with eight fighters 755 and 1019', () => {
    const at = (id: string, stage: number, party = 1): number => healthOf(row(id), stage, 0, party);
    assert.deepEqual(
      ['green-slime', 'spore-shroom', 'toxic-toad', 'jelly-cube', 'ooze-queen'].map((id) =>
        at(id, 3),
      ),
      [18, 22, 16, 57, 219],
    );
    assert.deepEqual(
      ['bone-soldier', 'wailing-ghost', 'tomb-scarab', 'crypt-mummy', 'tomb-lich'].map((id) =>
        at(id, 4),
      ),
      [25, 20, 27, 71, 295],
    );
    assert.equal(at('ooze-queen', 3, 8), 755);
    assert.equal(at('tomb-lich', 4, 8), 1019);
  });

  void it('E3 spot values at cycle 0, party 1 (real healthOf output): stage 5 is 33, 30, 27, 104, 359 and stage 6 is 45, 58, 49, 129, 430; bosses with eight fighters 1238 and 1485', () => {
    const at = (id: string, stage: number, party = 1): number => healthOf(row(id), stage, 0, party);
    assert.deepEqual(
      ['thorn-sprout', 'moss-wolf', 'bramble-pixie', 'ancient-treant', 'elder-dryad'].map((id) =>
        at(id, 5),
      ),
      [33, 30, 27, 104, 359],
    );
    assert.deepEqual(
      ['ember-imp', 'slag-snail', 'magma-crab', 'furnace-guard', 'molten-colossus'].map((id) =>
        at(id, 6),
      ),
      [45, 58, 49, 129, 430],
    );
    assert.equal(at('elder-dryad', 5, 8), 1238);
    assert.equal(at('molten-colossus', 6, 8), 1485);
  });

  void it('E4 spot values at cycle 0, party 1: stage 7 is 48, 42, 54, 145, 436 and stage 8 is 49, 41, 57, 157, 490; bosses with eight fighters 1504 and 1692', () => {
    const at = (id: string, stage: number, party = 1): number => healthOf(row(id), stage, 0, party);
    assert.deepEqual(
      ['rime-penguin', 'frost-hare', 'snow-sentry', 'snow-yeti', 'glacier-mammoth'].map((id) =>
        at(id, 7),
      ),
      [48, 42, 54, 145, 436],
    );
    assert.deepEqual(
      ['lantern-wraith', 'shard-cluster', 'mirror-mimic', 'gloom-stag', 'eclipse-warden'].map(
        (id) => at(id, 8),
      ),
      [49, 41, 57, 157, 490],
    );
    assert.equal(at('glacier-mammoth', 7, 8), 1504);
    assert.equal(at('eclipse-warden', 8, 8), 1692);
  });

  void it('E5 spot values at cycle 0, party 1 (real healthOf output): stage 9 is 51, 56, 43, 154, 515 and stage 10 is 45, 50, 54, 151, 541; bosses with eight fighters 1776 and 1865', () => {
    const at = (id: string, stage: number, party = 1): number => healthOf(row(id), stage, 0, party);
    assert.deepEqual(
      ['drake-whelp', 'kobold-sapper', 'gilded-crown', 'ash-wyvern', 'hoard-dragon'].map((id) =>
        at(id, 9),
      ),
      [51, 56, 43, 154, 515],
    );
    assert.deepEqual(
      [
        'crescent-drifter',
        'comet-tadpole',
        'eye-strider',
        'obelisk-sentinel',
        'void-sovereign',
      ].map((id) => at(id, 10)),
      [45, 50, 54, 151, 541],
    );
    assert.equal(at('hoard-dragon', 9, 8), 1776);
    assert.equal(at('void-sovereign', 10, 8), 1865);
  });

  void it('New Game+ ceiling for the finale: at the cycle cap (x3.0) with eight fighters the two bosses take 5329 and 5595, and cycles beyond the cap add nothing', () => {
    const dragon = row('hoard-dragon');
    const sovereign = row('void-sovereign');
    assert.equal(healthOf(dragon, 9, CYCLE_CAP, 8), 5329);
    assert.equal(healthOf(sovereign, 10, CYCLE_CAP, 8), 5595);
    for (const cycle of [CYCLE_CAP + 1, 50, 1e9]) {
      assert.equal(healthOf(dragon, 9, cycle, 8), 5329, `cycle ${cycle}`);
      assert.equal(healthOf(sovereign, 10, cycle, 8), 5595, `cycle ${cycle}`);
    }
    for (const r of rows) {
      assert.equal(healthOf(r, r.stage, 9, 8), healthOf(r, r.stage, CYCLE_CAP, 8), r.id);
      assert.equal(healthOf(r, r.stage, 1e9, 1), healthOf(r, r.stage, CYCLE_CAP, 1), r.id);
    }
  });

  void it('the late-growth tail: 1.35 per stage through Stage 8, then 1.05 (decision E5-3); the stage factors are the ratio of a probe row', () => {
    assert.equal(HEALTH_GROWTH_LATE, 1.05);
    assert.equal(LATE_GROWTH_FROM_STAGE, 9);
    // A probe row with a large base makes rounding negligible: the ratio of consecutive stages is the factor.
    const probe: EnemyRow = { ...row('hoard-dragon'), vigor: 2 };
    const h = (stage: number): number => healthOf(probe, stage, 0, 1);
    for (let stage = 2; stage <= 8; stage++) {
      assert.ok(Math.abs(h(stage) / h(stage - 1) - HEALTH_GROWTH) < 0.01, `stage ${stage}`);
    }
    assert.ok(Math.abs(h(9) / h(8) - HEALTH_GROWTH_LATE) < 0.01, 'stage 9');
    assert.ok(Math.abs(h(10) / h(9) - HEALTH_GROWTH_LATE) < 0.01, 'stage 10');
    for (let stage = 2; stage <= 10; stage++) assert.ok(h(stage) > h(stage - 1), `stage ${stage}`);
  });

  void it('E5 enemy rows are stage-local, and both new bosses sit at the vigor floor 0.5 (decision E5-3, option b)', () => {
    assert.deepEqual(
      enemiesForStage(9).map((r) => r.id),
      ['drake-whelp', 'kobold-sapper', 'gilded-crown', 'ash-wyvern'],
    );
    assert.deepEqual(
      enemiesForStage(10).map((r) => r.id),
      ['crescent-drifter', 'comet-tadpole', 'eye-strider', 'obelisk-sentinel'],
    );
    assert.equal(bossFor(9)?.id, 'hoard-dragon');
    assert.equal(bossFor(10)?.id, 'void-sovereign');
    assert.equal(bossFor(9)?.vigor, 0.5);
    assert.equal(bossFor(10)?.vigor, 0.5);
  });

  void it('E4 enemy rows are stage-local, and both new bosses keep the lowest allowed vigors 0.6 and 0.5 (decision E4-7)', () => {
    assert.deepEqual(
      enemiesForStage(7).map((r) => r.id),
      ['rime-penguin', 'frost-hare', 'snow-sentry', 'snow-yeti'],
    );
    assert.deepEqual(
      enemiesForStage(8).map((r) => r.id),
      ['lantern-wraith', 'shard-cluster', 'mirror-mimic', 'gloom-stag'],
    );
    assert.equal(bossFor(7)?.id, 'glacier-mammoth');
    assert.equal(bossFor(8)?.id, 'eclipse-warden');
    assert.equal(bossFor(7)?.vigor, 0.6);
    assert.equal(bossFor(8)?.vigor, 0.5);
    assert.ok((bossFor(7)?.vigor ?? 9) < 1 && (bossFor(8)?.vigor ?? 9) < 1);
  });

  void it('E3 enemy rows are stage-local, and both new bosses keep a vigor below 1 (decision E3-7)', () => {
    assert.deepEqual(
      enemiesForStage(5).map((r) => r.id),
      ['thorn-sprout', 'moss-wolf', 'bramble-pixie', 'ancient-treant'],
    );
    assert.deepEqual(
      enemiesForStage(6).map((r) => r.id),
      ['ember-imp', 'slag-snail', 'magma-crab', 'furnace-guard'],
    );
    assert.equal(bossFor(5)?.id, 'elder-dryad');
    assert.equal(bossFor(6)?.id, 'molten-colossus');
    assert.ok((bossFor(5)?.vigor ?? 9) < 1 && (bossFor(6)?.vigor ?? 9) < 1);
  });

  void it('E2 enemy rows are stage-local: enemiesForStage(3|4) lists the four regulars, bossFor the boss', () => {
    assert.deepEqual(
      enemiesForStage(3).map((r) => r.id),
      ['green-slime', 'spore-shroom', 'toxic-toad', 'jelly-cube'],
    );
    assert.deepEqual(
      enemiesForStage(4).map((r) => r.id),
      ['bone-soldier', 'wailing-ghost', 'tomb-scarab', 'crypt-mummy'],
    );
    assert.equal(bossFor(3)?.id, 'ooze-queen');
    assert.equal(bossFor(4)?.id, 'tomb-lich');
  });

  void it('is monotone in stage index and in cycle, never below 1, and capped in cycle and party', () => {
    for (const r of rows) {
      let last = 0;
      for (let stage = 1; stage <= 10; stage++) {
        const h = healthOf(r, stage, 0, 1);
        assert.ok(h >= last && h >= 1, `${r.id} stage ${stage}`);
        last = h;
      }
      last = 0;
      for (let cycle = 0; cycle <= 12; cycle++) {
        const h = healthOf(r, 1, cycle, 1);
        assert.ok(h >= last, `${r.id} cycle ${cycle}`);
        last = h;
      }
      assert.equal(healthOf(r, 1, CYCLE_CAP, 1), healthOf(r, 1, CYCLE_CAP + 50, 1));
    }
  });

  void it('party size grows a boss only, up to the cap of eight, and is ignored for every other tier', () => {
    for (const r of rows.filter((x) => x.tier !== 'boss')) {
      assert.equal(healthOf(r, 1, 0, 1), healthOf(r, 1, 0, 64), r.id);
    }
    let last = 0;
    for (let party = 1; party <= 8; party++) {
      const h = healthOf(king, 1, 0, party);
      assert.ok(h > last);
      last = h;
    }
    assert.equal(healthOf(king, 1, 0, 8), healthOf(king, 1, 0, 64));
    assert.equal(healthOf(king, 1, 0, 0), healthOf(king, 1, 0, 1), 'a party of 0 counts as 1');
  });

  void it('is pure and survives out-of-range cycle, party, and stage inputs (stage indexes stay 1..10 in play) with a finite whole number of at least 1', () => {
    for (const args of [
      [-5, -5, -5],
      [0, 0, 0],
      [100, 1e9, 1e9],
    ] as const) {
      const h = healthOf(rat, args[0], args[1], args[2]);
      assert.ok(Number.isFinite(h) && Number.isInteger(h) && h >= 1, String(h));
    }
    assert.equal(healthOf(rat, 3, 2, 5), healthOf(rat, 3, 2, 5));
  });
});

void describe('the drop table (decoration only, decision E1-12)', () => {
  void it('has exactly four kinds, and every enemy row names one of them', () => {
    assert.deepEqual([...DROP_KINDS], ['coin', 'gem', 'ore', 'chest']);
    for (const r of rows) {
      assert.ok((DROP_KINDS as readonly string[]).includes(r.drop), r.id);
    }
    for (const r of rows.filter((x) => x.tier === 'boss')) {
      assert.equal(r.drop, 'chest');
    }
  });

  void it('has the documented chances and capacities', () => {
    assert.deepEqual({ ...DROP_CHANCE }, { minion: 0.6, elite: 1, boss: 1 });
    assert.equal(BOSS_COIN_BURST, 5);
    assert.equal(DROP_CAPACITY, 16);
  });

  void it('Stage 2 exists in STAGES as the Goblin Mine Shafts with dust', () => {
    assert.equal(STAGE_1?.id, 'forgotten-cellar');
    assert.equal(STAGE_2?.id, 'goblin-mine-shafts');
    assert.equal(STAGE_2?.index, 2);
    assert.equal(STAGE_2?.ambient.kind, 'dust');
  });
});
