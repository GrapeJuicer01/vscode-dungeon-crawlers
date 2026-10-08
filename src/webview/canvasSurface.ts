// The only file besides main.ts that touches the canvas (ADR 0008): a Surface and BitmapFactory
// over CanvasRenderingContext2D. Bitmaps are made with ImageData and putImageData, never blob or
// data URLs, so the CSP stays `default-src 'none'`.
import type { Bitmap, BitmapFactory, Composite, OffscreenSurface, Surface } from '../game/ports';

/** A bitmap backed by a canvas. */
class CanvasBitmap implements Bitmap {
  readonly width: number;
  readonly height: number;
  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
  }
}

function source(bitmap: Bitmap): HTMLCanvasElement {
  if (!(bitmap instanceof CanvasBitmap)) {
    throw new TypeError('Unsupported bitmap');
  }
  return bitmap.canvas;
}

/** A Surface over a 2D context. Smoothing stays off for crisp pixels. */
export function createCanvasSurface(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Surface {
  ctx.imageSmoothingEnabled = false;
  let lastFill = '';
  return {
    width: canvas.width,
    height: canvas.height,
    clear(color: string): void {
      ctx.fillStyle = color;
      lastFill = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
    fillRect(color: string, x: number, y: number, w: number, h: number): void {
      if (color !== lastFill) {
        ctx.fillStyle = color;
        lastFill = color;
      }
      ctx.fillRect(x, y, w, h);
    },
    drawBitmap(bitmap: Bitmap, dx: number, dy: number, flipX: boolean): void {
      const image = source(bitmap);
      if (flipX) {
        // Mirror inside the bitmap's own box: x' = (dx + width) - x.
        ctx.setTransform(-1, 0, 0, 1, dx + bitmap.width, 0);
        ctx.drawImage(image, 0, dy);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.drawImage(image, dx, dy);
      }
    },
    drawBitmapRegion(
      bitmap: Bitmap,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void {
      ctx.drawImage(source(bitmap), sx, sy, sw, sh, dx, dy, dw, dh);
    },
    setComposite(op: Composite): void {
      ctx.globalCompositeOperation = op;
    },
    setAlpha(alpha: number): void {
      ctx.globalAlpha = alpha;
    },
  };
}

/** Makes bitmaps from RGBA and offscreen drawing surfaces. `createCanvas` is injected. */
export function createCanvasBitmaps(createCanvas: () => HTMLCanvasElement): BitmapFactory {
  return {
    fromRgba(width: number, height: number, rgba: Uint8ClampedArray): Bitmap {
      const canvas = createCanvas();
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        throw new Error('2D canvas is unavailable');
      }
      // ImageData needs a plain ArrayBuffer-backed array; copy so shared buffers are never used.
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      return new CanvasBitmap(canvas);
    },
    createOffscreen(width: number, height: number): OffscreenSurface {
      const canvas = createCanvas();
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        throw new Error('2D canvas is unavailable');
      }
      const surface = createCanvasSurface(canvas, ctx);
      return Object.assign(surface, { bitmap: new CanvasBitmap(canvas) });
    },
  };
}
