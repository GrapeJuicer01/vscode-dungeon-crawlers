// Pixel Agents webview entry point. M1: sizes and clears a blank canvas and keeps it
// integer-scaled. No messaging (M2) and no animation loop (M4), so it costs no CPU while shown.
// These constants move to Renderer in M4.

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

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
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
  const onPageHide = (): void => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', onPageHide);
}

// The script tag is the last element in <body>, so the canvas already exists.
try {
  boot();
} catch (error: unknown) {
  reportError(error);
}
