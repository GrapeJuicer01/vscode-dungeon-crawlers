// Pure engine math (M4 plan test note 1): integer scaling, the seeded generator, hashing, boxes,
// the camera, and the slot formulas.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Camera } from '../../src/game/Camera';
import { containsPoint, overlaps } from '../../src/game/Collision';
import { SKIN_TONE_COUNT, HAIR_COLOR_COUNT } from '../../src/game/data/tuning';
import {
  CAMPFIRE_X,
  CORRIDOR_SEGMENT_PX,
  FOOT_Y_MAX,
  FOOT_Y_MIN,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  VISIBLE_SLOTS,
  computeIntegerScale,
  entrancePosition,
  formationPosition,
  seatPosition,
} from '../../src/game/layout';
import type { Point } from '../../src/game/layout';
import { lookFor } from '../../src/game/Roster';
import { hashCell, hashId, mulberry32 } from '../../src/game/rng';

void describe('computeIntegerScale', () => {
  const cases: [number, number, number, number][] = [
    [320, 180, 1, 1],
    [640, 360, 1, 2],
    [1000, 400, 1, 2],
    [1919, 1080, 1, 5],
    [1920, 1080, 1, 6],
    [640, 360, 2, 4],
    [500, 300, 1.5, 2],
    [100, 50, 1, 1],
    [1, 1, 3, 1],
    [1280, 300, 2, 3],
  ];
  for (const [w, h, dpr, expected] of cases) {
    void it(`${w}x${h} at ${dpr} is ${expected}`, () => {
      assert.equal(computeIntegerScale(w, h, dpr), expected);
    });
  }

  void it('is the largest integer that fits across a dense sweep, and never below 1', () => {
    for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      for (let width = 120; width <= 2600; width += 97) {
        for (let height = 60; height <= 1500; height += 71) {
          const k = computeIntegerScale(width, height, dpr);
          assert.ok(Number.isInteger(k) && k >= 1);
          const fits = (n: number): boolean =>
            INTERNAL_WIDTH * n <= width * dpr + 1e-6 && INTERNAL_HEIGHT * n <= height * dpr + 1e-6;
          if (k > 1) {
            assert.ok(fits(k), `${k} overflows ${width}x${height}@${dpr}`);
          }
          assert.ok(!fits(k + 1), `${k + 1} would fit ${width}x${height}@${dpr}`);
        }
      }
    }
  });

  void it('treats a missing, zero, negative, or non-finite devicePixelRatio as 1', () => {
    for (const dpr of [0, -2, NaN, Infinity]) {
      assert.equal(computeIntegerScale(640, 360, dpr), 2, String(dpr));
    }
  });

  void it('returns 1 for non-finite sizes', () => {
    assert.equal(computeIntegerScale(NaN, 360, 1), 1);
    assert.equal(computeIntegerScale(640, Infinity, 1), 2);
  });
});

void describe('mulberry32, hashId, hashCell', () => {
  void it('is deterministic per seed, differs between seeds, and stays in [0, 1)', () => {
    const take = (seed: number): number[] => {
      const rng = mulberry32(seed);
      return Array.from({ length: 200 }, () => rng());
    };
    assert.deepEqual(take(1), take(1));
    assert.notDeepEqual(take(1), take(2));
    for (const v of take(0x50415845)) {
      assert.ok(v >= 0 && v < 1);
    }
  });

  void it('hashId is stable (FNV-1a, unsigned 32-bit) and order sensitive', () => {
    assert.equal(hashId(''), 0x811c9dc5);
    assert.equal(hashId('a'), 0xe40c292c);
    assert.equal(hashId('a'), hashId('a'));
    assert.notEqual(hashId('ab'), hashId('ba'));
    assert.ok(hashId('sim-0-0') >= 0);
  });

  void it('hashCell is deterministic and unsigned', () => {
    assert.equal(hashCell(1, 2, 3, 4), hashCell(1, 2, 3, 4));
    assert.notEqual(hashCell(1, 2, 3, 4), hashCell(1, 2, 4, 3));
    assert.ok(hashCell(65535, 65535, 65535, 65535) >= 0);
  });

  void it('looks are stable per id and spread over 1,000 UUID-like ids (all 4 skins, all 6 hairs)', () => {
    const rng = mulberry32(7);
    const skins = new Set<number>();
    const hairs = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const id = Array.from({ length: 5 }, () =>
        Math.floor(rng() * 0xffffffff)
          .toString(16)
          .padStart(8, '0'),
      ).join('-');
      const a = lookFor(id);
      assert.deepEqual(a, lookFor(id));
      assert.equal(a.accent, null);
      skins.add(a.skin);
      hairs.add(a.hair);
    }
    assert.equal(skins.size, SKIN_TONE_COUNT);
    assert.equal(hairs.size, HAIR_COLOR_COUNT);
  });
});

void describe('Collision', () => {
  const box = { x: 10, y: 20, w: 5, h: 4 };

  void it('overlaps requires interior intersection: touching edges do not overlap', () => {
    assert.equal(overlaps(box, { x: 12, y: 22, w: 5, h: 5 }), true);
    assert.equal(overlaps(box, { x: 15, y: 20, w: 5, h: 4 }), false);
    assert.equal(overlaps(box, { x: 10, y: 24, w: 5, h: 4 }), false);
    assert.equal(overlaps(box, { x: 5, y: 20, w: 5, h: 4 }), false);
    assert.equal(overlaps(box, { x: 10, y: 16, w: 5, h: 4 }), false);
    assert.equal(overlaps(box, box), true);
    assert.equal(overlaps(box, { x: 11, y: 21, w: 1, h: 1 }), true, 'contained');
  });

  void it('containsPoint includes left and top edges and excludes right and bottom', () => {
    assert.equal(containsPoint(box, 10, 20), true);
    assert.equal(containsPoint(box, 14.99, 23.99), true);
    assert.equal(containsPoint(box, 15, 21), false);
    assert.equal(containsPoint(box, 12, 24), false);
    assert.equal(containsPoint(box, 9.99, 21), false);
  });
});

void describe('Camera', () => {
  void it('starts at 0 and advances by px/s over dt', () => {
    const camera = new Camera();
    assert.equal(camera.scrollX, 0);
    camera.advance(500, 24);
    assert.equal(camera.scrollX, 12);
  });

  void it('corridorOffset is a whole number and wraps at 384', () => {
    const camera = new Camera();
    camera.advance(1000, CORRIDOR_SEGMENT_PX - 0.5);
    assert.equal(camera.corridorOffset(), CORRIDOR_SEGMENT_PX - 1);
    camera.advance(1000, 1);
    assert.equal(camera.corridorOffset(), 0);
    camera.advance(1000, 1000);
    const offset = camera.corridorOffset();
    assert.ok(Number.isInteger(offset) && offset >= 0 && offset < CORRIDOR_SEGMENT_PX);
  });

  void it('parallaxOffset is whole, scaled by the factor, and wraps at the period', () => {
    const camera = new Camera();
    camera.advance(1000, 100);
    assert.equal(camera.parallaxOffset(0.25, 128), 25);
    camera.advance(1000, 500);
    const offset = camera.parallaxOffset(0.25, 128);
    assert.ok(Number.isInteger(offset) && offset >= 0 && offset < 128);
  });

  void it('ignores negative, zero, NaN, and infinite input (the corridor never runs backwards)', () => {
    const camera = new Camera();
    camera.advance(1000, 10);
    const before = camera.scrollX;
    camera.advance(-1000, 10);
    camera.advance(1000, -10);
    camera.advance(NaN, 10);
    camera.advance(1000, NaN);
    camera.advance(Infinity, 10);
    camera.advance(1000, Infinity);
    camera.advance(0, 10);
    assert.equal(camera.scrollX, before);
  });

  void it('stays bounded over a very long scroll', () => {
    const camera = new Camera();
    for (let i = 0; i < 20_000; i++) {
      camera.advance(1000, 5000);
    }
    assert.ok(camera.scrollX < CORRIDOR_SEGMENT_PX * 1024 + 5000);
    assert.ok(Number.isFinite(camera.scrollX));
  });
});

void describe('slot formulas', () => {
  const p: Point = { x: 0, y: 0 };

  void it('every visible slot is on the floor band with distinct formation and seat points', () => {
    const formation = new Set<string>();
    const seats = new Set<string>();
    for (let slot = 0; slot < VISIBLE_SLOTS; slot++) {
      formationPosition(slot, p);
      assert.ok(p.y >= FOOT_Y_MIN && p.y <= FOOT_Y_MAX, `formation y ${p.y}`);
      assert.ok(p.x > 144 && p.x < INTERNAL_WIDTH, `formation x ${p.x}`);
      formation.add(`${p.x},${p.y}`);
      seatPosition(slot, p);
      assert.ok(p.y >= FOOT_Y_MIN && p.y <= FOOT_Y_MAX, `seat y ${p.y}`);
      assert.ok(p.x > 0 && p.x < 128, `seat x ${p.x}`);
      seats.add(`${p.x},${p.y}`);
    }
    assert.equal(formation.size, VISIBLE_SLOTS);
    assert.equal(seats.size, VISIBLE_SLOTS);
  });

  void it('seats alternate sides of the campfire; slots past 32 wrap with an offset', () => {
    seatPosition(0, p);
    assert.ok(p.x < CAMPFIRE_X);
    seatPosition(1, p);
    assert.ok(p.x > CAMPFIRE_X);
    const first: Point = { x: 0, y: 0 };
    formationPosition(0, first);
    formationPosition(VISIBLE_SLOTS, p);
    assert.equal(p.y, first.y);
    assert.notEqual(p.x, first.x);
  });

  void it('the entrance is just inside the door', () => {
    entrancePosition(0, p);
    assert.ok(p.x >= 128 && p.x < 144);
    assert.ok(p.y >= FOOT_Y_MIN && p.y <= FOOT_Y_MAX);
  });
});
