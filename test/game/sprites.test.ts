// Sprite factory: rasterizing, compositing, mirroring anchors, swaps, and the cache (M4 plan test
// note 4). Bitmaps are FakeBitmaps that remember their RGBA, so the pixels are asserted exactly.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { MASTER_PALETTE } from '../../src/game/sprites/palettes';
import {
  SpriteCache,
  compositeHeroFrame,
  heroBounds,
  heroFrameRows,
  hexToRgb,
  rasterizeFrame,
} from '../../src/game/sprites/spriteFactory';
import type { HeroLook, LayerFrame } from '../../src/game/sprites/spriteFactory';
import { BASE_HERO } from '../../src/game/sprites/spriteTemplates';
import type { HeroLayerSet, SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import { FakeBitmaps } from '../support/engineFakes';
import type { FakeBitmap } from '../support/engineFakes';

const PALETTE = { a: '#ff0000', b: '#00ff80', c: '#102030' };
const LOOK: HeroLook = { skin: 0, hair: 0, accent: null };

void describe('rasterizeFrame', () => {
  void it('writes exact RGBA for a 3x3 frame; "." is transparent', () => {
    const rgba = rasterizeFrame(['a.b', '...', 'bca'], 3, 3, PALETTE);
    assert.equal(rgba.length, 36);
    const px = (x: number, y: number): number[] =>
      Array.from(rgba.slice((y * 3 + x) * 4, (y * 3 + x) * 4 + 4));
    assert.deepEqual(px(0, 0), [255, 0, 0, 255]);
    assert.deepEqual(px(1, 0), [0, 0, 0, 0]);
    assert.deepEqual(px(2, 0), [0, 255, 128, 255]);
    assert.deepEqual(px(1, 1), [0, 0, 0, 0]);
    assert.deepEqual(px(0, 2), [0, 255, 128, 255]);
    assert.deepEqual(px(1, 2), [16, 32, 48, 255]);
    assert.deepEqual(px(2, 2), [255, 0, 0, 255]);
  });

  void it('throws a RangeError with a fixed message for an unknown character, never echoing it', () => {
    assert.throws(
      () => rasterizeFrame(['aZb'], 3, 1, PALETTE),
      (error: unknown) =>
        error instanceof RangeError &&
        error.message === 'Unknown palette character' &&
        !error.message.includes('Z'),
    );
  });

  void it('throws fixed-message RangeErrors for a wrong row width or height', () => {
    assert.throws(
      () => rasterizeFrame(['ab'], 3, 1, PALETTE),
      /^RangeError: Sprite row width mismatch$/,
    );
    assert.throws(
      () => rasterizeFrame(['abc'], 3, 2, PALETTE),
      /^RangeError: Sprite frame height mismatch$/,
    );
  });

  void it('hexToRgb parses #rrggbb and turns a malformed colour into magenta (visible, not a throw)', () => {
    assert.deepEqual(hexToRgb('#0a0b0c'), [10, 11, 12]);
    assert.deepEqual(hexToRgb('#FFAA00'), [255, 170, 0]);
    assert.deepEqual(hexToRgb('red'), [255, 0, 255]);
    assert.deepEqual(hexToRgb('#fff'), [255, 0, 255]);
  });
});

function layer(rows: string[], anchor: { x: number; y: number }): LayerFrame {
  return { rows, w: rows[0]?.length ?? 0, h: rows.length, anchor };
}

void describe('compositeHeroFrame and heroBounds', () => {
  void it('draws later layers over earlier ones where they are not transparent', () => {
    const body = layer(['bbb', 'bbb', 'bbb'], { x: 1, y: 2 });
    const head = layer(['.h.', '...', '...'], { x: 1, y: 2 });
    const weapon = layer(['w..', '...', '...'], { x: 1, y: 2 });
    const rows = compositeHeroFrame([body, head, weapon], { left: 1, right: 1, up: 2, down: 0 });
    assert.deepEqual(rows, ['whb', 'bbb', 'bbb']);
  });

  void it('aligns layers on their anchors, so a larger weapon layer pads the whole frame', () => {
    const body = layer(['.b.', 'bbb'], { x: 1, y: 1 });
    const weapon = layer(['...w', '....', '.w..'], { x: 1, y: 2 });
    const bounds = heroBounds({
      body: { id: 'b', w: 3, h: 2, anchor: { x: 1, y: 1 }, animations: {} },
      head: { id: 'h', w: 3, h: 2, anchor: { x: 1, y: 1 }, animations: {} },
      gear: null,
      weapon: { id: 'w', w: 4, h: 3, anchor: { x: 1, y: 2 }, animations: {} },
    });
    assert.deepEqual(bounds, { left: 1, right: 2, up: 2, down: 0 });
    // Both foot pixels (the anchors) land on the same cell, row 2 column 1.
    assert.deepEqual(compositeHeroFrame([body, weapon], bounds), ['...w', '.b..', 'bwb.']);
  });

  void it('ignores layer pixels that fall outside the bounds instead of throwing', () => {
    const wide = layer(['bbbbb'], { x: 0, y: 0 });
    assert.deepEqual(compositeHeroFrame([wide], { left: 0, right: 1, up: 0, down: 0 }), ['bb']);
  });

  void it('heroBounds is the union over all layers (so every animation shares one anchor)', () => {
    const bounds = heroBounds(BASE_HERO);
    for (const t of [BASE_HERO.body, BASE_HERO.head, BASE_HERO.weapon]) {
      assert.ok(bounds.left >= t.anchor.x);
      assert.ok(bounds.right >= t.w - 1 - t.anchor.x);
      assert.ok(bounds.up >= t.anchor.y);
      assert.ok(bounds.down >= t.h - 1 - t.anchor.y);
    }
    const widths = new Set<number>();
    for (const name of Object.keys(BASE_HERO.body.animations)) {
      for (let i = 0; i < (BASE_HERO.body.animations[name]?.length ?? 0); i++) {
        const rows = heroFrameRows(BASE_HERO, name, i);
        assert.equal(rows.length, bounds.up + bounds.down + 1);
        for (const row of rows) {
          widths.add(row.length);
        }
      }
    }
    assert.deepEqual([...widths], [bounds.left + bounds.right + 1]);
  });
});

void describe('SpriteCache', () => {
  function make(): { cache: SpriteCache; bitmaps: FakeBitmaps } {
    const bitmaps = new FakeBitmaps();
    return { cache: new SpriteCache(bitmaps, SHIPPED_ART), bitmaps };
  }

  void it('exposes the base hero layers', () => {
    assert.equal(make().cache.baseHero, SHIPPED_ART.baseHero);
  });

  void it('builds every animation at one size and anchor, with the template frame counts', () => {
    const { cache } = make();
    const sprites = cache.hero(LOOK, BASE_HERO);
    const bounds = heroBounds(BASE_HERO);
    const names = Object.keys(BASE_HERO.body.animations);
    assert.deepEqual(Object.keys(sprites).sort(), names.sort());
    for (const name of names) {
      const set = sprites[name];
      assert.equal(set?.w, bounds.left + bounds.right + 1, name);
      assert.equal(set?.h, bounds.up + bounds.down + 1, name);
      assert.deepEqual(set?.anchor, { x: bounds.left, y: bounds.up }, name);
      assert.equal(set?.frames.length, BASE_HERO.body.animations[name]?.length, name);
    }
  });

  void it('returns the identical object for the same look and layers, and builds bitmaps once', () => {
    const { cache, bitmaps } = make();
    const first = cache.hero(LOOK, BASE_HERO);
    const built = bitmaps.fromRgbaBitmaps.length;
    assert.ok(built > 20);
    assert.equal(cache.hero({ ...LOOK }, BASE_HERO), first);
    assert.equal(bitmaps.fromRgbaBitmaps.length, built);
    assert.notEqual(cache.hero({ ...LOOK, skin: 1 }, BASE_HERO), first);
    assert.notEqual(cache.hero({ ...LOOK, accent: '#123456' }, BASE_HERO), first);
  });

  void it('builds lazily: nothing is rasterized until a look is requested', () => {
    const { bitmaps } = make();
    assert.equal(bitmaps.fromRgbaBitmaps.length, 0);
  });

  void it('skin and hair swaps change only their own characters', () => {
    const { cache } = make();
    const base = cache.hero({ skin: 0, hair: 0, accent: null }, BASE_HERO);
    const frame = (set: typeof base, name: string): FakeBitmap =>
      set[name]?.frames[0] as FakeBitmap;
    const rows = heroFrameRows(BASE_HERO, 'idle', 0);
    const diff = (a: FakeBitmap, b: FakeBitmap): Set<string> => {
      const changed = new Set<string>();
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          if (a.pixel(x, y).join() !== b.pixel(x, y).join()) {
            changed.add(rows[y]?.charAt(x) ?? '?');
          }
        }
      }
      return changed;
    };
    const skin = cache.hero({ skin: 2, hair: 0, accent: null }, BASE_HERO);
    assert.deepEqual([...diff(frame(base, 'idle'), frame(skin, 'idle'))], ['s']);
    const hair = cache.hero({ skin: 0, hair: 3, accent: null }, BASE_HERO);
    assert.deepEqual([...diff(frame(base, 'idle'), frame(hair, 'idle'))], ['h']);
    const accent = cache.hero({ skin: 0, hair: 0, accent: '#123456' }, BASE_HERO);
    assert.deepEqual([...diff(frame(base, 'idle'), frame(accent, 'idle'))], ['a']);
  });

  void it('an unknown skin or hair index falls back to the master colours instead of throwing', () => {
    const { cache } = make();
    assert.doesNotThrow(() => cache.hero({ skin: 99, hair: 99, accent: null }, BASE_HERO));
  });

  void it('sheet caches by template id and uses the idle frames', () => {
    const { cache } = make();
    const tile = SHIPPED_ART.campfire.flameSmall;
    const a = cache.sheet(tile);
    assert.equal(cache.sheet(tile), a);
    assert.equal(a.frames.length, tile.animations['idle']?.length);
    assert.equal(a.w, tile.w);
    assert.deepEqual(a.anchor, tile.anchor);
  });

  void it('sheet throws a fixed RangeError for a template with no idle animation', () => {
    const { cache } = make();
    const bad: SpriteTemplate = {
      id: 'bad',
      w: 1,
      h: 1,
      anchor: { x: 0, y: 0 },
      animations: { walk: [['a']] },
    };
    assert.throws(() => cache.sheet(bad), /^RangeError: Template has no idle animation$/);
  });

  void it('hero layers with a gear layer composite it between head and weapon', () => {
    const { cache } = make();
    const gear: SpriteTemplate = {
      id: 'test/gear',
      w: BASE_HERO.body.w,
      h: BASE_HERO.body.h,
      anchor: BASE_HERO.body.anchor,
      animations: Object.fromEntries(
        Object.entries(BASE_HERO.body.animations).map(([name, frames]) => [
          name,
          frames.map((rows) => rows.map((row) => '.'.repeat(row.length))),
        ]),
      ),
    };
    const withGear: HeroLayerSet = { ...BASE_HERO, gear };
    assert.doesNotThrow(() => cache.hero(LOOK, withGear));
    assert.notEqual(cache.hero(LOOK, withGear), cache.hero(LOOK, BASE_HERO));
  });

  void it('the master palette defines every hero character', () => {
    for (const ch of 'oshecdbkmwa') {
      assert.ok(MASTER_PALETTE[ch] !== undefined, ch);
    }
  });
});
