// Grid A* for hero travel. All scratch memory is allocated with the grid (typed arrays), so
// findPath allocates nothing per call. An unreachable goal returns 0: callers keep the hero where
// it is (never an error, never a removal; docs/architecture/game-engine.md section 12).
import type { Aabb } from './Collision';

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellPx: number;
  readonly originX: number;
  readonly originY: number;
  readonly blocked: Uint8Array;
  // Search scratch, reused by every findPath call on this grid.
  readonly gCost: Float32Array;
  readonly parent: Int32Array;
  readonly stamp: Uint32Array;
  readonly closed: Uint32Array;
  readonly heap: Int32Array;
  readonly heapPos: Int32Array;
  readonly fCost: Float32Array;
  searchId = 0;

  constructor(cols: number, rows: number, cellPx: number, originX: number, originY: number) {
    this.cols = cols;
    this.rows = rows;
    this.cellPx = cellPx;
    this.originX = originX;
    this.originY = originY;
    const n = cols * rows;
    this.blocked = new Uint8Array(n);
    this.gCost = new Float32Array(n);
    this.fCost = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n);
    this.heapPos = new Int32Array(n);
  }

  /** Marks every cell whose area intersects the box. */
  block(box: Aabb): void {
    const c0 = Math.floor((box.x - this.originX) / this.cellPx);
    const c1 = Math.floor((box.x + box.w - 1 - this.originX) / this.cellPx);
    const r0 = Math.floor((box.y - this.originY) / this.cellPx);
    const r1 = Math.floor((box.y + box.h - 1 - this.originY) / this.cellPx);
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  isBlocked(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
      return true;
    }
    return this.blocked[row * this.cols + col] === 1;
  }

  /** Cell index containing the point, or -1 outside the grid. */
  cellAt(x: number, y: number): number {
    const c = Math.floor((x - this.originX) / this.cellPx);
    const r = Math.floor((y - this.originY) / this.cellPx);
    if (!(c >= 0 && r >= 0 && c < this.cols && r < this.rows)) {
      return -1;
    }
    return r * this.cols + c;
  }

  cellCenterX(index: number): number {
    return this.originX + (index % this.cols) * this.cellPx + this.cellPx / 2;
  }

  cellCenterY(index: number): number {
    return this.originY + Math.floor(index / this.cols) * this.cellPx + this.cellPx / 2;
  }
}

/** A reusable path: waypoints (cell centres) in xs/ys, valid up to `length`. */
export class PathBuffer {
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  length = 0;

  constructor(capacity: number) {
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
  }
}

const SQRT2_MINUS_1 = Math.SQRT2 - 1;

function octile(dc: number, dr: number): number {
  const a = Math.abs(dc);
  const b = Math.abs(dr);
  return Math.max(a, b) + SQRT2_MINUS_1 * Math.min(a, b);
}

function heapSwap(grid: NavGrid, i: number, j: number): void {
  const a = grid.heap[i] ?? 0;
  const b = grid.heap[j] ?? 0;
  grid.heap[i] = b;
  grid.heap[j] = a;
  grid.heapPos[b] = i;
  grid.heapPos[a] = j;
}

function siftUp(grid: NavGrid, start: number): void {
  let i = start;
  while (i > 0) {
    const p = (i - 1) >> 1;
    const cur = grid.heap[i] ?? 0;
    const par = grid.heap[p] ?? 0;
    if ((grid.fCost[cur] ?? 0) < (grid.fCost[par] ?? 0)) {
      heapSwap(grid, i, p);
      i = p;
    } else {
      break;
    }
  }
}

function siftDown(grid: NavGrid, size: number, start: number): void {
  let i = start;
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let best = i;
    if (
      l < size &&
      (grid.fCost[grid.heap[l] ?? 0] ?? 0) < (grid.fCost[grid.heap[best] ?? 0] ?? 0)
    ) {
      best = l;
    }
    if (
      r < size &&
      (grid.fCost[grid.heap[r] ?? 0] ?? 0) < (grid.fCost[grid.heap[best] ?? 0] ?? 0)
    ) {
      best = r;
    }
    if (best === i) {
      return;
    }
    heapSwap(grid, i, best);
    i = best;
  }
}

/**
 * A*, octile cost, 8 neighbours, no corner cutting. Writes cell centres from just after the start
 * cell through the goal cell into `out` and returns the count. If start and goal share a cell the
 * result is that one cell. Returns 0 when the goal is blocked or outside the grid, unreachable,
 * or the path does not fit in `out`. A start inside a blocked cell is allowed (it may leave).
 */
export function findPath(
  grid: NavGrid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  out: PathBuffer,
): number {
  out.length = 0;
  const start = grid.cellAt(fromX, fromY);
  const goal = grid.cellAt(toX, toY);
  if (start < 0 || goal < 0 || grid.blocked[goal] === 1) {
    return 0;
  }
  if (start === goal) {
    if (out.xs.length < 1) {
      return 0;
    }
    out.xs[0] = grid.cellCenterX(goal);
    out.ys[0] = grid.cellCenterY(goal);
    out.length = 1;
    return 1;
  }

  grid.searchId = (grid.searchId + 1) >>> 0;
  if (grid.searchId === 0) {
    grid.stamp.fill(0);
    grid.closed.fill(0);
    grid.searchId = 1;
  }
  const id = grid.searchId;
  const cols = grid.cols;
  const rows = grid.rows;
  const goalC = goal % cols;
  const goalR = Math.floor(goal / cols);

  let size: number;
  grid.stamp[start] = id;
  grid.gCost[start] = 0;
  grid.parent[start] = -1;
  grid.fCost[start] = octile(goalC - (start % cols), goalR - Math.floor(start / cols));
  grid.heap[0] = start;
  grid.heapPos[start] = 0;
  size = 1;

  let found = false;
  while (size > 0) {
    const cur: number = grid.heap[0] ?? 0;
    size--;
    if (size > 0) {
      const last = grid.heap[size] ?? 0;
      grid.heap[0] = last;
      grid.heapPos[last] = 0;
      siftDown(grid, size, 0);
    }
    grid.closed[cur] = id;
    if (cur === goal) {
      found = true;
      break;
    }
    const c: number = cur % cols;
    const r = Math.floor(cur / cols);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) {
          continue;
        }
        const nc: number = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) {
          continue;
        }
        const n = nr * cols + nc;
        if (grid.blocked[n] === 1 || grid.closed[n] === id) {
          continue;
        }
        if (dc !== 0 && dr !== 0) {
          // No corner cutting: both orthogonal neighbours must be free.
          if (grid.isBlocked(c + dc, r) || grid.isBlocked(c, r + dr)) {
            continue;
          }
        }
        const g = (grid.gCost[cur] ?? 0) + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1);
        const seen = grid.stamp[n] === id;
        if (seen && g >= (grid.gCost[n] ?? 0)) {
          continue;
        }
        grid.stamp[n] = id;
        grid.gCost[n] = g;
        grid.parent[n] = cur;
        grid.fCost[n] = g + octile(goalC - nc, goalR - nr);
        if (seen) {
          siftUp(grid, grid.heapPos[n] ?? 0);
        } else {
          grid.heap[size] = n;
          grid.heapPos[n] = size;
          size++;
          siftUp(grid, size - 1);
        }
      }
    }
  }
  if (!found) {
    return 0;
  }

  // Count the cells from the goal back to (not including) the start.
  let count = 0;
  for (let n = goal; n !== start; n = grid.parent[n] ?? start) {
    count++;
  }
  if (count > out.xs.length) {
    return 0;
  }
  let i = count - 1;
  for (let n = goal; n !== start; n = grid.parent[n] ?? start) {
    out.xs[i] = grid.cellCenterX(n);
    out.ys[i] = grid.cellCenterY(n);
    i--;
  }
  out.length = count;
  return count;
}
