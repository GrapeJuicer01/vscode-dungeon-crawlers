// Disabling combat during the 1.2 s stage-clear hold (reviewer fix to Combat.#disableClear):
// Progression has already advanced the stage, so the pending transition must still fire once and
// the scene must land on the progression stage. Three disable paths (the setting, the third
// fault, update() finding combat disabled) are covered at Combat level (event counts) and at Game
// level (stage agreement, setStage not re-entered, heroes untouched: Core invariants 2 and 4).
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Combat } from '../../src/game/Combat';
import {
  COMBAT_FAULT_LIMIT,
  STAGE_CLEAR_HOLD_MS,
  STAGE_FADE_MS,
  STEP_MS,
} from '../../src/game/data/tuning';
import type { StageDef } from '../../src/game/data/stages';
import { StageDirector } from '../../src/game/StageDirector';
import type { Progress } from '../../src/shared/progress';
import { makeCombat } from '../support/combatRig';
import type { CombatRig } from '../support/combatRig';
import { agent, feed, gameRig } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

type Path = 'setting' | 'third fault' | 'update finds it disabled';
const PATHS: readonly Path[] = ['setting', 'third fault', 'update finds it disabled'];

/** Combat level: hammer to the boss defeat; the clear hold is pending when this returns. */
function inClearHold(): CombatRig {
  const rig = makeCombat({ fighters: 8, config: { killsPerStage: 2, maxEnemies: 6 } });
  assert.ok(
    rig.until(() => {
      for (const f of rig.party) f.strike += 2;
      return rig.progression.snapshot().bossesDefeated >= 1;
    }, 120_000),
    'the boss fell',
  );
  assert.equal(rig.stageClears, 0, 'the hold is pending');
  return rig;
}

function disableCombatLevel(rig: CombatRig, path: Path): void {
  switch (path) {
    case 'setting':
      rig.combat.configure({ enabled: false, killsPerStage: 2, maxEnemies: 6 });
      return;
    case 'third fault':
      for (let i = 0; i < COMBAT_FAULT_LIMIT; i++) {
        rig.combat.recordFault();
      }
      return;
    case 'update finds it disabled':
      Object.defineProperty(rig.combat, 'disabled', { get: () => true, configurable: true });
      rig.step(STEP_MS);
      return;
  }
}

void describe('Combat: disabling during the stage-clear hold fires onStageClear once', () => {
  for (const path of PATHS) {
    void it(`${path}: exactly one onStageClear, now, and never again`, () => {
      const rig = inClearHold();
      disableCombatLevel(rig, path);
      assert.equal(rig.stageClears, 1);
      assert.deepEqual(rig.enemies(), [], 'live enemies are cleared');
      rig.step(STAGE_CLEAR_HOLD_MS * 3);
      assert.equal(rig.stageClears, 1, 'the dropped hold does not fire a second time');
    });
  }

  for (const path of PATHS) {
    void it(`${path}: with no clear pending nothing fires`, () => {
      const rig = makeCombat({ fighters: 4 });
      rig.hammer(5_000);
      assert.equal(rig.stageClears, 0);
      disableCombatLevel(rig, path);
      rig.step(STAGE_CLEAR_HOLD_MS * 3);
      assert.equal(rig.stageClears, 0);
    });
  }
});

void describe('Combat: each real disable path during the clear hold, driven directly', () => {
  void it('configure(enabled: false) fires onStageClear once, and a later update or repeat configure adds none', () => {
    const rig = inClearHold();
    rig.combat.configure({ enabled: false, killsPerStage: 2, maxEnemies: 6 });
    assert.equal(rig.stageClears, 1);
    assert.equal(rig.combat.disabled, true);
    assert.deepEqual(rig.enemies(), []);
    rig.step(STEP_MS);
    assert.equal(rig.stageClears, 1, 'a later update does not fire again');
    rig.combat.configure({ enabled: false, killsPerStage: 2, maxEnemies: 6 });
    rig.step(STAGE_CLEAR_HOLD_MS * 2);
    assert.equal(rig.stageClears, 1);
  });

  void it('the third recordFault fires onStageClear once; earlier faults fire nothing; later faults and updates add none', () => {
    const rig = inClearHold();
    for (let i = 0; i < COMBAT_FAULT_LIMIT - 1; i++) {
      rig.combat.recordFault();
      assert.equal(rig.stageClears, 0, `fault ${String(i + 1)} does not disable`);
      assert.equal(rig.combat.disabled, false);
    }
    rig.combat.recordFault();
    assert.equal(rig.combat.disabled, true);
    assert.equal(rig.stageClears, 1);
    assert.deepEqual(rig.enemies(), []);
    rig.step(STEP_MS);
    assert.equal(rig.stageClears, 1, 'a later update does not fire again');
    rig.combat.recordFault();
    rig.step(STAGE_CLEAR_HOLD_MS * 2);
    assert.equal(rig.stageClears, 1, 'a fourth fault adds none');
  });
});

interface Spies {
  readonly begins: number[];
  readonly setStages: number[];
}

function spyStageFlow(): Spies {
  const spies: Spies = { begins: [], setStages: [] };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const begin = StageDirector.prototype.begin;
  StageDirector.prototype.begin = function (this: StageDirector, index: number): void {
    spies.begins.push(index);
    begin.call(this, index);
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const setStage = Combat.prototype.setStage;
  Combat.prototype.setStage = function (this: Combat, def: StageDef): void {
    spies.setStages.push(def.index);
    setStage.call(this, def);
  };
  restores.push(() => {
    StageDirector.prototype.begin = begin;
    Combat.prototype.setStage = setStage;
  });
  return spies;
}

/** Game level: eight working heroes, the boss falls, and the reported progress is already stage 2. */
function gameInClearHold(): { rig: GameRig; spies: Spies; reported: Progress } {
  const spies = spyStageFlow();
  const reports: Progress[] = [];
  const rig = gameRig({
    deps: { onProgress: (p, urgent) => urgent && void reports.push(p) },
  });
  rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 });
  for (let i = 0; i < 8; i++) {
    feed(rig, agent(`h${i}`, 'working', 'Edit', 1));
  }
  for (let i = 0; i < 60 * 600 && reports.length === 0; i++) {
    rig.game.step();
  }
  const reported = reports[0];
  assert.ok(reported !== undefined, 'the boss fell');
  assert.equal(reported.stageIndex, 2, 'Progression already advanced');
  assert.deepEqual(spies.begins, [], 'the hold is pending');
  return { rig, spies, reported };
}

function disableGameLevel(rig: GameRig, path: Path): void {
  switch (path) {
    case 'setting':
      rig.game.applyConfig({ enemiesEnabled: false, killsPerStage: 5, maxEnemies: 12 });
      return;
    case 'third fault': {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and restored
      const update = Combat.prototype.update;
      let thrown = 0;
      Combat.prototype.update = function (this: Combat): void {
        if (thrown < COMBAT_FAULT_LIMIT) {
          thrown += 1;
          throw new Error('combat fault');
        }
      };
      restores.push(() => {
        Combat.prototype.update = update;
      });
      for (let i = 0; i < COMBAT_FAULT_LIMIT; i++) {
        rig.game.step();
      }
      assert.equal(thrown, COMBAT_FAULT_LIMIT);
      return;
    }
    case 'update finds it disabled': {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and restored
      const update = Combat.prototype.update;
      Combat.prototype.update = function (this: Combat, ...args: Parameters<Combat['update']>) {
        Object.defineProperty(this, 'disabled', { get: () => true, configurable: true });
        update.apply(this, args);
      };
      restores.push(() => {
        Combat.prototype.update = update;
      });
      rig.game.step();
      return;
    }
  }
}

void describe('Game: disabling combat during the clear hold lands on the progression stage', () => {
  for (const path of PATHS) {
    void it(`${path}: one stage transition, shown stage equals progression stage, setStage not re-entered, heroes unchanged`, () => {
      const { rig, spies, reported } = gameInClearHold();
      const heroes = JSON.stringify(rig.game.heroSnapshot());
      const setStagesBefore = spies.setStages.length;
      disableGameLevel(rig, path);
      assert.deepEqual(spies.begins, [reported.stageIndex], 'onStageClear fired exactly once');
      assert.equal(
        spies.setStages.length,
        setStagesBefore,
        'setStage is not called inside the disable (the swap is deferred to the fade)',
      );
      for (let t = 0; t < STAGE_CLEAR_HOLD_MS + 4 * STAGE_FADE_MS; t += STEP_MS) {
        rig.game.step();
      }
      assert.deepEqual(spies.begins, [reported.stageIndex], 'no second transition');
      assert.deepEqual(
        spies.setStages.slice(setStagesBefore),
        [reported.stageIndex],
        'the swap shows the progression stage, once',
      );
      assert.equal(JSON.stringify(rig.game.heroSnapshot()), heroes, 'heroSnapshot is unchanged');
      for (const hero of rig.game.heroSnapshot()) {
        assert.equal(hero.lifecycle, 'working');
      }
    });
  }

  for (const path of PATHS) {
    void it(`${path}: with no clear pending no stage transition starts`, () => {
      const spies = spyStageFlow();
      const rig = gameRig();
      rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 30, maxEnemies: 6 });
      for (let i = 0; i < 4; i++) {
        feed(rig, agent(`h${i}`, 'working', 'Edit', 1));
      }
      for (let i = 0; i < 300; i++) {
        rig.game.step();
      }
      disableGameLevel(rig, path);
      for (let t = 0; t < STAGE_CLEAR_HOLD_MS + 4 * STAGE_FADE_MS; t += STEP_MS) {
        rig.game.step();
      }
      assert.deepEqual(spies.begins, []);
    });
  }
});
