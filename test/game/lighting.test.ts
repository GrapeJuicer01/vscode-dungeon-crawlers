// Banded lighting (M4 plan test notes 6 and 7, step 7 check).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIGHT_MAP_HEIGHT, LIGHT_MAP_WIDTH, MAX_LIGHTS } from '../../src/game/data/tuning';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../../src/game/layout';
import { Lighting } from '../../src/game/Lighting';
import type { LightSource } from '../../src/game/Lighting';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { FakeBitmaps, RecordingSurface } from '../support/engineFakes';

function makeLighting(): {
  lighting: Lighting;
  bitmaps: FakeBitmaps;
  map: RecordingSurface;
  mapBitmap: unknown;
} {
  const bitmaps = new FakeBitmaps();
  const ambient = SHIPPED_ART.stageAmbientChar['forgotten-cellar'] ?? 'g';
  const lighting = new Lighting(bitmaps, SHIPPED_ART.palette, ambient, [
    SHIPPED_ART.lightChars.torch,
    SHIPPED_ART.lightChars.campfire,
  ]);
  const offscreen = bitmaps.offscreens[0];
  assert.ok(offscreen);
  return { lighting, bitmaps, map: offscreen.surface, mapBitmap: offscreen.bitmap };
}

const torch: LightSource = { x: 40, y: 40, radius: 56, intensity: 0.85, colorIndex: 0 };

void describe('Lighting', () => {
  void it('keeps an 80x45 light map (a quarter of 320x180)', () => {
    const { map } = makeLighting();
    assert.equal(map.width, LIGHT_MAP_WIDTH);
    assert.equal(map.height, LIGHT_MAP_HEIGHT);
    assert.equal(LIGHT_MAP_WIDTH * 4, INTERNAL_WIDTH);
    assert.equal(LIGHT_MAP_HEIGHT * 4, INTERNAL_HEIGHT);
  });

  void it('generates banded radial bitmaps from pixel math: soft, centred, alpha in bands', () => {
    const { bitmaps } = makeLighting();
    assert.ok(bitmaps.fromRgbaBitmaps.length >= 12, 'several radii per light colour');
    const bitmap = bitmaps.fromRgbaBitmaps[bitmaps.fromRgbaBitmaps.length - 1];
    assert.ok(bitmap?.rgba);
    const c = (bitmap.width - 1) / 2;
    assert.ok(bitmap.pixel(c, c)[3] > bitmap.pixel(1, c)[3], 'brighter at the centre');
    assert.equal(bitmap.pixel(0, 0)[3], 0, 'transparent outside the radius');
    const alphas = new Set<number>();
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        alphas.add(bitmap.pixel(x, y)[3]);
      }
    }
    assert.ok(alphas.size <= 5, `${alphas.size} alpha values, expected at most 4 bands plus 0`);
  });

  void it('begin clears the light map to the ambient colour with plain source-over', () => {
    const { lighting, map } = makeLighting();
    lighting.begin();
    const clear = map.calls.find((call) => call.method === 'clear');
    assert.equal(
      clear?.args[0],
      SHIPPED_ART.palette[SHIPPED_ART.stageAmbientChar['forgotten-cellar'] ?? ''],
    );
    assert.equal(lighting.lightCount, 0);
  });

  void it('add draws with lighter into the map and restores composite and alpha', () => {
    const { lighting, map } = makeLighting();
    lighting.begin();
    map.reset();
    assert.equal(lighting.add(torch), true);
    const blit = map.calls.find((call) => call.method === 'drawBitmap');
    assert.equal(blit?.composite, 'lighter');
    assert.equal(blit?.alpha, 0.85);
    assert.equal(map.composite, 'source-over');
    assert.equal(map.alpha, 1);
    assert.equal(lighting.lightCount, 1);
  });

  void it('refuses lights past MAX_LIGHTS (16)', () => {
    const { lighting } = makeLighting();
    assert.equal(MAX_LIGHTS, 16);
    lighting.begin();
    for (let i = 0; i < MAX_LIGHTS; i++) {
      assert.equal(lighting.add(torch), true, `light ${i}`);
    }
    assert.equal(lighting.add(torch), false);
    assert.equal(lighting.lightCount, MAX_LIGHTS);
    lighting.begin();
    assert.equal(lighting.add(torch), true, 'begin resets the count');
  });

  void it('refuses unusable lights without drawing (bad colour index, zero or NaN radius)', () => {
    const { lighting, map } = makeLighting();
    lighting.begin();
    map.reset();
    assert.equal(lighting.add({ ...torch, colorIndex: 9 }), false);
    assert.equal(lighting.add({ ...torch, colorIndex: -1 }), false);
    assert.equal(lighting.add({ ...torch, radius: 0 }), false);
    assert.equal(lighting.add({ ...torch, radius: NaN }), false);
    assert.equal(map.count('drawBitmap'), 0);
  });

  void it('clamps the radius to the generated range and the intensity to 0..1', () => {
    const { lighting, map } = makeLighting();
    lighting.begin();
    map.reset();
    assert.equal(lighting.add({ ...torch, radius: 5000, intensity: 7 }), true);
    assert.equal(lighting.add({ ...torch, radius: 1, intensity: -3 }), true);
    const alphas = map.calls.filter((c) => c.method === 'drawBitmap').map((c) => c.alpha);
    assert.deepEqual(alphas, [1, 0]);
  });

  void it('compose is exactly one multiply blit of the whole map onto the target, then source-over', () => {
    const { lighting, mapBitmap } = makeLighting();
    lighting.begin();
    lighting.add(torch);
    const target = new RecordingSurface();
    lighting.compose(target);
    const blits = target.calls.filter(
      (c) => c.method === 'drawBitmapRegion' || c.method === 'drawBitmap',
    );
    assert.equal(blits.length, 1);
    assert.equal(blits[0]?.method, 'drawBitmapRegion');
    assert.equal(blits[0]?.composite, 'multiply');
    assert.deepEqual(blits[0]?.args.slice(1), [
      0,
      0,
      LIGHT_MAP_WIDTH,
      LIGHT_MAP_HEIGHT,
      0,
      0,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
    ]);
    assert.equal(blits[0]?.args[0], mapBitmap);
    assert.equal(target.composite, 'source-over');
  });
});
