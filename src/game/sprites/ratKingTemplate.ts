// Stage 1 boss "Rat King" (batch E1, step A-E1-3). Owned by the pixel-artist.
// `enemies/rat-king`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames). A huge gray rat with a bent gold crown, a tattered
// royal-blue cape trailing behind, a pink tail, and a heap of small pink tails at his feet
// (decoration only). Colors (12): 1 G P m s w e a Y R d b. Cape = `d` main, `b` shade; crown =
// `a`/`Y`/`R`. Phase 2 (ENEMY_PHASE_PALETTES in palettesE1.ts) overrides `d b a R` for a hotter
// crown and cape over the same silhouette.
// `telegraph` rears up with both arms overhead, then winds back with the head and one arm thrown
// behind: clearly different from `attack` (a low forward claw swipe with an open mouth).

import { dots, draft, ellipse, enemyTemplate, finish, poly, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

type Pt = readonly [number, number];
const S = 48;

interface Arm {
  readonly elbow: Pt;
  readonly hand: Pt;
}

interface KingPose {
  readonly bob?: number;
  readonly head?: Pt;
  readonly mouth?: 0 | 1 | 2;
  readonly near: Arm;
  readonly far: Arm;
  readonly sway?: 0 | 1;
  readonly glint?: boolean;
}

const NEAR_DOWN: Arm = { elbow: [14, 33], hand: [12, 38] };
const FAR_DOWN: Arm = { elbow: [38, 32], hand: [40, 37] };

function heap(d: Draft, sway: number): void {
  ellipse(d, 24, 46, 22, 7, 'P');
  d.g.rect(0, 47, S, 1, '.');
  // lighter mounds and speckles
  for (const [x, y] of [
    [8, 44],
    [14, 42],
    [20, 44],
    [30, 43],
    [36, 45],
    [42, 43],
    [26, 41],
    [11, 45],
  ] as Pt[]) {
    dots(d, [
      [x, y, 'G'],
      [x + 1, y, 'G'],
    ]);
  }
  // decorative little tails curling out of the heap
  const curls: Pt[][] = [
    [
      [6, 42],
      [3, 41],
      [3, 38],
      [5, 36],
    ],
    [
      [10, 40],
      [8, 38],
      [9, 35],
    ],
    [
      [42, 42],
      [45, 41],
      [45, 38],
    ],
    [
      [39, 40],
      [41, 37 + sway],
      [40, 34 + sway],
    ],
    [
      [22, 41],
      [20, 40 - sway],
      [21, 38 - sway],
    ],
  ];
  for (const c of curls) stroke(d, c, 's', 1);
}

function cape(d: Draft, bob: number): void {
  poly(
    d,
    [
      [27, 17 + bob],
      [38, 19 + bob],
      [45, 28],
      [45, 41],
      [42, 38],
      [40, 44],
      [36, 39],
      [33, 44],
      [30, 38],
      [27, 41],
    ],
    'd',
  );
  // folds and a darker underside
  for (let y = 24 + bob; y < 40; y++) {
    dots(d, [
      [34, y, 'b'],
      [39, y + 1, 'b'],
    ]);
  }
  for (let x = 28; x < 44; x++) dots(d, [[x, 40 - ((x * 7) % 3), 'b']]);
}

function arm(d: Draft, shoulder: Pt, a: Arm, fur: string): void {
  stroke(d, [shoulder, a.elbow, a.hand], fur, 4);
  const [hx, hy] = a.hand;
  put(d, ['ssss', 'ssss', 'ssss'], hx - 2, hy - 1);
  dots(d, [
    [hx - 2, hy + 2, 'w'],
    [hx, hy + 2, 'w'],
    [hx + 1, hy + 2, 'w'],
  ]);
}

function head(d: Draft, hx: number, hy: number, mouth: number, glint: boolean): void {
  // far ear, near ear
  ellipse(d, hx + 12, hy - 8, 4, 5, 'P');
  ellipse(d, hx + 12, hy - 7, 2, 3, 's');
  ellipse(d, hx + 5, hy - 9, 5, 6, 'G');
  ellipse(d, hx + 5, hy - 8, 3, 4, 's');
  // head: shade first, then fur
  ellipse(d, hx + 1, hy + 1, 9, 8, 'P');
  ellipse(d, hx, hy, 9, 8, 'G');
  ellipse(d, hx - 8, hy + 3, 5, 4, 'G');
  // nose
  put(d, ['ss', 'ss'], hx - 12, hy + 2);
  // eye: big white with a left-looking pupil, brow above
  put(d, ['.ww.', 'wwww', 'wwww', '.ww.'], hx - 6, hy - 4);
  put(d, ['ee', 'ee', 'ee'], hx - 6, hy - 3);
  dots(d, [
    [hx - 6, hy - 5, 'P'],
    [hx - 5, hy - 5, 'P'],
    [hx - 4, hy - 5, 'P'],
    [hx - 3, hy - 5, 'P'],
    [hx - 2, hy - 5, 'P'],
  ]);
  // mouth and jaw
  const open = mouth * 2;
  if (mouth === 0) {
    put(d, ['eeeee'], hx - 9, hy + 6);
  } else {
    put(
      d,
      Array.from({ length: open }, () => 'RRRRRR'),
      hx - 9,
      hy + 6,
    );
    dots(d, [
      [hx - 9, hy + 6, 'w'],
      [hx - 7, hy + 6, 'w'],
      [hx - 5, hy + 6, 'w'],
      [hx - 8, hy + 5 + open, 'w'],
      [hx - 6, hy + 5 + open, 'w'],
    ]);
    put(d, ['GGGGGG', 'GGGGGG'], hx - 9, hy + 6 + open);
  }
  // bent crown: band, four spikes (the third bent), jewel
  put(d, ['aaaaaaaaaaaa', 'aYaaaaRaaaYa', 'aaaaaaaaaaaa'], hx - 3, hy - 9);
  const spike = (sx: number, bend: number): void => {
    put(d, ['aaa', '.aY'], sx, hy - 11);
    dots(d, [
      [sx + 1 + bend, hy - 12, 'a'],
      [sx + 1 + bend, hy - 13, 'Y'],
    ]);
  };
  spike(hx - 3, 0);
  spike(hx + 1, 0);
  spike(hx + 5, 1);
  spike(hx + 8, 0);
  if (glint)
    dots(d, [
      [hx + 1, hy - 15, 'w'],
      [hx, hy - 14, 'w'],
      [hx + 2, hy - 14, 'w'],
    ]);
}

function kingFrame(p: KingPose): string[] {
  const d = draft(S, S);
  const bob = p.bob ?? 0;
  const [hdx, hdy] = p.head ?? [0, 0];
  cape(d, bob);
  // far arm sits behind the torso
  arm(
    d,
    [33, 26 + bob],
    { elbow: [p.far.elbow[0], p.far.elbow[1] + bob], hand: [p.far.hand[0], p.far.hand[1] + bob] },
    'P',
  );
  // tail in front of the cape, behind the body
  stroke(
    d,
    p.sway
      ? [
          [34, 38],
          [41, 37],
          [45, 33],
          [44, 28],
        ]
      : [
          [34, 38],
          [41, 38],
          [45, 34],
          [45, 29],
        ],
    's',
    2,
  );
  heap(d, p.sway ?? 0);
  // torso: shade crescent then fur then light belly
  ellipse(d, 28, 29 + bob, 11, 12, 'P');
  ellipse(d, 26, 28 + bob, 10, 11, 'G');
  ellipse(d, 21, 31 + bob, 5, 7, 'm');
  head(d, 15 + hdx, 22 + hdy + bob, p.mouth ?? 0, p.glint === true);
  arm(
    d,
    [18, 27 + bob],
    {
      elbow: [p.near.elbow[0], p.near.elbow[1] + bob],
      hand: [p.near.hand[0], p.near.hand[1] + bob],
    },
    'G',
  );
  d.g.rect(0, 47, S, 1, '.');
  return finish(d);
}

const IDLE: KingPose = { near: NEAR_DOWN, far: FAR_DOWN };

export const RAT_KING: SpriteTemplate = enemyTemplate(
  'rat-king',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [
      kingFrame(IDLE),
      kingFrame({ ...IDLE, bob: 1, sway: 1, near: { elbow: [14, 34], hand: [12, 39] } }),
    ],
    walk: [
      kingFrame({
        near: { elbow: [12, 33], hand: [8, 37] },
        far: { elbow: [40, 33], hand: [42, 38] },
        head: [-1, 0],
        sway: 1,
      }),
      kingFrame({
        bob: 1,
        near: { elbow: [16, 33], hand: [15, 38] },
        far: { elbow: [36, 32], hand: [37, 36] },
        head: [0, 0],
      }),
    ],
    attack: [
      kingFrame({
        head: [2, -1],
        mouth: 1,
        near: { elbow: [24, 22], hand: [30, 14] },
        far: FAR_DOWN,
      }),
      kingFrame({
        bob: 1,
        head: [-1, 1],
        mouth: 2,
        near: { elbow: [10, 31], hand: [4, 36] },
        far: FAR_DOWN,
      }),
      kingFrame({
        head: [-1, 0],
        mouth: 1,
        near: { elbow: [12, 33], hand: [8, 38] },
        far: FAR_DOWN,
      }),
    ],
    telegraph: [
      kingFrame({
        bob: -3,
        head: [0, 0],
        mouth: 1,
        near: { elbow: [10, 22], hand: [8, 11] },
        far: { elbow: [38, 20], hand: [41, 9] },
      }),
      kingFrame({
        bob: -3,
        head: [3, -2],
        mouth: 2,
        near: { elbow: [26, 16], hand: [35, 9] },
        far: { elbow: [40, 22], hand: [43, 14] },
      }),
    ],
    intro: [
      kingFrame({
        bob: -1,
        near: { elbow: [10, 24], hand: [5, 16] },
        far: { elbow: [38, 22], hand: [42, 14] },
      }),
      kingFrame({
        bob: -2,
        mouth: 2,
        glint: true,
        near: { elbow: [9, 22], hand: [4, 13] },
        far: { elbow: [39, 20], hand: [42, 11] },
      }),
    ],
  },
);
