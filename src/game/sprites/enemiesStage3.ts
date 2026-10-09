// Stage 3 "Toxic Slime Caverns" regular enemies (batch E2, step A-E2-4). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: green-slime, spore-shroom, toxic-toad, jelly-cube.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row, idle 2 / walk 2 /
// attack 3; no hit or dissolve art (engine flash and dissolve). Characters: the stage's `1` outline
// and `7` plus master accents; at most 12 colors per sprite. The stage rock is dark teal, so the
// enemies use brighter, warmer or more saturated colors. Silhouettes: slime a dome with a tip and
// no limbs; shroom an umbrella cap on a thin stem; toad a wide low body with a big haunch and
// bulging eyes; jelly cube a rounded square block.

import { dots, draft, ellipse, enemyTemplate, finish, put } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
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
// A squat drop-shaped blob: big eyes, a pale highlight, two bubbles inside, a tiny tip on top.
// Colors: 1 L N w e q = 6.

interface SlimeShape {
  /** Half width and half height of the dome. */
  readonly rx: number;
  readonly ry: number;
  /** Horizontal shift of the dome, and extra lean of the top (positive = toward the back). */
  readonly dx?: number;
  readonly mouth?: boolean;
  readonly tip?: boolean;
}

function slimeFrame(s: SlimeShape): string[] {
  const d = draft(W, W);
  const dx = s.dx ?? 0;
  const cx = 8 + dx;
  const cy = 14 - s.ry;
  ellipse(d, cx, cy, s.rx, s.ry, 'L');
  d.g.rect(0, 15, W, 1, '.');
  // flat bottom: widen the last row a little
  for (let x = cx - s.rx; x <= cx + s.rx; x++) if (d.g.get(x, 13) === 'L') d.g.set(x, 14, 'L');
  const top = cy - s.ry;
  recolor(d, 'L', 'N', (x, y) => y >= 13 || (x - cx > s.rx * 0.45 && y > top + 2));
  if (s.tip !== false)
    dots(d, [
      [cx + 1, top - 1, 'L'],
      [cx + 1, top - 2, 'L'],
    ]);
  // highlight and bubbles
  dots(d, [
    [cx + 2, top + 2, 'w'],
    [cx + 3, top + 3, 'w'],
    [cx + 3, 12, 'q'],
    [cx + 4, 11, 'q'],
  ]);
  // big eyes on the front (left) half
  const ey = top + Math.max(3, Math.floor(s.ry * 0.7));
  dots(d, [
    [cx - 4, ey, 'w'],
    [cx - 3, ey, 'w'],
    [cx - 4, ey + 1, 'e'],
    [cx - 3, ey + 1, 'e'],
    [cx - 4, ey + 2, 'e'],
    [cx - 3, ey + 2, 'e'],
    [cx - 1, ey, 'w'],
    [cx, ey, 'w'],
    [cx - 1, ey + 1, 'e'],
    [cx, ey + 1, 'e'],
    [cx - 1, ey + 2, 'e'],
    [cx, ey + 2, 'e'],
  ]);
  if (s.mouth) {
    dots(d, [
      [cx - 4, ey + 4, 'e'],
      [cx - 3, ey + 4, 'e'],
      [cx - 2, ey + 4, 'e'],
      [cx - 1, ey + 4, 'e'],
    ]);
  }
  return finish(d);
}

export const GREEN_SLIME: SpriteTemplate = enemyTemplate('green-slime', W, W, ANCHOR, {
  idle: [slimeFrame({ rx: 6, ry: 5 }), slimeFrame({ rx: 7, ry: 4 })],
  walk: [slimeFrame({ rx: 5, ry: 6 }), slimeFrame({ rx: 7, ry: 4 })],
  attack: [
    slimeFrame({ rx: 5, ry: 6, dx: 1 }),
    slimeFrame({ rx: 7, ry: 4, dx: -1, mouth: true }),
    slimeFrame({ rx: 6, ry: 5 }),
  ],
});

// ---------------------------------------------------------------- Spore Shroom (16x16)
// A walking toadstool: wide red cap with white spots, a pale thin stem with dot eyes, two stubby
// feet. `attack` squeezes the cap down and puffs green spores to the front.
// Colors: 1 R D w 7 G e L k = 9.

interface ShroomPose {
  readonly bob?: number;
  readonly feet: 0 | 1 | 2;
  readonly cap?: number; // cap offset (negative = lifted)
  readonly spores?: 0 | 1 | 2;
  readonly mouth?: boolean;
}

function shroomFrame(p: ShroomPose): string[] {
  const d = draft(W, W);
  const bob = p.bob ?? 0;
  const cap = p.cap ?? 0;
  // feet
  const fx = p.feet === 0 ? [5, 9] : p.feet === 1 ? [4, 10] : [6, 8];
  for (const x of fx) put(d, ['kk', 'kk'], x, 13);
  // stem
  put(d, ['7777', '7777', '7777', '77GG'], 6, 9 + bob + (cap > 0 ? 1 : 0));
  dots(d, [
    [6, 9 + bob, '7'],
    [6, 11 + bob, 'e'],
    [7, 11 + bob, 'e'],
  ]);
  // cap: wide umbrella
  put(
    d,
    [
      '...RRRRRRRR...',
      '..RRwwRRRRRR..',
      '.RRRwwRRRwwRRD',
      'RRRRRRRRRwwRRD',
      'RRRRwwRRRRRRDD',
      '.DDDDDDDDDDDD.',
    ],
    1,
    3 + bob + cap,
  );
  // eyes sit on the stem under the cap
  dots(d, [
    [6, 10 + bob, 'w'],
    [7, 10 + bob, 'w'],
  ]);
  if (p.mouth) dots(d, [[7, 12 + bob, 'e']]);
  d.g.rect(0, 15, W, 1, '.');
  const out = finish(d);
  if (!p.spores) return out;
  const g = draft(W, W);
  g.g.blit(out, 0, 0);
  const puff: [number, number][] =
    p.spores === 1
      ? [
          [3, 9],
          [2, 11],
          [4, 12],
          [1, 8],
        ]
      : [
          [2, 8],
          [1, 10],
          [3, 11],
          [0, 12],
          [4, 7],
          [1, 6],
        ];
  for (const [x, y] of puff) g.loose.push([x, y, 'L']);
  g.g.plot(g.loose);
  return g.g.rows();
}

export const SPORE_SHROOM: SpriteTemplate = enemyTemplate('spore-shroom', W, W, ANCHOR, {
  idle: [shroomFrame({ feet: 0 }), shroomFrame({ feet: 0, bob: 1 })],
  walk: [shroomFrame({ feet: 1, bob: 1 }), shroomFrame({ feet: 2 })],
  attack: [
    shroomFrame({ feet: 0, cap: -1 }),
    shroomFrame({ feet: 0, cap: 1, spores: 1, mouth: true }),
    shroomFrame({ feet: 0, spores: 2, mouth: true }),
  ],
});

// ---------------------------------------------------------------- Toxic Toad (16x16)
// A squat orange toad with red warts, bulging yellow eyes, a wide mouth line and a big hind leg.
// Wide and low. `attack` lunges a pink tongue to the front.
// Colors: 1 C Z Y R e w O = 8.

interface ToadPose {
  readonly bob?: number;
  readonly stretch?: boolean;
  readonly mouth?: boolean;
  readonly tongue?: number;
}

function toadFrame(p: ToadPose): string[] {
  const d = draft(W, W);
  const bob = p.bob ?? 0;
  const lift = p.stretch ? 2 : 0;
  // body
  ellipse(d, 8, 10 + bob - lift, 6, 3.5, 'C');
  // hind haunch (big, back-right) and foot
  ellipse(d, 12, 11 - lift, 3, 3, 'C');
  put(d, ['CC', 'CC'], 3, 12 - lift);
  if (p.stretch) put(d, ['CCC'], 13, 14 - lift);
  put(d, ['CCCC'], 11, 14);
  // front leg
  put(d, ['CC', 'CC'], 5, 12 - lift);
  // belly shade
  recolor(d, 'C', 'Z', (x, y) => y >= 12 - lift + bob && x < 11 && x > 5);
  // eye bulges
  put(d, ['CC', 'CC'], 5, 6 + bob - lift);
  put(d, ['CC', 'CC'], 8, 6 + bob - lift);
  dots(d, [
    [5, 5 + bob - lift, 'Y'],
    [6, 5 + bob - lift, 'Y'],
    [8, 5 + bob - lift, 'Y'],
    [9, 5 + bob - lift, 'Y'],
    [5, 6 + bob - lift, 'e'],
    [8, 6 + bob - lift, 'e'],
  ]);
  // warts on the back and a pale throat
  dots(d, [
    [10, 8 + bob - lift, 'R'],
    [12, 9 + bob - lift, 'R'],
    [11, 11 - lift, 'R'],
    [8, 9 + bob - lift, 'Y'],
  ]);
  // wide mouth
  const my = 9 + bob - lift;
  if (p.mouth) {
    put(d, ['eeeee', 'eRRRe'], 2, my);
  } else {
    put(d, ['eeeee'], 3, my + 1);
  }
  d.g.rect(0, 15, W, 1, '.');
  const out = finish(d);
  const t = draft(W, W);
  t.g.blit(out, 0, 0);
  if (p.tongue) {
    for (let x = 0; x < p.tongue; x++) t.loose.push([x, my + 1, x === 0 ? 'O' : 'R']);
    t.loose.push([0, my, 'O']);
  }
  t.g.plot(t.loose);
  return t.g.rows();
}

export const TOXIC_TOAD: SpriteTemplate = enemyTemplate('toxic-toad', W, W, ANCHOR, {
  idle: [toadFrame({}), toadFrame({ bob: 1 })],
  walk: [toadFrame({ bob: 1 }), toadFrame({ stretch: true })],
  attack: [
    toadFrame({ bob: 1, mouth: true }),
    toadFrame({ mouth: true, tongue: 4 }),
    toadFrame({}),
  ],
});

// ---------------------------------------------------------------- Jelly Cube (elite 24x24)
// A rounded block of blue jelly with a glossy rim, big dot eyes, and a gold coin and a bone
// floating inside. `attack` stretches up, then slams flat.
// Colors: 1 c d Q q e w a Y = 9.

const JW = 24;

interface CubePose {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly mouth?: boolean;
  readonly drift?: number;
}

function cubeFrame(p: CubePose): string[] {
  const d = draft(JW, JW);
  const y1 = 22;
  // body with cut corners
  for (let y = p.y0; y <= y1; y++) {
    for (let x = p.x0; x <= p.x1; x++) {
      const cx = Math.min(x - p.x0, p.x1 - x);
      const cy = Math.min(y - p.y0, y1 - y);
      if (cx + cy < 2 || (cx === 0 && cy === 1) || (cx === 1 && cy === 0)) continue;
      d.g.set(x, y, 'c');
    }
  }
  // gloss rim top-left, shade bottom-right
  recolor(d, 'c', 'Q', (x, y) => y === p.y0 || x === p.x0);
  recolor(d, 'c', 'd', (x, y) => y >= y1 - 2 || x >= p.x1 - 2);
  dots(d, [
    [p.x0 + 2, p.y0 + 1, 'q'],
    [p.x0 + 3, p.y0 + 1, 'q'],
    [p.x0 + 1, p.y0 + 3, 'q'],
    [p.x0 + 1, p.y0 + 4, 'q'],
  ]);
  const mx = Math.floor((p.x0 + p.x1) / 2);
  const my = Math.floor((p.y0 + y1) / 2);
  // suspended coin and bone
  const dr = p.drift ?? 0;
  put(d, ['.aa.', 'aYYa', 'aYaa', '.aa.'], mx + 2, my - 3 + dr);
  dots(d, [
    [mx + 1, my + 3 + dr, 'w'],
    [mx + 2, my + 4 + dr, 'w'],
    [mx + 3, my + 5 + dr, 'w'],
    [mx + 4, my + 5 + dr, 'w'],
  ]);
  // eyes (front, left)
  const ey = p.y0 + Math.floor((y1 - p.y0) * 0.35);
  dots(d, [
    [p.x0 + 3, ey, 'w'],
    [p.x0 + 4, ey, 'w'],
    [p.x0 + 3, ey + 1, 'e'],
    [p.x0 + 4, ey + 1, 'e'],
    [p.x0 + 3, ey + 2, 'e'],
    [p.x0 + 4, ey + 2, 'e'],
    [p.x0 + 7, ey, 'w'],
    [p.x0 + 8, ey, 'w'],
    [p.x0 + 7, ey + 1, 'e'],
    [p.x0 + 8, ey + 1, 'e'],
    [p.x0 + 7, ey + 2, 'e'],
    [p.x0 + 8, ey + 2, 'e'],
  ]);
  if (p.mouth) {
    put(d, ['eeeeee', '.eeee.'], p.x0 + 3, ey + 5);
  } else {
    put(d, ['eeee'], p.x0 + 4, ey + 5);
  }
  return finish(d);
}

export const JELLY_CUBE: SpriteTemplate = enemyTemplate(
  'jelly-cube',
  JW,
  JW,
  { x: 12, y: 23 },
  {
    idle: [cubeFrame({ x0: 2, x1: 21, y0: 5 }), cubeFrame({ x0: 2, x1: 21, y0: 6, drift: 1 })],
    walk: [cubeFrame({ x0: 3, x1: 21, y0: 4 }), cubeFrame({ x0: 1, x1: 22, y0: 7, drift: 1 })],
    attack: [
      cubeFrame({ x0: 5, x1: 19, y0: 1, drift: -1 }),
      cubeFrame({ x0: 0, x1: 23, y0: 11, mouth: true, drift: 1 }),
      cubeFrame({ x0: 2, x1: 21, y0: 6 }),
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
