// The two ports that keep src/game/** DOM-free (ADR 0008): a Surface to draw on and a
// BitmapFactory to make bitmaps. The webview adapter (src/webview/canvasSurface.ts) implements
// them over canvas 2D; tests implement them with recording fakes.

/** An opaque, immutable image handle created by a BitmapFactory. */
export interface Bitmap {
  readonly width: number;
  readonly height: number;
}

export type Composite = 'source-over' | 'multiply' | 'lighter';

export interface Surface {
  readonly width: number;
  readonly height: number;
  clear(color: string): void;
  fillRect(color: string, x: number, y: number, w: number, h: number): void;
  /** Draws the bitmap with its top-left at (dx, dy); flipX mirrors it inside its own box. */
  drawBitmap(bitmap: Bitmap, dx: number, dy: number, flipX: boolean): void;
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
  ): void;
  /** 'source-over' is the default; callers restore it after changing it. */
  setComposite(op: Composite): void;
  /** 0..1; callers restore 1. */
  setAlpha(alpha: number): void;
}

export interface OffscreenSurface extends Surface {
  readonly bitmap: Bitmap;
}

export interface BitmapFactory {
  fromRgba(width: number, height: number, rgba: Uint8ClampedArray): Bitmap;
  createOffscreen(width: number, height: number): OffscreenSurface;
}

export type ErrorScope = 'boot' | 'step' | 'update' | 'render' | 'draw' | 'host';
/** Receives every caught error. The webview wires this to its single crash reporter. */
export type ErrorSink = (error: unknown, scope: ErrorScope) => void;
