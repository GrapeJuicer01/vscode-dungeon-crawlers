// The Combat model (E1 plan test note 4; as-built drift 13.1 and 13.8): wave sizing, the strike
// counting rule with its first-sight baseline, nearest-engaged targeting, ability hits up to three,
// kill credit, the boss gate and restart, withdrawal, quarantine of a throwing enemy, the
// cosmetic attack landing, and fault handling. Driven with a scripted party and real pieces.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Combat } from '../../src/game/Combat';
import {
  BOSS_COIN_BURST,
  DROP_ARC_MS,
  DROP_FADE_MS,
  DROP_REST_MS,
} from '../../src/game/data/drops';
import { ENEMIES, healthOf } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import {
  BOSS_SLAM_TARGETS,
  COMBAT_FAULT_LIMIT,
  ENEMY_CAPACITY,
  ENEMY_GAP_PX,
  ENEMY_INTRO_MS,
  ENEMY_SPAWN_X,
  ENEMY_STAND_MAX_X,
  HERO_FLASH_GAP_MS,
  HIT_SPARKS,
  STAGE_CLEAR_HOLD_MS,
  STEP_MS,
  WAVE_GAP_MS,
  WITHDRAW_AFTER_MS,
} from '../../src/game/data/tuning';
import type { Boss } from '../../src/game/entities/Boss';
import { Enemy } from '../../src/game/entities/Enemy';
import { RecordingSurface } from '../support/engineFakes';
import { makeCombat, party, untilEngaged } from '../support/combatRig';
import type { CombatRig } from '../support/combatRig';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

function patch<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  const original = target[key];
  target[key] = value;
  restores.push(() => {
    target[key] = original;
  });
}

/** Health an enemy has left, from its fraction and the table row (stage 1, cycle 0). */
function healthLeft(e: Enemy, partySize: number, stage = 1): number {
  const row = e.row;
  assert.ok(row !== null);
  return Math.round(e.healthFraction * healthOf(row, stage, 0, partySize));
}

/** A rig with `n` fighters and `wave` regular enemies standing engaged. */
function engagedRig(n: number, wave: number, maxEnemies = 6): CombatRig {
  const rig = makeCombat({ fighters: n, config: { maxEnemies } });
  assert.ok(untilEngaged(rig, wave), 'the wave walked in');
  return rig;
}

void describe('waves (E1 plan 3.4.4 step 3)', () => {
  void it('nothing spawns with no fighters, however long it runs', () => {
    const rig = makeCombat({ fighters: 0 });
    rig.step(20_000);
    assert.deepEqual(rig.enemies(), []);
    assert.equal(rig.combat.inContact, false);
  });

  void it('nothing spawns while disabled by construction or by the setting, and live enemies are cleared when disabled', () => {
    const built = makeCombat({ fighters: 4, enabled: false });
    built.step(10_000);
    assert.deepEqual(built.enemies(), []);
    assert.equal(built.combat.disabled, true);
    const off = makeCombat({ fighters: 4, config: { enabled: false } });
    off.step(10_000);
    assert.deepEqual(off.enemies(), []);
    const rig = makeCombat({ fighters: 4 });
    assert.ok(untilEngaged(rig, 1));
    rig.combat.configure({ enabled: false, killsPerStage: 30, maxEnemies: 6 });
    assert.equal(rig.combat.disabled, true);
    rig.step(STEP_MS);
    assert.deepEqual(rig.enemies(), [], 'configure(off) cleared the field');
    assert.equal(rig.combat.inContact, false);
    rig.combat.configure({ enabled: true, killsPerStage: 30, maxEnemies: 6 });
    rig.step(WAVE_GAP_MS + 200);
    assert.ok(rig.enemies().length > 0, 're-enabled: waves resume');
  });

  void it('the first wave arrives after WAVE_GAP_MS, not before', () => {
    const rig = makeCombat({ fighters: 1 });
    rig.step(WAVE_GAP_MS - 100);
    assert.equal(rig.enemies().length, 0);
    rig.step(200);
    assert.equal(rig.enemies().length, 1);
  });

  void it('wave size is min(maxEnemies, 1 + floor(fighters / 2))', () => {
    const cases: [number, number, number][] = [
      [1, 6, 1],
      [2, 6, 2],
      [3, 6, 2],
      [4, 6, 3],
      [8, 6, 5],
      [8, 2, 2],
      [12, 6, 6],
      [64, 6, 6],
      [64, 12, 12],
      [8, 1, 1],
    ];
    for (const [fighters, maxEnemies, expected] of cases) {
      const rig = makeCombat({ fighters, config: { maxEnemies } });
      rig.step(WAVE_GAP_MS + 200);
      assert.equal(rig.enemies().length, expected, `${fighters} fighters, max ${maxEnemies}`);
    }
  });

  void it('capacity never exceeds ENEMY_CAPACITY (12), even when configured above it', () => {
    const rig = makeCombat({ fighters: 64 });
    rig.combat.configure({ enabled: true, killsPerStage: 30, maxEnemies: 99 });
    let most = 0;
    for (let i = 0; i < 600; i++) {
      rig.step(STEP_MS);
      most = Math.max(most, rig.enemies().length);
    }
    assert.equal(most, ENEMY_CAPACITY);
  });

  void it('spawns only the stage rows: four regular rows of the stage, never the boss', () => {
    for (const stage of [1, 2]) {
      const rig = makeCombat({ fighters: 64, stage, config: { maxEnemies: 12 } });
      const seen = new Set<string>();
      for (let n = 0; n < 40; n++) {
        rig.step(WAVE_GAP_MS + 300);
        for (const e of rig.enemies()) {
          assert.equal(e.row?.stage, stage);
          assert.notEqual(e.row?.tier, 'boss');
          seen.add(e.row?.id ?? '');
        }
        // Clear the field so the next wave can spawn.
        rig.combat.setStage(STAGES[stage - 1] ?? (STAGES[0] as never));
      }
      assert.ok(seen.size >= 3, `stage ${stage}: ${[...seen].join()}`);
    }
  });

  void it('no new wave while an enemy is alive; the next one follows WAVE_GAP_MS after the field empties', () => {
    const rig = engagedRig(1, 1);
    rig.step(5000);
    assert.equal(rig.enemies().length, 1, 'still the one enemy');
    const target = rig.enemies()[0]!;
    while (target.inUse) {
      rig.party[0]!.strike += 1;
      rig.step(STEP_MS);
    }
    assert.deepEqual(rig.progressCalls, [false], 'one kill');
    assert.equal(rig.enemies().length, 0, 'released after the dissolve');
    rig.step(WAVE_GAP_MS - 100);
    assert.equal(rig.enemies().length, 0, 'the gap has not elapsed');
    rig.step(200);
    assert.equal(rig.enemies().length, 1, 'the next wave');
  });

  void it('enemies enter at ENEMY_SPAWN_X, walk left, and stand at min(front + gap, max) plus a lane offset', () => {
    const rig = makeCombat({ fighters: 4 });
    rig.step(WAVE_GAP_MS + 100);
    const xs = rig.enemies().map((e) => e.x);
    assert.ok(
      xs.every((x) => x >= ENEMY_SPAWN_X - 6),
      xs.join(),
    );
    rig.step(200);
    assert.ok(rig.enemies().every((e) => e.x < ENEMY_SPAWN_X + 30 && e.phase === 'approach'));
    assert.ok(untilEngaged(rig, 3));
    const front = Math.max(...rig.party.map((f) => f.x));
    for (const e of rig.enemies()) {
      const base = Math.min(front + ENEMY_GAP_PX, ENEMY_STAND_MAX_X);
      assert.ok(e.x === base || e.x === base + 8, `stand ${e.x}, base ${base}`);
    }
    // A party far to the right pushes the stand to the cap.
    const far = makeCombat({ fighters: 0 });
    far.party = party(2, 400);
    assert.ok(untilEngaged(far, 1));
    assert.ok(far.enemies().every((e) => e.x <= ENEMY_STAND_MAX_X + 8));
  });

  void it('inContact is true only while an enemy stands engaged, and a dissolving enemy ends it', () => {
    const rig = makeCombat({ fighters: 1 });
    rig.step(WAVE_GAP_MS + 200);
    assert.equal(rig.combat.inContact, false, 'still walking in');
    assert.ok(untilEngaged(rig, 1));
    assert.equal(rig.combat.inContact, true);
    rig.hammer(1500);
    const dissolving = rig.enemies().filter((e) => e.phase === 'dissolve');
    if (rig.enemies().length === dissolving.length) {
      assert.equal(rig.combat.inContact, false);
    }
  });
});

void describe('strike counting (13.1: first-sight baseline, delta rule)', () => {
  void it('a slot that first appears with a large serial counts nothing (no burst for a long-running hero)', () => {
    const rig = makeCombat({ fighters: 0 });
    rig.party = party(1);
    rig.party[0]!.strike = 5000;
    rig.party[0]!.ability = 4000;
    assert.ok(untilEngaged(rig, 1));
    const target = rig.enemies()[0]!;
    const before = target.healthFraction;
    rig.step(STEP_MS);
    assert.equal(target.healthFraction, before, 'nothing was counted on first sight or since');
    assert.equal(rig.progressCalls.length, 0);
  });

  void it('one serial bump is one strike of power 1 on an engaged enemy', () => {
    const rig = engagedRig(1, 1);
    const target = rig.enemies()[0]!;
    const full = healthLeft(target, 1);
    rig.party[0]!.strike += 1;
    rig.step(STEP_MS);
    assert.equal(healthLeft(target, 1), full - 1);
    rig.step(500);
    assert.equal(healthLeft(target, 1), full - 1, 'no serial change, no more damage');
  });

  void it('a jump of many serials in one step counts at most MAX_SERIAL_DELTA (2)', () => {
    const rig = engagedRig(1, 1);
    const target = rig.enemies()[0]!;
    const full = healthLeft(target, 1);
    rig.party[0]!.strike += 40;
    rig.step(STEP_MS);
    assert.equal(healthLeft(target, 1), full - 2);
  });

  void it('a serial that goes backwards counts as a restart: the new value is the delta (capped)', () => {
    const rig = makeCombat({ fighters: 1 });
    rig.party[0]!.strike = 10;
    assert.ok(untilEngaged(rig, 1));
    const target = rig.enemies()[0]!;
    const full = healthLeft(target, 1);
    rig.party[0]!.strike = 1;
    rig.step(STEP_MS);
    assert.equal(healthLeft(target, 1), full - 1);
    rig.party[0]!.strike = 0;
    rig.step(STEP_MS);
    assert.equal(healthLeft(target, 1), full - 1, 'delta 0');
  });

  void it('a slot missing for a step is untracked: reappearing with any serial re-baselines and counts nothing', () => {
    const rig = engagedRig(2, 2);
    const total = (): number => rig.enemies().reduce((n, e) => n + healthLeft(e, 2), 0);
    const before = total();
    const gone = rig.party.pop()!;
    rig.step(STEP_MS);
    rig.party.push({ ...gone, strike: gone.strike + 900, ability: gone.ability + 900 });
    rig.step(STEP_MS * 3);
    assert.equal(total(), before, 'slot reuse never counts the serial gap');
    rig.party[1]!.strike += 1;
    rig.step(STEP_MS);
    assert.equal(total(), before - 1, 'but a real bump afterwards counts');
  });

  void it('slots at or above the tracking bound are ignored', () => {
    const rig = makeCombat({ fighters: 1 });
    rig.party = [{ slot: 4000, x: 100, y: 150, strike: 0, ability: 0 }];
    rig.step(WAVE_GAP_MS + 200);
    assert.equal(rig.enemies().length, 1, 'still counts as a fighter for the wave');
    assert.ok(untilEngaged(rig, 1));
    const target = rig.enemies()[0]!;
    const full = target.healthFraction;
    rig.party[0]!.strike += 2;
    rig.step(STEP_MS);
    assert.equal(target.healthFraction, full);
  });

  void it('two fighters striking in one step both land', () => {
    const rig = engagedRig(2, 2);
    const total = (): number => rig.enemies().reduce((n, e) => n + healthLeft(e, 2), 0);
    const before = total();
    rig.party[0]!.strike += 1;
    rig.party[1]!.strike += 1;
    rig.step(STEP_MS);
    assert.equal(total(), before - 2);
  });

  void it('a non-positive or NaN step does nothing', () => {
    const rig = engagedRig(1, 1);
    const target = rig.enemies()[0]!;
    const before = target.healthFraction;
    rig.party[0]!.strike += 1;
    for (const dt of [0, -16, Number.NaN]) {
      rig.fighters.clear();
      rig.fighters.push(0, 100, 150, rig.party[0]!.strike, 0);
      rig.combat.update(dt, rig.world.world, rig.fighters);
    }
    assert.equal(target.healthFraction, before);
  });
});

void describe('targeting', () => {
  void it('a strike hits the nearest engaged enemy (smallest x) and no other', () => {
    const rig = engagedRig(8, 5);
    const live = rig.enemies();
    const nearest = Math.min(...live.map((e) => e.x));
    const before = new Map(live.map((e) => [e, e.healthFraction]));
    rig.party[0]!.strike += 1;
    rig.step(STEP_MS);
    const changed = live.filter((e) => e.healthFraction !== before.get(e));
    assert.equal(changed.length, 1);
    assert.equal(changed[0]!.x, nearest);
  });

  void it('an approaching enemy is never hit, even when it is the only one', () => {
    const rig = makeCombat({ fighters: 1 });
    rig.step(WAVE_GAP_MS + 200);
    const walker = rig.enemies()[0]!;
    assert.equal(walker.phase, 'approach');
    rig.party[0]!.strike = 1;
    rig.step(STEP_MS);
    rig.party[0]!.strike = 2;
    rig.step(STEP_MS);
    assert.equal(walker.healthFraction, 1);
    assert.equal(walker.isTargetable, false);
  });

  void it('an ability hit strikes up to three nearest engaged enemies for power 2 each', () => {
    const rig = engagedRig(8, 5);
    const live = rig.enemies().sort((a, b) => a.x - b.x);
    const full = live.map((e) => healthLeft(e, 8));
    rig.party[0]!.ability += 1;
    rig.step(STEP_MS);
    const after = live.map((e) => healthLeft(e, 8));
    const hit = after.map((h, i) => full[i]! - h);
    assert.deepEqual(
      hit.filter((d) => d > 0),
      [2, 2, 2],
      `damage by distance order: ${hit.join()}`,
    );
    assert.equal(hit.filter((d) => d === 0).length, live.length - 3);
    // The hit ones are the three with the smallest x.
    const hitXs = live.filter((_, i) => hit[i]! > 0).map((e) => e.x);
    const restXs = live.filter((_, i) => hit[i] === 0).map((e) => e.x);
    assert.ok(Math.max(...hitXs) <= Math.min(...restXs));
  });

  void it('an ability with fewer engaged enemies than targets hits only those', () => {
    const rig = engagedRig(2, 2);
    const live = rig.enemies();
    const full = live.map((e) => healthLeft(e, 2));
    rig.party[0]!.ability += 1;
    rig.step(STEP_MS);
    const after = live.map((e) => healthLeft(e, 2));
    assert.deepEqual(
      after.map((h, i) => full[i]! - h),
      [2, 2],
    );
  });

  void it('a strike with no engaged enemy is a no-op: no kill, no progress call, no error', () => {
    const rig = makeCombat({ fighters: 1 });
    rig.step(500);
    rig.party[0]!.strike += 2;
    rig.party[0]!.ability += 2;
    assert.doesNotThrow(() => rig.step(STEP_MS));
    assert.equal(rig.progressCalls.length, 0);
    assert.equal(rig.progression.killsInStage, 0);
  });

  void it('every landed hit emits HIT_SPARKS spark particles at the enemy', () => {
    const rig = engagedRig(8, 5);
    const emitted: string[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const original = rig.world.particles.emit;
    patch(
      rig.world.particles,
      'emit',
      function (this: unknown, ...args: Parameters<typeof original>) {
        emitted.push(args[0]);
        return original.apply(rig.world.particles, args);
      },
    );
    rig.party[0]!.strike += 1;
    rig.step(STEP_MS);
    assert.equal(emitted.filter((k) => k === 'spark').length, HIT_SPARKS);
    emitted.length = 0;
    rig.party[0]!.ability += 1;
    rig.step(STEP_MS);
    assert.equal(emitted.filter((k) => k === 'spark').length, HIT_SPARKS * 3);
  });
});

void describe('kills and progress', () => {
  void it('defeating a regular enemy counts exactly one kill and one non-urgent progress call', () => {
    const rig = engagedRig(1, 1);
    rig.hammer(20_000);
    assert.ok(rig.progression.killsInStage >= 1);
    assert.equal(rig.progression.killsInStage, rig.progressCalls.length);
    assert.ok(rig.progressCalls.every((urgent) => !urgent));
    assert.equal(rig.progression.snapshot().totalKills, rig.progression.killsInStage);
  });

  void it('a defeated enemy dissolves, is released after the dissolve, and the field empties', () => {
    const rig = engagedRig(1, 1, 1);
    const target = rig.enemies()[0]!;
    while (target.healthFraction > 0) {
      rig.party[0]!.strike += 1;
      rig.step(STEP_MS);
    }
    assert.equal(target.phase, 'dissolve');
    assert.equal(target.isTargetable, false);
    assert.equal(rig.progression.killsInStage, 1);
    rig.step(600);
    assert.equal(target.inUse, false);
    assert.equal(rig.enemies().length, 0);
  });

  void it('the run is deterministic for a seed: the same seed gives the same kill timeline', () => {
    const timeline = (seed: number): string => {
      const rig = makeCombat({ fighters: 4, seed });
      const marks: number[] = [];
      for (let i = 0; i < 60 * 30; i++) {
        for (const f of rig.party) f.strike += 1;
        rig.step(STEP_MS);
        marks.push(rig.progression.snapshot().totalKills);
      }
      return marks.join();
    };
    assert.equal(timeline(11), timeline(11));
    assert.notEqual(timeline(11), timeline(12));
  });
});

void describe('the boss (E1 plan 3.4.4 step 4 and 13.1)', () => {
  /** A hammering party until the kill threshold is met (regular enemies keep dying). */
  function bossRig(fighters = 4, killsPerStage = 2): CombatRig {
    const rig = makeCombat({ fighters, config: { killsPerStage, maxEnemies: 6 } });
    const reached = rig.until(() => {
      for (const f of rig.party) f.strike += 2;
      return rig.progression.killsInStage >= killsPerStage;
    }, 90_000);
    assert.ok(reached, 'threshold reached');
    return rig;
  }

  /** Keeps hammering (the boss is untargetable during its intro) until the boss stands engaged. */
  function untilBossEngaged(rig: CombatRig): Boss {
    assert.ok(
      rig.until(() => {
        for (const f of rig.party) f.strike += 2;
        return rig.boss()?.isEngaged === true;
      }, 90_000),
      'the boss walked in',
    );
    return rig.boss()!;
  }

  /** The boss is introduced and can be struck; nobody has struck it yet. */
  function untilBossTargetable(rig: CombatRig): Boss {
    untilBossEngaged(rig);
    assert.ok(rig.until(() => rig.boss()?.isTargetable === true, ENEMY_INTRO_MS + 500));
    return rig.boss()!;
  }

  /** Hammers until the boss is defeated (bossesDefeated reaches `n`). */
  function untilBossDefeated(rig: CombatRig, n = 1): void {
    assert.ok(
      rig.until(() => {
        for (const f of rig.party) f.strike += 2;
        return rig.progression.snapshot().bossesDefeated >= n;
      }, 120_000),
      'the boss fell',
    );
  }

  void it('no boss before the threshold; regular waves continue', () => {
    const rig = makeCombat({ fighters: 4, config: { killsPerStage: 30 } });
    rig.hammer(30_000);
    assert.equal(rig.boss(), undefined);
    assert.ok(rig.progression.killsInStage < 30);
    assert.ok(rig.progression.killsInStage > 0);
  });

  void it('the boss spawns only after the threshold and an empty field, and no regular enemy spawns while it is pending or alive', () => {
    const rig = bossRig();
    let bossWithRegulars = false;
    let bossSeen = false;
    for (let i = 0; i < 60 * 90 && !bossSeen; i++) {
      for (const f of rig.party) f.strike += 2;
      rig.step(STEP_MS);
      if (rig.boss() !== undefined) {
        bossSeen = true;
        bossWithRegulars = rig.regulars().length > 0;
      }
    }
    const boss = rig.boss();
    assert.ok(boss, 'the boss walked in');
    assert.equal(boss.row?.id, 'rat-king');
    assert.equal(bossWithRegulars, false, 'a boss is never alive with a regular enemy');
    // Health is frozen at spawn for the party of four.
    assert.equal(healthLeft(boss, 4), healthOf(boss.row, 1, 0, 4));
    rig.step(10_000);
    assert.equal(rig.regulars().length, 0, 'no regular spawn while the boss lives');
  });

  void it('during the intro the boss is engaged (the corridor stops) but not targetable, and strikes find nothing', () => {
    const rig = bossRig();
    const boss = untilBossEngaged(rig);
    assert.equal(boss.isEngaged, true);
    assert.equal(boss.isTargetable, false);
    assert.equal(rig.combat.inContact, true, 'contact uses isEngaged (13.1)');
    const full = boss.healthFraction;
    for (const f of rig.party) f.strike += 2;
    rig.step(STEP_MS);
    assert.equal(boss.healthFraction, full);
    rig.step(ENEMY_INTRO_MS + 100);
    assert.equal(boss.isTargetable, true);
    for (const f of rig.party) f.strike += 1;
    rig.step(STEP_MS);
    assert.ok(boss.healthFraction < full);
  });

  void it('defeating the boss is not a regular kill: one urgent progress call, bossesDefeated + 1, kills reset, the stage advances', () => {
    const rig = bossRig(8, 2);
    untilBossTargetable(rig);
    const killsBefore = rig.progression.snapshot().totalKills;
    const callsBefore = rig.progressCalls.length;
    untilBossDefeated(rig);
    const snap = rig.progression.snapshot();
    assert.equal(snap.totalKills, killsBefore, 'boss defeat is not a regular kill');
    assert.equal(snap.killsInStage, 0);
    assert.equal(snap.stageIndex, 2);
    assert.equal(snap.cycle, 0);
    assert.deepEqual(rig.progressCalls.slice(callsBefore), [true]);
    // The hold, then exactly one onStageClear.
    assert.equal(rig.stageClears, 0);
    rig.step(STAGE_CLEAR_HOLD_MS - 200);
    assert.equal(rig.stageClears, 0);
    rig.step(400);
    assert.equal(rig.stageClears, 1);
    rig.step(5000);
    assert.equal(rig.stageClears, 1, 'once');
  });

  void it('no waves spawn during the clear hold', () => {
    const rig = bossRig(8, 2);
    untilBossTargetable(rig);
    untilBossDefeated(rig);
    rig.step(STAGE_CLEAR_HOLD_MS / 2);
    assert.equal(rig.regulars().length, 0);
    assert.equal(rig.stageClears, 0);
  });

  void it('a boss defeat drops a chest and BOSS_COIN_BURST coins (decoration) that rest, fade, and vanish', () => {
    const rig = bossRig(8, 2);
    untilBossTargetable(rig);
    const surface = new RecordingSurface();
    rig.step(STEP_MS);
    surface.reset();
    rig.combat.drawDrops(surface, rig.world.world.cache);
    const before = surface.bitmapDraws;
    untilBossDefeated(rig);
    surface.reset();
    rig.combat.drawDrops(surface, rig.world.world.cache);
    assert.equal(
      surface.bitmapDraws - before >= 1 + BOSS_COIN_BURST,
      true,
      String(surface.bitmapDraws),
    );
    rig.step(DROP_ARC_MS + DROP_REST_MS + DROP_FADE_MS + 200);
    surface.reset();
    rig.combat.drawDrops(surface, rig.world.world.cache);
    assert.equal(surface.bitmapDraws, 0, 'every drop faded away');
  });

  void it('a boss defeat in the last delivered stage wraps: Stage 8 clear returns to Stage 1 with cycle + 1 (E4)', () => {
    const rig = makeCombat({ fighters: 8, stage: 8, config: { killsPerStage: 2 } });
    rig.progression.load({
      schemaVersion: 1,
      stageIndex: 8,
      killsInStage: 0,
      totalKills: 10,
      bossesDefeated: 1,
      cycle: 0,
    });
    untilBossDefeated(rig, 2);
    const snap = rig.progression.snapshot();
    assert.equal(snap.stageIndex, 1);
    assert.equal(snap.cycle, 1);
    assert.equal(snap.killsInStage, 0);
  });

  void it('boss defeats in Stages 1 to 7 advance one stage each with no new cycle (E4: the wrap moved to Stage 8)', () => {
    for (const from of [1, 2, 3, 4, 5, 6, 7]) {
      const rig = makeCombat({ fighters: 8, stage: from, config: { killsPerStage: 2 } });
      rig.progression.load({
        schemaVersion: 1,
        stageIndex: from,
        killsInStage: 0,
        totalKills: 10,
        bossesDefeated: 0,
        cycle: 0,
      });
      untilBossDefeated(rig, 1);
      const snap = rig.progression.snapshot();
      assert.equal(snap.stageIndex, from + 1, `from stage ${from}`);
      assert.equal(snap.cycle, 0, `from stage ${from}`);
      assert.equal(snap.killsInStage, 0);
      assert.equal(snap.totalKills >= 10, true, 'counters are kept');
    }
  });

  void it('enemy health follows the cycle when it spawns (New Game+ looping): more strikes to defeat', () => {
    const strikesToDefeat = (cycle: number): number => {
      const rig = makeCombat({ fighters: 1, seed: 7, config: { maxEnemies: 1 } });
      rig.progression.load({
        schemaVersion: 1,
        stageIndex: 1,
        killsInStage: 0,
        totalKills: 0,
        bossesDefeated: 0,
        cycle,
      });
      assert.ok(untilEngaged(rig, 1));
      const target = rig.enemies()[0]!;
      const expected = healthOf(target.row!, 1, cycle, 1);
      let strikes = 0;
      while (target.phase !== 'dissolve') {
        rig.party[0]!.strike += 1;
        rig.step(STEP_MS);
        strikes += 1;
        assert.ok(strikes < 500);
      }
      assert.equal(strikes, expected);
      return strikes;
    };
    assert.ok(strikesToDefeat(4) > strikesToDefeat(0));
    assert.equal(strikesToDefeat(40), strikesToDefeat(8), 'the cycle is capped at CYCLE_CAP');
  });

  void it('a boss slam flashes exactly BOSS_SLAM_TARGETS fighters at once, strongly (2 px)', () => {
    const rig = bossRig(8, 1);
    untilBossTargetable(rig);
    let peak = 0;
    let strong = false;
    for (let i = 0; i < 60 * 40 && rig.boss() !== undefined; i++) {
      rig.step(STEP_MS);
      const n = rig.party.filter((f) => rig.reactions.flashing(f.slot)).length;
      peak = Math.max(peak, n);
      if (rig.party.some((f) => Math.abs(rig.reactions.offsetPx(f.slot)) === 2)) strong = true;
      if (peak >= BOSS_SLAM_TARGETS && strong) break;
    }
    assert.equal(peak, BOSS_SLAM_TARGETS, 'a slam reaches exactly three');
    assert.equal(strong, true, 'a slam slides two pixels');
    // Only the three nearest the boss (largest x) are ever reached.
    for (const f of rig.party.slice(0, 5)) {
      assert.equal(rig.reactions.flashing(f.slot), false);
    }
  });

  void it('a withdrawn boss restarts at full health and the pending flag survives', () => {
    const rig = bossRig(4, 2);
    const boss = untilBossTargetable(rig);
    for (let i = 0; i < 15 && boss.healthFraction > 0.85; i++) {
      for (const f of rig.party) f.strike += 1;
      rig.step(STEP_MS);
    }
    assert.ok(boss.healthFraction < 1 && boss.healthFraction > 0);
    const kills = rig.progression.snapshot().totalKills;
    const killsInStage = rig.progression.killsInStage;
    // Everyone goes away.
    const stay = rig.party;
    rig.party = [];
    rig.step(WITHDRAW_AFTER_MS + 100);
    assert.equal(boss.phase, 'withdraw');
    rig.step(40_000);
    assert.equal(rig.boss(), undefined, 'walked off');
    assert.equal(rig.progression.snapshot().totalKills, kills, 'no credit for a withdrawal');
    assert.equal(rig.progression.snapshot().bossesDefeated, 0);
    assert.equal(rig.progression.killsInStage, killsInStage, 'still pending');
    // Work resumes.
    rig.party = stay;
    assert.ok(
      rig.until(() => rig.boss() !== undefined, 20_000),
      'the boss returns',
    );
    const again = rig.boss()!;
    assert.equal(again.healthFraction, 1, 'full health');
    assert.equal(rig.regulars().length, 0, 'no regular wave while pending');
  });
});

void describe('withdrawal (E1 plan 3.4.4 step 5)', () => {
  void it('after WITHDRAW_AFTER_MS without fighters every enemy walks off, credits nothing, and is released', () => {
    const rig = engagedRig(4, 3);
    const killsBefore = rig.progression.snapshot().totalKills;
    const stay = rig.party;
    rig.party = [];
    rig.step(WITHDRAW_AFTER_MS - 200);
    assert.ok(
      rig.enemies().every((e) => e.phase === 'engaged'),
      'not yet',
    );
    rig.step(400);
    assert.ok(rig.enemies().every((e) => e.phase === 'withdraw'));
    rig.step(30_000);
    assert.deepEqual(rig.enemies(), []);
    assert.equal(rig.progression.snapshot().totalKills, killsBefore);
    assert.deepEqual(rig.progressCalls, []);
    rig.party = stay;
    rig.step(WAVE_GAP_MS + 300);
    assert.ok(rig.enemies().length > 0, 'a new wave once work resumes');
  });

  void it('a fighter returning before the delay cancels the countdown', () => {
    const rig = engagedRig(2, 2);
    const stay = rig.party;
    rig.party = [];
    rig.step(WITHDRAW_AFTER_MS - 300);
    rig.party = stay;
    rig.step(WITHDRAW_AFTER_MS);
    assert.ok(rig.enemies().every((e) => e.phase !== 'withdraw'));
  });
});

void describe('enemy attacks land only as a cosmetic reaction (invariant 1)', () => {
  void it('a regular attack flashes one of the (up to three) fighters with the largest x, pushing left', () => {
    const rig = makeCombat({ fighters: 6, config: { maxEnemies: 6 } });
    const flashed = new Set<number>();
    for (let i = 0; i < 60 * 40; i++) {
      rig.step(STEP_MS);
      for (const f of rig.party) {
        if (rig.reactions.flashing(f.slot)) flashed.add(f.slot);
      }
      if (rig.reactions.flashing(0)) break;
    }
    assert.ok(flashed.size > 0, 'some hero flashed');
    // Slots 0..5 sit at x 100..160; the three nearest the enemies are slots 5, 4, 3.
    for (const slot of flashed) {
      assert.ok(slot >= 3, `slot ${slot} is not among the three nearest`);
    }
    const slot = [...flashed][0]!;
    assert.ok(rig.reactions.offsetPx(slot) <= 0, 'pushed away from the enemies (left or none)');
  });

  void it('with no fighters nothing is flashed, whatever the enemies do', () => {
    const rig = engagedRig(1, 1);
    rig.party = [];
    for (let i = 0; i < 60; i++) {
      rig.step(STEP_MS);
      for (let slot = 0; slot < 64; slot++) {
        assert.equal(rig.reactions.flashing(slot), false);
      }
    }
  });

  void it('a slot never flashes twice inside HERO_FLASH_GAP_MS', () => {
    const rig = makeCombat({ fighters: 1, config: { maxEnemies: 6 } });
    rig.party = party(1);
    const starts: number[] = [];
    let was = false;
    for (let i = 0; i < 60 * 60; i++) {
      rig.step(STEP_MS);
      const now = rig.reactions.flashing(0);
      if (now && !was) starts.push(i * STEP_MS);
      was = now;
    }
    assert.ok(starts.length >= 3, `flashes: ${starts.length}`);
    for (let i = 1; i < starts.length; i++) {
      assert.ok(starts[i]! - starts[i - 1]! >= HERO_FLASH_GAP_MS - STEP_MS, `${starts.join()}`);
    }
  });
});

void describe('faults and quarantine (invariant 4)', () => {
  void it('a throwing Enemy.update quarantines only that enemy: released with no credit, the others live', () => {
    const rig = engagedRig(8, 5);
    const live = rig.enemies();
    const victim = live[0]!;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const original = Enemy.prototype.update;
    patch(Enemy.prototype, 'update', function (this: Enemy, ...args: Parameters<typeof original>) {
      if (this === victim) {
        throw new Error('enemy broke');
      }
      original.apply(this, args);
    });
    const killsBefore = rig.progression.snapshot().totalKills;
    rig.step(STEP_MS * 6);
    assert.equal(victim.inUse, false, 'released after the third fault freezes it');
    assert.equal(rig.progression.snapshot().totalKills, killsBefore, 'no credit');
    assert.equal(rig.errors.length, 1, 'reported once');
    assert.ok(live.slice(1).every((e) => e.inUse));
    assert.equal(rig.combat.disabled, false, 'combat itself keeps running');
  });

  void it('recordFault three times disables combat for the page load and clears the field', () => {
    const rig = engagedRig(4, 3);
    assert.equal(COMBAT_FAULT_LIMIT, 3);
    rig.combat.recordFault();
    rig.combat.recordFault();
    assert.equal(rig.combat.disabled, false);
    assert.ok(rig.enemies().length > 0);
    rig.combat.recordFault();
    assert.equal(rig.combat.disabled, true);
    assert.deepEqual(rig.enemies(), []);
    assert.equal(rig.combat.inContact, false);
    rig.step(10_000);
    assert.deepEqual(rig.enemies(), [], 'nothing spawns again');
    rig.combat.configure({ enabled: true, killsPerStage: 30, maxEnemies: 6 });
    assert.equal(rig.combat.disabled, true, 'a setting change does not revive it');
  });

  void it('setTransitioning(true) pauses spawning only; strikes, attacks, and drops keep running', () => {
    const rig = engagedRig(1, 1, 1);
    const target = rig.enemies()[0]!;
    rig.combat.setTransitioning(true);
    const full = healthLeft(target, 1);
    rig.party[0]!.strike += 1;
    rig.step(STEP_MS);
    assert.equal(healthLeft(target, 1), full - 1, 'strikes still land');
    rig.hammer(15_000);
    assert.equal(rig.enemies().length, 0);
    rig.step(10_000);
    assert.equal(rig.enemies().length, 0, 'no wave while transitioning');
    rig.combat.setTransitioning(false);
    rig.step(WAVE_GAP_MS + 300);
    assert.ok(rig.enemies().length > 0);
  });

  void it('setStage clears live enemies and swaps the row set', () => {
    const rig = engagedRig(4, 3);
    rig.combat.setStage(STAGES[1]!);
    assert.deepEqual(rig.enemies(), []);
    rig.step(WAVE_GAP_MS + 300);
    assert.ok(rig.enemies().length > 0);
    assert.ok(rig.enemies().every((e) => e.row?.stage === 2));
  });

  void it('with a table missing a boss the pending flag spawns nothing and nothing throws', () => {
    const noBoss: EnemyRow[] = ENEMIES.filter((r) => r.tier !== 'boss');
    const rig = makeCombat({ rows: noBoss, fighters: 8, config: { killsPerStage: 1 } });
    assert.doesNotThrow(() => rig.hammer(30_000));
    assert.equal(rig.boss(), undefined);
  });
});

void describe('summons are never targets or fighters (plan 2.2)', () => {
  void it('live summons in the world change nothing: entities() holds only Enemy instances and strikes land as before', () => {
    const rig = engagedRig(2, 2);
    for (const kind of ['skeleton', 'beast', 'turret'] as const) {
      rig.world.summons.raise(kind === 'skeleton' ? 0 : 1, kind, 120, 150, true);
    }
    assert.ok(rig.world.summons.count > 0);
    assert.ok(rig.combat.entities().every((e) => e instanceof Enemy));
    const total = (): number => rig.enemies().reduce((n, e) => n + healthLeft(e, 2), 0);
    const before = total();
    rig.party[0]!.strike += 1;
    rig.step(STEP_MS);
    assert.equal(total(), before - 1);
    // The reaction board only ever knows hero slots that were fighters.
    for (let i = 0; i < 600; i++) {
      rig.step(STEP_MS);
      for (let slot = 2; slot < 64; slot++) {
        assert.equal(rig.reactions.flashing(slot), false, `slot ${slot} is not a fighter`);
      }
    }
  });

  void it('Combat has no reference to Summon code (its constructor takes no pool and entities() are enemies)', () => {
    assert.equal(Combat.length >= 6, true);
    const rig = makeCombat({ fighters: 1 });
    assert.equal(typeof (rig.combat as unknown as Record<string, unknown>)['summons'], 'undefined');
  });
});
