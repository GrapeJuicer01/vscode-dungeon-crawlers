// Row-level frame helpers for hand-drawn enemy art (batch E3). Owned by the pixel-artist.
// A frame is an array of equal-length strings (palette characters, `.` transparent). These pure
// functions derive animation frames from one hand-drawn base frame: lean a band of rows, squash or
// stretch, lift, and overlay small patches. Everything runs once at module load and keeps the
// frame dimensions unchanged.

import { draft, finish, put } from './enemyBuilder';

export type Rows = readonly string[];

function blank(w: number): string {
  return '.'.repeat(w);
}

/** Shifts rows y0..y1 (inclusive) horizontally by dx (negative = left); vacated cells are transparent. */
export function shiftRows(rows: Rows, y0: number, y1: number, dx: number): string[] {
  return rows.map((r, y) => {
    if (y < y0 || y > y1 || dx === 0) return r;
    const w = r.length;
    if (dx < 0) return r.slice(-dx) + '.'.repeat(-dx);
    return '.'.repeat(dx) + r.slice(0, w - dx);
  });
}

/** Moves the whole picture up by dy (negative = down); vacated rows are transparent. */
export function lift(rows: Rows, dy: number): string[] {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  return rows.map((_, y) => rows[y + dy] ?? blank(w)).slice(0, h);
}

/** Removes n rows at `at` and pads the top, so the feet stay put and the body is n rows shorter. */
export function squash(rows: Rows, at: number, n = 1): string[] {
  const w = rows[0]?.length ?? 0;
  const out = rows.filter((_, y) => y < at || y >= at + n);
  return [...Array.from({ length: n }, () => blank(w)), ...out];
}

/** Repeats the row at `at` n times and drops n rows from the top (which must be transparent). */
export function stretch(rows: Rows, at: number, n = 1): string[] {
  const out = [...rows.slice(0, at + 1)];
  for (let i = 0; i < n; i++) out.push(rows[at] ?? '');
  out.push(...rows.slice(at + 1));
  return out.slice(n);
}

/** Overlays `patch` at (x, y). `.` in the patch leaves the picture unchanged, `,` clears a pixel. */
export function patch(rows: Rows, x: number, y: number, p: Rows): string[] {
  const out = rows.map((r) => [...r]);
  p.forEach((line, dy) => {
    const row = out[y + dy];
    if (!row) return;
    for (let dx = 0; dx < line.length; dx++) {
      const ch = line.charAt(dx);
      if (ch === '.' || x + dx < 0 || x + dx >= row.length) continue;
      row[x + dx] = ch === ',' ? '.' : ch;
    }
  });
  return out.map((r) => r.join(''));
}

/** Replaces character `from` with `to` over the whole frame (or the rows y0..y1). */
export function recolorRows(rows: Rows, from: string, to: string, y0 = 0, y1 = 1e9): string[] {
  return rows.map((r, y) => (y >= y0 && y <= y1 ? r.split(from).join(to) : r));
}

/** Throws when rows are not all the same length (module-load guard so art mistakes surface in tests). */
export function checked(rows: Rows, w: number, h: number): string[] {
  if (rows.length !== h || rows.some((r) => r.length !== w)) {
    throw new RangeError('frame has the wrong size');
  }
  return [...rows];
}

/** Draws a fill-only picture (no outline) and returns it with the 1 px outline `1` added. */
export function fromFill(fill: Rows, outline = '1'): string[] {
  const d = draft(fill[0]?.length ?? 0, fill.length);
  put(d, fill);
  return finish(d, outline);
}
