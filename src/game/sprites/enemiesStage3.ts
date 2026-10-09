// Stage 3 "Toxic Slime Caverns" regular enemies (batch E2, step A-E2-4). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: green-slime, spore-shroom, toxic-toad, jelly-cube.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row, idle 2 / walk 2 /
// attack 3; no hit or dissolve art (engine flash and dissolve). Characters: the stage's `1` outline
// and `7` plus master accents; at most 12 colors per sprite. The stage rock is dark teal, so the
// enemies use brighter, warmer or more saturated colors. Silhouettes (reworked in E3, step A-E3-0,
// to clear the look-alike policy): slime a tall pear drop with a pointed top and a base rim; shroom
// a very wide cap over a thin stem with tiny feet; toad an upright sitting frog with a raised
// haunch; jelly cube a tall leaning pillar of jelly that melts into a wide puddle skirt.

import { dots, draft, enemyTemplate, finish, put } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { checked, lift, patch, shiftRows, squash } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const ANCHOR = { x: 8, y: 15 };

/** Recolors every fill pixel `from` that satisfies `pred` into `to`. */
function recolor(
  d: Draft,
  from: string,
  to: string,
  pred: (x: number, y: number) => boolean,
): void {
  for (let y = 0; y < d.g.h; y++)
    for (let x = 0; x < d.g.w; x++) if (d.g.get(x, y) === from && pred(x, y)) d.g.set(x, y, to);
}

// ---------------------------------------------------------------- Green Slime (16x16)
// A tall pear-shaped drop: pointed top leaning right, big off-center eyes, a pale highlight, a
// bubble, and a darker rim at the base. Colors: 1 L N w e q = 6.

/** Half-open [x0, x1] fill columns per row of the drop, top to bottom (13 rows). */
const DROP: readonly (readonly [number, number])[] = [
  [9, 9],
  [8, 9],
  [7, 10],
  [6, 10],
  [5, 11],
  [5, 11],
  [4, 12],
  [4, 12],
  [3, 12],
  [3, 13],
  [3, 13],
  [3, 13],
  [4, 11],
];

/** Whole drop shifted right by one column (a lean toward the back; keeps clear of the toad). */
const SHIFT = -1;

interface SlimeShape {
  /** Rows removed from the middle (the drop squashes) and columns added on both sides. */
  readonly cut?: number;
  readonly grow?: number;
  /** Lean of the upper half (positive = toward the back). */
  readonly lean?: number;
  readonly mouth?: boolean;
}

function slimeFrame(s: SlimeShape): string[] {
  const d = draft(W, W);
  const cut = s.cut ?? 0;
  const grow = s.grow ?? 0;
  const lean = s.lean ?? 0;
  const rows = DROP.filter((_, i) => i < 5 || i >= 5 + cut);
  const top = 14 - rows.length + 1;
  rows.forEach(([x0, x1], i) => {
    const sh = i < 7 ? Math.round(lean * (1 - i / 7)) : 0;
    const g = i >= 3 ? grow : 0;
    for (let x = x0 - 2 * g + sh - SHIFT; x <= x1 + sh - SHIFT; x++) d.g.set(x, top + i, 'L');
  });
  // base rim and right-side shade
  const o = -SHIFT;
  const rim = (y: number): boolean => y >= 13;
  recolor(d, 'L', 'N', (x, y) => rim(y) || (x >= 11 + o + grow && y > top + 5));
  const ey = top + 6;
  for (const ex of [5 + o, 8 + o]) {
    dots(d, [
      [ex, ey, 'w'],
      [ex + 1, ey, 'w'],
      [ex, ey + 1, 'e'],
      [ex + 1, ey + 1, 'e'],
      [ex, ey + 2, 'e'],
      [ex + 1, ey + 2, 'e'],
    ]);
  }
  dots(d, [
    [9 + o + Math.round(lean / 2), top + 3, 'w'],
    [9 + o + Math.round(lean / 2), top + 4, 'w'],
    [11 + o, 11, 'q'],
    [10 + o, 12, 'q'],
  ]);
  if (s.mouth) {
    for (let x = 5 + o; x <= 8 + o; x++) dots(d, [[x, ey + 4, 'e']]);
  }
  return finish(d);
}

export const GREEN_SLIME: SpriteTemplate = enemyTemplate('green-slime', W, W, ANCHOR, {
  idle: [slimeFrame({}), slimeFrame({ cut: 1, grow: 1 })],
  walk: [slimeFrame({ lean: 2 }), slimeFrame({ cut: 2, grow: 1, lean: -1 })],
  attack: [
    slimeFrame({ lean: 3 }),
    slimeFrame({ cut: 2, grow: 1, lean: -2, mouth: true }),
    slimeFrame({ lean: -1 }),
  ],
});

// ---------------------------------------------------------------- Spore Shroom (16x16)
// A walking toadstool: a very wide, tilted red cap (lifted brim on the left, scalloped gills on
// the right) with uneven white spots, a thin pale stem with dot eyes, two tiny feet. Hand-drawn
// base frame; `attack` squeezes the cap down and puffs green spores to the front.
// Colors: 1 R D w 7 G e L k = 9.

const SHROOM_BASE: readonly string[] = [
  '......1111......',
  '....11RRRR11....',
  '...1RRwwRRRR1...',
  '..1RRRwwRRRRRR1.',
  '.1RRRRRRRRRwwRR1',
  '1RRwwRRRRRRRRRR1',
  'RRRRRRRRwRRRRRDD',
  '1111111RRRRRRDDD',
  '.......1D1DD1DD1',
  '......177711.11.',
  '.....1e7e7G1....',
  '.....177771.....',
  '.....177771.....',
  '....1kk11kk1....',
  '....1kk11kk1....',
  '.....11..11.....',
];

export const SPORE_SHROOM: SpriteTemplate = enemyTemplate('spore-shroom', W, W, ANCHOR, {
  idle: [checked(SHROOM_BASE, W, W), squash(SHROOM_BASE, 11)],
  walk: [shiftRows(squash(SHROOM_BASE, 11), 13, 15, -1), shiftRows(SHROOM_BASE, 13, 15, 1)],
  attack: [
    shiftRows(squash(SHROOM_BASE, 11), 0, 8, -1),
    patch(squash(SHROOM_BASE, 10, 2), 0, 11, ['.L..L', 'L...L.', '.L.L.']),
    patch(SHROOM_BASE, 0, 9, ['L..L.L', '.L..L.', 'L...L.']),
  ],
});

// ---------------------------------------------------------------- Toxic Toad (16x16)
// An upright sitting toad: two eye globes on thin stalks (the tall cue), a wide mouth line, a pale
// belly, red warts, and a Z-bent hind leg with a long flat foot. Hand-drawn base frame; the other
// frames come from row-level helpers. `attack` lunges a pink tongue to the front.
// Colors: 1 C Z Y R e O = 7.

const TOAD_BASE: readonly string[] = [
  '...111.111......',
  '..1YYY1YYY1.....',
  '..1eYY1eYY1.....',
  '...1C111C1......',
  '..1CCCCCCC1.....',
  '..1eeeeeeeC11...',
  '...1CCCCCCCCZ1..',
  '...1YYCCCCRCZ1..',
  '....1YYCCCCC1...',
  '....1YCCCCCCZ1..',
  '...1CCC11CCRCC1.',
  '...1CC1..1CCCZ1.',
  '...1C1....1CC1..',
  '...1C1.....1Z11.',
  '..1CC1....1ZZZ1.',
  '...11......111..',
];

/** Tongue lunge: the mouth opens and a pink tongue reaches to the front (left). */
function toadLunge(rows: readonly string[]): string[] {
  return patch(patch(rows, 4, 6, ['eRRRe']), 0, 5, ['RRRR']);
}

export const TOXIC_TOAD: SpriteTemplate = enemyTemplate('toxic-toad', W, W, ANCHOR, {
  idle: [checked(TOAD_BASE, W, W), squash(TOAD_BASE, 8)],
  walk: [lift(TOAD_BASE, 1), squash(TOAD_BASE, 8)],
  attack: [
    shiftRows(TOAD_BASE, 0, 10, 1),
    checked(toadLunge(TOAD_BASE), W, W),
    checked(TOAD_BASE, W, W),
  ],
});

// ---------------------------------------------------------------- Jelly Cube (elite 24x24)
// A tall flat-topped pillar of blue jelly that leans toward the back and melts into a wide puddle
// skirt, with a glossy rim, big dot eyes, and a gold coin and a bone floating inside. `attack`
// stretches up, then slams flat. Colors: 1 c d Q q e w a Y = 9.

const JW = 24;

interface CubePose {
  /** Rows the top is lowered (squash) and extra half width. */
  readonly sq?: number;
  readonly wide?: number;
  /** Lean of the top (positive = toward the back, right). */
  readonly lean?: number;
  readonly mouth?: boolean;
  readonly drift?: number;
}

function cubeFrame(p: CubePose): string[] {
  const d = draft(JW, JW);
  const sq = p.sq ?? 0;
  const wide = p.wide ?? 0;
  const lean = p.lean ?? 7;
  const top = 1 + sq;
  const y1 = 22;
  const flare = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 5];
  for (let y = top; y <= y1; y++) {
    const t = (y - top) / (y1 - top);
    const cx = 11 + Math.round(lean * Math.max(0, 1 - t * 1.6));
    const hw = 6 + wide + (flare[y] ?? 5) + (y === top ? -2 : y === top + 1 ? -1 : 0);
    for (let x = cx - hw; x < cx + hw; x++) d.g.set(x, y, 'c');
  }
  const mx = 12 + Math.round(lean * 0.4);
  recolor(d, 'c', 'Q', (x, y) => y === top + 1 && x < mx + 1);
  recolor(d, 'c', 'd', (x, y) => y >= y1 - 1 || x >= mx + 4 + Math.round((y - top) / 5));
  dots(d, [
    [mx - 4, top + 3, 'q'],
    [mx - 3, top + 3, 'q'],
    [mx - 5, top + 5, 'q'],
    [mx - 5, top + 6, 'q'],
  ]);
  const my = Math.floor((top + y1) / 2);
  const dr = p.drift ?? 0;
  put(d, ['.aa.', 'aYYa', 'aYaa', '.aa.'], mx + 1, my - 1 + dr);
  const by = Math.min(my + 5 + dr, y1 - 5);
  dots(d, [
    [mx - 3, by, 'w'],
    [mx - 2, by + 1, 'w'],
    [mx - 1, by + 2, 'w'],
    [mx, by + 2, 'w'],
  ]);
  const ey = top + 5;
  dots(d, [
    [mx - 5, ey, 'w'],
    [mx - 4, ey, 'w'],
    [mx - 5, ey + 1, 'e'],
    [mx - 4, ey + 1, 'e'],
    [mx - 5, ey + 2, 'e'],
    [mx - 4, ey + 2, 'e'],
    [mx - 1, ey, 'w'],
    [mx, ey, 'w'],
    [mx - 1, ey + 1, 'e'],
    [mx, ey + 1, 'e'],
    [mx - 1, ey + 2, 'e'],
    [mx, ey + 2, 'e'],
  ]);
  if (p.mouth) put(d, ['eeeeee', '.eeee.'], mx - 5, ey + 5);
  else put(d, ['eeee'], mx - 4, ey + 5);
  return finish(d);
}

export const JELLY_CUBE: SpriteTemplate = enemyTemplate(
  'jelly-cube',
  JW,
  JW,
  { x: 12, y: 23 },
  {
    idle: [cubeFrame({}), cubeFrame({ sq: 1, wide: 0, drift: 1 })],
    walk: [cubeFrame({ lean: 5 }), cubeFrame({ sq: 2, wide: 0, lean: 2, drift: 1 })],
    attack: [
      cubeFrame({ lean: 5, drift: -1 }),
      cubeFrame({ sq: 7, wide: 0, lean: -1, mouth: true, drift: 1 }),
      cubeFrame({ lean: 2 }),
    ],
  },
);

/** Stage 3 regular enemies, id -> template. */
export const ENEMIES_STAGE3: Readonly<Record<string, SpriteTemplate>> = {
  'green-slime': GREEN_SLIME,
  'spore-shroom': SPORE_SHROOM,
  'toxic-toad': TOXIC_TOAD,
  'jelly-cube': JELLY_CUBE,
};
