// The canvas adapter: Surface and BitmapFactory over a 2d context (ADR 0008).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createCanvasBitmaps, createCanvasSurface } from '../../src/webview/canvasSurface';
import { FakeCanvas, FakeImageData } from '../support/fakeDom';

const globals = globalThis as unknown as { ImageData?: unknown };
let saved: unknown;
beforeEach(() => {
  saved = globals.ImageData;
  globals.ImageData = FakeImageData;
});
afterEach(() => {
  globals.ImageData = saved;
});

function surfaceOver(canvas = new FakeCanvas()): {
  canvas: FakeCanvas;
  surface: ReturnType<typeof createCanvasSurface>;
} {
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.context;
  assert.ok(ctx);
  return {
    canvas,
    surface: createCanvasSurface(canvas, ctx),
  };
}

function bitmaps(): { made: FakeCanvas[]; factory: ReturnType<typeof createCanvasBitmaps> } {
  const made: FakeCanvas[] = [];
  return {
    made,
    factory: createCanvasBitmaps(() => {
      const c = new FakeCanvas();
      made.push(c);
      return c;
    }),
  };
}

void describe('createCanvasSurface', () => {
  void it('turns smoothing off and clears the whole canvas', () => {
    const { canvas, surface } = surfaceOver();
    assert.equal(canvas.context?.imageSmoothingEnabled, false);
    surface.clear('#101010');
    assert.deepEqual(canvas.context?.fills, [{ x: 0, y: 0, w: 320, h: 180, style: '#101010' }]);
  });

  void it('fillRect uses the colour', () => {
    const { canvas, surface } = surfaceOver();
    surface.fillRect('#ff0000', 1, 2, 3, 4);
    surface.fillRect('#00ff00', 5, 6, 7, 8);
    surface.fillRect('#00ff00', 9, 9, 1, 1);
    assert.deepEqual(
      canvas.context?.fills.map((f) => f.style),
      ['#ff0000', '#00ff00', '#00ff00'],
    );
  });

  void it('drawBitmap draws unflipped with a plain drawImage', () => {
    const { surface, canvas } = surfaceOver();
    const { factory, made } = bitmaps();
    const bitmap = factory.fromRgba(2, 2, new Uint8ClampedArray(16));
    surface.drawBitmap(bitmap, 10, 20, false);
    assert.deepEqual(canvas.context?.draws, [
      { source: made[0], args: [10, 20], composite: 'source-over', alpha: 1 },
    ]);
    assert.deepEqual(canvas.context?.transforms, []);
  });

  void it('a flipped draw mirrors inside the bitmap box and resets the transform', () => {
    const { surface, canvas } = surfaceOver();
    const { factory } = bitmaps();
    const bitmap = factory.fromRgba(7, 3, new Uint8ClampedArray(7 * 3 * 4));
    surface.drawBitmap(bitmap, 10, 20, true);
    assert.deepEqual(canvas.context?.transforms, [
      [-1, 0, 0, 1, 17, 0],
      [1, 0, 0, 1, 0, 0],
    ]);
    assert.deepEqual(canvas.context?.draws[0]?.args, [0, 20]);
  });

  void it('drawBitmapRegion passes all nine arguments', () => {
    const { surface, canvas } = surfaceOver();
    const { factory } = bitmaps();
    surface.drawBitmapRegion(
      factory.fromRgba(4, 4, new Uint8ClampedArray(64)),
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
    );
    assert.deepEqual(canvas.context?.draws[0]?.args, [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  void it('setComposite and setAlpha reach the context and apply to later draws', () => {
    const { surface, canvas } = surfaceOver();
    const { factory } = bitmaps();
    surface.setComposite('multiply');
    surface.setAlpha(0.5);
    surface.drawBitmap(factory.fromRgba(1, 1, new Uint8ClampedArray(4)), 0, 0, false);
    assert.equal(canvas.context?.draws[0]?.composite, 'multiply');
    assert.equal(canvas.context?.draws[0]?.alpha, 0.5);
  });

  void it('rejects a bitmap it did not make with a fixed TypeError', () => {
    const { surface } = surfaceOver();
    assert.throws(
      () => surface.drawBitmap({ width: 1, height: 1 }, 0, 0, false),
      (e: unknown) => e instanceof TypeError && e.message === 'Unsupported bitmap',
    );
  });
});

void describe('createCanvasBitmaps', () => {
  void it('fromRgba sizes a canvas and uses putImageData (no blob or data URL)', () => {
    const { factory, made } = bitmaps();
    const bitmap = factory.fromRgba(3, 2, new Uint8ClampedArray(24));
    assert.deepEqual([bitmap.width, bitmap.height], [3, 2]);
    assert.deepEqual([made[0]?.width, made[0]?.height], [3, 2]);
    assert.deepEqual(made[0]?.context?.puts, [{ width: 3, height: 2, x: 0, y: 0 }]);
  });

  void it('createOffscreen returns a drawing surface with a bitmap of the same size', () => {
    const { factory, made } = bitmaps();
    const offscreen = factory.createOffscreen(16, 8);
    assert.deepEqual([offscreen.width, offscreen.height], [16, 8]);
    assert.deepEqual([offscreen.bitmap.width, offscreen.bitmap.height], [16, 8]);
    offscreen.fillRect('#123456', 0, 0, 1, 1);
    assert.equal(made[0]?.context?.fills.length, 1);
  });

  void it('throws when a 2d context is unavailable', () => {
    const factory = createCanvasBitmaps(() => {
      const c = new FakeCanvas();
      c.context = null;
      return c;
    });
    assert.throws(
      () => factory.fromRgba(1, 1, new Uint8ClampedArray(4)),
      /2D canvas is unavailable/,
    );
    assert.throws(() => factory.createOffscreen(1, 1), /2D canvas is unavailable/);
  });
});
