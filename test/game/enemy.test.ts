// Enemy and Boss entities (E1 plan 3.4.3 and drift 13.3): movement, strike as the only health
// mutator, withdraw, dissolve, the attack cadence, the boss intro, telegraph, and phases, and the
// health bar rules (after damage only, always for an engaged boss, never for anything else).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOSS_PHASE2_FRACTION,
  BOSS_PHASE2_INTERVAL_FACTOR,
  ENEMY_ATTACK_STRIKE_FRAME,
  ENEMY_BAR_SHOW_MS,
  ENEMY_DISSOLVE_FRAME_MS,
  ENEMY_DISSOLVE_FRAMES,
  ENEMY_FLASH_MS,
  ENEMY_INTRO_MS,
  ENEMY_RELEASE_X,
  ENEMY_TELEGRAPH_MS,
  STEP_MS,
} from '../../src/game/data/tuning';
import { ENEMY_ATTACK_TOTAL_MS } from '../../src/game/data/animations';
import { ENEMIES, TIER_SHADOW_PX, TIER_SPEED_PX_PER_S } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { Boss } from '../../src/game/entities/Boss';
import { Enemy } from '../../src/game/entities/Enemy';
import type { DrawContext, World } from '../../src/game/entities/Entity';
import { Camera } from '../../src/game/Camera';
import { drawContext, makeWorld } from '../support/classRig';
import type { ClassWorld } from '../support/classRig';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { RecordingSurface } from '../support/engineFakes';

const row = (id: string): EnemyRow => {
  const found = ENEMIES.find((r) => r.id === id);
  assert.ok(found, id);
  return found;
};
const RAT = row('cellar-rat');
const BAT = row('cave-bat');
const MIMIC = row('crate-mimic');
const KING = row('rat-king');

/** A world whose engagement scrolls at `scroll` px/s (the corridor moving under the enemy). */
function withScroll(w: ClassWorld, scroll: number): World {
  return {
    ...w.world,
    engagement: {
      update: () => undefined,
      scrollPxPerS: scroll,
      isEngaged: false,
    },
  };
}

function advance(e: Enemy, world: World, ms: number): void {
  for (let t = 0; t < ms; t += STEP_MS) {
    e.update(STEP_MS, world);
  }
}

/** A standing, engaged enemy of `row` with `health`. */
function standing(r: EnemyRow, health = 10, x = 150): { e: Enemy; w: ClassWorld } {
  const w = makeWorld();
  const e = r.tier === 'boss' ? new Boss() : new Enemy();
  e.begin(r, health, x, 150);
  e.setStand(x);
  e.update(STEP_MS, w.world);
  assert.equal(e.phase, 'engaged');
  return { e, w };
}

function draw(e: Enemy, w: ClassWorld, surface = new RecordingSurface()): RecordingSurface {
  surface.record = true;
  e.draw(drawContext(surface, w, new Camera()) satisfies DrawContext);
  return surface;
}

void describe('Enemy: begin, movement, and engagement', () => {
  void it('begin resets every field and starts approaching at full health', () => {
    const e = new Enemy();
    assert.equal(e.inUse, false);
    e.begin(RAT, 10, 340, 150);
    assert.equal(e.inUse, true);
    assert.equal(e.row, RAT);
    assert.equal(e.phase, 'approach');
    assert.equal(e.x, 340);
    assert.equal(e.sortY, 150);
    assert.equal(e.healthFraction, 1);
    assert.equal(e.isEngaged, false);
    assert.equal(e.isTargetable, false);
    assert.equal(e.finished, false);
    assert.equal(e.frozen, false);
    assert.equal(e.shadowWidth, TIER_SHADOW_PX.minion);
  });

  void it('re-using a pooled instance forgets the previous fight (damage, faults, attack, flash)', () => {
    const { e, w } = standing(RAT, 10);
    e.strike(3);
    e.faults = 2;
    e.frozen = true;
    e.beginAttack();
    e.release();
    e.begin(BAT, 8, 300, 140);
    assert.equal(e.healthFraction, 1);
    assert.equal(e.frozen, false);
    assert.equal(e.faults, 0);
    assert.equal(e.row, BAT);
    e.update(STEP_MS, w.world);
    assert.equal(e.takeAttackFrame(), false);
  });

  void it('walks left at tier speed times pace, plus the corridor scroll while approaching', () => {
    const w = makeWorld();
    const e = new Enemy();
    e.begin(RAT, 10, 340, 150);
    e.setStand(100);
    advance(e, w.world, 1000);
    const perSecond = TIER_SPEED_PX_PER_S.minion * RAT.pace;
    assert.ok(
      Math.abs(340 - e.x - perSecond) < 1.2,
      `moved ${340 - e.x}, expected about ${perSecond}`,
    );
    const f = new Enemy();
    f.begin(RAT, 10, 340, 150);
    f.setStand(100);
    advance(f, withScroll(w, 24), 1000);
    assert.ok(Math.abs(340 - f.x - (perSecond + 24)) < 1.5);
    // A negative scroll never pushes an enemy backwards.
    const g = new Enemy();
    g.begin(RAT, 10, 340, 150);
    g.setStand(100);
    advance(g, withScroll(w, -50), 1000);
    assert.ok(Math.abs(340 - g.x - perSecond) < 1.2);
  });

  void it('stops exactly at its stand position and becomes engaged and targetable', () => {
    const w = makeWorld();
    const e = new Enemy();
    e.begin(RAT, 10, 200, 150);
    e.setStand(180);
    advance(e, w.world, 5000);
    assert.equal(e.x, 180);
    assert.equal(e.phase, 'engaged');
    assert.equal(e.isEngaged, true);
    assert.equal(e.isTargetable, true);
    advance(e, withScroll(w, 24), 1000);
    assert.equal(e.x, 180, 'scroll does not move an engaged enemy');
  });

  void it('an update before begin (or after release) does nothing and never throws', () => {
    const w = makeWorld();
    const e = new Enemy();
    assert.doesNotThrow(() => e.update(STEP_MS, w.world));
    assert.doesNotThrow(() => draw(e, w));
    e.begin(RAT, 10, 200, 150);
    e.release();
    assert.equal(e.inUse, false);
    assert.equal(e.row, null);
    assert.doesNotThrow(() => e.update(STEP_MS, w.world));
    assert.equal(draw(e, w).bitmapDraws, 0);
  });
});

void describe('Enemy.strike: the only health mutator', () => {
  void it('does nothing to an approaching enemy', () => {
    const w = makeWorld();
    const e = new Enemy();
    e.begin(RAT, 10, 300, 150);
    e.setStand(100);
    e.update(STEP_MS, w.world);
    assert.equal(e.strike(5), false);
    assert.equal(e.healthFraction, 1);
  });

  void it('reduces health by the power and returns true exactly once, on the defeating call', () => {
    const { e } = standing(RAT, 3);
    assert.equal(e.strike(1), false);
    assert.ok(Math.abs(e.healthFraction - 2 / 3) < 1e-9);
    assert.equal(e.strike(1), false);
    assert.equal(e.strike(1), true);
    assert.equal(e.healthFraction, 0);
    assert.equal(e.phase, 'dissolve');
    assert.equal(e.strike(1), false, 'a defeated enemy cannot be defeated again');
    assert.equal(e.strike(100), false);
    assert.equal(e.healthFraction, 0);
  });

  void it('power 2 on health 1 defeats it without going negative', () => {
    const { e } = standing(RAT, 1);
    assert.equal(e.strike(2), true);
    assert.equal(e.healthFraction, 0);
  });

  void it('ignores zero, negative, and NaN power', () => {
    const { e } = standing(RAT, 5);
    for (const power of [0, -1, Number.NaN, -Infinity]) {
      assert.equal(e.strike(power), false);
    }
    assert.equal(e.healthFraction, 1);
  });

  void it('healthFraction stays within 0..1 and the health never exceeds the maximum', () => {
    const { e } = standing(MIMIC, 24);
    let last = 1;
    while (e.phase === 'engaged') {
      e.strike(1);
      assert.ok(e.healthFraction <= last && e.healthFraction >= 0);
      last = e.healthFraction;
    }
    assert.equal(last, 0);
  });

  void it('a minimum health of 1 is enforced for a zero or negative request', () => {
    const w = makeWorld();
    const e = new Enemy();
    e.begin(RAT, 0, 100, 150);
    e.setStand(100);
    e.update(STEP_MS, w.world);
    assert.equal(e.healthFraction, 1);
    assert.equal(e.strike(1), true);
  });

  void it('the Enemy class has no other method that lowers health (strike is the only mutator)', () => {
    const names = Object.getOwnPropertyNames(Enemy.prototype);
    assert.ok(names.includes('strike'));
    const suspicious = names.filter((n) => /damage|hurt|heal|health|hit\b|wound/i.test(n));
    assert.deepEqual(suspicious, ['healthFraction'], 'only the read-only fraction getter');
    const desc = Object.getOwnPropertyDescriptor(Enemy.prototype, 'healthFraction');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- only checked for absence
    assert.equal(desc?.set, undefined, 'healthFraction has no setter');
  });
});

void describe('Enemy: withdraw, dissolve, and release', () => {
  void it('withdraws to the right at twice its speed plus scroll, then is released past ENEMY_RELEASE_X', () => {
    const { e, w } = standing(RAT, 10, 150);
    e.beginWithdraw();
    assert.equal(e.phase, 'withdraw');
    assert.equal(e.isEngaged, false);
    assert.equal(e.isTargetable, false);
    const x0 = e.x;
    advance(e, w.world, 1000);
    const perSecond = 2 * TIER_SPEED_PX_PER_S.minion * RAT.pace;
    assert.ok(Math.abs(e.x - x0 - perSecond) < 1.5);
    for (let i = 0; i < 1000 && e.inUse; i++) {
      e.update(STEP_MS, w.world);
    }
    assert.equal(e.inUse, false);
    assert.ok(ENEMY_RELEASE_X > 300);
  });

  void it('beginWithdraw works while approaching, and is ignored while dissolving or already withdrawing', () => {
    const w = makeWorld();
    const walker = new Enemy();
    walker.begin(RAT, 10, 300, 150);
    walker.setStand(100);
    walker.beginWithdraw();
    assert.equal(walker.phase, 'withdraw');
    const { e } = standing(RAT, 1);
    e.strike(1);
    e.beginWithdraw();
    assert.equal(e.phase, 'dissolve', 'a defeated enemy finishes dissolving');
    walker.update(STEP_MS, w.world);
    walker.beginWithdraw();
    assert.equal(walker.phase, 'withdraw');
  });

  void it('a defeated enemy dissolves for ENEMY_DISSOLVE_FRAMES x ENEMY_DISSOLVE_FRAME_MS and then reports finished', () => {
    const { e, w } = standing(RAT, 1);
    e.strike(1);
    const total = ENEMY_DISSOLVE_FRAMES * ENEMY_DISSOLVE_FRAME_MS;
    assert.equal(ENEMY_DISSOLVE_FRAMES, 4);
    assert.equal(e.finished, false);
    advance(e, w.world, total - 2 * STEP_MS);
    assert.equal(e.finished, false);
    advance(e, w.world, 4 * STEP_MS);
    assert.equal(e.finished, true);
    assert.equal(e.shadowWidth, 0, 'a dissolving enemy casts no shadow');
  });

  void it('does not move while dissolving', () => {
    const { e, w } = standing(RAT, 1, 140);
    e.strike(1);
    advance(e, withScroll(w, 24), 300);
    assert.equal(e.x, 140);
  });
});

void describe('Enemy: attacks are timed by Combat and only play an animation', () => {
  void it('tickAttack counts down only while it can attack and fires once at zero', () => {
    const { e } = standing(RAT, 10);
    e.armAttack(100);
    assert.equal(e.tickAttack(50), false);
    assert.equal(e.tickAttack(60), true);
    // An enemy that is not engaged never ticks.
    const w = makeWorld();
    const walker = new Enemy();
    walker.begin(RAT, 10, 300, 150);
    walker.setStand(100);
    walker.update(STEP_MS, w.world);
    walker.armAttack(0);
    assert.equal(walker.tickAttack(1000), false);
  });

  void it('beginAttack plays the attack; takeAttackFrame fires once on the strike frame, then the attack ends', () => {
    const { e, w } = standing(RAT, 10);
    assert.equal(e.canAttack, true);
    e.beginAttack();
    assert.equal(e.canAttack, false, 'busy attacking');
    assert.equal(e.takeAttackFrame(), false, 'nothing yet');
    let fired = 0;
    let firedAt = -1;
    for (let t = 0; t < ENEMY_ATTACK_TOTAL_MS + 200; t += STEP_MS) {
      e.update(STEP_MS, w.world);
      if (e.takeAttackFrame()) {
        fired += 1;
        firedAt = t;
      }
    }
    assert.equal(fired, 1);
    assert.equal(ENEMY_ATTACK_STRIKE_FRAME, 1);
    assert.ok(firedAt >= 140 - STEP_MS && firedAt <= 140 + 90 + STEP_MS, `fired at ${firedAt}`);
    assert.equal(e.canAttack, true, 'ready again after the swing');
    assert.equal(e.takeAttackFrame(), false, 'the flag is consumed');
  });

  void it('a withdraw or a defeat cancels an attack in progress and its pending frame', () => {
    const { e, w } = standing(RAT, 10);
    e.beginAttack();
    for (let t = 0; t < 400; t += STEP_MS) e.update(STEP_MS, w.world);
    e.beginWithdraw();
    assert.equal(e.takeAttackFrame(), false);
    const { e: f, w: w2 } = standing(RAT, 1);
    f.beginAttack();
    for (let t = 0; t < 120; t += STEP_MS) f.update(STEP_MS, w2.world);
    f.strike(1);
    advance(f, w2.world, 500);
    assert.equal(f.takeAttackFrame(), false);
  });

  void it('a regular enemy has no intro and no telegraph and spritePhase 1, attack factor 1', () => {
    const { e } = standing(BAT, 8);
    assert.equal(e.introLeftMs, 0);
    assert.equal(e.isWindingUp, false);
    assert.equal(e.spritePhase, 1);
    assert.equal(e.attackIntervalFactor, 1);
  });
});

void describe('Enemy.draw: art, flash, and the health bar', () => {
  void it('draws one bitmap for a healthy enemy: no bar, no bar rectangle', () => {
    const { e, w } = standing(RAT, 10);
    const s = draw(e, w);
    assert.equal(s.bitmapDraws, 1);
    assert.equal(s.count('fillRect'), 0);
  });

  void it('shows a bar only after damage: one outline bitmap and two rectangles, for ENEMY_BAR_SHOW_MS', () => {
    const { e, w } = standing(RAT, 10);
    e.strike(1);
    const s = draw(e, w);
    assert.equal(s.bitmapDraws, 2, 'sprite + bar frame');
    assert.equal(s.count('fillRect'), 2, 'back and fill');
    advance(e, w.world, ENEMY_BAR_SHOW_MS - 100);
    assert.equal(draw(e, w).bitmapDraws, 2, 'still visible');
    advance(e, w.world, 300);
    const gone = draw(e, w);
    assert.equal(gone.bitmapDraws, 1);
    assert.equal(gone.count('fillRect'), 0);
  });

  void it('the fill width is ceil(fraction x inner width): any health above zero shows at least 1 px', () => {
    const { e, w } = standing(MIMIC, 24);
    for (let i = 0; i < 23; i++) e.strike(1);
    const s = draw(e, w);
    const rects = s.calls.filter((c) => c.method === 'fillRect');
    assert.equal(rects.length, 2);
    const fill = rects[1]!.args;
    assert.equal(fill[3], 1, 'one pixel of fill at 1/24');
    const back = rects[0]!.args;
    assert.ok((back[3] as number) > (fill[3] as number));
  });

  void it('no bar when health reaches zero (a dissolving enemy draws only its dissolve frame)', () => {
    const { e, w } = standing(RAT, 1);
    e.strike(1);
    const s = draw(e, w);
    assert.equal(s.bitmapDraws, 1);
    assert.equal(s.count('fillRect'), 0);
  });

  void it('flashes a white silhouette for ENEMY_FLASH_MS after a strike, then returns to its colors', () => {
    const { e, w } = standing(RAT, 10);
    const normal = draw(e, w).calls.find((c) => c.method === 'drawBitmap')!.args[0];
    e.strike(1);
    const flash = draw(e, w).calls.find((c) => c.method === 'drawBitmap')!.args[0];
    assert.notEqual(flash, normal);
    assert.equal(w.world.cache.enemyFlash(RAT.id)?.['idle']?.frames.includes(flash as never), true);
    advance(e, w.world, ENEMY_FLASH_MS + 2 * STEP_MS);
    const after = draw(e, w).calls.filter((c) => c.method === 'drawBitmap')[0]!.args[0];
    assert.equal(
      w.world.cache.enemyFlash(RAT.id)?.['idle']?.frames.includes(after as never),
      false,
    );
  });

  void it('draws the withdrawing enemy mirrored; an approaching or engaged one unmirrored', () => {
    const { e, w } = standing(RAT, 10);
    assert.equal(draw(e, w).calls.find((c) => c.method === 'drawBitmap')!.args[3], false);
    e.beginWithdraw();
    assert.equal(draw(e, w).calls.find((c) => c.method === 'drawBitmap')!.args[3], true);
  });

  void it('the bat floats and the mimic hops (cosmetic draw offset only; x and foot y never change)', () => {
    const w = makeWorld();
    const bat = new Enemy();
    bat.begin(BAT, 8, 200, 150);
    bat.setStand(100);
    const ys = new Set<number>();
    for (let i = 0; i < 120; i++) {
      bat.update(STEP_MS, w.world);
      ys.add(draw(bat, w).calls.find((c) => c.method === 'drawBitmap')!.args[2] as number);
      assert.equal(bat.sortY, 150);
    }
    assert.ok(ys.size > 1, 'bobs');
    const rat = new Enemy();
    rat.begin(RAT, 10, 200, 150);
    rat.setStand(100);
    rat.update(STEP_MS, w.world);
    const y1 = draw(rat, w).calls.find((c) => c.method === 'drawBitmap')!.args[2];
    advance(rat, w.world, 400);
    const y2 = draw(rat, w).calls.find((c) => c.method === 'drawBitmap')!.args[2];
    assert.equal(y1, y2, 'a walker does not bob');
  });

  void it('draws nothing, and does not throw, when the art set lacks the enemy, its flash, its dissolve, or the bar', () => {
    const w = makeWorld({ ...SHIPPED_ART, enemies: {} });
    const e = new Enemy();
    e.begin(RAT, 10, 150, 150);
    e.setStand(150);
    e.update(STEP_MS, w.world);
    assert.equal(draw(e, w).bitmapDraws, 0);
    e.strike(1);
    assert.doesNotThrow(() => draw(e, w));
    e.strike(20);
    assert.equal(e.phase, 'dissolve');
    assert.equal(draw(e, w).bitmapDraws, 0);
  });
});

void describe('Boss: intro, telegraph, and phases', () => {
  /** An engaged boss with `health`. */
  const boss = (health = 120): { b: Boss; w: ClassWorld } => {
    const { e, w } = standing(KING, health, 200);
    assert.ok(e instanceof Boss);
    return { b: e, w };
  };

  void it('is an Enemy with the boss shadow, an intro of ENEMY_INTRO_MS, and is untargetable until it ends', () => {
    const { b, w } = boss();
    assert.ok(b instanceof Enemy);
    assert.equal(b.shadowWidth, TIER_SHADOW_PX.boss);
    assert.equal(b.introLeftMs, ENEMY_INTRO_MS);
    assert.equal(b.introduced, false);
    assert.equal(b.isEngaged, true);
    assert.equal(b.isTargetable, false);
    assert.equal(b.strike(50), false);
    assert.equal(b.healthFraction, 1);
    advance(b, w.world, ENEMY_INTRO_MS - STEP_MS);
    assert.equal(b.introduced, false);
    advance(b, w.world, 3 * STEP_MS);
    assert.equal(b.introduced, true);
    assert.equal(b.isTargetable, true);
  });

  void it('draws the intro animation while posing, the telegraph before an attack, and the attack after it', () => {
    const { b, w } = boss();
    const sprites = w.world.cache.enemy(KING.id, 1);
    assert.ok(sprites);
    const frames = (name: string): readonly unknown[] => sprites[name]?.frames ?? [];
    const drawn = (): unknown => draw(b, w).calls.find((c) => c.method === 'drawBitmap')?.args[0];
    assert.ok(frames('intro').includes(drawn()), 'intro pose');
    advance(b, w.world, ENEMY_INTRO_MS + 100);
    assert.ok(frames('idle').includes(drawn()));
    b.beginAttack();
    assert.equal(b.telegraphing, true);
    assert.ok(frames('telegraph').includes(drawn()), 'wind-up');
    advance(b, w.world, ENEMY_TELEGRAPH_MS + 2 * STEP_MS);
    assert.equal(b.telegraphing, false);
    assert.ok(frames('attack').includes(drawn()), 'swing');
  });

  void it('the attack frame fires only after the telegraph and then the swing reaches its strike frame', () => {
    const { b, w } = boss();
    advance(b, w.world, ENEMY_INTRO_MS + 100);
    b.beginAttack();
    let at = -1;
    for (let t = 0; t < 3000 && at < 0; t += STEP_MS) {
      b.update(STEP_MS, w.world);
      if (b.takeAttackFrame()) at = t;
    }
    assert.ok(at >= ENEMY_TELEGRAPH_MS, `landed at ${at}, the wind-up is ${ENEMY_TELEGRAPH_MS}`);
  });

  void it('the bar is always drawn for an engaged boss, from full health, with the larger frame', () => {
    const { b, w } = boss();
    const s = draw(b, w);
    assert.equal(s.bitmapDraws, 2, 'sprite + boss bar frame');
    assert.equal(s.count('fillRect'), 2);
    const barBitmap = s.calls.filter((c) => c.method === 'drawBitmap')[1]!.args[0];
    assert.equal(w.world.cache.barFrame(true).frames.includes(barBitmap as never), true);
    assert.equal(w.world.cache.barFrame(false).frames.includes(barBitmap as never), false);
  });

  void it('the second phase begins below half health: bossStage 2, faster attacks, the phase palette sprite', () => {
    const { b, w } = boss(100);
    advance(b, w.world, ENEMY_INTRO_MS + 100);
    assert.equal(b.bossStage, 1);
    assert.equal(b.attackIntervalFactor, 1);
    assert.equal(b.spritePhase, 1);
    for (let i = 0; i < 50; i++) b.strike(1);
    assert.equal(b.healthFraction, 0.5);
    assert.equal(b.bossStage, 1, 'exactly half is still phase 1');
    b.strike(1);
    assert.ok(b.healthFraction < BOSS_PHASE2_FRACTION);
    assert.equal(b.bossStage, 2);
    assert.equal(b.attackIntervalFactor, BOSS_PHASE2_INTERVAL_FACTOR);
    assert.equal(BOSS_PHASE2_INTERVAL_FACTOR, 0.7);
    assert.equal(b.spritePhase, 2);
    const phase2 = w.world.cache.enemy(KING.id, 2);
    const phase1 = w.world.cache.enemy(KING.id, 1);
    assert.ok(phase2 && phase1);
    advance(b, w.world, ENEMY_FLASH_MS + 3 * STEP_MS);
    const drawn = draw(b, w).calls.find((c) => c.method === 'drawBitmap')?.args[0];
    assert.equal(phase2['idle']?.frames.includes(drawn as never), true);
    assert.equal(phase1['idle']?.frames.includes(drawn as never), false);
  });

  void it('a boss is defeated once: strike returns true once, the dissolve plays, and the bar disappears', () => {
    const { b, w } = boss(3);
    advance(b, w.world, ENEMY_INTRO_MS + 100);
    assert.equal(b.strike(2), false);
    assert.equal(b.strike(2), true);
    assert.equal(b.strike(2), false);
    assert.equal(draw(b, w).count('fillRect'), 0);
  });

  void it('a withdrawing boss is not credited: release leaves it reusable at full health', () => {
    const { b, w } = boss(120);
    advance(b, w.world, ENEMY_INTRO_MS + 100);
    b.strike(60);
    b.beginWithdraw();
    for (let i = 0; i < 5000 && b.inUse; i++) b.update(STEP_MS, w.world);
    assert.equal(b.inUse, false);
    b.begin(KING, 120, 340, 156);
    assert.equal(b.healthFraction, 1);
    assert.equal(b.introLeftMs, ENEMY_INTRO_MS);
    assert.equal(b.bossStage, 1);
  });
});
