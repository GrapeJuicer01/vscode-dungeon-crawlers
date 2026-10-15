// Summons in the renderer and the sprite layer (H2 plan test notes 3 and 8): y-ordered with
// heroes, one shadow bar each, bitmap-only, effects still after the last entity, a clean canvas
// state after every frame, the 152 / 450 draw ceiling, missing art skipped, a throwing draw
// quarantined, SpriteCache.summon, and validateSummonArt on crafted faults.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  SUMMON_SHADOW_PX,
  EFFECT_CAPACITY,
  PARTICLE_CAPACITY,
  STEP_MS,
} from '../../src/game/data/tuning';
import { SUMMON_IDS } from '../../src/game/data/summons';
import { Camera } from '../../src/game/Camera';
import { createHero } from '../../src/game/entities/ClassHero';
import { GuardedEntity } from '../../src/game/entities/Entity';
import type { DrawContext, Entity } from '../../src/game/entities/Entity';
import { FAULT_LIMIT } from '../../src/game/data/tuning';
import { Renderer } from '../../src/game/Renderer';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import type { ArtSet, FrameSet } from '../../src/game/sprites/spriteFactory';
import {
  REQUIRED_SUMMON_ANIMATIONS,
  validateArtSet,
  validateSummonArt,
} from '../../src/game/sprites/spriteValidator';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import { idsOfClass, info, lookFor, makeWorld, mixedIds, stepWorld } from '../support/classRig';
import type { ClassWorld } from '../support/classRig';
import { FakeBitmaps, RecordingSurface } from '../support/engineFakes';
import type { DrawCall } from '../support/engineFakes';
import { patchSummon } from '../support/summonRig';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

const isBitmap = (c: DrawCall): boolean =>
  c.method === 'drawBitmap' || c.method === 'drawBitmapRegion';

/** A bitmap-drawing marker entity with a chosen sort y, to interleave with summons. */
class Marker extends GuardedEntity {
  readonly shadowWidth = 0;
  readonly x: number;
  readonly sortY: number;
  readonly bitmap: object;
  constructor(x: number, y: number, bitmap: object) {
    super();
    this.x = x;
    this.sortY = y;
    this.bitmap = bitmap;
  }
  update(): void {
    // Nothing.
  }
  draw(ctx: DrawContext): void {
    ctx.surface.drawBitmap(this.bitmap as never, this.x, this.sortY - 10, false);
  }
}

interface Scene {
  readonly w: ClassWorld;
  readonly renderer: Renderer;
  readonly errors: unknown[];
  readonly surface: RecordingSurface;
  readonly camera: Camera;
  readonly frames: Set<unknown>;
  frame(heroes?: readonly Entity[]): DrawCall[];
}

function scene(art: ArtSet = SHIPPED_ART): Scene {
  const w = makeWorld(art);
  const errors: unknown[] = [];
  const renderer = new Renderer(w.bitmaps, art, (e) => errors.push(e));
  const surface = new RecordingSurface();
  const camera = new Camera();
  const frames = new Set<unknown>();
  const sprites = w.world.cache.summon('skeleton');
  for (const set of Object.values(sprites ?? {})) {
    for (const f of set.frames) {
      frames.add(f);
    }
  }
  return {
    w,
    renderer,
    errors,
    surface,
    camera,
    frames,
    frame(heroes: readonly Entity[] = []): DrawCall[] {
      surface.reset();
      renderer.render(surface, w.world, heroes, camera);
      return surface.calls.slice();
    },
  };
}

function lipOrForeground(c: DrawCall): boolean {
  const b = c.args[0] as { height?: number; surface?: unknown } | undefined;
  return isBitmap(c) && b?.height === 20 && b.surface !== null && b.surface !== undefined;
}

void describe('summon drawing', () => {
  void it('draws one bitmap per live summon, none when the pool is empty', () => {
    const s = scene();
    assert.equal(s.frame().filter((c) => s.frames.has(c.args[0])).length, 0);
    s.w.summons.raise(0, 'skeleton', 100, 120, true);
    s.w.summons.raise(1, 'skeleton', 140, 130, false);
    assert.equal(s.frame().filter((c) => s.frames.has(c.args[0])).length, 2);
    assert.deepEqual(s.errors, []);
  });

  void it('mirrors the bitmap when the summon faces left, and anchors it on the foot pixel', () => {
    const s = scene();
    const set = s.w.world.cache.summon('skeleton')?.['rise'];
    assert.ok(set);
    s.w.summons.raise(0, 'skeleton', 100.8, 120.9, true);
    s.w.summons.raise(1, 'skeleton', 200.2, 120.9, false);
    const calls = s.frame().filter((c) => s.frames.has(c.args[0]));
    const right = calls.find((c) => c.args[3] === false);
    const left = calls.find((c) => c.args[3] === true);
    assert.deepEqual(right?.args.slice(1, 3), [100 - set.anchor.x, 120 - set.anchor.y]);
    assert.deepEqual(left?.args.slice(1, 3), [
      200 - (set.w - 1 - set.anchor.x),
      120 - set.anchor.y,
    ]);
  });

  void it('sorts with heroes and props by foot y: a marker with a lower y draws before, a higher y after', () => {
    const s = scene();
    const bitmap = new FakeBitmaps().fromRgba(2, 2, new Uint8ClampedArray(16));
    s.w.summons.raise(0, 'skeleton', 100, 120, true);
    const before = new Marker(60, 100, bitmap);
    const after = new Marker(140, 150, bitmap);
    // Entities passed in a scrambled order must still draw in y order.
    const calls = s.frame([after, before]);
    const order = calls
      .filter(isBitmap)
      .map((c) =>
        c.args[0] === bitmap
          ? c.args[1] === 60
            ? 'before'
            : 'after'
          : s.frames.has(c.args[0])
            ? 'summon'
            : '',
      )
      .filter((x) => x !== '');
    assert.deepEqual(order, ['before', 'summon', 'after']);
  });

  void it('draws one 8 x 2 translucent shadow bar per summon at its feet', () => {
    const s = scene();
    const base = s.frame().filter((c) => c.method === 'fillRect').length;
    s.w.summons.raise(0, 'skeleton', 100, 120, true);
    s.w.summons.raise(1, 'skeleton', 141, 133, false);
    const calls = s.frame();
    assert.equal(calls.filter((c) => c.method === 'fillRect').length, base + 2);
    const bars = calls.filter(
      (c) => c.method === 'fillRect' && c.args[3] === SUMMON_SHADOW_PX.skeleton && c.args[4] === 2,
    );
    const positions = bars.map((c) => [c.args[1], c.args[2]]);
    assert.ok(
      positions.some(([x, y]) => x === 100 - 4 && y === 119),
      JSON.stringify(positions),
    );
    assert.ok(
      positions.some(([x, y]) => x === 141 - 4 && y === 132),
      JSON.stringify(positions),
    );
    for (const c of bars) {
      assert.ok(c.alpha < 1 && c.alpha > 0, 'shadows are translucent');
    }
  });

  void it('draws bitmaps only: the summon adds no fill beyond its shadow', () => {
    const s = scene();
    const base = s.frame();
    s.w.summons.raise(0, 'skeleton', 100, 120, true);
    const withSummon = s.frame();
    const fills = (cs: DrawCall[]): number => cs.filter((c) => c.method === 'fillRect').length;
    assert.equal(fills(withSummon) - fills(base), 1);
    assert.equal(
      withSummon.filter((c) => c.method === 'strokeRect' || c.method === 'fillText').length,
      0,
    );
  });

  void it('effects are still drawn after the last entity (summon included) and before the foreground', () => {
    const s = scene();
    s.w.summons.raise(0, 'skeleton', 100, 120, true);
    s.w.effects.spawn('buffSparkle', 100, 100, 0, 0, 600, false);
    const effectFrames = new Set<unknown>(s.w.world.cache.effect('buffSparkle')?.frames ?? []);
    const calls = s.frame();
    const iSummon = calls.findIndex((c) => s.frames.has(c.args[0]));
    const iEffect = calls.findIndex((c) => effectFrames.has(c.args[0]));
    const iFg = calls.findIndex((c, i) => i > iEffect && lipOrForeground(c));
    assert.ok(iSummon >= 0 && iEffect > iSummon, `summon ${iSummon}, effect ${iEffect}`);
    assert.ok(iFg > iEffect, `foreground ${iFg}`);
  });

  void it('leaves the composite at source-over and alpha 1 after every frame', () => {
    const s = scene();
    for (let slot = 0; slot < 4; slot++) {
      s.w.summons.raise(slot, 'skeleton', 60 + slot * 20, 120, true);
    }
    for (let i = 0; i < 60; i++) {
      s.w.summons.update(STEP_MS, s.w.world);
      s.frame();
      assert.equal(s.surface.composite, 'source-over');
      assert.equal(s.surface.alpha, 1);
    }
  });

  void it('a summon with missing art is skipped without an error, but its shadow still draws', () => {
    const noSummons: ArtSet = { ...SHIPPED_ART, summons: {} };
    const s = scene(noSummons);
    s.w.summons.raise(0, 'skeleton', 100, 120, true);
    const calls = s.frame();
    assert.deepEqual(s.errors, []);
    assert.equal(
      calls.filter((c) => c.method === 'fillRect' && c.args[3] === SUMMON_SHADOW_PX.skeleton)
        .length,
      1,
    );
  });

  void it('a throwing Summon.draw is reported once, quarantined after FAULT_LIMIT, and never reaches the caller', () => {
    const s = scene();
    s.w.summons.raise(0, 'skeleton', 100, 120, true);
    s.w.summons.raise(1, 'skeleton', 140, 120, true);
    restores.push(
      patchSummon('draw', function () {
        throw new Error('summon draw fault');
      }),
    );
    for (let i = 0; i < FAULT_LIMIT + 5; i++) {
      assert.doesNotThrow(() => s.frame());
    }
    assert.equal(s.errors.length, 2, 'one report per summon, not per frame');
    assert.equal(s.w.summons.count, 2);
    assert.equal(s.surface.composite, 'source-over');
  });
});

void describe('the shadow bar follows the summon kind (H3-8)', () => {
  void it('SUMMON_SHADOW_PX is skeleton 8, beast 12, turret 10, one entry per kind', () => {
    assert.deepEqual(SUMMON_SHADOW_PX, { skeleton: 8, beast: 12, turret: 10 });
    assert.deepEqual(Object.keys(SUMMON_SHADOW_PX).sort(), [...SUMMON_IDS].sort());
  });

  for (const kind of SUMMON_IDS) {
    void it(`a ${kind} draws a ${SUMMON_SHADOW_PX[kind]} x 2 shadow centered on its foot pixel`, () => {
      const s = scene();
      s.w.summons.raise(0, kind, 100, 120, true);
      const bars = s.frame().filter((c) => c.method === 'fillRect' && c.args[4] === 2);
      const width = SUMMON_SHADOW_PX[kind];
      const mine = bars.filter((c) => c.args[3] === width);
      assert.equal(mine.length >= 1, true, JSON.stringify(bars.map((c) => c.args)));
      assert.ok(
        mine.some((c) => c.args[1] === 100 - width / 2 && c.args[2] === 119),
        JSON.stringify(mine.map((c) => c.args)),
      );
    });
  }

  void it('a mixed row of three kinds draws three bars of three widths', () => {
    const s = scene();
    s.w.summons.raise(0, 'skeleton', 60, 120, true);
    s.w.summons.raise(1, 'beast', 120, 120, true);
    s.w.summons.raise(2, 'turret', 180, 120, true);
    const widths = s
      .frame()
      .filter((c) => c.method === 'fillRect' && c.args[4] === 2 && c.args[2] === 119)
      .map((c) => Number(c.args[3]))
      .sort((a, b) => a - b);
    assert.deepEqual(widths, [8, 10, 12]);
  });
});

void describe('draw-call ceiling with summons', () => {
  void it('8 heroes, 8 summons of all three kinds, a full effect pool, and a full particle pool: at most 152 bitmap draws and 450 fills', (t) => {
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, () => undefined);
    // Classes 4..11 (Cleric to Berserker): the H2 and H3 casters, so all new art is in the count.
    const heroes = mixedIds(12)
      .slice(4)
      .map((id, slot) =>
        createHero({
          info: info(id, 'working'),
          slot,
          instant: true,
          look: lookFor(id),
        }),
      );
    w.engagement.engaged = true;
    const surface = new RecordingSurface();
    surface.record = true;
    const camera = new Camera();
    let worstBitmaps = 0;
    let worstFills = 0;
    let worstEffects = 0;
    const effectFrames = new Set<unknown>();
    for (const id of [
      'whirl',
      'arrow',
      'note',
      'soulWisp',
      'holyBurst',
      'blessGlow',
      'leaf',
      'chiOrb',
      'chiBurst',
      'warCry',
      'wrench',
    ]) {
      for (const f of w.world.cache.effect(id)?.frames ?? []) {
        effectFrames.add(f);
      }
    }
    for (let i = 0; i < 1800; i++) {
      for (const h of heroes) {
        h.update(STEP_MS, w.world);
      }
      for (let slot = 0; slot < 8; slot++) {
        const kind = SUMMON_IDS[slot % SUMMON_IDS.length] ?? 'skeleton';
        w.summons.raise(slot, kind, 40 + slot * 30, 110 + (slot % 3) * 10, slot % 2 === 0);
        w.summons.renew(
          slot,
          kind,
          40 + slot * 30,
          110 + (slot % 3) * 10,
          slot % 2 === 0,
          'attack',
        );
      }
      for (let k = 0; k < 40; k++) {
        w.effects.spawn('buffSparkle', 60 + k * 5, 90 + (k % 10) * 6, 0, 0, 600, false);
      }
      for (let k = 0; k < PARTICLE_CAPACITY; k++) {
        w.particles.emit('ember', 100 + (k % 50), 100, 0, -10, 600);
      }
      stepWorld(w);
      surface.reset();
      renderer.render(surface, w.world, heroes, camera);
      worstBitmaps = Math.max(worstBitmaps, surface.bitmapDraws);
      worstFills = Math.max(worstFills, surface.count('fillRect'));
      worstEffects = Math.max(
        worstEffects,
        surface.calls.filter((c) => isBitmap(c) && effectFrames.has(c.args[0])).length,
      );
    }
    t.diagnostic(`worst frame: ${worstBitmaps} bitmap draws, ${worstFills} fills`);
    assert.equal(w.summons.count, 8, 'all eight summons live');
    assert.ok(w.effects.count <= EFFECT_CAPACITY);
    assert.ok(worstEffects > 0);
    assert.ok(worstBitmaps <= 152, `${worstBitmaps} bitmap draws`);
    assert.ok(worstFills <= 450, `${worstFills} fills`);
  });
});

void describe('SpriteCache.summon', () => {
  void it('returns every animation as frame sets with the template size and anchor, cached by template', () => {
    const bitmaps = new FakeBitmaps();
    const cache = new SpriteCache(bitmaps, SHIPPED_ART);
    const sprites = cache.summon('skeleton');
    assert.ok(sprites);
    assert.deepEqual(Object.keys(sprites).sort(), Object.keys(REQUIRED_SUMMON_ANIMATIONS).sort());
    const template = SHIPPED_ART.summons['skeleton'] as SpriteTemplate;
    for (const [name, count] of Object.entries(REQUIRED_SUMMON_ANIMATIONS)) {
      const frameSet: FrameSet | undefined = sprites[name];
      assert.equal(frameSet?.frames.length, count, name);
      assert.equal(frameSet?.w, template.w);
      assert.equal(frameSet?.h, template.h);
      assert.deepEqual(frameSet?.anchor, template.anchor);
    }
    const built = bitmaps.fromRgbaBitmaps.length;
    assert.equal(built, 16, 'idle 2 + walk 4 + attack 3 + rise 4 + sink 3');
    assert.equal(cache.summon('skeleton'), sprites, 'the same object again');
    assert.equal(bitmaps.fromRgbaBitmaps.length, built, 'nothing is rebuilt');
  });

  void it('returns null for an unknown id or a missing template, and never throws', () => {
    const cache = new SpriteCache(new FakeBitmaps(), SHIPPED_ART);
    assert.equal(cache.summon('dragon'), null);
    assert.equal(cache.summon(''), null);
    const empty = new SpriteCache(new FakeBitmaps(), { ...SHIPPED_ART, summons: {} });
    assert.equal(empty.summon('skeleton'), null);
  });

  void it('uses the master palette only: no class swap, skin, or hair', () => {
    const bitmaps = new FakeBitmaps();
    new SpriteCache(bitmaps, SHIPPED_ART).summon('skeleton');
    const a = bitmaps.fromRgbaBitmaps.length;
    const bitmaps2 = new FakeBitmaps();
    const cache2 = new SpriteCache(bitmaps2, {
      ...SHIPPED_ART,
      classPalettes: { necromancer: { m: '#ff0000' } },
    });
    cache2.summon('skeleton');
    assert.equal(bitmaps2.fromRgbaBitmaps.length, a);
    for (let i = 0; i < a; i++) {
      assert.deepEqual(
        [...(bitmaps.fromRgbaBitmaps[i]?.rgba ?? [])],
        [...(bitmaps2.fromRgbaBitmaps[i]?.rgba ?? [])],
        `frame ${i}`,
      );
    }
  });
});

void describe('validateSummonArt', () => {
  const ids: readonly string[] = SUMMON_IDS;
  type Mutable = Omit<ArtSet, 'summons'> & { summons: Record<string, SpriteTemplate> };
  const clone = (): Mutable => structuredClone(SHIPPED_ART);
  const skeleton = (art: Mutable): SpriteTemplate => {
    const t = art.summons['skeleton'];
    assert.ok(t);
    return t;
  };

  void it('accepts the shipped art, alone and inside validateArtSet', () => {
    assert.deepEqual(validateSummonArt(SHIPPED_ART, ids), []);
    assert.deepEqual(validateArtSet(SHIPPED_ART), []);
  });

  void it('the shipped skeleton: idle 2, walk 4, attack 3, rise 4, sink 3; at most 24 x 24; at most 8 colors; anchor inside', () => {
    const t = SHIPPED_ART.summons['skeleton'] as SpriteTemplate;
    assert.equal(t.id, 'summons/skeleton');
    assert.deepEqual(
      Object.fromEntries(Object.entries(t.animations).map(([k, v]) => [k, v.length])),
      { idle: 2, walk: 4, attack: 3, rise: 4, sink: 3 },
    );
    assert.ok(t.w <= 24 && t.h <= 24);
    assert.ok(t.anchor.x >= 0 && t.anchor.x < t.w && t.anchor.y >= 0 && t.anchor.y < t.h);
    const used = new Set<string>();
    for (const frames of Object.values(t.animations)) {
      for (const rows of frames) {
        for (const row of rows) {
          for (const ch of row) {
            if (ch !== '.') used.add(ch);
          }
        }
      }
    }
    assert.ok(used.size <= 8, [...used].join());
    for (const ch of used) {
      assert.ok(ch in SHIPPED_ART.palette, `${ch} is a master palette character`);
    }
    assert.ok(Object.keys(SHIPPED_ART.palette).length <= 48, 'master palette at most 48 colors');
  });

  void it('the shipped beast and turret: idle 2, walk 4, attack 3, rise 4, sink 3; at most 24 x 24; at most 8 colors; anchor inside', () => {
    for (const kind of ['beast', 'turret'] as const) {
      const t = SHIPPED_ART.summons[kind] as SpriteTemplate;
      assert.equal(t.id, `summons/${kind}`);
      assert.deepEqual(
        Object.fromEntries(Object.entries(t.animations).map(([k, v]) => [k, v.length])),
        { idle: 2, walk: 4, attack: 3, rise: 4, sink: 3 },
        kind,
      );
      assert.ok(t.w <= 24 && t.h <= 24, kind);
      assert.ok(t.anchor.x >= 0 && t.anchor.x < t.w && t.anchor.y >= 0 && t.anchor.y < t.h, kind);
      const used = new Set<string>();
      for (const frames of Object.values(t.animations)) {
        for (const rows of frames) {
          for (const row of rows) {
            for (const ch of row) {
              if (ch !== '.') used.add(ch);
            }
          }
        }
      }
      assert.ok(used.size <= 8, `${kind}: ${[...used].join()}`);
      for (const ch of used) {
        assert.ok(ch in SHIPPED_ART.palette, `${kind}: ${ch} is a master palette character`);
      }
      for (const name of ['hurt', 'death', 'dying', 'downed']) {
        assert.ok(!(name in t.animations), `${kind} has no ${name}`);
      }
    }
    assert.deepEqual(Object.keys(SHIPPED_ART.summons).sort(), [...SUMMON_IDS].sort());
  });

  void it('a missing template for a kind is one error naming it (beast, turret, skeleton)', () => {
    for (const kind of SUMMON_IDS) {
      const art = clone();
      delete art.summons[kind];
      const errors = validateSummonArt(art, ids);
      assert.ok(
        errors.some((e) => e.includes(kind)),
        `${kind}: ${errors.join('\n')}`,
      );
    }
  });

  void it('a beast or turret with a missing animation or a wrong frame count is rejected', () => {
    for (const kind of ['beast', 'turret']) {
      const art = clone();
      delete art.summons[kind]?.animations['sink'];
      assert.deepEqual(validateSummonArt(art, ids), [
        `summons/${kind}: missing required animation sink`,
      ]);
      const art2 = clone();
      art2.summons[kind]?.animations['attack']?.pop();
      assert.match(
        validateSummonArt(art2, ids).join('\n'),
        new RegExp(`^summons/${kind}: animation attack has 2 frames, expected 3`),
      );
    }
  });

  void it('a missing required animation is one error naming the id', () => {
    const art = clone();
    delete skeleton(art).animations['rise'];
    const errors = validateSummonArt(art, ids);
    assert.deepEqual(errors, ['summons/skeleton: missing required animation rise']);
  });

  void it('a wrong frame count is one error', () => {
    const art = clone();
    const walk = skeleton(art).animations['walk'];
    assert.ok(walk);
    walk.pop();
    const errors = validateSummonArt(art, ids);
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0] ?? '', /^summons\/skeleton: animation walk has 3 frames, expected 4/);
  });

  void it('a forbidden animation name (hurt, death, dying, downed) is one error each', () => {
    for (const name of ['hurt', 'death', 'dying', 'downed']) {
      const art = clone();
      const t = skeleton(art);
      t.animations[name] = t.animations['idle'] ?? [];
      const errors = validateSummonArt(art, ids);
      assert.ok(
        errors.some((e) => e === `summons/skeleton: forbidden summon animation name ${name}`),
        `${name}: ${errors.join('\n')}`,
      );
    }
  });

  void it('a template larger than 24 x 24 is rejected', () => {
    const art = clone();
    const t = skeleton(art);
    const wide = { ...t, w: 25 };
    art.summons['skeleton'] = wide;
    const errors = validateSummonArt(art, ids);
    assert.ok(
      errors.some((e) => e.includes('summons/skeleton: summon is larger than 24x24')),
      errors.join('\n'),
    );
  });

  void it('more than 8 colors is rejected, naming the id and leaking no pixels', () => {
    const art = clone();
    const t = skeleton(art);
    const chars = Object.keys(art.palette)
      .filter((c) => c !== '.')
      .slice(0, 12);
    t.animations['idle'] = [
      [
        chars.join('').padEnd(t.w, '.').slice(0, t.w),
        ...Array<string>(t.h - 1).fill('.'.repeat(t.w)),
      ],
      [
        chars.join('').padEnd(t.w, '.').slice(0, t.w),
        ...Array<string>(t.h - 1).fill('.'.repeat(t.w)),
      ],
    ];
    const errors = validateSummonArt(art, ids);
    assert.ok(
      errors.some((e) => /^summons\/skeleton: uses \d+ colors, limit 8/.test(e)),
      errors.join('\n'),
    );
  });

  void it('a character outside the master palette is rejected', () => {
    const art = clone();
    const t = skeleton(art);
    const rows = t.animations['idle']?.[0];
    assert.ok(rows);
    rows[0] = '!' + (rows[0] ?? '').slice(1);
    const errors = validateSummonArt(art, ids);
    assert.ok(errors.length >= 1);
    assert.ok(
      errors.every((e) => e.startsWith('summons/skeleton')),
      errors.join('\n'),
    );
  });

  void it('a wrong template id is rejected', () => {
    const art = clone();
    art.summons['skeleton'] = { ...skeleton(art), id: 'summons/bones' };
    const errors = validateSummonArt(art, ids);
    assert.deepEqual(errors, ['summons/bones: summon id does not match its key skeleton']);
  });

  void it('a stray template and a missing template are each one error', () => {
    const stray = clone();
    stray.summons['golem'] = { ...skeleton(stray), id: 'summons/golem' };
    assert.deepEqual(validateSummonArt(stray, ids), [
      'golem: summon template for an unknown summon',
    ]);
    const missing = clone();
    delete missing.summons['skeleton'];
    assert.deepEqual(validateSummonArt(missing, ids), ['skeleton: no summon template']);
  });

  void it('no template file holds a hex colour or data URI (characters only)', () => {
    // Checked structurally in classStructure.test.ts; here, the art object itself has no hex.
    const json = JSON.stringify(SHIPPED_ART.summons);
    assert.doesNotMatch(json, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(json, /data:/);
  });

  void it('helper sanity: idsOfClass finds a necromancer id', () => {
    assert.equal(idsOfClass('necromancer', 1).length, 1);
  });
});
