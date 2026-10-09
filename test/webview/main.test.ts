// Behavior of the webview entry point (src/webview/main.ts) as shipped: dist/webview.js runs in a
// node:vm context against fake DOM globals (test/support/fakeDom.ts). Covers the integer-scaling
// layout, the dark boot clear, resize and zoom handling, listener cleanup, crash containment
// (invariant 4), (M2, plan test note 10) the host channel: one acquireVsCodeApi call and one
// `ready` per boot, the message listener registered first, invalid host messages dropped
// silently, and the single crash reporter, and (M4) the engine wiring: one animation-frame
// request at boot, a dark first frame, the loop pausing while hidden, and cleanup on pagehide.
// Requires `npm run build`; test/build/bundles.test.ts checks dist/ is fresh.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWebviewMessage } from '../../src/shared/protocol';
import { FakeCanvas, FakeWindow, runInBundleRealm, runWebviewBundle } from '../support/fakeDom';
import type { VsCodeApiMode, WebviewRun } from '../support/fakeDom';

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

  void it('clears the whole canvas once with a dark colour at boot, before any frame runs', () => {
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

  void it('the first engine frame clears the whole canvas with a dark stage colour first', () => {
    const run = runWebviewBundle(new FakeWindow(800, 600, 1), new FakeCanvas());
    run.window.runFrame(1000);
    const fills = run.canvas?.context?.fills ?? [];
    // fills[0] is the boot clear; fills[1] is the frame's clear (the renderer's first call).
    const clear = fills[1];
    assert.deepEqual(
      { x: clear?.x, y: clear?.y, w: clear?.w, h: clear?.h },
      { x: 0, y: 0, w: 320, h: 180 },
    );
    assert.ok(relativeLuminance(clear?.style ?? '') < 0.02, `${clear?.style} is not dark`);
    assert.deepEqual(run.errors, []);
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

  // Each boot now builds the whole engine (sprites, strips), so the bundle sweep is coarse; the
  // dense sweep runs against computeIntegerScale in test/game/layout.test.ts.
  void it('picks the largest fitting integer scale across sizes and zoom levels', () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      for (let width = 120; width <= 2600; width += 620) {
        for (let height = 60; height <= 1500; height += 360) {
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

  void it('removes its resize, message, pagehide, and visibilitychange listeners on pagehide', () => {
    const run = runWebviewBundle(new FakeWindow(640, 360, 1), new FakeCanvas());
    const { window, document } = run;
    assert.equal(window.listenerCount('resize'), 1);
    assert.equal(window.listenerCount('message'), 1);
    assert.equal(window.listenerCount('pagehide'), 1);
    assert.equal(document.listenerCount('visibilitychange'), 1);
    window.dispatch('pagehide');
    assert.equal(window.listenerCount('resize'), 0);
    assert.equal(window.listenerCount('message'), 0);
    assert.equal(window.listenerCount('pagehide'), 0);
    assert.equal(document.listenerCount('visibilitychange'), 0);
  });
});

function engineRun(hidden = false): WebviewRun {
  return runWebviewBundle(new FakeWindow(1280, 300, 2), new FakeCanvas(), 'present', { hidden });
}

void describe('webview main: the engine loop (M4)', () => {
  void it('requests exactly one animation frame at boot and runs none by itself', () => {
    const run = engineRun();
    assert.equal(run.window.frameRequests.length, 1);
    assert.equal(run.window.pendingFrames.size, 1);
    assert.equal(run.canvas?.context?.draws.length, 0, 'nothing is drawn before a frame runs');
  });

  void it('keeps exactly one frame pending after every frame (the loop never stops)', () => {
    const run = engineRun();
    for (let i = 0; i < 30; i += 1) {
      run.window.runFrame(1000 + i * 17);
      assert.equal(run.window.pendingFrames.size, 1, `frame ${i}`);
    }
    assert.deepEqual(run.errors, []);
  });

  void it('draws the lit room each frame with one multiply blit and restores the composite', () => {
    const run = engineRun();
    sendProgress(run); // the boot gate draws only the clear colour until the host's progress arrives
    run.window.runFrame(1000);
    const context = run.canvas?.context;
    const draws = context?.draws ?? [];
    assert.ok(draws.length > 3, `only ${draws.length} draws`);
    assert.equal(draws.filter((d) => d.composite === 'multiply').length, 1);
    assert.equal(context?.globalCompositeOperation, 'source-over');
    assert.equal(context?.globalAlpha, 1);
    assert.equal(context?.imageSmoothingEnabled, false);
  });

  void it('builds sprites with putImageData on offscreen canvases (no blob or data URLs)', () => {
    const run = engineRun();
    const created = run.document.created;
    assert.ok(created.length > 20, `only ${created.length} offscreen canvases`);
    const puts = created.reduce((sum, canvas) => sum + (canvas.context?.puts.length ?? 0), 0);
    assert.ok(puts > 20, `only ${puts} putImageData calls`);
  });

  void it('draws heroes after a host agent message, and removes them after despawned', () => {
    const run = engineRun();
    const draws = (): number => run.canvas?.context?.draws.length ?? 0;
    run.window.runFrames(3);
    const empty = draws();
    const send = (state: string, timestamp: number): void =>
      run.window.dispatchMessage({
        data: runInBundleRealm(
          run,
          `{ type: 'agentState', agent: { id: 'sim-0-0', name: 'Sim A', state: '${state}', toolName: null, timestamp: ${timestamp} } }`,
        ),
      });
    send('working', 1);
    run.window.runFrames(120);
    const perFrameWithHero = (draws() - empty) / 120;
    const before = draws();
    run.window.runFrames(1);
    const oneFrameWithHero = draws() - before;
    run.window.runFrames(1);
    send('despawned', 2);
    // 1.8 s of game time at 60 fps removes the exiting hero.
    run.window.runFrames(200);
    const after = draws();
    run.window.runFrames(1);
    const oneFrameAfter = draws() - after;
    assert.ok(perFrameWithHero > 0);
    assert.ok(
      oneFrameWithHero > oneFrameAfter,
      `hero frame ${oneFrameWithHero} vs empty ${oneFrameAfter}`,
    );
    assert.deepEqual(run.errors, []);
    assert.equal(run.api.posted.length, 1, 'only `ready` was ever posted');
  });

  void it('does not request frames while the document is hidden at boot', () => {
    const run = engineRun(true);
    assert.equal(run.window.frameRequests.length, 0);
    run.document.setHidden(false);
    assert.equal(run.window.pendingFrames.size, 1);
  });

  void it('cancels the pending frame when hidden and resumes when visible again', () => {
    const run = engineRun();
    run.window.runFrame(1000);
    run.document.setHidden(true);
    assert.equal(run.window.pendingFrames.size, 0);
    assert.equal(run.window.frameCancels.length, 1);
    run.document.setHidden(false);
    assert.equal(run.window.pendingFrames.size, 1);
    run.window.runFrame(60_000);
    assert.deepEqual(run.errors, []);
  });

  void it('stops the loop on pagehide: the pending frame is cancelled and none is requested', () => {
    const run = engineRun();
    run.window.runFrame(1000);
    run.window.dispatch('pagehide');
    assert.equal(run.window.pendingFrames.size, 0);
    const requests = run.window.frameRequests.length;
    run.document.setHidden(false);
    run.window.runFrame(2000);
    assert.equal(run.window.frameRequests.length, requests);
  });

  void it('a drawing failure is reported once and the loop keeps running (invariant 4)', () => {
    const run = engineRun();
    sendProgress(run);
    const context = run.canvas?.context;
    assert.ok(context);
    context.drawImage = (): never => {
      throw new Error('draw boom');
    };
    for (let i = 0; i < 5; i += 1) {
      assert.doesNotThrow(() => run.window.runFrame(1000 + i * 17));
      assert.equal(run.window.pendingFrames.size, 1);
    }
    assert.equal(run.errors.length, 1, JSON.stringify(run.errors));
    assert.match(run.errors[0] ?? '', /^Pixel Agents webview error: draw boom$/);
  });

  void it('an engine that cannot boot is reported once; messages and `ready` still work', () => {
    const window = new FakeWindow(1280, 300, 2);
    const broken = runWebviewBundle(window, new FakeCanvas(), 'present', {
      failOffscreenContext: true,
    });
    assert.ok(broken.document.created.length > 0, 'the engine tried to build sprites');
    assert.equal(broken.errors.length, 1, JSON.stringify(broken.errors));
    assert.equal(broken.api.posted.length, 1, '`ready` is still posted');
    assert.equal(window.pendingFrames.size, 0, 'no loop without an engine');
    assert.equal(window.listenerCount('message'), 1);
    assert.doesNotThrow(() =>
      window.dispatchMessage({
        data: runInBundleRealm(
          broken,
          `{ type: 'agentList', agents: [{ id: 'a', name: 'A', state: 'idle', toolName: null, timestamp: 1 }] }`,
        ),
      }),
    );
    assert.equal(broken.errors.length, 1);
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

const PROGRESS_LITERAL =
  '{ schemaVersion: 1, stageIndex: 1, killsInStage: 0, totalKills: 0, bossesDefeated: 0, cycle: 0 }';

/** Delivers the host's stored progress (what the extension posts after config and agentList). */
function sendProgress(run: WebviewRun, literal = PROGRESS_LITERAL): void {
  run.window.dispatchMessage({
    data: runInBundleRealm(run, `{ type: 'progress', progress: ${literal} }`),
  });
}

function bootWith(mode: VsCodeApiMode): WebviewRun {
  return runWebviewBundle(new FakeWindow(640, 360, 1), new FakeCanvas(), mode);
}

/** A message event whose `data` getter throws `thrown`, to drive the crash reporter. */
function throwingEvent(thrown: unknown): unknown {
  return {
    get data(): unknown {
      throw thrown;
    },
  };
}

void describe('webview main: host channel and ready handshake (M2)', () => {
  void it('calls acquireVsCodeApi exactly once per boot', () => {
    assert.equal(bootWith('present').api.acquireCalls, 1);
    // A second document load is a new boot with its own single call.
    assert.equal(bootWith('present').api.acquireCalls, 1);
  });

  void it('posts exactly one { type: "ready" } per boot, which the host parser accepts', () => {
    const run = bootWith('present');
    assert.equal(run.api.posted.length, 1);
    // structuredClone, as the real postMessage does: the copy lives in the host (test) realm.
    const cloned: unknown = structuredClone(run.api.posted[0]);
    assert.deepEqual(cloned, { type: 'ready' });
    assert.deepEqual(parseWebviewMessage(cloned), { type: 'ready' });
  });

  void it('registers the message listener before posting ready (the answer cannot be missed)', () => {
    const { window } = bootWith('present');
    const added = window.timeline.indexOf('add:message');
    const post = window.timeline.indexOf('post');
    assert.ok(added !== -1, 'message listener registered');
    assert.ok(post !== -1, 'ready posted');
    assert.ok(added < post, `timeline: ${JSON.stringify(window.timeline)}`);
  });

  void it('posts nothing in response to host messages (no focusAgent or other traffic in M2)', () => {
    const run = bootWith('present');
    run.window.dispatchMessage({
      data: runInBundleRealm(run, `{ type: 'agentList', agents: [] }`),
    });
    run.window.dispatchMessage({ data: { type: 'stopAgent' } });
    assert.equal(run.api.posted.length, 1);
  });

  void it('accepts valid same-realm host messages without any error output', () => {
    const run = bootWith('present');
    const messages = [
      `{ type: 'config', config: { protocolVersion: 2, enemiesEnabled: true, killsPerStage: 30, maxEnemies: 6 } }`,
      `{ type: 'progress', progress: ${PROGRESS_LITERAL} }`,
      `{ type: 'agentList', agents: [{ id: 'sim-1', name: 'Sim', state: 'working', toolName: 'Bash', timestamp: 1 }] }`,
      `{ type: 'agentState', agent: { id: 'sim-1', name: 'Sim', state: 'idle', toolName: null, timestamp: 2 } }`,
      `{ type: 'agentState', agent: { id: 'sim-1', name: 'Sim', state: 'despawned', toolName: null, timestamp: 3 } }`,
    ];
    for (const message of messages) {
      assert.doesNotThrow(() =>
        run.window.dispatchMessage({ data: runInBundleRealm(run, message) }),
      );
    }
    assert.deepEqual(run.errors, []);
  });

  void it('drops invalid host messages silently: no error output, nothing thrown, data never printed', () => {
    const run = bootWith('present');
    const secret = 'SECRET-TRANSCRIPT-TEXT';
    const payloads: unknown[] = [
      { type: 'stopAgent', agentId: secret },
      null,
      undefined,
      `${secret}${'x'.repeat(1_000_000)}`,
      runInBundleRealm(run, `{ type: 'agentList', agents: [{ id: 'a', text: '${secret}' }] }`),
      runInBundleRealm(run, `{ type: 'config', config: { protocolVersion: 1 } }`),
      runInBundleRealm(run, `{ type: 'config', config: { protocolVersion: 2 } }`),
      runInBundleRealm(run, `{ type: 'progress', progress: { stageIndex: 0 } }`),
      // Built in the test realm: a cross-realm object is not a plain object to the bundle.
      { type: 'agentList', agents: [] },
    ];
    for (const data of payloads) {
      assert.doesNotThrow(() => run.window.dispatchMessage({ data }));
    }
    assert.deepEqual(run.errors, []);
  });
});

void describe('webview main: messaging failures are contained (M2, invariant 4)', () => {
  for (const mode of ['missing', 'throws', 'postThrows'] as const) {
    void it(`acquireVsCodeApi ${mode}: one error line, the canvas is still cleared, nothing throws`, () => {
      const window = new FakeWindow(640, 360, 1);
      const canvas = new FakeCanvas();
      let run: WebviewRun | undefined;
      assert.doesNotThrow(() => {
        run = runWebviewBundle(window, canvas, mode);
      });
      assert.equal(run?.errors.length, 1, `errors: ${JSON.stringify(run?.errors)}`);
      assert.match(run?.errors[0] ?? '', /^Pixel Agents webview error: /);
      assert.equal(
        canvas.context?.fills.length,
        1,
        'the canvas is cleared before messaging starts',
      );
      assert.equal(canvas.width, INTERNAL_WIDTH);
      assert.equal(
        window.listenerCount('message'),
        1,
        'the listener was registered before failure',
      );
    });
  }
});

void describe('webview main: the single crash reporter (M2)', () => {
  void it('prints a same-realm Error message with the fixed prefix', () => {
    const run = bootWith('present');
    run.window.dispatchMessage(
      throwingEvent(runInBundleRealm(run, `new Error('same-realm boom')`)),
    );
    assert.deepEqual(run.errors, ['Pixel Agents webview error: same-realm boom']);
  });

  void it('prints a cross-realm Error message (instanceof fails across realms)', () => {
    const run = bootWith('present');
    run.window.dispatchMessage(throwingEvent(new Error('cross-realm boom')));
    assert.deepEqual(run.errors, ['Pixel Agents webview error: cross-realm boom']);
  });

  void it('prints "non-error thrown" for a thrown string or plain object, never the value', () => {
    const run = bootWith('present');
    run.window.dispatchMessage(throwingEvent('SECRET-STRING'));
    run.window.dispatchMessage(throwingEvent({ message: 'SECRET-OBJECT' }));
    run.window.dispatchMessage(
      throwingEvent(runInBundleRealm(run, `{ message: 'SECRET-OBJECT' }`)),
    );
    assert.deepEqual(run.errors, ['Pixel Agents webview error: non-error thrown']);
  });

  void it('prints a repeated identical message once per page load', () => {
    const run = bootWith('present');
    for (let i = 0; i < 5; i += 1) {
      run.window.dispatchMessage(throwingEvent(new Error('again')));
    }
    run.window.dispatchMessage(throwingEvent(new Error('different')));
    assert.deepEqual(run.errors, [
      'Pixel Agents webview error: again',
      'Pixel Agents webview error: different',
    ]);
  });

  void it('a new page load starts with a fresh reporter', () => {
    const first = bootWith('present');
    first.window.dispatchMessage(throwingEvent(new Error('per load')));
    const second = bootWith('present');
    second.window.dispatchMessage(throwingEvent(new Error('per load')));
    assert.equal(first.errors.length, 1);
    assert.equal(second.errors.length, 1);
  });

  void it('keeps listening after a reported error', () => {
    const run = bootWith('present');
    run.window.dispatchMessage(throwingEvent(new Error('first')));
    assert.equal(run.window.listenerCount('message'), 1);
    run.window.dispatchMessage(throwingEvent(new Error('second')));
    assert.equal(run.errors.length, 2);
  });
});

function sendWorking(run: WebviewRun, id: string): void {
  run.window.dispatchMessage({
    data: runInBundleRealm(
      run,
      `{ type: 'agentState', agent: { id: '${id}', name: 'Sim ${id}', state: 'working', toolName: 'Bash', timestamp: 1 } }`,
    ),
  });
}

function sendConfig(run: WebviewRun, enemiesEnabled: boolean, killsPerStage = 30): void {
  run.window.dispatchMessage({
    data: runInBundleRealm(
      run,
      `{ type: 'config', config: { protocolVersion: 2, enemiesEnabled: ${String(enemiesEnabled)}, killsPerStage: ${killsPerStage}, maxEnemies: 6 } }`,
    ),
  });
}

/** Everything posted after `ready`, structured-cloned into this realm as the host would see it. */
function savesOf(run: WebviewRun): unknown[] {
  return run.api.posted.slice(1).map((message) => structuredClone(message));
}

void describe('webview main: stored progress and saving (E1, ADR 0012)', () => {
  void it('draws only the clear colour until the host progress arrives, then the room', () => {
    const run = engineRun();
    run.window.runFrames(20);
    assert.equal(run.canvas?.context?.draws.length, 0, 'no stage flash while the stage is unknown');
    sendProgress(run);
    run.window.runFrames(2);
    assert.ok(
      (run.canvas?.context?.draws.length ?? 0) > 3,
      'the room draws once progress is applied',
    );
    assert.deepEqual(run.errors, []);
  });

  void it('stops waiting after 1.5 s of game time and runs on the defaults', () => {
    const run = engineRun();
    run.window.runFrames(60); // about 1.0 s
    assert.equal(run.canvas?.context?.draws.length, 0);
    run.window.runFrames(60); // past 1.5 s
    assert.ok((run.canvas?.context?.draws.length ?? 0) > 3);
    assert.deepEqual(run.errors, []);
  });

  void it('a document that never receives progress never sends saveProgress', () => {
    const run = engineRun();
    sendConfig(run, true, 5);
    sendWorking(run, 'sim-a');
    sendWorking(run, 'sim-b');
    run.window.runFrames(2400);
    run.window.fireTimers();
    run.window.dispatch('pagehide');
    assert.equal(run.api.posted.length, 1, 'only `ready` was posted');
    assert.deepEqual(run.errors, []);
  });

  void it('once progress is loaded, kills are saved as valid, monotonic saveProgress messages', () => {
    const run = engineRun();
    sendConfig(run, true, 5);
    sendProgress(run);
    sendWorking(run, 'sim-a');
    sendWorking(run, 'sim-b');
    for (let i = 0; i < 6; i += 1) {
      run.window.runFrames(600);
      run.window.fireTimers(); // the 15 s throttle timer
    }
    run.window.dispatch('pagehide');
    const saves = savesOf(run);
    assert.ok(saves.length >= 1, 'at least one save after real fighting');
    let lastTotal = 0;
    for (const raw of saves) {
      const parsed = parseWebviewMessage(raw);
      assert.ok(parsed?.type === 'saveProgress', `unexpected message ${JSON.stringify(raw)}`);
      assert.ok(parsed.progress.totalKills >= lastTotal, 'totalKills never goes down');
      lastTotal = parsed.progress.totalKills;
    }
    assert.ok(lastTotal > 0, 'kills were counted');
    assert.deepEqual(run.errors, []);
  });

  void it('stored progress is restored: a stored kill count continues from where it was', () => {
    const run = engineRun();
    sendConfig(run, true, 5);
    sendProgress(
      run,
      '{ schemaVersion: 1, stageIndex: 1, killsInStage: 1, totalKills: 100, bossesDefeated: 3, cycle: 1 }',
    );
    sendWorking(run, 'sim-a');
    sendWorking(run, 'sim-b');
    for (let i = 0; i < 6; i += 1) {
      run.window.runFrames(600);
      run.window.fireTimers();
    }
    run.window.dispatch('pagehide');
    const saves = savesOf(run).map((raw) => parseWebviewMessage(raw));
    assert.ok(saves.length >= 1);
    for (const save of saves) {
      assert.ok(save?.type === 'saveProgress');
      assert.ok(save.progress.totalKills > 100, 'continues above the stored 100');
      assert.ok(save.progress.bossesDefeated >= 3 && save.progress.cycle >= 1);
    }
  });

  void it('with enemies switched off by the host nothing is ever saved', () => {
    const run = engineRun();
    sendConfig(run, false);
    sendProgress(run);
    sendWorking(run, 'sim-a');
    run.window.runFrames(1800);
    run.window.fireTimers();
    run.window.dispatch('pagehide');
    assert.equal(run.api.posted.length, 1);
    assert.deepEqual(run.errors, []);
  });

  void it('a second progress message in the same document does not reset the engine', () => {
    const run = engineRun();
    sendProgress(run);
    run.window.runFrames(5);
    sendProgress(
      run,
      '{ schemaVersion: 1, stageIndex: 2, killsInStage: 0, totalKills: 9, bossesDefeated: 1, cycle: 0 }',
    );
    assert.doesNotThrow(() => run.window.runFrames(5));
    assert.deepEqual(run.errors, []);
  });
});
