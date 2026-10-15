// Axis-aligned boxes. M4 uses them to build the navigation grid and test zones; the spatial
// hash for hits arrives with Combat in E1.

export interface Aabb {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** True when the interiors intersect (touching edges do not overlap). */
export function overlaps(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Left and top edges are inside; right and bottom edges are outside. */
export function containsPoint(box: Aabb, x: number, y: number): boolean {
  return x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
}
