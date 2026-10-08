// Small pure helpers that build palette-character maps at module load. The output is always plain
// string rows, exactly the format in docs/design/sprite-spec.md; nothing here runs per frame.
// Owned by the pixel-artist.

import type { SpriteTemplate } from './spriteTypes';

/** A mutable character grid. '.' is transparent. Out-of-range writes are ignored. */
export class Grid {
  private readonly cells: string[];

  constructor(
    readonly w: number,
    readonly h: number,
    fill = '.',
  ) {
    this.cells = new Array<string>(w * h).fill(fill);
  }

  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.cells[y * this.w + x] ?? '.';
  }

  set(x: number, y: number, ch: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.cells[y * this.w + x] = ch;
  }

  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch);
  }

  /** Draws rows at (x, y); '.' in the source leaves the destination untouched. */
  blit(rows: readonly string[], x: number, y: number): void {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row.charAt(dx);
        if (ch !== '.') this.set(x + dx, y + dy, ch);
      }
    });
  }

  /** Plots a list of [x, y, char] pixels. */
  plot(pixels: readonly Px[]): void {
    for (const [x, y, ch] of pixels) this.set(x, y, ch);
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, ch: string): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, ch);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Adds `ch` to every transparent pixel that touches an opaque pixel (4-neighbourhood). */
  outline(ch: string): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== '.') continue;
        if (
          this.get(x - 1, y) !== '.' ||
          this.get(x + 1, y) !== '.' ||
          this.get(x, y - 1) !== '.' ||
          this.get(x, y + 1) !== '.'
        ) {
          add.push(y * this.w + x);
        }
      }
    }
    for (const i of add) this.cells[i] = ch;
  }

  rows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++)
      out.push(this.cells.slice(y * this.w, (y + 1) * this.w).join(''));
    return out;
  }
}

/** [x, y, palette character] */
export type Px = readonly [number, number, string];

/** Deterministic generator so generated art is identical on every load (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a one-frame `idle` template (the convention for every non-hero sprite). */
export function staticTemplate(
  id: string,
  rows: readonly string[],
  anchor: { x: number; y: number },
): SpriteTemplate {
  const first = rows[0] ?? '';
  return { id, w: first.length, h: rows.length, anchor, animations: { idle: [[...rows]] } };
}

/** Builds a multi-frame `idle` template. */
export function loopTemplate(
  id: string,
  frames: readonly (readonly string[])[],
  anchor: { x: number; y: number },
): SpriteTemplate {
  const first = frames[0]?.[0] ?? '';
  return {
    id,
    w: first.length,
    h: frames[0]?.length ?? 0,
    anchor,
    animations: { idle: frames.map((f) => [...f]) },
  };
}
