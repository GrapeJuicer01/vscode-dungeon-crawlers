// Minimal DOM types for the node-side tests. tsconfig.tools.json has no DOM lib, but the canvas
// adapter (src/webview/canvasSurface.ts) is imported by test/webview/canvasSurface.test.ts. Only
// the members the adapter uses are declared; the webview project uses the real lib.dom types.
interface CanvasRenderingContext2D {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  drawImage(image: HTMLCanvasElement, dx: number, dy: number): void;
  drawImage(
    image: HTMLCanvasElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  putImageData(image: ImageData, x: number, y: number): void;
}

interface HTMLCanvasElement {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}

declare class ImageData {
  constructor(data: Uint8ClampedArray, width: number, height: number);
}
