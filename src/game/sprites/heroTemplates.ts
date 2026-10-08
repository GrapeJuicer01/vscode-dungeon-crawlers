// The default (classless) hero: layers body, head, gear (null), weapon. Batch A0.
// Owned by the pixel-artist. Each of the 11 animations is described once as poses; the three layer
// templates are rendered from the same poses, so frame counts always match. The output is plain
// palette-character rows (see docs/design/sprite-spec.md); outlines are added by Grid.outline.
//
// Design note: chibi, big head (9 of 20 rows), 1px dark outline, dot eye, side view facing right.
// Neutral blue cloth with a sand scarf in the accent character `a`, brown boots, plain short sword.
// No hurt, downed, or dying pose exists; hits are a renderer-side flash (Core invariant 1).

import { Grid, type Px } from './spriteBuilder';
import type { HeroLayerSet, SpriteTemplate } from './spriteTypes';

const W = 16;
const H = 20;
const WEAPON_W = 24;
/** The foot pixel under the character's centre (bottom outline row of the boots). */
const ANCHOR = { x: 8, y: 19 } as const;

// ---- Inner pieces (no outline; Grid.outline adds it) ----

const HEAD = [
  '.hhhhhhhh.',
  'hhhhhhhhhh',
  'hhhhhsssss',
  'hhhhssssss',
  'hhhhssssss',
  '.hhhssssss',
  '...ssssss.',
];
const TORSO = ['aaaaaa', 'cccccc', 'cccccc', 'cccccc', 'dddddd'];

const LEGS_STAND = ['bbbbbb.', 'bb..bb.', 'bb..bb.', 'kk..kkk'];
const LEGS_PASS_L = ['bbbbbb.', '.bb.bb.', 'kkk.bb.', '....kkk'];
const LEGS_PASS_R = ['bbbbbb.', 'bb.bb..', 'bb..kkk', 'kk.....'];
const LEGS_STRIDE = ['..bbbbbb..', '.bbb..bbb.', 'bbb....bbb', 'kkk....kkk'];
const LEGS_SIT = ['bbbbbbbbb', 'bbbbbbkkk'];

// ---- Pose description ----

interface Pose {
  /** Inner top-left of the head. The eye sits at (x + 6, y + 3). */
  head: { x: number; y: number; closed?: boolean };
  /** Inner top-left of the torso. */
  torso: { x: number; y: number };
  legs: { rows: readonly string[]; x: number; y: number };
  /** Arm, hands, and held props drawn in the body layer (outlined with it). */
  arm?: readonly Px[];
  /** Head-layer decoration above the head (the sleeping "z"); not outlined. */
  deco?: readonly Px[];
  /** Weapon-layer drawing on a 24x20 grid. */
  weapon?: (g: Grid) => void;
}

const sleeve = (pts: readonly (readonly [number, number])[]): Px[] =>
  pts.map(([x, y]) => [x, y, 'd'] as const);
const hand = (x: number, y: number): Px[] => [
  [x, y, 's'],
  [x + 1, y, 's'],
  [x, y + 1, 's'],
  [x + 1, y + 1, 's'],
];
const block = (x: number, y: number, w: number, h: number, ch: string): Px[] => {
  const out: Px[] = [];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out.push([x + xx, y + yy, ch]);
  return out;
};
const zShape = (x: number, y: number): Px[] => [
  [x, y, 'w'],
  [x + 1, y, 'w'],
  [x + 2, y, 'w'],
  [x + 3, y, 'w'],
  [x + 2, y + 1, 'w'],
  [x + 1, y + 2, 'w'],
  [x, y + 3, 'w'],
  [x + 1, y + 3, 'w'],
  [x + 2, y + 3, 'w'],
  [x + 3, y + 3, 'w'],
];

/** Plain short sword held point-up; the guard row is `gy`, the blade rises from it. */
function swordUp(g: Grid, gx: number, gy: number, len: number): void {
  g.rect(gx - 1, gy, 3, 1, 'k');
  g.rect(gx, gy - len + 1, 1, len - 1, 'm');
  g.set(gx, gy - len, 'w');
  g.outline('o');
}

/** Draws into a scratch grid, outlines it, and lays it over `g`. */
function overlay(g: Grid, draw: (s: Grid) => void): void {
  const s = new Grid(g.w, g.h);
  draw(s);
  s.outline('o');
  g.blit(s.rows(), 0, 0);
}

const holdArm = (ty: number): Px[] => [
  ...sleeve([
    [9, ty + 2],
    [10, ty + 2],
    [11, ty + 2],
    [12, ty + 2],
  ]),
  ...hand(13, ty + 2),
];
const heldSword =
  (ty: number) =>
  (g: Grid): void =>
    swordUp(g, 14, ty + 1, 7);

const stand = (ty: number): Pick<Pose, 'head' | 'torso' | 'arm' | 'weapon'> => ({
  head: { x: 3, y: ty - 8 },
  torso: { x: 5, y: ty },
  arm: holdArm(ty),
  weapon: heldSword(ty),
});

const POSES: Readonly<Record<string, readonly Pose[]>> = {
  idle: [
    { ...stand(10), legs: { rows: LEGS_STAND, x: 5, y: 15 } },
    { ...stand(11), legs: { rows: LEGS_STAND, x: 5, y: 15 } },
  ],
  walk: [
    { ...stand(11), legs: { rows: LEGS_STRIDE, x: 3, y: 15 } },
    { ...stand(10), legs: { rows: LEGS_PASS_L, x: 5, y: 15 } },
    { ...stand(11), legs: { rows: LEGS_STRIDE, x: 3, y: 15 } },
    { ...stand(10), legs: { rows: LEGS_PASS_R, x: 5, y: 15 } },
  ],
  attack: [
    // wind-up: lean back, blade raised
    {
      head: { x: 2, y: 2 },
      torso: { x: 4, y: 10 },
      legs: { rows: LEGS_STAND, x: 5, y: 15 },
      arm: [
        ...sleeve([
          [8, 11],
          [9, 11],
          [10, 11],
          [11, 11],
          [12, 11],
          [12, 10],
        ]),
        ...hand(13, 9),
      ],
      weapon: (g) => swordUp(g, 14, 8, 7),
    },
    // strike: lean in, blade out level, a crescent of air behind it
    {
      head: { x: 4, y: 3 },
      torso: { x: 6, y: 11 },
      legs: { rows: LEGS_STRIDE, x: 3, y: 15 },
      arm: [
        ...sleeve([
          [10, 12],
          [11, 12],
          [12, 12],
          [13, 12],
        ]),
        ...hand(14, 12),
      ],
      weapon: (g) => {
        g.rect(16, 11, 1, 4, 'k');
        g.rect(17, 12, 6, 1, 'w');
        g.rect(17, 13, 5, 1, 'm');
        g.outline('o');
        g.plot([
          [16, 3, 'w'],
          [17, 3, 'w'],
          [18, 3, 'w'],
          [19, 4, 'w'],
          [20, 5, 'w'],
          [21, 6, 'w'],
          [22, 8, 'w'],
          [22, 9, 'w'],
          [22, 16, 'w'],
          [21, 17, 'w'],
          [19, 18, 'w'],
        ]);
      },
    },
    // recover: blade swept low
    {
      head: { x: 3, y: 3 },
      torso: { x: 5, y: 11 },
      legs: { rows: LEGS_STAND, x: 5, y: 15 },
      arm: [
        ...sleeve([
          [9, 13],
          [10, 13],
          [11, 13],
        ]),
        ...hand(12, 13),
      ],
      weapon: (g) => {
        g.rect(14, 14, 2, 2, 'k');
        g.line(16, 15, 22, 18, 'm');
        g.set(22, 18, 'w');
        g.outline('o');
      },
    },
  ],
  // Generic signature pose (never played by the base hero; every class layer set has it):
  // raise the weapon arm, thrust forward, recover.
  ability: [
    // raise: lean back, blade overhead
    {
      head: { x: 2, y: 2 },
      torso: { x: 4, y: 10 },
      legs: { rows: LEGS_STAND, x: 5, y: 15 },
      arm: [
        ...sleeve([
          [9, 11],
          [10, 11],
          [11, 11],
          [12, 10],
          [12, 9],
          [12, 8],
          [12, 7],
        ]),
        ...hand(13, 6),
      ],
      weapon: (g) => swordUp(g, 14, 5, 5),
    },
    // thrust: lean in, blade straight out
    {
      head: { x: 4, y: 3 },
      torso: { x: 6, y: 11 },
      legs: { rows: LEGS_STRIDE, x: 3, y: 15 },
      arm: [
        ...sleeve([
          [10, 12],
          [11, 12],
          [12, 12],
          [13, 12],
        ]),
        ...hand(14, 12),
      ],
      weapon: (g) => {
        g.rect(16, 11, 1, 4, 'k');
        g.rect(17, 12, 5, 1, 'm');
        g.set(22, 12, 'w');
        g.outline('o');
      },
    },
    // recover: blade angled forward and up
    {
      head: { x: 3, y: 3 },
      torso: { x: 5, y: 11 },
      legs: { rows: LEGS_STAND, x: 5, y: 15 },
      arm: [
        ...sleeve([
          [9, 13],
          [10, 13],
          [11, 13],
        ]),
        ...hand(12, 13),
      ],
      weapon: (g) => {
        g.rect(14, 12, 1, 4, 'k');
        g.line(15, 13, 21, 10, 'm');
        g.set(21, 10, 'w');
        g.outline('o');
      },
    },
  ],
  sit: [
    {
      head: { x: 3, y: 4 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 14],
          [10, 15],
        ]),
        ...hand(11, 15),
      ],
    },
    {
      head: { x: 3, y: 5 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 14],
          [10, 15],
        ]),
        ...hand(11, 15),
      ],
    },
  ],
  eat: [
    {
      head: { x: 3, y: 4 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 14],
        ]),
        ...hand(11, 14),
        ...block(13, 13, 2, 2, 'k'),
        [15, 13, 'w'],
        [15, 14, 'w'],
      ],
    },
    {
      head: { x: 3, y: 5 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 13],
          [10, 12],
          [11, 11],
          [12, 11],
        ]),
        ...hand(13, 10),
        ...block(14, 8, 2, 2, 'k'),
      ],
    },
  ],
  sleep: [
    {
      head: { x: 4, y: 6, closed: true },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 15],
        ]),
        ...hand(11, 15),
      ],
      deco: zShape(12, 1),
    },
    {
      head: { x: 4, y: 7, closed: true },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 15],
        ]),
        ...hand(11, 15),
      ],
      deco: [...zShape(12, 0), [10, 4, 'w'], [9, 5, 'w']],
    },
  ],
  polish: [
    {
      head: { x: 3, y: 4 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 14],
        ]),
        ...hand(11, 14),
      ],
      weapon: (g) => polishSword(g, 16),
    },
    {
      head: { x: 3, y: 4 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 14],
        ]),
        ...hand(11, 14),
      ],
      weapon: (g) => polishSword(g, 19),
    },
  ],
  read: [
    {
      head: { x: 3, y: 5 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 14],
        ]),
        ...hand(9, 15),
        ...bookPx(false),
      ],
    },
    {
      head: { x: 3, y: 5 },
      torso: { x: 5, y: 12 },
      legs: { rows: LEGS_SIT, x: 5, y: 17 },
      arm: [
        ...sleeve([
          [9, 14],
          [10, 14],
        ]),
        ...hand(9, 15),
        ...bookPx(true),
      ],
    },
  ],
  warmHands: [
    {
      head: { x: 3, y: 2 },
      torso: { x: 5, y: 10 },
      legs: { rows: LEGS_STAND, x: 5, y: 15 },
      arm: [
        ...sleeve([
          [9, 12],
          [10, 12],
          [11, 12],
          [12, 12],
        ]),
        ...hand(13, 11),
      ],
    },
    {
      head: { x: 3, y: 3 },
      torso: { x: 5, y: 11 },
      legs: { rows: LEGS_STAND, x: 5, y: 15 },
      arm: [
        ...sleeve([
          [9, 13],
          [10, 13],
          [11, 13],
          [12, 13],
        ]),
        ...hand(13, 12),
      ],
    },
  ],
  victory: [
    {
      head: { x: 3, y: 2 },
      torso: { x: 5, y: 10 },
      legs: { rows: LEGS_STAND, x: 5, y: 15 },
      arm: [
        ...sleeve([
          [9, 11],
          [10, 11],
          [11, 11],
          [12, 10],
          [12, 9],
          [12, 8],
        ]),
        ...hand(13, 7),
      ],
      weapon: (g) => swordUp(g, 14, 6, 5),
    },
    {
      head: { x: 3, y: 1 },
      torso: { x: 5, y: 9 },
      legs: { rows: LEGS_STAND, x: 5, y: 14 },
      arm: [
        ...sleeve([
          [9, 10],
          [10, 10],
          [11, 10],
          [12, 9],
          [12, 8],
          [12, 7],
        ]),
        ...hand(13, 6),
      ],
      weapon: (g) => swordUp(g, 14, 5, 5),
    },
  ],
};

function bookPx(turned: boolean): Px[] {
  const rows = turned ? ['kkkkk', 'kwkwk', 'kwwwk', 'kkkkk'] : ['kkkkk', 'kwwwk', 'kwkwk', 'kkkkk'];
  const out: Px[] = [];
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) out.push([11 + dx, 13 + dy, row.charAt(dx)]);
  });
  return out;
}

/** Sword across the lap; a hand wipes a sand-colored rag along the blade at column `rx`. */
function polishSword(g: Grid, rx: number): void {
  g.rect(13, 13, 1, 4, 'k');
  g.rect(14, 14, 9, 1, 'w');
  g.rect(14, 15, 8, 1, 'm');
  g.outline('o');
  overlay(g, (s) => {
    s.line(10, 13, rx + 1, 11, 'd');
    s.rect(rx, 11, 2, 2, 's');
    s.rect(rx, 13, 3, 4, 'a');
  });
}

// ---- Rendering of the three layers ----

function renderBody(p: Pose): string[] {
  const g = new Grid(W, H);
  g.blit(p.legs.rows, p.legs.x, p.legs.y);
  g.blit(TORSO, p.torso.x, p.torso.y);
  if (p.arm) g.plot(p.arm);
  g.outline('o');
  return g.rows();
}

function renderHead(p: Pose): string[] {
  const g = new Grid(W, H);
  g.blit(HEAD, p.head.x, p.head.y);
  g.outline('o');
  const ex = p.head.x + 6;
  const ey = p.head.y + 3;
  if (p.head.closed) {
    g.set(ex, ey, 'o');
    g.set(ex + 1, ey, 'o');
  } else {
    g.set(ex, ey, 'e');
  }
  if (p.deco) g.plot(p.deco);
  return g.rows();
}

function renderWeapon(p: Pose): string[] {
  const g = new Grid(WEAPON_W, H);
  if (p.weapon) p.weapon(g);
  return g.rows();
}

function layer(id: string, w: number, render: (p: Pose) => string[]): SpriteTemplate {
  const animations: Record<string, string[][]> = {};
  for (const [name, poses] of Object.entries(POSES)) animations[name] = poses.map(render);
  return { id, w, h: H, anchor: { x: ANCHOR.x, y: ANCHOR.y }, animations };
}

export const BASE_HERO: HeroLayerSet = {
  body: layer('hero/body', W, renderBody),
  head: layer('hero/head', W, renderHead),
  gear: null,
  weapon: layer('hero/weapon', WEAPON_W, renderWeapon),
};
