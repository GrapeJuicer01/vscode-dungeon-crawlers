// Grid A* (M4 plan test note 2, game-engine section 12).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NavGrid, PathBuffer, findPath } from '../../src/game/Pathfinding';
import { STAGES } from '../../src/game/data/stages';
import {
  NAV_CELL_PX,
  NAV_COLS,
  NAV_ROWS,
  FLOOR_Y,
  VISIBLE_SLOTS,
  entrancePosition,
  formationPosition,
  seatPosition,
} from '../../src/game/layout';
import type { Point } from '../../src/game/layout';
import { buildStage } from '../../src/game/Stage';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { FakeBitmaps } from '../support/engineFakes';

/** A grid of `cols` x `rows` 8 px cells at the origin. */
function grid(cols: number, rows: number): NavGrid {
  return new NavGrid(cols, rows, 8, 0, 0);
}

/** Centre of a cell. */
function cx(col: number): number {
  return col * 8 + 4;
}

function cells(out: PathBuffer): [number, number][] {
  return Array.from({ length: out.length }, (_, i) => [
    Math.floor((out.xs[i] ?? 0) / 8),
    Math.floor((out.ys[i] ?? 0) / 8),
  ]);
}

void describe('findPath', () => {
  void it('returns the cells after the start through the goal in a straight line', () => {
    const g = grid(10, 3);
    const out = new PathBuffer(64);
    const count = findPath(g, cx(0), cx(1), cx(5), cx(1), out);
    assert.equal(count, 5);
    assert.equal(out.length, 5);
    assert.deepEqual(cells(out), [
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
    ]);
    assert.equal(out.xs[0], cx(1), 'cell centres, start cell excluded');
    assert.equal(out.xs[4], cx(5), 'goal cell included');
  });

  void it('returns the single goal cell when start and goal share a cell', () => {
    const g = grid(10, 3);
    const out = new PathBuffer(8);
    assert.equal(findPath(g, 9, 9, 12, 14, out), 1);
    assert.deepEqual(cells(out), [[1, 1]]);
  });

  void it('moves diagonally where open (octile cost)', () => {
    const g = grid(10, 10);
    const out = new PathBuffer(64);
    assert.equal(findPath(g, cx(0), cx(0), cx(4), cx(4), out), 4);
    assert.deepEqual(cells(out), [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
  });

  void it('routes around an obstacle (40x4 grid, a blocked two-cell column)', () => {
    const g = new NavGrid(40, 4, 8, 0, 0);
    g.block({ x: 20 * 8, y: 1 * 8, w: 8, h: 16 });
    assert.equal(g.isBlocked(20, 1), true);
    assert.equal(g.isBlocked(20, 2), true);
    const out = new PathBuffer(128);
    const count = findPath(g, cx(2), cx(1), cx(30), cx(1), out);
    // Octile cost: the diagonal detour around the column costs no extra steps.
    assert.equal(count, 28);
    for (const [c, r] of cells(out)) {
      assert.equal(g.isBlocked(c, r), false, `walks through blocked cell ${c},${r}`);
    }
    const crossing = cells(out).find(([c]) => c === 20);
    assert.ok(
      crossing && (crossing[1] === 0 || crossing[1] === 3),
      'passes the column through an open row',
    );
    assert.deepEqual(cells(out).at(-1), [30, 1]);
  });

  void it('never cuts a corner between two blocked orthogonal neighbours', () => {
    const g = grid(4, 4);
    g.block({ x: 8, y: 0, w: 8, h: 8 }); // cell (1,0)
    g.block({ x: 0, y: 8, w: 8, h: 8 }); // cell (0,1)
    const out = new PathBuffer(32);
    // (0,0) -> (1,1) is a diagonal squeeze between the two blocks.
    assert.equal(findPath(g, cx(0), cx(0), cx(1), cx(1), out), 0);
  });

  void it('does not cut a corner past a single blocked neighbour either', () => {
    const g = grid(4, 4);
    g.block({ x: 8, y: 0, w: 8, h: 8 }); // cell (1,0)
    const out = new PathBuffer(32);
    const count = findPath(g, cx(0), cx(0), cx(1), cx(1), out);
    assert.ok(count >= 2, 'goes (0,1) then (1,1)');
    assert.deepEqual(cells(out)[0], [0, 1]);
  });

  void it('returns 0 for an enclosed goal', () => {
    const g = grid(10, 10);
    for (const [c, r] of [
      [4, 4],
      [5, 4],
      [6, 4],
      [4, 5],
      [6, 5],
      [4, 6],
      [5, 6],
      [6, 6],
    ] as const) {
      g.block({ x: c * 8, y: r * 8, w: 8, h: 8 });
    }
    assert.equal(findPath(g, cx(0), cx(0), cx(5), cx(5), new PathBuffer(64)), 0);
  });

  void it('returns 0 for a blocked goal, and for a goal or start outside the grid', () => {
    const g = grid(10, 3);
    g.block({ x: 40, y: 8, w: 8, h: 8 });
    const out = new PathBuffer(32);
    assert.equal(findPath(g, cx(0), cx(1), cx(5), cx(1), out), 0);
    assert.equal(out.length, 0);
    assert.equal(findPath(g, cx(0), cx(1), 500, 4, out), 0);
    assert.equal(findPath(g, -5, 4, cx(2), cx(1), out), 0);
    assert.equal(findPath(g, NaN, 4, cx(2), cx(1), out), 0);
  });

  void it('allows a start inside a blocked cell (the hero may leave it)', () => {
    const g = grid(10, 3);
    g.block({ x: 0, y: 8, w: 8, h: 8 });
    const out = new PathBuffer(32);
    const count = findPath(g, cx(0), cx(1), cx(3), cx(1), out);
    assert.equal(count, 3);
  });

  void it('returns 0 when the path does not fit the buffer, and writes within capacity', () => {
    const g = grid(40, 3);
    const out = new PathBuffer(5);
    assert.equal(findPath(g, cx(0), cx(1), cx(30), cx(1), out), 0);
    assert.equal(out.length, 0);
    assert.equal(findPath(g, cx(0), cx(1), cx(5), cx(1), out), 5, 'exactly capacity fits');
    const tiny = new PathBuffer(0);
    assert.equal(findPath(g, 9, 9, 12, 14, tiny), 0);
  });

  void it('allocates nothing across repeated calls: scratch arrays keep their identity', () => {
    const g = new NavGrid(40, 4, 8, 0, 0);
    const scratch = [g.gCost, g.fCost, g.parent, g.stamp, g.closed, g.heap, g.heapPos, g.blocked];
    const out = new PathBuffer(128);
    const xs = out.xs;
    const ys = out.ys;
    for (let i = 0; i < 500; i++) {
      findPath(g, cx(i % 5), cx(i % 3), cx(30 + (i % 8)), cx(1), out);
    }
    assert.deepEqual(
      [g.gCost, g.fCost, g.parent, g.stamp, g.closed, g.heap, g.heapPos, g.blocked].map(
        (a, i) => a === scratch[i],
      ),
      scratch.map(() => true),
    );
    assert.equal(out.xs, xs);
    assert.equal(out.ys, ys);
  });

  void it('gives equal results on repeated calls (the search stamp does not leak state)', () => {
    const g = new NavGrid(40, 4, 8, 0, 0);
    g.block({ x: 160, y: 8, w: 8, h: 16 });
    const a = new PathBuffer(128);
    const b = new PathBuffer(128);
    findPath(g, cx(2), cx(1), cx(30), cx(1), a);
    findPath(g, cx(25), cx(3), cx(4), cx(0), b);
    const again = new PathBuffer(128);
    findPath(g, cx(2), cx(1), cx(30), cx(1), again);
    assert.deepEqual(cells(again), cells(a));
  });
});

void describe('NavGrid', () => {
  void it('cellAt returns an index or -1 outside the grid (including NaN)', () => {
    const g = new NavGrid(4, 3, 8, 16, 100);
    assert.equal(g.cellAt(16, 100), 0);
    assert.equal(g.cellAt(16 + 31, 100 + 23), 11);
    assert.equal(g.cellAt(15, 100), -1);
    assert.equal(g.cellAt(16 + 32, 100), -1);
    assert.equal(g.cellAt(16, 100 + 24), -1);
    assert.equal(g.cellAt(NaN, 100), -1);
  });

  void it('block marks every intersected cell and clips to the grid', () => {
    const g = new NavGrid(4, 3, 8, 0, 0);
    g.block({ x: 6, y: 6, w: 4, h: 4 });
    assert.deepEqual(
      [
        g.isBlocked(0, 0),
        g.isBlocked(1, 0),
        g.isBlocked(0, 1),
        g.isBlocked(1, 1),
        g.isBlocked(2, 2),
      ],
      [true, true, true, true, false],
    );
    assert.doesNotThrow(() => g.block({ x: -100, y: -100, w: 1000, h: 1000 }));
    assert.equal(g.isBlocked(3, 2), true);
    assert.equal(g.isBlocked(-1, 0), true, 'outside counts as blocked');
    assert.equal(g.isBlocked(0, 3), true);
  });
});

void describe('Stage 1 connectivity', () => {
  const bitmaps = new FakeBitmaps();
  bitmaps.recordOffscreen = false;
  const def = STAGES[0];
  assert.ok(def);
  const stage = buildStage(def, SHIPPED_ART, new SpriteCache(bitmaps, SHIPPED_ART), bitmaps);

  void it('uses the documented nav grid over the floor band', () => {
    assert.equal(stage.nav.cols, NAV_COLS);
    assert.equal(stage.nav.rows, NAV_ROWS);
    assert.equal(stage.nav.cellPx, NAV_CELL_PX);
    assert.equal(stage.nav.originY, FLOOR_Y);
  });

  void it('every seat and formation cell is open and reachable from the door', () => {
    const door: Point = { x: 0, y: 0 };
    entrancePosition(0, door);
    const out = new PathBuffer(NAV_COLS * NAV_ROWS);
    const slot: Point = { x: 0, y: 0 };
    for (const place of [seatPosition, formationPosition]) {
      for (let i = 0; i < VISIBLE_SLOTS; i++) {
        place(i, slot);
        const cell = stage.nav.cellAt(slot.x, slot.y);
        assert.ok(cell >= 0 && stage.nav.blocked[cell] === 0, `slot ${i} blocked`);
        assert.ok(findPath(stage.nav, door.x, door.y, slot.x, slot.y, out) > 0, `slot ${i}`);
      }
    }
  });

  void it('the campfire pit blocks the cells in front of the logs', () => {
    const pit = stage.nav.cellAt(64, 148);
    assert.ok(pit >= 0);
    assert.equal(stage.nav.blocked[pit], 1);
  });
});
