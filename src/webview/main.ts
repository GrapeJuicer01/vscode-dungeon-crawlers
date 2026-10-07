// Pixel Agents webview entry point. Sizes and clears a blank canvas and keeps it integer-scaled
// (M1), then opens the host channel and sends `ready` on every document load (M2, ADR 0007).
// Host state is mirrored but not drawn until M4. No animation loop yet (M4), so it costs no CPU
// while shown. The canvas constants move to Renderer in M4.
import { createHostChannel } from './hostChannel';
import type { VsCodeWebviewApi } from './hostChannel';
import { handleHostMessage } from './hostMessages';
import { HostStateMirror } from './hostState';

/** Injected by VS Code into the webview; may be called only once per document. */
declare function acquireVsCodeApi(): VsCodeWebviewApi;

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 180;
/** Assumption: a fixed near-black until the master palette replaces it in M4. */
const CLEAR_COLOR = '#14101c';

/**
 * Scales the canvas by the largest integer factor (in device pixels) that fits the view,
 * never below 1, so every game pixel maps to a whole number of screen pixels.
 */
function layout(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(
        (window.innerWidth * dpr) / INTERNAL_WIDTH,
        (window.innerHeight * dpr) / INTERNAL_HEIGHT,
      ),
    ),
  );
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
  if (ctx !== null) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = CLEAR_COLOR;
    ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
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
  // Mirrors whatever the host sends; rebuilt from the host snapshot on every load (invariant 4).
  const mirror = new HostStateMirror();
  const onMessage = (event: MessageEvent<unknown>): void => {
    try {
      handleHostMessage(event.data, mirror);
    } catch (error: unknown) {
      reportError(error);
    }
  };
  const onPageHide = (): void => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('pagehide', onPageHide);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', onPageHide);
  // Listener before `ready`, so the host's answer cannot be missed.
  window.addEventListener('message', onMessage);

  // Sent on every boot, never deferred or skipped: it is also the host-observable signal that
  // this script ran (M2 plan section 1.2).
  const channel = createHostChannel(acquireVsCodeApi());
  channel.send({ type: 'ready' });
}

// The script tag is the last element in <body>, so the canvas already exists.
try {
  boot();
} catch (error: unknown) {
  reportError(error);
}
