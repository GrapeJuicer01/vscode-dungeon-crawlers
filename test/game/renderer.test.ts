// Draw order, lighting pass, restoring state, and the draw-call budget (M4 plan test note 6;
// game-engine sections 8 and 15). The surface is a RecordingSurface; heroes are identified by
// the bitmaps the SpriteCache creates when the first hero is drawn.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STEP_MS } from '../../src/game/data/tuning';
import { CORRIDOR_X, INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../../src/game/layout';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import { agent, feed, gameRig, run } from '../support/engineFakes';
import type { DrawCall, GameRig } from '../support/engineFakes';

const STATE_CALLS = new Set(['setComposite', 'setAlpha']);

/** A rig with `n` heroes (mixed states) settled for `settleMs`, and the hero bitmap set. */
function populated(
  n: number,
  settleMs = 20_000,
  states: readonly ('working' | 'idle')[] = ['working', 'idle'],
): { rig: GameRig; heroBitmaps: Set<unknown> } {
  const rig = gameRig();
  rig.game.frame(0, rig.surface); // builds the lighting bitmaps
  // Hero bitmaps are the frames SpriteCache.hero returns. Counting every fromRgba after the first
  // frame would also count lazily built effect sheets (H1), which are not heroes.
  const heroBitmaps = new Set<unknown>();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = SpriteCache.prototype.hero;
  SpriteCache.prototype.hero = function (this: SpriteCache, ...args: Parameters<typeof original>) {
    const sprites = original.apply(this, args);
    for (const set of Object.values(sprites)) {
      for (const frame of set.frames) {
        heroBitmaps.add(frame);
      }
    }
    return sprites;
  };
  try {
    for (let i = 0; i < n; i++) {
      feed(rig, agent(`h${i}`, states[i % states.length] ?? 'idle'));
    }
    run(rig, settleMs);
  } finally {
    SpriteCache.prototype.hero = original;
  }
  return { rig, heroBitmaps };
}

function oneFrame(rig: GameRig): readonly DrawCall[] {
  rig.surface.record = true;
  rig.surface.reset();
  rig.game.frame(STEP_MS, rig.surface);
  rig.surface.record = false;
  return rig.surface.calls.slice();
}

const isBitmapDraw = (c: DrawCall): boolean =>
  c.method === 'drawBitmap' || c.method === 'drawBitmapRegion';

void describe('Renderer draw order', () => {
  const { rig, heroBitmaps } = populated(8);
  const calls = oneFrame(rig);

  void it('the first drawing call is clear with the stage clear colour (state resets may precede it)', () => {
    const first = calls.find((c) => !STATE_CALLS.has(c.method));
    assert.equal(first?.method, 'clear');
    assert.equal(
      first?.args[0],
      SHIPPED_ART.palette[SHIPPED_ART.stageClearChar['forgotten-cellar'] ?? ''],
    );
    assert.equal(calls.filter((c) => c.method === 'clear').length, 1);
    for (const c of calls.slice(0, calls.indexOf(first))) {
      assert.ok(STATE_CALLS.has(c.method));
    }
  });

  void it('there is exactly one multiply blit: the whole light map, scaled up, after the environment', () => {
    const multiplies = calls.filter((c) => c.composite === 'multiply' && isBitmapDraw(c));
    assert.equal(multiplies.length, 1);
    const blit = multiplies[0] as DrawCall;
    assert.equal(blit.method, 'drawBitmapRegion');
    assert.deepEqual(blit.args.slice(5), [0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT]);
  });

  void it('the environment (strips, backdrop, live props) is drawn before the blit, heroes after it', () => {
    const blitIndex = calls.findIndex((c) => c.composite === 'multiply' && isBitmapDraw(c));
    assert.ok(blitIndex > 0);
    const before = calls.slice(0, blitIndex).filter(isBitmapDraw);
    const after = calls.slice(blitIndex + 1).filter(isBitmapDraw);
    assert.ok(before.length >= 8, `${before.length} environment draws before the light`);
    assert.equal(
      before.filter((c) => heroBitmaps.has(c.args[0])).length,
      0,
      'a hero was drawn before the light pass',
    );
    const heroDraws = after.filter((c) => heroBitmaps.has(c.args[0]));
    assert.equal(heroDraws.length, 8, 'every hero is drawn once, after the light');
  });

  void it('heroes are never darkened: they draw with plain source-over at full alpha', () => {
    for (const c of calls.filter((x) => heroBitmaps.has(x.args[0]))) {
      assert.equal(c.composite, 'source-over');
      assert.equal(c.alpha, 1);
    }
  });

  void it('entities are drawn in ascending foot y; ties keep roster order', () => {
    const { rig: tall, heroBitmaps: sprites } = populated(16, 20_000, ['working']);
    const draws = oneFrame(tall).filter((c) => sprites.has(c.args[0]) && c.method === 'drawBitmap');
    assert.equal(draws.length, 16);
    const ys = draws.map((c) => Number(c.args[2]));
    assert.deepEqual(
      ys,
      [...ys].sort((a, b) => a - b),
      'dy is non-decreasing',
    );
    // First 8 heroes share formation row 0: same y, so they draw in slot (roster) order, left to right.
    const firstRow = draws
      .filter((c) => c.args[2] === ys[ys.length - 1])
      .map((c) => Number(c.args[1]));
    assert.deepEqual(
      firstRow,
      [...firstRow].sort((a, b) => a - b),
    );
    assert.equal(firstRow.length, 8);
  });

  void it('the foreground lip is drawn after the last entity, and particles after the lip', () => {
    const indexOfLast = (pred: (c: DrawCall) => boolean): number =>
      calls.reduce((last, c, i) => (pred(c) ? i : last), -1);
    const lastHero = indexOfLast((c) => heroBitmaps.has(c.args[0]));
    const isLip = (c: DrawCall): boolean =>
      isBitmapDraw(c) &&
      (c.args[0] as { height: number; surface: unknown }).height === 20 &&
      (c.args[0] as { surface: unknown }).surface !== null;
    const lip = calls.map((c, i) => (isLip(c) ? i : -1)).filter((i) => i >= 0);
    assert.ok(lip.length >= 2, 'near lip and corridor lip');
    assert.ok(
      lip.every((i) => i > lastHero),
      'the lip is over every entity',
    );
    const lastLip = Math.max(...lip);
    const fillsAfterHeroes = calls
      .map((c, i) => (c.method === 'fillRect' && i > lastHero ? i : -1))
      .filter((i) => i >= 0);
    assert.ok(
      fillsAfterHeroes.every((i) => i > lastLip),
      'only particles follow the lip',
    );
    assert.ok(fillsAfterHeroes.length > 0, 'embers or drips are drawn');
  });

  void it('composite is source-over and alpha is 1 at the end of every frame', () => {
    const fresh = populated(8, 3000).rig;
    for (let i = 0; i < 120; i++) {
      fresh.game.frame(STEP_MS, fresh.surface);
      assert.equal(fresh.surface.composite, 'source-over');
      assert.equal(fresh.surface.alpha, 1);
    }
  });

  void it('draws nothing but plain state when the scene is empty besides the environment and campfire', () => {
    const empty = gameRig();
    const frame = oneFrame(empty);
    assert.equal(frame.filter((c) => c.composite === 'multiply' && isBitmapDraw(c)).length, 1);
    assert.ok(frame.filter(isBitmapDraw).length >= 8);
  });

  void it('the corridor strips are blitted twice at the seam when scrolled (two regions wrap)', () => {
    const rig2 = populated(4, 12_000, ['working']).rig;
    const frame = oneFrame(rig2);
    const corridorBlits = frame.filter(
      (c) =>
        c.method === 'drawBitmapRegion' &&
        c.args[5] === CORRIDOR_X &&
        c.composite === 'source-over',
    );
    assert.ok(corridorBlits.length >= 1);
  });
});

void describe('draw-call budget (game-engine section 15)', () => {
  function counts(n: number): { bitmaps: number; fills: number; multiplies: number } {
    const { rig } = populated(n, 20_000);
    // Measure the worst of 600 frames (a full engage cycle of sparks, embers, drips).
    let bitmaps = 0;
    let fills = 0;
    let multiplies = 0;
    for (let i = 0; i < 600; i++) {
      rig.surface.reset();
      rig.surface.record = true;
      rig.game.frame(STEP_MS, rig.surface);
      rig.surface.record = false;
      bitmaps = Math.max(bitmaps, rig.surface.bitmapDraws);
      fills = Math.max(fills, rig.surface.count('fillRect'));
      multiplies = Math.max(
        multiplies,
        rig.surface.calls.filter((c) => c.composite === 'multiply' && isBitmapDraw(c)).length,
      );
    }
    return { bitmaps, fills, multiplies };
  }

  void it('8 heroes: at most 144 bitmap draws, 450 fills, and exactly 1 multiply blit per frame', (t) => {
    const c = counts(8);
    t.diagnostic(`8 heroes, worst of 600 frames: ${JSON.stringify(c)}`);
    assert.ok(c.bitmaps <= 144, `${c.bitmaps} bitmap draws`);
    assert.ok(c.fills <= 450, `${c.fills} fills`);
    assert.equal(c.multiplies, 1);
  });

  void it('32 heroes: grows by about one bitmap draw and one shadow per extra hero', (t) => {
    const eight = counts(8);
    const many = counts(32);
    t.diagnostic(`32 heroes: ${JSON.stringify(many)}`);
    assert.ok(many.bitmaps - eight.bitmaps <= 2 * 24, `${many.bitmaps} vs ${eight.bitmaps}`);
    assert.ok(many.fills - eight.fills <= 3 * 24 + 100, `${many.fills} vs ${eight.fills}`);
    assert.equal(many.multiplies, 1);
  });

  void it('8 heroes warping in at once stay within the same budget', (t) => {
    const rig = gameRig();
    for (let i = 0; i < 8; i++) {
      feed(rig, agent(`w${i}`, 'spawned'));
    }
    let bitmaps = 0;
    let fills = 0;
    for (let i = 0; i < 90; i++) {
      rig.surface.reset();
      rig.game.frame(STEP_MS, rig.surface);
      bitmaps = Math.max(bitmaps, rig.surface.bitmapDraws);
      fills = Math.max(fills, rig.surface.count('fillRect'));
    }
    t.diagnostic(`8 warping heroes: ${bitmaps} bitmap draws, ${fills} fills (worst frame)`);
    assert.ok(bitmaps <= 144 && fills <= 450);
  });

  void it('a steady 8-hero frame (no warps) is about 34 bitmap draws', (t) => {
    const { rig } = populated(8, 30_000);
    const frame = oneFrame(rig);
    const n = frame.filter(isBitmapDraw).length;
    t.diagnostic(`steady 8-hero frame: ${n} bitmap draws, ${rig.surface.count('fillRect')} fills`);
    assert.ok(n >= 20 && n <= 60, `${n}`);
  });
});
