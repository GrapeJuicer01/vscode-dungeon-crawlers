// The cosmetic effect pool (H1 plan test note 6): capacity, slot reuse, culling, sparks at the end
// of a projectile, bitmap-only drawing, missing art, clear, and frame choice. The pool is driven
// directly with a Particles pool and a SpriteCache over fake bitmaps.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EFFECT_IDS } from '../../src/game/data/effects';
import type { EffectId } from '../../src/game/data/effects';
import {
  EFFECT_CAPACITY,
  EFFECT_CULL_MARGIN_PX,
  EFFECT_FRAME_MS,
  PARTICLE_CAPACITY,
} from '../../src/game/data/tuning';
import { EffectPool } from '../../src/game/Effects';
import { Particles } from '../../src/game/Particles';
import { INTERNAL_WIDTH } from '../../src/game/layout';
import { mulberry32 } from '../../src/game/rng';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import { FakeBitmaps, RecordingSurface } from '../support/engineFakes';

function pool(capacity = EFFECT_CAPACITY, art: ArtSet = SHIPPED_ART) {
  const bitmaps = new FakeBitmaps();
  const cache = new SpriteCache(bitmaps, art);
  const particles = new Particles(PARTICLE_CAPACITY, mulberry32(1));
  const effects = new EffectPool(capacity);
  return { effects, particles, cache, bitmaps, surface: new RecordingSurface() };
}

const spawn = (
  p: ReturnType<typeof pool>,
  effect: EffectId = 'arrow',
  x = 100,
  y = 140,
  vx = 0,
  vy = 0,
  life = 500,
  flip = false,
): boolean => p.effects.spawn(effect, x, y, vx, vy, life, flip);

void describe('capacity and reuse', () => {
  void it('the production capacity is 24', () => {
    assert.equal(EFFECT_CAPACITY, 24);
  });

  void it('100 spawns into a pool of 24 leave exactly 24, refuse the rest without throwing', () => {
    const p = pool(24);
    const results: boolean[] = [];
    assert.doesNotThrow(() => {
      for (let i = 0; i < 100; i++) {
        results.push(spawn(p, 'dagger', 100 + (i % 10), 140));
      }
    });
    assert.equal(p.effects.count, 24);
    assert.equal(results.filter(Boolean).length, 24);
    assert.deepEqual(results.slice(0, 24).every(Boolean), true, 'the first 24 are accepted');
    assert.equal(results.slice(24).some(Boolean), false);
  });

  void it('a full pool drops spawns silently and update/draw still work', () => {
    const p = pool(4);
    for (let i = 0; i < 10; i++) {
      spawn(p);
    }
    assert.doesNotThrow(() => {
      p.effects.update(16, p.particles);
      p.effects.draw(p.surface, p.cache);
    });
    assert.equal(p.effects.count, 4);
    assert.equal(p.surface.count('drawBitmap'), 4);
  });

  void it('expired slots are reused: the pool refills to capacity after every generation', () => {
    const p = pool(24);
    for (let generation = 0; generation < 5; generation++) {
      for (let i = 0; i < 24; i++) {
        assert.equal(
          spawn(p, 'smokePuff', 100, 140, 0, 0, 100),
          true,
          `generation ${generation} #${i}`,
        );
      }
      assert.equal(spawn(p), false);
      p.effects.update(150, p.particles);
      assert.equal(p.effects.count, 0);
    }
  });

  void it('one expiry frees exactly one slot', () => {
    const p = pool(3);
    spawn(p, 'arrow', 100, 140, 0, 0, 100);
    spawn(p, 'arrow', 100, 140, 0, 0, 1000);
    spawn(p, 'arrow', 100, 140, 0, 0, 1000);
    assert.equal(spawn(p), false);
    p.effects.update(150, p.particles);
    assert.equal(p.effects.count, 2);
    assert.equal(spawn(p), true);
    assert.equal(spawn(p), false);
  });

  void it('refuses an unknown effect id and a non-positive or NaN lifetime', () => {
    const p = pool();
    assert.equal(spawn(p, 'nope' as EffectId), false);
    assert.equal(spawn(p, 'arrow', 1, 1, 0, 0, 0), false);
    assert.equal(spawn(p, 'arrow', 1, 1, 0, 0, -5), false);
    assert.equal(spawn(p, 'arrow', 1, 1, 0, 0, NaN), false);
    assert.equal(p.effects.count, 0);
  });

  void it('an effect ages out after its lifetime and not before', () => {
    const p = pool();
    spawn(p, 'arcaneBurst', 100, 140, 0, 0, 420);
    p.effects.update(400, p.particles);
    assert.equal(p.effects.count, 1);
    p.effects.update(30, p.particles);
    assert.equal(p.effects.count, 0);
  });

  void it('ignores a zero, negative, or NaN time step: nothing moves or ages', () => {
    const p = pool();
    p.surface.record = true;
    spawn(p, 'arrow', 100, 140, 100, 0, 500);
    p.effects.draw(p.surface, p.cache);
    for (const dt of [0, -10, NaN]) {
      p.effects.update(dt, p.particles);
    }
    p.effects.draw(p.surface, p.cache);
    assert.equal(p.surface.calls.length, 2);
    assert.deepEqual(p.surface.calls[1]?.args.slice(1), p.surface.calls[0]?.args.slice(1));
    assert.equal(p.effects.count, 1);
  });

  void it('is deterministic: the same spawns and steps give the same draws', () => {
    const run = (): string => {
      const p = pool();
      p.surface.record = true;
      spawn(p, 'dagger', 100, 140, 200, 0, 400);
      spawn(p, 'arcaneBurst', 150, 130, 0, 0, 420);
      for (let i = 0; i < 20; i++) {
        p.effects.update(16.7, p.particles);
        p.effects.draw(p.surface, p.cache);
      }
      return JSON.stringify(p.surface.calls.map((c) => [c.method, c.args.slice(1)]));
    };
    assert.equal(run(), run());
  });
});

void describe('movement, culling, and sparks', () => {
  void it('a projectile ends in two spark particles when its life runs out', () => {
    const p = pool();
    spawn(p, 'arrow', 100, 140, 180, 0, 500);
    p.effects.update(300, p.particles);
    assert.equal(p.particles.count, 0);
    assert.equal(p.effects.count, 1);
    p.effects.update(300, p.particles);
    assert.equal(p.effects.count, 0);
    assert.equal(p.particles.count, 2, 'two sparks at the end of the flight');
  });

  void it('sparks appear where the projectile ended', () => {
    const p = pool();
    const emitted: { kind: string; x: number; y: number }[] = [];
    const original = p.particles.emit.bind(p.particles);
    p.particles.emit = (kind, x, y, vx, vy, life): boolean => {
      emitted.push({ kind, x, y });
      return original(kind, x, y, vx, vy, life);
    };
    spawn(p, 'dagger', 100, 140, 200, 0, 400);
    for (let i = 0; i < 40; i++) {
      p.effects.update(10, p.particles);
    }
    assert.equal(emitted.length, 2);
    assert.ok(emitted.every((e) => e.kind === 'spark'));
    for (const e of emitted) {
      assert.ok(Math.abs(e.x - (100 + 200 * 0.4)) < 8, `x ${e.x}`);
      assert.equal(e.y, 140);
    }
  });

  void it('a stationary burst fades without sparks', () => {
    const p = pool();
    for (const effect of ['whirl', 'arcaneBurst', 'smokePuff'] as const) {
      spawn(p, effect, 100, 140, 0, 0, 300);
    }
    p.effects.update(400, p.particles);
    assert.equal(p.effects.count, 0);
    assert.equal(p.particles.count, 0);
  });

  void it('a full particle pool drops the sparks silently', () => {
    const p = pool();
    const tiny = new Particles(1, mulberry32(2));
    tiny.emit('ember', 0, 0, 0, 0, 10_000);
    spawn(p, 'arrow', 100, 140, 180, 0, 100);
    assert.doesNotThrow(() => p.effects.update(150, tiny));
    assert.equal(p.effects.count, 0);
    assert.equal(tiny.count, 1);
  });

  void it('projectiles move by velocity times time in x and y', () => {
    const p = pool();
    p.surface.record = true;
    spawn(p, 'arrow', 100, 140, 180, 10, 1000);
    p.effects.update(500, p.particles);
    p.effects.draw(p.surface, p.cache);
    const set = p.cache.effect('arrow');
    assert.ok(set !== null);
    const call = p.surface.calls[0];
    assert.equal(call?.args[1], Math.floor(100 + 90) - set.anchor.x);
    assert.equal(call?.args[2], Math.floor(140 + 5) - set.anchor.y);
  });

  void it('culls an effect that leaves the view by the margin on either side, without sparks', () => {
    for (const [x, vx] of [
      [INTERNAL_WIDTH - 10, 400],
      [10, -400],
    ] as const) {
      const p = pool();
      spawn(p, 'arrow', x, 140, vx, 0, 1500);
      let steps = 0;
      while (p.effects.count > 0 && steps < 200) {
        p.effects.update(16, p.particles);
        steps++;
      }
      assert.equal(p.effects.count, 0);
      assert.ok(steps * 16 < 1500, `culled early after ${steps * 16} ms, not at end of life`);
      assert.equal(p.particles.count, 0, 'a culled projectile leaves no sparks');
    }
  });

  void it('stays alive inside the margin and dies just outside it', () => {
    const p = pool();
    spawn(p, 'arrow', INTERNAL_WIDTH + EFFECT_CULL_MARGIN_PX - 5, 140, 0, 0, 1000);
    p.effects.update(16, p.particles);
    assert.equal(p.effects.count, 1);
    const q = pool();
    spawn(q, 'arrow', INTERNAL_WIDTH + EFFECT_CULL_MARGIN_PX + 5, 140, 0, 0, 1000);
    q.effects.update(16, q.particles);
    assert.equal(q.effects.count, 0);
    const r = pool();
    spawn(r, 'arrow', -EFFECT_CULL_MARGIN_PX - 5, 140, 0, 0, 1000);
    r.effects.update(16, r.particles);
    assert.equal(r.effects.count, 0);
  });
});

void describe('drawing', () => {
  void it('draws with drawBitmap only: no fillRect, no region draw, no composite or alpha change', () => {
    const p = pool();
    p.surface.record = true;
    for (const id of EFFECT_IDS) {
      spawn(
        p,
        id,
        100,
        140,
        id === 'arrow' || id === 'dagger' || id === 'orbBolt' ? 100 : 0,
        0,
        600,
      );
    }
    for (let i = 0; i < 30; i++) {
      p.effects.update(16.7, p.particles);
      p.effects.draw(p.surface, p.cache);
    }
    assert.equal(p.surface.count('fillRect'), 0);
    assert.equal(p.surface.count('drawBitmapRegion'), 0);
    assert.equal(p.surface.count('setAlpha'), 0);
    assert.equal(p.surface.count('setComposite'), 0);
    assert.equal(p.surface.count('clear'), 0);
    assert.equal(p.surface.count('drawBitmap'), p.surface.calls.length);
    assert.ok(p.surface.calls.length >= 30 * 4);
  });

  void it('draws one bitmap per live effect, at the floored position minus the anchor', () => {
    const p = pool();
    p.surface.record = true;
    spawn(p, 'arcaneBurst', 120.9, 130.7, 0, 0, 420);
    p.effects.draw(p.surface, p.cache);
    const set = p.cache.effect('arcaneBurst');
    assert.ok(set !== null);
    assert.equal(p.surface.calls.length, 1);
    assert.deepEqual(p.surface.calls[0]?.args.slice(1), [
      120 - set.anchor.x,
      130 - set.anchor.y,
      false,
    ]);
  });

  void it('a flipped effect mirrors around its anchor and passes flipX', () => {
    const p = pool();
    p.surface.record = true;
    spawn(p, 'arrow', 120, 130, 0, 0, 420, true);
    p.effects.draw(p.surface, p.cache);
    const set = p.cache.effect('arrow');
    assert.ok(set !== null);
    assert.deepEqual(p.surface.calls[0]?.args.slice(1), [
      120 - (set.w - 1 - set.anchor.x),
      130 - set.anchor.y,
      true,
    ]);
  });

  void it('an empty pool draws nothing', () => {
    const p = pool();
    p.effects.draw(p.surface, p.cache);
    assert.equal(p.surface.calls.length + p.surface.counts.size, 0);
  });

  void it('missing effect art is skipped without throwing or drawing', () => {
    const p = pool(24, { ...SHIPPED_ART, effects: {} });
    for (const id of EFFECT_IDS) {
      spawn(p, id);
    }
    assert.doesNotThrow(() => {
      p.effects.update(16, p.particles);
      p.effects.draw(p.surface, p.cache);
    });
    assert.equal(p.surface.count('drawBitmap'), 0);
    assert.equal(
      p.effects.count,
      EFFECT_IDS.length,
      'the pool still tracks them and ages them out',
    );
    p.effects.update(2000, p.particles);
    assert.equal(p.effects.count, 0);
  });

  void it('only the effect whose art is missing is skipped', () => {
    const effects = { ...SHIPPED_ART.effects };
    delete effects['dagger'];
    const p = pool(24, { ...SHIPPED_ART, effects });
    spawn(p, 'dagger');
    spawn(p, 'arrow');
    p.effects.draw(p.surface, p.cache);
    assert.equal(p.surface.count('drawBitmap'), 1);
  });

  void it('static effects play their frames once and hold the last frame; moving ones loop', () => {
    const p = pool();
    const burst = p.cache.effect('arcaneBurst');
    const bolt = p.cache.effect('orbBolt');
    assert.ok(burst !== null && bolt !== null);
    assert.ok(burst.frames.length >= 3 && bolt.frames.length >= 2);
    const bitmapAt = (effect: EffectId, vx: number, ageMs: number): unknown => {
      const q = pool();
      q.surface.record = true;
      const sets = q.cache.effect(effect);
      assert.ok(sets !== null);
      spawn(q, effect, 100, 140, vx, 0, 100_000);
      // Keep the move tiny: a 1 ms step per iteration so culling never matters.
      let t = 0;
      while (t < ageMs) {
        const dt = Math.min(10, ageMs - t);
        q.effects.update(dt, q.particles);
        t += dt;
      }
      q.effects.draw(q.surface, q.cache);
      const bitmap = q.surface.calls[0]?.args[0];
      return sets.frames.indexOf(bitmap as (typeof sets.frames)[number]);
    };
    assert.equal(bitmapAt('arcaneBurst', 0, 10), 0);
    assert.equal(bitmapAt('arcaneBurst', 0, EFFECT_FRAME_MS + 10), 1);
    assert.equal(bitmapAt('arcaneBurst', 0, EFFECT_FRAME_MS * 2 + 10), 2);
    assert.equal(bitmapAt('arcaneBurst', 0, EFFECT_FRAME_MS * 3 + 10), 2, 'holds the last frame');
    assert.equal(bitmapAt('arcaneBurst', 0, EFFECT_FRAME_MS * 40), 2, 'and keeps holding it');
    // A moving effect loops its frames (a spin or a pulse). Slow enough to stay on screen.
    assert.equal(bitmapAt('orbBolt', 1, 10), 0);
    assert.equal(bitmapAt('orbBolt', 1, EFFECT_FRAME_MS + 10), 1);
    assert.equal(bitmapAt('orbBolt', 1, EFFECT_FRAME_MS * 2 + 10), 0, 'wraps to frame 0');
  });

  void it('a one-frame effect always draws that frame', () => {
    const p = pool();
    const arrow = p.cache.effect('arrow');
    assert.equal(arrow?.frames.length, 1);
    p.surface.record = true;
    spawn(p, 'arrow', 100, 140, 1, 0, 100_000);
    p.effects.update(777, p.particles);
    p.effects.draw(p.surface, p.cache);
    assert.equal(p.surface.calls[0]?.args[0], arrow?.frames[0]);
  });

  void it('draws up to the whole pool (24) as 24 bitmap draws', () => {
    const p = pool();
    for (let i = 0; i < 40; i++) {
      spawn(p, EFFECT_IDS[i % EFFECT_IDS.length], 100 + i, 140, 0, 0, 1000);
    }
    p.effects.draw(p.surface, p.cache);
    assert.equal(p.surface.count('drawBitmap'), 24);
  });
});

void describe('clear', () => {
  void it('empties the pool, draws nothing afterwards, and makes the full capacity usable again', () => {
    const p = pool();
    for (let i = 0; i < 30; i++) {
      spawn(p);
    }
    assert.equal(p.effects.count, 24);
    p.effects.clear();
    assert.equal(p.effects.count, 0);
    p.effects.draw(p.surface, p.cache);
    assert.equal(p.surface.count('drawBitmap'), 0);
    for (let i = 0; i < 24; i++) {
      assert.equal(spawn(p), true);
    }
    assert.equal(spawn(p), false);
    assert.equal(p.effects.count, 24);
  });

  void it('clear on an empty pool and repeated clears are harmless', () => {
    const p = pool();
    p.effects.clear();
    p.effects.clear();
    assert.equal(p.effects.count, 0);
    spawn(p);
    p.effects.clear();
    p.effects.update(16, p.particles);
    assert.equal(p.effects.count, 0);
  });
});
