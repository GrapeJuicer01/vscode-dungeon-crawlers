// The renderer's effect pass (H1 plan test note 7, game-engine section 8 step 6b): effects are
// drawn after the last entity and before the foreground, unlit; a fault in the pass is isolated,
// reported once, and switches the pass off after EFFECT_FAULT_LIMIT faults; a fault in
// EffectPool.update leaves heroes untouched.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EFFECT_FAULT_LIMIT, STEP_MS } from '../../src/game/data/tuning';
import { createHero } from '../../src/game/entities/ClassHero';
import { EffectPool } from '../../src/game/Effects';
import { artWithoutEffects, mixedIds, trackBitmaps } from '../support/classRig';
import type { BitmapTracker } from '../support/classRig';
import { agent, feed, gameRig, heroLog, run } from '../support/engineFakes';
import type { DrawCall, GameRig } from '../support/engineFakes';

const isBitmapDraw = (c: DrawCall): boolean =>
  c.method === 'drawBitmap' || c.method === 'drawBitmapRegion';
/** The near and corridor foreground strips are 20 px tall offscreen bitmaps. */
const isLip = (c: DrawCall): boolean =>
  isBitmapDraw(c) &&
  (c.args[0] as { height: number; surface: unknown }).height === 20 &&
  (c.args[0] as { surface: unknown }).surface !== null;

let tracker: BitmapTracker | null = null;
const restores: (() => void)[] = [];
afterEach(() => {
  tracker?.restore();
  tracker = null;
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

function patchPool<K extends 'update' | 'draw'>(key: K, value: EffectPool[K]): void {
  const original = EffectPool.prototype[key];
  EffectPool.prototype[key] = value;
  restores.push(() => {
    EffectPool.prototype[key] = original;
  });
}

function oneFrame(rig: GameRig): readonly DrawCall[] {
  rig.surface.record = true;
  rig.surface.reset();
  rig.game.frame(STEP_MS, rig.surface);
  rig.surface.record = false;
  return rig.surface.calls.slice();
}

/** Eight working heroes of mixed classes, run until a frame with live effects has been drawn. */
function partyWithEffects(options: Parameters<typeof gameRig>[0] = {}): {
  rig: GameRig;
  frame: readonly DrawCall[];
} {
  const rig = gameRig(options);
  for (const id of mixedIds(8)) {
    feed(rig, agent(id, 'working'));
  }
  run(rig, 6000);
  for (let i = 0; i < 4000; i++) {
    rig.game.frame(STEP_MS, rig.surface);
    if (i % 4 === 0) {
      const frame = oneFrame(rig);
      if (frame.some((c) => tracker?.effect.has(c.args[0]) === true)) {
        return { rig, frame };
      }
    }
  }
  return { rig, frame: oneFrame(rig) };
}

void describe('effect pass draw order', () => {
  void it('effects come after the last entity and before the foreground strips and particles', () => {
    tracker = trackBitmaps();
    const { frame } = partyWithEffects();
    const blit = frame.findIndex((c) => c.composite === 'multiply' && isBitmapDraw(c));
    assert.ok(blit > 0);
    const after = frame.map((c, i) => ({ c, i })).filter(({ c, i }) => i > blit && isBitmapDraw(c));
    const effects = after
      .filter(({ c }) => tracker?.effect.has(c.args[0]) === true)
      .map((x) => x.i);
    const lips = after.filter(({ c }) => isLip(c)).map((x) => x.i);
    const entities = after
      .filter(({ c }) => tracker?.effect.has(c.args[0]) !== true && !isLip(c))
      .map((x) => x.i);
    assert.ok(effects.length >= 1, 'a live effect was drawn');
    assert.ok(entities.length >= 8, 'heroes and the campfire were drawn');
    assert.ok(lips.length >= 2, 'near and corridor foreground');
    assert.ok(Math.max(...entities) < Math.min(...effects), 'every entity is drawn first');
    assert.ok(Math.max(...effects) < Math.min(...lips), 'the foreground is drawn over effects');
    const lastLip = Math.max(...lips);
    assert.ok(
      frame.some((c, i) => i > lastLip && c.method === 'fillRect'),
      'particles come after the foreground',
    );
  });

  void it('effects are unlit: source-over at full alpha, drawn after the one multiply blit', () => {
    tracker = trackBitmaps();
    const { frame } = partyWithEffects();
    const effectCalls = frame.filter((c) => tracker?.effect.has(c.args[0]) === true);
    assert.ok(effectCalls.length >= 1);
    for (const c of effectCalls) {
      assert.equal(c.method, 'drawBitmap');
      assert.equal(c.composite, 'source-over');
      assert.equal(c.alpha, 1);
    }
    const blit = frame.findIndex((c) => c.composite === 'multiply' && isBitmapDraw(c));
    assert.ok(frame.indexOf(effectCalls[0] as DrawCall) > blit);
    assert.equal(frame.filter((c) => c.composite === 'multiply' && isBitmapDraw(c)).length, 1);
  });

  void it('composite is source-over and alpha is 1 after every frame while effects are live', () => {
    tracker = trackBitmaps();
    const { rig } = partyWithEffects();
    for (let i = 0; i < 300; i++) {
      rig.game.frame(STEP_MS, rig.surface);
      assert.equal(rig.surface.composite, 'source-over');
      assert.equal(rig.surface.alpha, 1);
    }
  });

  void it('with no effect art the pass draws nothing and the frame still completes', () => {
    tracker = trackBitmaps();
    const { rig, frame } = partyWithEffects({ art: artWithoutEffects() });
    assert.equal(frame.filter((c) => tracker?.effect.has(c.args[0]) === true).length, 0);
    assert.ok(frame.filter(isLip).length >= 2);
    assert.deepEqual(rig.errors, []);
  });
});

void describe('a throwing effect draw', () => {
  function throwingDraw(counter: { calls: number }, message = 'effect draw boom'): void {
    patchPool('draw', () => {
      counter.calls++;
      throw new Error(message);
    });
  }

  void it('does not stop the foreground or the particles, and is reported once', () => {
    tracker = trackBitmaps();
    const counter = { calls: 0 };
    throwingDraw(counter);
    const rig = gameRig();
    for (const id of mixedIds(8)) {
      feed(rig, agent(id, 'working'));
    }
    run(rig, 3000);
    for (let i = 0; i < 2; i++) {
      const frame = oneFrame(rig);
      assert.ok(frame.filter(isLip).length >= 2, 'foreground still drawn');
      const lastLip = frame.map((c, j) => (isLip(c) ? j : -1)).reduce((a, b) => Math.max(a, b));
      assert.ok(
        frame.some((c, j) => j > lastLip && c.method === 'fillRect'),
        'particles still drawn',
      );
      assert.ok(frame.filter((c) => tracker?.hero.has(c.args[0]) === true).length >= 8);
    }
    const reports = rig.errors.filter((e) => (e.error as Error).message === 'effect draw boom');
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.scope, 'render');
  });

  void it('is switched off after EFFECT_FAULT_LIMIT (3) faults and never called again', () => {
    const counter = { calls: 0 };
    throwingDraw(counter);
    const rig = gameRig();
    feed(rig, agent('a', 'working'));
    for (let i = 0; i < 250; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    }
    assert.equal(EFFECT_FAULT_LIMIT, 3);
    assert.equal(counter.calls, 3, 'called exactly three times in 250 frames, then disabled');
    assert.equal(rig.errors.length, 1, 'reported once');
  });

  void it('resets composite and alpha, so the foreground is not drawn multiplied or faded', () => {
    patchPool('draw', function (this: EffectPool, surface) {
      surface.setComposite('multiply');
      surface.setAlpha(0.3);
      throw new Error('mid-draw boom');
    });
    const rig = gameRig();
    feed(rig, agent('a', 'working'));
    run(rig, 3000);
    const frame = oneFrame(rig);
    const lips = frame.filter(isLip);
    assert.ok(lips.length >= 2);
    for (const c of lips) {
      assert.equal(c.composite, 'source-over');
      assert.equal(c.alpha, 1);
    }
    assert.equal(rig.surface.composite, 'source-over');
    assert.equal(rig.surface.alpha, 1);
  });

  void it('leaves heroes, their lifecycle, and the loop untouched', () => {
    patchPool('draw', () => {
      throw new Error('draw boom');
    });
    const log = heroLog(createHero);
    const rig = gameRig({ heroFactory: log.factory });
    for (const id of mixedIds(8)) {
      feed(rig, agent(id, 'working'));
    }
    const phases = new Set<string>();
    for (let i = 0; i < 60_000 / STEP_MS; i++) {
      rig.game.frame(STEP_MS, rig.surface);
      phases.add(log.made[0]?.phase ?? '');
    }
    assert.ok(phases.has('attack') && phases.has('ability'), [...phases].join());
    assert.ok(rig.game.heroSnapshot().every((h) => h.lifecycle === 'working' && !h.exiting));
    assert.equal(rig.game.heroSnapshot().length, 8);
  });
});

void describe('a throwing EffectPool.update', () => {
  void it('is reported once with scope update, the pool is cleared, and heroes are untouched', () => {
    patchPool('update', () => {
      throw new Error('effect update boom');
    });
    const log = heroLog(createHero);
    const rig = gameRig({ heroFactory: log.factory });
    const ids = mixedIds(8);
    for (const id of ids) {
      feed(rig, agent(id, 'working'));
    }
    const phases = new Set<string>();
    for (let i = 0; i < 40_000 / STEP_MS; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
      phases.add(log.made[1]?.phase ?? '');
    }
    const reports = rig.errors.filter((e) => (e.error as Error).message === 'effect update boom');
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.scope, 'update');
    assert.ok(phases.has('attack'), 'heroes keep fighting while the effect layer is broken');
    assert.deepEqual(
      rig.game.heroSnapshot().map((h) => [h.id, h.lifecycle, h.exiting]),
      ids.map((id) => [id, 'working', false]),
    );
  });

  void it('still renders every frame, with the campfire, the foreground, and heroes', () => {
    tracker = trackBitmaps();
    patchPool('update', () => {
      throw new Error('effect update boom');
    });
    const rig = gameRig();
    for (const id of mixedIds(4)) {
      feed(rig, agent(id, 'idle'));
    }
    run(rig, 5000);
    const frame = oneFrame(rig);
    assert.equal(frame.filter((c) => c.method === 'clear').length, 1);
    assert.ok(frame.filter(isLip).length >= 2);
    assert.ok(frame.filter((c) => tracker?.hero.has(c.args[0]) === true).length >= 4);
  });
});
