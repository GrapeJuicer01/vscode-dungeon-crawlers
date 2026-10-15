// Draw-call budget and CPU cost with class heroes and live effects (H1 plan test notes 7 and 13;
// game-engine section 15). The M4 ceiling of 120 bitmap draws rises to 144 by the 24-effect cap and to 152 by the 8 summons (H2).
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EFFECT_CAPACITY, STEP_MS } from '../../src/game/data/tuning';
import { EffectPool } from '../../src/game/Effects';
import { mixedIds, trackBitmaps } from '../support/classRig';
import type { BitmapTracker } from '../support/classRig';
import { agent, feed, gameRig, run } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const MAX_BITMAPS = 152;
const MAX_FILLS = 450;

let tracker: BitmapTracker | null = null;
const restores: (() => void)[] = [];
afterEach(() => {
  tracker?.restore();
  tracker = null;
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

/** Every spawn is repeated so the pool is full most of the time (24 live effects). */
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

function party(n: number, states: readonly ('working' | 'idle')[]): GameRig {
  const rig = gameRig();
  mixedIds(n).forEach((id, i) => feed(rig, agent(id, states[i % states.length] ?? 'idle')));
  run(rig, 12_000);
  return rig;
}

interface Worst {
  bitmaps: number;
  fills: number;
  multiplies: number;
  effectDraws: number;
  frames: number;
}

function measure(rig: GameRig, frames: number): Worst {
  const worst: Worst = { bitmaps: 0, fills: 0, multiplies: 0, effectDraws: 0, frames };
  for (let i = 0; i < frames; i++) {
    rig.surface.reset();
    rig.surface.record = true;
    rig.game.frame(STEP_MS, rig.surface);
    rig.surface.record = false;
    worst.bitmaps = Math.max(worst.bitmaps, rig.surface.bitmapDraws);
    worst.fills = Math.max(worst.fills, rig.surface.count('fillRect'));
    worst.multiplies = Math.max(
      worst.multiplies,
      rig.surface.calls.filter(
        (c) =>
          c.composite === 'multiply' &&
          (c.method === 'drawBitmap' || c.method === 'drawBitmapRegion'),
      ).length,
    );
    worst.effectDraws = Math.max(
      worst.effectDraws,
      rig.surface.calls.filter((c) => tracker?.effect.has(c.args[0]) === true).length,
    );
  }
  return worst;
}

void describe('draw-call ceiling with class heroes and effects', () => {
  void it('8 heroes of classes 4..11 (all summoners and the H3 classes) with a full effect pool: still at most 152 bitmap draws and 450 fills', (t) => {
    tracker = trackBitmaps();
    floodEffects();
    const rig = gameRig();
    mixedIds(12)
      .slice(4)
      .forEach((id) => feed(rig, agent(id, 'working')));
    run(rig, 12_000);
    const worst = measure(rig, 900);
    t.diagnostic(`8 H2/H3 class heroes, 24 live effects: ${JSON.stringify(worst)}`);
    assert.equal(worst.effectDraws, EFFECT_CAPACITY, 'the pool really was full in some frame');
    assert.ok(worst.bitmaps <= MAX_BITMAPS, `${worst.bitmaps} bitmap draws`);
    assert.ok(worst.fills <= MAX_FILLS, `${worst.fills} fills`);
    assert.equal(worst.multiplies, 1);
    assert.deepEqual(rig.errors, []);
  });

  void it('8 class heroes with the effect pool kept full: at most 152 bitmap draws, 450 fills, 1 multiply', (t) => {
    tracker = trackBitmaps();
    floodEffects();
    const rig = party(8, ['working']);
    const worst = measure(rig, 900);
    t.diagnostic(`8 class heroes, 24 live effects: ${JSON.stringify(worst)}`);
    assert.equal(worst.effectDraws, EFFECT_CAPACITY, 'the pool really was full in some frame');
    assert.ok(worst.bitmaps <= MAX_BITMAPS, `${worst.bitmaps} bitmap draws`);
    assert.ok(worst.fills <= MAX_FILLS, `${worst.fills} fills`);
    assert.equal(worst.multiplies, 1);
    assert.deepEqual(rig.errors, []);
  });

  void it('8 class heroes warping in and then fighting, effects full: still within the ceiling', (t) => {
    tracker = trackBitmaps();
    floodEffects();
    const rig = gameRig();
    mixedIds(8).forEach((id) => feed(rig, agent(id, 'spawned')));
    let worstBitmaps = 0;
    let worstFills = 0;
    for (let i = 0; i < 120; i++) {
      rig.surface.reset();
      rig.game.frame(STEP_MS, rig.surface);
      worstBitmaps = Math.max(worstBitmaps, rig.surface.bitmapDraws);
      worstFills = Math.max(worstFills, rig.surface.count('fillRect'));
    }
    mixedIds(8).forEach((id) => feed(rig, agent(id, 'working', null, 2)));
    const worst = measure(rig, 1800);
    t.diagnostic(
      `warp: ${worstBitmaps} bitmaps, ${worstFills} fills; fight: ${JSON.stringify(worst)}`,
    );
    assert.ok(worstBitmaps <= MAX_BITMAPS && worstFills <= MAX_FILLS);
    assert.ok(worst.bitmaps <= MAX_BITMAPS && worst.fills <= MAX_FILLS);
  });

  void it('the effect pass never draws more than the pool capacity, even with 64 heroes', (t) => {
    tracker = trackBitmaps();
    floodEffects();
    const rig = party(64, ['working']);
    const worst = measure(rig, 600);
    t.diagnostic(`64 class heroes: ${JSON.stringify(worst)}`);
    assert.ok(worst.effectDraws <= EFFECT_CAPACITY);
    assert.equal(worst.multiplies, 1);
  });

  void it('without a flood, 8 class heroes keep the effect count near the documented dozen', (t) => {
    tracker = trackBitmaps();
    const rig = party(8, ['working']);
    const worst = measure(rig, 3000);
    t.diagnostic(`natural 8-hero effect load, worst frame: ${worst.effectDraws} effects`);
    assert.ok(worst.effectDraws >= 1, 'strikes and abilities really played');
    assert.ok(worst.effectDraws <= EFFECT_CAPACITY);
    assert.ok(worst.bitmaps <= MAX_BITMAPS);
  });
});

void describe('class look cost', () => {
  void it('hero bitmap sets are built per look, lazily: 8 heroes build at most 8 sets of 26 frames', (t) => {
    tracker = trackBitmaps();
    const rig = party(8, ['working', 'idle']);
    const frames = tracker.hero.size;
    t.diagnostic(`${frames} hero frame bitmaps for 8 class heroes`);
    assert.ok(frames > 0 && frames <= 8 * 26, `${frames}`);
    assert.deepEqual(rig.errors, []);
  });

  void it('building 8 new class looks in one frame stays well under 250 ms (soft; typically a few ms each)', (t) => {
    const rig = gameRig();
    mixedIds(8).forEach((id) => feed(rig, agent(id, 'idle')));
    rig.game.step();
    const start = process.hrtime.bigint();
    rig.game.frame(STEP_MS, rig.surface);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    t.diagnostic(`first frame with 8 new looks: ${ms.toFixed(1)} ms`);
    assert.ok(ms < 250, `${ms} ms`);
  });
});

void describe('engine CPU cost with class heroes (counting surface, node)', () => {
  void it('8 mixed-class heroes over 10 simulated minutes average under 4 ms per frame (target under 1 ms)', (t) => {
    const rig = gameRig();
    mixedIds(8).forEach((id, i) => feed(rig, agent(id, i % 2 === 0 ? 'working' : 'idle')));
    const frames = 36_000;
    const start = process.hrtime.bigint();
    let worst = 0;
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

  void it('64 heroes with a full effect pool average under 4 ms per frame over two simulated minutes', (t) => {
    floodEffects();
    const rig = gameRig();
    mixedIds(64).forEach((id) => feed(rig, agent(id, 'working')));
    const frames = 7200;
    const start = process.hrtime.bigint();
    for (let i = 0; i < frames; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
    t.diagnostic(`64 heroes, full pool: average ${avg.toFixed(3)} ms per frame`);
    assert.ok(avg < 4, `average ${avg} ms`);
  });
});
