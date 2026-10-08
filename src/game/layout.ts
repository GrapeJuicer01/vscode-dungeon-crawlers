// Fixed room geometry (ADR 0010, docs/architecture/game-engine.md section 3) and the slot
// formulas for formation (working) and seats (idle). Pure; no state.

export const INTERNAL_WIDTH = 320;
export const INTERNAL_HEIGHT = 180;
export const TILE = 16;
export const WALL_ROWS = 8;
export const FLOOR_ROWS = 2;
export const WALL_Y = 0;
export const FLOOR_Y = 128;
export const FOREGROUND_Y = 160;
export const ALCOVE_WIDTH = 128;
export const DOOR_X = 128;
export const CORRIDOR_X = 144;
export const CORRIDOR_SEGMENT_PX = 384;
export const FOOT_Y_MIN = 140;
export const FOOT_Y_MAX = 158;

/** Where the campfire stands: x centre and foot y (alcove). */
export const CAMPFIRE_X = 64;
export const CAMPFIRE_FOOT_Y = 152;

/** Navigation grid over the floor band: 8 px cells, 40 columns by 4 rows. */
export const NAV_CELL_PX = 8;
export const NAV_COLS = INTERNAL_WIDTH / NAV_CELL_PX;
export const NAV_ROWS = 4;

/** Slots beyond this share positions with an offset (decision H4-7). */
export const VISIBLE_SLOTS = 32;

export interface Point {
  x: number;
  y: number;
}

/**
 * The largest integer device-pixel scale that fits the view, never below 1, so every game pixel
 * maps to a whole number of screen pixels. Non-finite inputs give 1.
 */
export function computeIntegerScale(
  viewWidth: number,
  viewHeight: number,
  devicePixelRatio: number,
): number {
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const fit = Math.min((viewWidth * dpr) / INTERNAL_WIDTH, (viewHeight * dpr) / INTERNAL_HEIGHT);
  return Number.isFinite(fit) ? Math.max(1, Math.floor(fit)) : 1;
}

/** Slot position for a working hero in the corridor. Writes into `out`. */
export function formationPosition(slot: number, out: Point): void {
  const i = slot % VISIBLE_SLOTS;
  const wrap = Math.floor(slot / VISIBLE_SLOTS);
  const col = i % 8;
  const row = Math.floor(i / 8) % 4;
  out.x = 168 + col * 18 + (row % 2) * 9 + wrap * 6;
  out.y = 156 - row * 5;
}

/** Slot position for a resting hero around the campfire. Writes into `out`. */
export function seatPosition(slot: number, out: Point): void {
  const i = slot % VISIBLE_SLOTS;
  const wrap = Math.floor(slot / VISIBLE_SLOTS);
  const side = i % 2 === 0 ? -1 : 1;
  const ring = Math.floor((i % 8) / 2);
  const row = Math.floor(i / 8) % 4;
  out.x = CAMPFIRE_X + side * (16 + ring * 12) + (row % 2) * 6 * side + wrap * 6;
  out.y = 156 - row * 5;
}

/** Where a spawned hero appears and waits: just inside the door, slightly spread by slot. */
export function entrancePosition(slot: number, out: Point): void {
  out.x = DOOR_X + TILE / 2;
  out.y = 146 + (slot % 3) * 4;
}
