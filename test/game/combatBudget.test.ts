// Draw-call ceilings and CPU cost with enemies on screen (E1 plan test note 15, risk R4, drift
// 13.3). The M4 to H3 budget (152 bitmap draws, 450 fills; still pinned, unchanged, in classBudget and renderer tests, which run with enemies on and pass) rises to 200 and 520 with 12 enemies,
// their bars, 16 drops, and the fade. Two measurements: an engineered worst case that fills every
// pool at once (8 heroes, 12 damaged enemies with bars, 16 drops, 24 effects, 8 summons, 384
// particles, a fade), and real games under hard combat. The numbers are reported as diagnostics.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Camera } from '../../src/game/Camera';
import { ENEMIES } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { DROP_CAPACITY } from '../../src/game/data/drops';
import { EFFECT_IDS } from '../../src/game/data/effects';
import {
  EFFECT_CAPACITY,
  ENEMY_CAPACITY,
  PARTICLE_CAPACITY,
  STEP_MS,
  SUMMON_CAPACITY,
} from '../../src/game/data/tuning';
import { Enemy } from '../../src/game/entities/Enemy';
import { Hero } from '../../src/game/entities/Hero';
import { Drops } from '../../src/game/Drops';
import { HitReactions } from '../../src/game/HitReactions';
import { Renderer } from '../../src/game/Renderer';
import type { RenderExtras } from '../../src/game/Renderer';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { info, lookFor, makeWorld, mixedIds } from '../support/classRig';
import { RecordingSurface, agent, feed, gameRig, run } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';
import { EffectPool } from '../../src/game/Effects';

/** E1 ceilings (plan section 9, R4). */
const MAX_BITMAPS = 200;
const MAX_FILLS = 520;

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

const regulars = ENEMIES.filter((r) => r.tier !== 'boss');

/** The engineered worst case: every pool full at once, bars on, a fade over everything. */
function worstFrame(): { bitmaps: number; fills: number; barDraws: number; dropDraws: number } {
  const w = makeWorld();
  const renderer = new Renderer(w.bitmaps, SHIPPED_ART, () => undefined);
  const heroes: Hero[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `h${i}`;
    const hero = new Hero({
      info: info(id, i % 2 === 0 ? 'working' : 'idle'),
      slot: i,
      instant: true,
      look: lookFor(id),
    });
    hero.update(STEP_MS, w.world);
    heroes.push(hero);
  }
  const foes: Enemy[] = [];
  for (let i = 0; i < ENEMY_CAPACITY; i++) {
    const row = regulars[i % regulars.length] as EnemyRow;
    const e = new Enemy();
    e.begin(row, 10, 200 + i * 5, 156 - 5 * (i % 4));
    e.setStand(200 + i * 5);
    e.update(STEP_MS, w.world);
    e.strike(1); // damaged: the bar shows
    foes.push(e);
  }
  const drops = new Drops();
  for (let i = 0; i < DROP_CAPACITY; i++) {
    drops.spawn(['coin', 'gem', 'ore', 'chest'][i % 4] as 'coin', 150 + i * 6, 150, 3);
  }
  for (let i = 0; i < EFFECT_CAPACITY; i++) {
    w.effects.spawn(
      EFFECT_IDS[i % EFFECT_IDS.length] as never,
      100 + i * 4,
      120,
      0,
      0,
      5000,
      false,
    );
  }
  for (let i = 0; i < SUMMON_CAPACITY; i++) {
    w.summons.raise(
      i,
      (['skeleton', 'beast', 'turret'] as const)[i % 3] as 'skeleton',
      120 + i * 10,
      150,
      true,
    );
  }
  for (let i = 0; i < PARTICLE_CAPACITY; i++) {
    w.particles.emit('spark', 100 + (i % 200), 100 + (i % 50), 0, 0, 5000);
  }
  for (let i = 0; i < 20; i++) {
    w.effects.update(STEP_MS, w.particles);
    w.summons.update(STEP_MS, w.world);
  }
  const extras: RenderExtras = {
    foes,
    reactions: new HitReactions(64),
    drops: (surface, cache) => drops.draw(surface, cache),
    fadeAlpha: 0.5,
  };
  // Flash every hero too: a flashing hero replaces its frame, so it must not add a draw.
  for (let i = 0; i < 8; i++) extras.reactions.flash(i, -1, true);
  const surface = new RecordingSurface();
  surface.record = true;
  renderer.render(surface, w.world, heroes, new Camera(), extras);
  assert.equal(w.effects.count, EFFECT_CAPACITY);
  assert.equal(w.summons.count, SUMMON_CAPACITY);
  assert.equal(w.particles.count, PARTICLE_CAPACITY);
  assert.equal(drops.count, DROP_CAPACITY);
  const barBitmap = w.world.cache.barFrame(false).frames[0];
  const dropBitmaps = new Set(
    ['coin', 'gem', 'ore', 'chest'].flatMap((k) => w.world.cache.drop(k)?.frames ?? []),
  );
  const barDraws = surface.calls.filter(
    (c) => c.method === 'drawBitmap' && c.args[0] === barBitmap,
  ).length;
  const dropDraws = surface.calls.filter(
    (c) => c.method === 'drawBitmap' && dropBitmaps.has(c.args[0] as never),
  ).length;
  return { bitmaps: surface.bitmapDraws, fills: surface.count('fillRect'), barDraws, dropDraws };
}

function floodEffects(): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = EffectPool.prototype.spawn;
  EffectPool.prototype.spawn = function (
    this: EffectPool,
    ...args: Parameters<EffectPool['spawn']>
  ) {
    for (let i = 0; i < 30; i++) {
      original.apply(this, args);
    }
    return original.apply(this, args);
  };
  restores.push(() => {
    EffectPool.prototype.spawn = original;
  });
}

function hardParty(n: number, flood: boolean): GameRig {
  if (flood) floodEffects();
  const rig = gameRig();
  rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 });
  mixedIds(n).forEach((id) => feed(rig, agent(id, 'working')));
  return rig;
}

function measure(rig: GameRig, frames: number): { bitmaps: number; fills: number } {
  const worst = { bitmaps: 0, fills: 0 };
  for (let i = 0; i < frames; i++) {
    rig.surface.reset();
    rig.game.frame(STEP_MS, rig.surface);
    worst.bitmaps = Math.max(worst.bitmaps, rig.surface.bitmapDraws);
    worst.fills = Math.max(worst.fills, rig.surface.count('fillRect'));
  }
  return worst;
}

void describe('the E1 draw-call ceilings: 200 bitmap draws and 520 fills', () => {
  void it('the engineered worst case (8 heroes, 12 damaged enemies with bars, 16 drops, 24 effects, 8 summons, 384 particles, a fade) fits', (t) => {
    const worst = worstFrame();
    t.diagnostic(`engineered worst case: ${worst.bitmaps} bitmap draws, ${worst.fills} fills`);
    assert.ok(worst.bitmaps <= MAX_BITMAPS, `${worst.bitmaps} bitmap draws`);
    assert.ok(worst.fills <= MAX_FILLS, `${worst.fills} fills`);
    // The scene really is full: 12 bars, 16 drops, 384 particles + 20 shadows + 24 bar rectangles + 1 fade.
    assert.equal(worst.barDraws, ENEMY_CAPACITY);
    assert.equal(worst.dropDraws, DROP_CAPACITY);
    assert.ok(
      worst.fills >= PARTICLE_CAPACITY + 20 + 2 * ENEMY_CAPACITY + 1,
      `${worst.fills} fills`,
    );
  });

  void it('a flashing hero draws one bitmap, like any hero: reactions add no draw call', () => {
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, () => undefined);
    const heroes = ['a', 'b', 'c'].map((id, i) => {
      const h = new Hero({ info: info(id, 'working'), slot: i, instant: true, look: lookFor(id) });
      h.update(STEP_MS, w.world);
      return h;
    });
    const count = (flash: boolean): number => {
      const reactions = new HitReactions(64);
      if (flash) heroes.forEach((_, i) => reactions.flash(i, -1, false));
      const surface = new RecordingSurface();
      surface.record = false;
      renderer.render(surface, w.world, heroes, new Camera(), {
        foes: [],
        reactions,
        drops: () => undefined,
        fadeAlpha: 0,
      });
      return surface.bitmapDraws;
    };
    assert.equal(count(true), count(false));
  });

  void it('8 heroes under hard combat with a flooded effect pool (waves, a boss, drops, the fade) stay within the ceiling', (t) => {
    const rig = hardParty(8, true);
    run(rig, 12_000);
    const worst = measure(rig, 60 * 150);
    t.diagnostic(`8 heroes, hard combat, 24 effects: ${JSON.stringify(worst)}`);
    assert.ok(worst.bitmaps <= MAX_BITMAPS, `${worst.bitmaps} bitmap draws`);
    assert.ok(worst.fills <= MAX_FILLS, `${worst.fills} fills`);
    assert.deepEqual(rig.errors, []);
  });

  void it('64 heroes under hard combat still draw at most one pass per entity: bitmaps stay proportional (no draw loop per enemy hit)', (t) => {
    const rig = hardParty(64, false);
    run(rig, 12_000);
    const worst = measure(rig, 60 * 40);
    t.diagnostic(`64 heroes, hard combat: ${JSON.stringify(worst)}`);
    // 64 heroes + 12 enemies + bars + drops + effects, and a fixed set of scene bitmaps.
    assert.ok(
      worst.bitmaps <= 64 + 12 + 12 + DROP_CAPACITY + EFFECT_CAPACITY + 64 + 40,
      `${worst.bitmaps}`,
    );
    assert.deepEqual(rig.errors, []);
  });
});

void describe('engine CPU cost with enemies (counting surface, node)', () => {
  void it('8 heroes with waves, bosses, and stage swaps average under 4 ms per frame over 10 simulated minutes (target under 1 ms)', (t) => {
    const rig = hardParty(8, false);
    const frames = 36_000;
    let worst = 0;
    const start = process.hrtime.bigint();
    for (let i = 0; i < frames; i++) {
      const frameStart = process.hrtime.bigint();
      rig.game.frame(STEP_MS, rig.surface);
      const ms = Number(process.hrtime.bigint() - frameStart) / 1e6;
      if (i > 600 && ms > worst) worst = ms;
    }
    const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
    t.diagnostic(
      `average ${avg.toFixed(3)} ms per frame; worst steady frame ${worst.toFixed(2)} ms`,
    );
    assert.ok(avg < 4, `average ${avg} ms`);
    assert.deepEqual(rig.errors, []);
  });

  void it('64 heroes with a wave of 12 average under 4 ms per frame over two simulated minutes', (t) => {
    const rig = hardParty(64, false);
    const frames = 7_200;
    const start = process.hrtime.bigint();
    for (let i = 0; i < frames; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
    t.diagnostic(`64 heroes: average ${avg.toFixed(3)} ms per frame`);
    assert.ok(avg < 4, `average ${avg} ms`);
    assert.deepEqual(rig.errors, []);
  });

  void it('steady-state update does not grow the heap: ten simulated minutes of combat leave the retained set bounded', (t) => {
    const rig = hardParty(8, false);
    for (let i = 0; i < 3_600; i++) rig.game.frame(STEP_MS, rig.surface);
    const gc = (globalThis as { gc?: () => void }).gc;
    gc?.();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 36_000; i++) rig.game.frame(STEP_MS, rig.surface);
    gc?.();
    const grown = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
    t.diagnostic(
      `heap growth over 10 simulated minutes: ${grown.toFixed(1)} MB (gc ${gc ? 'forced' : 'not exposed'})`,
    );
    assert.ok(grown < 64, `${grown} MB`);
  });
});
