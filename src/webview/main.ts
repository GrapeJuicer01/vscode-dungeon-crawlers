// Pixel Agents webview entry point. Sizes the canvas and keeps it integer-scaled (M1), opens the
// host channel and sends `ready` on every document load (M2, ADR 0007), and runs the dungeon
// engine (M4, ADR 0008): host messages go to the mirror and the engine through SceneFeed, and
// GameHost drives the frame loop. E1 adds `saveProgress` (ADR 0012): the engine's numeric progress
// callback goes through ProgressSaver, which sends nothing until the host's `progress` arrived. If the engine cannot boot, the failure is reported once and the
// mirror keeps working (Core invariant 4). This file and canvasSurface.ts are the only webview
// files that touch the DOM; requestAnimationFrame appears only here.
import { Game } from '../game/Game';
import { STAGES } from '../game/data/stages';
import { ENGINE_SEED } from '../game/data/tuning';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, computeIntegerScale } from '../game/layout';
import { SHIPPED_ART } from '../game/sprites/artSet';
import { createCanvasBitmaps, createCanvasSurface } from './canvasSurface';
import { GameHost } from './gameHost';
import { createHostChannel } from './hostChannel';
import type { HostChannel, VsCodeWebviewApi } from './hostChannel';
import { handleHostMessage } from './hostMessages';
import { HostStateMirror } from './hostState';
import { ProgressSaver } from './progressSaver';
import { SceneFeed } from './sceneFeed';
import { createSaveProgressMessage } from '../shared/protocol';

/** Injected by VS Code into the webview; may be called only once per document. */
declare function acquireVsCodeApi(): VsCodeWebviewApi;

/** Shown until the first engine frame (and when the engine cannot boot): the stage near-black. */
const BOOT_CLEAR_COLOR = SHIPPED_ART.palette['n'] ?? '#0a0810';

/**
 * Scales the canvas by the largest integer factor (in device pixels) that fits the view,
 * never below 1, so every game pixel maps to a whole number of screen pixels.
 */
function layout(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const scale = computeIntegerScale(window.innerWidth, window.innerHeight, dpr);
  canvas.style.width = `${(INTERNAL_WIDTH * scale) / dpr}px`;
  canvas.style.height = `${(INTERNAL_HEIGHT * scale) / dpr}px`;
}

/** Messages already printed in this page load; each distinct message is printed once. */
const reportedErrors = new Set<string>();

/**
 * True for an Error from any realm. `instanceof Error` alone misses errors created in another
 * realm (another frame, or a node:vm test context), which are still genuine Errors.
 */
function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === 'object' &&
      value !== null &&
      Object.prototype.toString.call(value) === '[object Error]' &&
      typeof (value as { message?: unknown }).message === 'string')
  );
}

/**
 * The single crash reporter, used by every catch block. A non-Error value is never printed
 * (it may be untrusted data), and neither is event.data.
 */
function reportError(error: unknown): void {
  const message = isError(error) ? error.message : 'non-error thrown';
  if (reportedErrors.has(message)) {
    return;
  }
  reportedErrors.add(message);
  console.error(`Pixel Agents webview error: ${message}`);
}

function boot(): void {
  const canvas = document.querySelector('canvas');
  if (canvas === null) {
    return;
  }

  canvas.width = INTERNAL_WIDTH;
  canvas.height = INTERNAL_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  // Rebuilt from the host snapshot on every load (invariant 4); only host messages change it.
  const mirror = new HostStateMirror();
  // Assigned at the end of boot; a save before then cannot happen (the saver waits for `progress`).
  let channel: HostChannel | null = null;
  const saver = new ProgressSaver(
    (progress) => {
      const message = createSaveProgressMessage(progress);
      if (message !== undefined) {
        channel?.send(message);
      }
    },
    {
      set: (run, ms) => window.setTimeout(run, ms),
      clear: (handle) => window.clearTimeout(handle as number),
    },
  );
  let game: Game | null = null;
  let host: GameHost | null = null;
  if (ctx !== null) {
    const surface = createCanvasSurface(canvas, ctx);
    surface.clear(BOOT_CLEAR_COLOR);
    try {
      game = new Game({
        art: SHIPPED_ART,
        stages: STAGES,
        bitmaps: createCanvasBitmaps(() => document.createElement('canvas')),
        onError: (error) => reportError(error),
        seed: ENGINE_SEED,
        agentSource: () => mirror.agents(),
        awaitProgress: true,
        onProgress: (progress, urgent) => saver.submit(progress, urgent),
      });
      host = new GameHost({
        game,
        surface,
        scheduler: {
          request: (cb) => window.requestAnimationFrame(cb),
          cancel: (handle) => window.cancelAnimationFrame(handle),
        },
        onError: (error) => reportError(error),
        isHidden: () => document.hidden,
      });
    } catch (error: unknown) {
      // Boot failure: report once, skip the game, keep mirroring host state.
      reportError(error);
      game = null;
      host = null;
    }
  }

  layout(canvas);

  // Fires on panel resize and on zoom (devicePixelRatio change).
  const onResize = (): void => {
    try {
      layout(canvas);
    } catch (error: unknown) {
      reportError(error);
    }
  };
  const feed = new SceneFeed(mirror, game, () => saver.markLoaded());
  const onMessage = (event: MessageEvent<unknown>): void => {
    try {
      handleHostMessage(event.data, feed);
    } catch (error: unknown) {
      reportError(error);
    }
  };
  const onVisibility = (): void => {
    try {
      host?.setHidden(document.hidden);
    } catch (error: unknown) {
      reportError(error);
    }
  };
  const onPageHide = (): void => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibility);
    try {
      saver.flush();
      saver.dispose();
      host?.stop();
      game?.dispose();
    } catch (error: unknown) {
      reportError(error);
    }
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);
  // Listener before `ready`, so the host's answer cannot be missed.
  window.addEventListener('message', onMessage);
  host?.start();

  // Sent on every boot, never deferred or skipped: it is also the host-observable signal that
  // this script ran (M2 plan section 1.2).
  channel = createHostChannel(acquireVsCodeApi());
  channel.send({ type: 'ready' });
}

// The script tag is the last element in <body>, so the canvas already exists.
try {
  boot();
} catch (error: unknown) {
  reportError(error);
}
