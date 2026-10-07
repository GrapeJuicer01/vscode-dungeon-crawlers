// Behavior of the webview entry point (src/webview/main.ts) as shipped: dist/webview.js runs in a
// node:vm context against fake DOM globals (test/support/fakeDom.ts). Covers the integer-scaling
// layout, the dark clear, resize and zoom handling, listener cleanup, and crash containment
// (invariant 4). Requires `npm run build`; test/build/bundles.test.ts checks dist/ is fresh.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FakeCanvas, FakeWindow, runWebviewBundle } from '../support/fakeDom';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 180;
const EPSILON = 1e-6;

function cssPixels(value: string): number {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  assert.ok(match !== null, `expected a px length, got "${value}"`);
  return Number(match[1]);
}

/** The integer device-pixel scale the canvas was laid out at; fails if it is not an integer. */
function deviceScale(canvas: FakeCanvas, dpr: number): number {
  const scaleX = (cssPixels(canvas.style.width) * dpr) / INTERNAL_WIDTH;
  const scaleY = (cssPixels(canvas.style.height) * dpr) / INTERNAL_HEIGHT;
  const k = Math.round(scaleX);
  assert.ok(Math.abs(scaleX - k) < EPSILON, `width is not an integer device scale: ${scaleX}`);
  assert.ok(Math.abs(scaleY - k) < EPSILON, `height scale ${scaleY} differs from width ${scaleX}`);
  return k;
}

function fits(k: number, window: FakeWindow, dpr: number): boolean {
  return (
    INTERNAL_WIDTH * k <= window.innerWidth * dpr + EPSILON &&
    INTERNAL_HEIGHT * k <= window.innerHeight * dpr + EPSILON
  );
}

/** Integer, at least 1, the largest that fits (or 1 when even 1 does not fit). */
function assertBestIntegerScale(canvas: FakeCanvas, window: FakeWindow, dpr: number): number {
  const k = deviceScale(canvas, dpr);
  assert.ok(k >= 1, 'scale is never below 1');
  if (k > 1) {
    assert.ok(
      fits(k, window, dpr),
      `scale ${k} overflows ${window.innerWidth}x${window.innerHeight}@${dpr}`,
    );
  }
  assert.ok(!fits(k + 1, window, dpr), `scale ${k + 1} would also fit, so ${k} is not the largest`);
  return k;
}

function boot(
  width: number,
  height: number,
  dpr: number,
): { window: FakeWindow; canvas: FakeCanvas; errors: string[] } {
  const window = new FakeWindow(width, height, dpr);
  const canvas = new FakeCanvas();
  const { errors } = runWebviewBundle(window, canvas);
  return { window, canvas, errors };
}

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  assert.ok(match !== null, `expected a #rrggbb colour, got "${hex}"`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => {
    const c = parseInt(part ?? '0', 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

void describe('webview main: canvas setup', () => {
  void it('sizes the backing store to the internal 320x180 resolution', () => {
    const { canvas } = boot(800, 600, 1);
    assert.equal(canvas.width, INTERNAL_WIDTH);
    assert.equal(canvas.height, INTERNAL_HEIGHT);
  });

  void it('requests an opaque 2d context and turns smoothing off (crisp pixels)', () => {
    const { canvas } = boot(800, 600, 1);
    // JSON round trip: the options object comes from the vm realm, with a different prototype.
    assert.deepEqual(JSON.parse(JSON.stringify(canvas.contextRequests)), [
      { type: '2d', options: { alpha: false } },
    ]);
    assert.equal(canvas.context?.imageSmoothingEnabled, false);
  });

  void it('clears the whole canvas once with a dark colour', () => {
    const { canvas } = boot(800, 600, 1);
    const fills = canvas.context?.fills ?? [];
    assert.equal(fills.length, 1);
    const [fill] = fills;
    assert.deepEqual(
      { x: fill?.x, y: fill?.y, w: fill?.w, h: fill?.h },
      { x: 0, y: 0, w: 320, h: 180 },
    );
    assert.ok(relativeLuminance(fill?.style ?? '') < 0.02, `${fill?.style} is not dark`);
  });

  void it('reports no error on a normal boot', () => {
    assert.deepEqual(boot(800, 600, 1).errors, []);
  });
});

void describe('webview main: integer scaling', () => {
  const exact: [number, number, number, number][] = [
    // innerWidth, innerHeight, devicePixelRatio, expected device scale
    [320, 180, 1, 1],
    [640, 360, 1, 2],
    [1000, 400, 1, 2],
    [1919, 1080, 1, 5],
    [1920, 1080, 1, 6],
    [640, 360, 2, 4],
    [500, 300, 1.5, 2],
    [100, 50, 1, 1],
    [1, 1, 3, 1],
  ];
  for (const [width, height, dpr, expected] of exact) {
    void it(`${width}x${height} at devicePixelRatio ${dpr} scales by ${expected} device pixels`, () => {
      const { window, canvas } = boot(width, height, dpr);
      assert.equal(assertBestIntegerScale(canvas, window, dpr), expected);
    });
  }

  void it('picks the largest fitting integer scale across many sizes and zoom levels', () => {
    for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
      for (let width = 120; width <= 2600; width += 97) {
        for (let height = 60; height <= 1500; height += 71) {
          const { window, canvas } = boot(width, height, dpr);
          assertBestIntegerScale(canvas, window, dpr);
        }
      }
    }
  });

  void it('treats a missing devicePixelRatio as 1', () => {
    const { canvas } = boot(640, 360, 0);
    assert.equal(canvas.style.width, '640px');
    assert.equal(canvas.style.height, '360px');
  });

  void it('never exceeds the view when at least one scale fits', () => {
    const { window, canvas } = boot(1000, 700, 1.25);
    assert.ok(cssPixels(canvas.style.width) <= window.innerWidth + EPSILON);
    assert.ok(cssPixels(canvas.style.height) <= window.innerHeight + EPSILON);
  });
});

void describe('webview main: resize and zoom', () => {
  void it('re-lays out on resize when the panel size changes', () => {
    const { window, canvas } = boot(640, 360, 1);
    assert.equal(deviceScale(canvas, 1), 2);
    window.innerWidth = 1280;
    window.innerHeight = 720;
    window.dispatch('resize');
    assert.equal(assertBestIntegerScale(canvas, window, 1), 4);
  });

  void it('re-lays out on resize when the zoom (devicePixelRatio) changes', () => {
    const { window, canvas } = boot(640, 360, 1);
    window.devicePixelRatio = 1.5;
    window.dispatch('resize');
    assert.equal(assertBestIntegerScale(canvas, window, 1.5), 3);
  });

  void it('does not redraw or resize the backing store on resize', () => {
    const { window, canvas } = boot(640, 360, 1);
    window.innerWidth = 961;
    window.dispatch('resize');
    assert.equal(canvas.width, INTERNAL_WIDTH);
    assert.equal(canvas.height, INTERNAL_HEIGHT);
    assert.equal(canvas.context?.fills.length, 1);
  });

  void it('removes its resize and pagehide listeners on pagehide', () => {
    const { window } = boot(640, 360, 1);
    assert.equal(window.listenerCount('resize'), 1);
    assert.equal(window.listenerCount('pagehide'), 1);
    window.dispatch('pagehide');
    assert.equal(window.listenerCount('resize'), 0);
    assert.equal(window.listenerCount('pagehide'), 0);
  });
});

void describe('webview main: crash containment (invariant 4)', () => {
  void it('reports an error thrown during resize instead of throwing', () => {
    const { window, errors } = boot(640, 360, 1);
    Object.defineProperty(window, 'devicePixelRatio', {
      get(): number {
        throw new Error('boom');
      },
    });
    assert.doesNotThrow(() => window.dispatch('resize'));
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? '', /Pixel Agents webview error: .*boom/);
  });

  void it('reports an error thrown during boot instead of throwing', () => {
    const window = new FakeWindow(640, 360, 1);
    const canvas = new FakeCanvas();
    canvas.getContext = (): never => {
      throw new Error('no context');
    };
    let errors: string[] = [];
    assert.doesNotThrow(() => {
      errors = runWebviewBundle(window, canvas).errors;
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? '', /no context/);
  });

  void it('does nothing and throws nothing when the document has no canvas', () => {
    const window = new FakeWindow(640, 360, 1);
    const { errors } = runWebviewBundle(window, null);
    assert.deepEqual(errors, []);
    assert.equal(window.listenerCount('resize'), 0);
  });

  void it('still lays out when the 2d context is unavailable', () => {
    const window = new FakeWindow(640, 360, 1);
    const canvas = new FakeCanvas();
    canvas.context = null;
    const { errors } = runWebviewBundle(window, canvas);
    assert.deepEqual(errors, []);
    assert.equal(deviceScale(canvas, 1), 2);
  });
});
