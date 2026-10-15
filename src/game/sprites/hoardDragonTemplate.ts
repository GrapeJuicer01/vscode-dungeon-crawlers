// Stage 9 boss "Hoard Dragon" (batch E5, step A-E5-6). Owned by the pixel-artist.
// `enemies/hoard-dragon`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. A crimson dragon
// seated on a heap of gold: wings raised high in an M (two peaks and a notch between them), the
// horned head lifted to the upper left on a curved neck, a pale sand belly, a haunch, a front
// claw on the heap, and a tail curling up at the right. Colors (11): 1 outline, R and D scales,
// a belly, 4 wing membrane, 5 6 7 the gold heap and horns, 8 gems, Y eye, e pupil.
// Phase 2 (BOSS_PHASE_PALETTES_E5 in palettesE5.ts) overrides `R D a Y` so the scales and belly
// turn brighter gold and pale amber over the same silhouette.
// `telegraph` rears the head back while the throat brightens over two slow frames (never a
// flash); `attack` is a tail sweep then a head snap forward (nothing is drawn leaving the boss);
// `intro` rises from behind the heap. The dragon is scenery art for the enemy only; nothing here
// is drawn on or toward a hero.

import { dots, draft, ellipse, enemyTemplate, finish, poly, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { lift } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

type Pt = readonly [number, number];

interface DragonPose {
  /** Whole-figure bob in rows (0 or 1); the heap stays put. */
  readonly bob?: number;
  /** Wing tips raised or lowered by this many rows (0 to 2). */
  readonly flap?: number;
  /** Head rears back and up (the telegraph), in columns to the right and rows up. */
  readonly rear?: number;
  /** Head snaps forward (left) by this many columns (the attack). */
  readonly snap?: number;
  /** Tail: 0 curled up, 1 swept out low (the attack). */
  readonly tail?: 0 | 1;
  /** The throat glows (the telegraph): 0 none, 1 warm, 2 brighter. */
  readonly glow?: 0 | 1 | 2;
  /** Intro: rows the whole figure is sunk behind the heap. */
  readonly sink?: number;
}

export function dragonFrame(p: DragonPose): string[] {
  const d: Draft = draft(S, S);
  const b = p.bob ?? 0;
  const fl = p.flap ?? 0;
  const rear = p.rear ?? 0;
  const snap = p.snap ?? 0;
  const hx = 9 + rear * 2 - snap;
  const hy = 14 - rear * 2 + b;
  // the tail first (behind the body): curls up at the right, or sweeps out low
  const tail: readonly Pt[] =
    p.tail === 1
      ? [
          [33, 36 + b],
          [40, 40],
          [46, 41],
        ]
      : [
          [33, 35 + b],
          [40, 34],
          [45, 29],
          [44, 23],
          [45, 21],
        ];
  stroke(d, tail, 'R', 3);
  poly(
    d,
    p.tail === 1
      ? [
          [44, 38],
          [46, 40],
          [46, 44],
          [43, 42],
        ]
      : [
          [43, 21],
          [45, 17],
          [46, 22],
          [45, 24],
        ],
    'D',
  );
  // wings raised in an M: bone arms and scalloped membranes, two peaks and a notch
  const wing = (shoulder: Pt, tip: Pt, trail: Pt, hem: readonly Pt[]): void => {
    poly(d, [shoulder, tip, ...hem, trail], '4');
    stroke(d, [shoulder, tip], 'R', 2);
    stroke(d, [shoulder, hem[0] ?? trail], 'D');
  };
  wing(
    [26, 21 + b],
    [19, 2 - fl],
    [31, 22 + b],
    [
      [14, 11],
      [19, 10],
      [21, 15],
      [25, 12],
      [29, 18],
    ],
  );
  wing(
    [31, 21 + b],
    [42, 2 - fl],
    [32, 23 + b],
    [
      [46, 12],
      [41, 10],
      [39, 16],
      [36, 12],
      [33, 19],
    ],
  );
  // the heap of gold: a wide mound along the foot of the picture
  ellipse(d, 24, 47, 21.5, 10, '5');
  // body, haunch, and the far leg
  ellipse(d, 26, 30 + b, 9, 10, 'R');
  ellipse(d, 31, 35 + b, 6, 5, 'R');
  stroke(
    d,
    [
      [19, 33 + b],
      [16, 38],
    ],
    'R',
    3,
  );
  // neck and head, lifted at the left
  stroke(
    d,
    [
      [21, 24 + b],
      [16, 19 + b],
      [hx + 3, hy + 3],
    ],
    'R',
    5,
  );
  ellipse(d, hx, hy, 5, 4, 'R');
  d.g.rect(hx - 8, hy, 5, 3, 'R');
  d.g.rect(hx - 7, hy + 3, 5, 1, 'D');
  poly(
    d,
    [
      [hx + 2, hy - 3],
      [hx + 7, hy - 9],
      [hx + 5, hy - 2],
    ],
    '7',
  );
  poly(
    d,
    [
      [hx - 1, hy - 3],
      [hx + 1, hy - 8],
      [hx + 2, hy - 3],
    ],
    '7',
  );
  // colors: scales shade, belly, and the heap
  const paint = (x: number, y: number, ch: string): void => {
    if (d.g.get(x, y) !== '.') d.g.set(x, y, ch);
  };
  for (let y = 20 + b; y <= 40 + b; y++) {
    for (let x = 16; x <= 24; x++) {
      if (d.g.get(x, y) === 'R' && Math.hypot(x - 21, y - 31 - b) < 7.5) paint(x, y, 'a');
    }
  }
  for (let y = 22 + b; y <= 36 + b; y++) {
    for (let x = 29; x <= 36; x++) if ((x + y) % 3 === 0) paint(x, y, 'D');
  }
  for (let y = 29; y <= 46; y++) {
    for (let x = 0; x < S; x++) {
      if (d.g.get(x, y) !== '5') continue;
      const m = (x * 5 + y * 3) % 11;
      if (m === 0 || m === 7) paint(x, y, '6');
      else if (m === 3) paint(x, y, '7');
      else if (m === 5 && y > 38) paint(x, y, '8');
    }
  }
  dots(d, [
    [hx - 2, hy - 1, 'Y'],
    [hx - 1, hy - 1, 'Y'],
    [hx - 2, hy, 'e'],
  ]);
  // the throat: pale sand, brighter while the head is reared (the telegraph)
  const throat = p.glow === 2 ? 'Y' : p.glow === 1 ? '6' : 'a';
  for (const [x, y] of [
    [hx + 1, hy + 3],
    [hx + 2, hy + 4],
    [hx + 3, hy + 6],
    [hx + 4, hy + 8],
  ] as const) {
    paint(x, y, throat);
    paint(x + 1, y, throat);
  }
  d.g.rect(0, 47, S, 1, '.');
  const out = finish(d);
  return p.sink ? lift(out, -p.sink) : out;
}

export const HOARD_DRAGON: SpriteTemplate = enemyTemplate(
  'hoard-dragon',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [dragonFrame({}), dragonFrame({ bob: 1, flap: 1 })],
    walk: [dragonFrame({ flap: 1 }), dragonFrame({ bob: 1 })],
    attack: [dragonFrame({ tail: 1, flap: 1 }), dragonFrame({ tail: 1, snap: 3 }), dragonFrame({})],
    telegraph: [dragonFrame({ rear: 1, glow: 1 }), dragonFrame({ rear: 2, flap: 2, glow: 2 })],
    intro: [dragonFrame({ sink: 24 }), dragonFrame({ sink: 8 })],
  },
);
