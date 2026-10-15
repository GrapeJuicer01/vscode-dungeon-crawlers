// Regression for commit 0ea8ddb: the light pass has its own guard. A throwing lighting path is
// reported once with scope 'render', the pass is skipped after LIGHT_FAULT_LIMIT (3) faults, and
// entities, foreground, and particles keep drawing throughout (invariant 4).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STEP_MS } from '../../src/game/data/tuning';
import { RecordingSurface, agent, feed, gameRig, run } from '../support/engineFakes';
import type { DrawCall, GameRig } from '../support/engineFakes';

/** The RENDERER's private limit (src/game/Renderer.ts LIGHT_FAULT_LIMIT). */
const LIGHT_FAULT_LIMIT = 3;

/** Throws from the multiply blit (the light compose) while `faulting`; counts every attempt. */
class LightFaultSurface extends RecordingSurface {
  faulting = true;
  multiplyAttempts = 0;

  override drawBitmapRegion(...args: Parameters<RecordingSurface['drawBitmapRegion']>): void {
    if (this.composite === 'multiply') {
      this.multiplyAttempts++;
      if (this.faulting) {
        throw new Error('light compose failed');
      }
    }
    super.drawBitmapRegion(...args);
  }
}

function settledRig(): GameRig {
  const rig = gameRig();
  rig.game.frame(0, rig.surface);
  for (let i = 0; i < 4; i++) {
    feed(rig, agent(`h${i}`, i % 2 === 0 ? 'working' : 'idle'));
  }
  run(rig, 15_000);
  return rig;
}

const isBitmapDraw = (c: DrawCall): boolean =>
  c.method === 'drawBitmap' || c.method === 'drawBitmapRegion';

/** Method sequence of the entity/foreground/particle drawing: all draws except the multiply blit. */
function drawShape(calls: readonly DrawCall[]): string[] {
  return calls
    .filter((c) => (isBitmapDraw(c) || c.method === 'fillRect') && c.composite !== 'multiply')
    .map((c) => c.method);
}

function frame(rig: GameRig, surface: RecordingSurface): DrawCall[] {
  surface.reset();
  rig.game.frame(STEP_MS, surface);
  return surface.calls.slice();
}

void describe('Renderer light-pass guard', () => {
  void it('a throwing light path is reported once with scope render, then skipped after the limit', () => {
    const rig = settledRig();
    const surface = new LightFaultSurface();
    for (let i = 0; i < 20; i++) {
      frame(rig, surface);
    }
    const renders = rig.errors.filter((e) => e.scope === 'render');
    assert.equal(renders.length, 1, 'reported exactly once');
    assert.equal(rig.errors.length, 1, 'nothing else reported');
    assert.equal((renders[0]?.error as Error).message, 'light compose failed');
    assert.equal(
      surface.multiplyAttempts,
      LIGHT_FAULT_LIMIT,
      'the light pass ran for exactly LIGHT_FAULT_LIMIT frames, then was skipped',
    );
  });

  void it('after the limit there are no multiply blits or reports, even if the surface recovers', () => {
    const rig = settledRig();
    const surface = new LightFaultSurface();
    for (let i = 0; i < LIGHT_FAULT_LIMIT; i++) {
      frame(rig, surface);
    }
    assert.equal(surface.multiplyAttempts, LIGHT_FAULT_LIMIT);
    surface.faulting = false;
    for (let i = 0; i < 30; i++) {
      const calls = frame(rig, surface);
      assert.equal(
        calls.filter((c) => c.composite === 'multiply').length,
        0,
        'no multiply composite at all',
      );
    }
    assert.equal(surface.multiplyAttempts, LIGHT_FAULT_LIMIT, 'no further attempts');
    assert.equal(rig.errors.length, 1, 'no further reports');
  });

  void it('entities, foreground, and particles draw exactly as in a healthy frame, during and after faults', () => {
    const healthyRig = settledRig();
    const faultRig = settledRig();
    const healthy = new RecordingSurface();
    const faulty = new LightFaultSurface();
    healthy.record = true;
    for (let i = 0; i < 12; i++) {
      const good = frame(healthyRig, healthy);
      const bad = frame(faultRig, faulty);
      const goodShape = drawShape(good);
      assert.ok(goodShape.length > 20, 'the healthy frame draws a scene');
      assert.deepEqual(
        drawShape(bad),
        goodShape,
        `frame ${i} (${i < LIGHT_FAULT_LIMIT ? 'faulting' : 'skipped'})`,
      );
      assert.equal(good.filter((c) => c.composite === 'multiply' && isBitmapDraw(c)).length, 1);
    }
  });

  void it('the surface is left at source-over alpha 1 after every frame, faulting or not', () => {
    const rig = settledRig();
    const surface = new LightFaultSurface();
    for (let i = 0; i < 10; i++) {
      rig.game.frame(STEP_MS, surface);
      assert.equal(surface.composite, 'source-over', `frame ${i}`);
      assert.equal(surface.alpha, 1, `frame ${i}`);
    }
  });

  void it('entities are drawn in source-over at alpha 1 in the frame where the light faulted', () => {
    const rig = settledRig();
    const surface = new LightFaultSurface();
    const calls = frame(rig, surface);
    assert.equal(rig.errors.length, 1);
    const afterFault = calls.slice(
      calls.findIndex((c) => c.method === 'setComposite' && c.args[0] === 'multiply'),
    );
    const bitmaps = afterFault.filter(isBitmapDraw);
    assert.ok(bitmaps.length >= 10, 'entities and foreground still drew');
    assert.ok(bitmaps.every((c) => c.composite === 'source-over'));
  });

  void it('healthy lighting gives exactly one multiply blit per frame and no reports', () => {
    const rig = settledRig();
    const surface = new LightFaultSurface();
    surface.faulting = false;
    for (let i = 0; i < 30; i++) {
      const calls = frame(rig, surface);
      assert.equal(calls.filter((c) => c.composite === 'multiply' && isBitmapDraw(c)).length, 1);
    }
    assert.equal(surface.multiplyAttempts, 30);
    assert.deepEqual(rig.errors, []);
  });
});
