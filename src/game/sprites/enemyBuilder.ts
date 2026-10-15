// Small pure helpers for authoring enemy frames (batch E1). Owned by the pixel-artist.
// An enemy frame is drawn as FILL ONLY into a Grid (no outline), then `finish` adds the 1 px
// outline in the stage's `1` character and any "loose" pixels (thin legs, threads) that must not
// be outlined. Everything runs once at module load; the exported value is plain string rows.

import { Grid } from './spriteBuilder';
import type { Px } from './spriteBuilder';
import type { SpriteTemplate } from './spriteTypes';

/** A fill-only frame: a Grid plus pixels added after the outline. */
export interface Draft {
  readonly g: Grid;
  readonly loose: Px[];
}

export function draft(w: number, h: number): Draft {
  return { g: new Grid(w, h), loose: [] };
}

/** Draws `rows` (fill only) at (x, y). `.` leaves the destination untouched. */
export function put(d: Draft, rows: readonly string[], x = 0, y = 0): Draft {
  d.g.blit(rows, x, y);
  return d;
}

/** Plots pixels `[x, y, ch]` into the fill (they will be outlined). */
export function dots(d: Draft, pixels: readonly Px[]): Draft {
  d.g.plot(pixels);
  return d;
}

/** Plots a polyline of points with `ch`, after the outline (not outlined). */
export function looseLine(
  d: Draft,
  pts: readonly (readonly [number, number])[],
  ch: string,
): Draft {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    d.loose.push([p[0], p[1], ch]);
    const q = pts[i + 1];
    if (q) {
      const t = new Grid(40, 40);
      t.line(p[0], p[1], q[0], q[1], ch);
      for (let yy = 0; yy < 40; yy++)
        for (let xx = 0; xx < 40; xx++) if (t.get(xx, yy) !== '.') d.loose.push([xx, yy, ch]);
    }
  }
  return d;
}

/** Fills a closed polygon (pixel centres inside, even-odd rule) with `ch`. */
export function poly(d: Draft, pts: readonly (readonly [number, number])[], ch: string): Draft {
  for (let y = 0; y < d.g.h; y++) {
    for (let x = 0; x < d.g.w; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (!a || !b) continue;
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
          inside = !inside;
        }
      }
      if (inside) d.g.set(x, y, ch);
    }
  }
  return d;
}

/** Fills an axis-aligned ellipse (pixel centres inside) with `ch`. */
export function ellipse(
  d: Draft,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ch: string,
): Draft {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / (rx + 0.5);
      const ny = (y - cy) / (ry + 0.5);
      if (nx * nx + ny * ny <= 1) d.g.set(x, y, ch);
    }
  }
  return d;
}

/** Draws a polyline with a square brush of `size` px (fill, outlined later). */
export function stroke(
  d: Draft,
  pts: readonly (readonly [number, number])[],
  ch: string,
  size = 1,
): Draft {
  const t = new Grid(d.g.w, d.g.h);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a && b) t.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), ch);
  }
  for (let y = 0; y < d.g.h; y++) {
    for (let x = 0; x < d.g.w; x++) {
      if (t.get(x, y) === '.') continue;
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) d.g.set(x + dx, y + dy, ch);
    }
  }
  return d;
}

/** Plots loose pixels after the outline. */
export function looseDots(d: Draft, pixels: readonly Px[]): Draft {
  d.loose.push(...pixels);
  return d;
}

/** Adds the outline (`1` by default) around the fill, then the loose pixels. */
export function finish(d: Draft, outline = '1'): string[] {
  d.g.outline(outline);
  d.g.plot(d.loose);
  return d.g.rows();
}

/** Builds a template `enemies/<id>` from animation name -> frames. */
export function enemyTemplate(
  id: string,
  w: number,
  h: number,
  anchor: { x: number; y: number },
  animations: Record<string, string[][]>,
): SpriteTemplate {
  return { id: `enemies/${id}`, w, h, anchor, animations };
}
