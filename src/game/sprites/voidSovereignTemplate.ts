// Stage 10 boss "Void Sovereign" (batch E5, step A-E5-6). Owned by the pixel-artist.
// `enemies/void-sovereign`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. A hovering cloaked
// figure shaped like an inverted triangle: broad shoulders under a spread crown of pale shards,
// tapering to a point below, a star-filled cleft down the chest, and two detached hands that float
// at its sides. Colors (8): 1 outline, 2 3 4 the cloak (shade, base, rim), 5 hood lining, 6 shard
// tips and cleft rim, 7 stars and highlights, 8 cyan cleft glow and eyes.
// Phase 2 (BOSS_PHASE_PALETTES_E5 in palettesE5.ts) moves the glow (8 and 6) and the stars (7) to
// pale magenta-white while the cloak (2 3 4) stays dark; the silhouette is unchanged.
// `telegraph` raises the hands over two slow frames while the cleft widens (never a flash);
// `attack` pulls the hands in, thrusts both forward (left), then settles; `intro` rises from below.
// The figure is enemy art only; nothing here is drawn on or toward a hero.

import { dots, draft, ellipse, enemyTemplate, finish, poly } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { lift } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

type Pt = readonly [number, number];

interface SovereignPose {
  /** Hands and crown bob by this many rows (0 or 1); the cloak stays put. */
  readonly bob?: number;
  /** Hand height offset in rows (negative raises them). */
  readonly handY?: number;
  /** Hands pushed forward (left) by this many columns. */
  readonly thrust?: number;
  /** Hands pulled in toward the body by this many columns. */
  readonly pull?: number;
  /** Cleft half width in columns (1 to 3), widens in the telegraph. */
  readonly cleft?: number;
  /** Intro: rows the whole figure is sunk below the picture. */
  readonly sink?: number;
}

function hand(d: Draft, cx: number, cy: number): void {
  ellipse(d, cx, cy, 3, 3, '4');
  dots(d, [
    [cx - 1, cy - 1, '7'],
    [cx, cy - 1, '7'],
  ]);
}

export function sovereignFrame(p: SovereignPose): string[] {
  const d: Draft = draft(S, S);
  const b = p.bob ?? 0;
  const cl = p.cleft ?? 2;
  // the cloak: broad shoulders, tapering to a point below
  const cloak: readonly Pt[] = [
    [7, 16],
    [11, 11],
    [37, 11],
    [41, 16],
    [36, 28],
    [29, 40],
    [24, 46],
    [19, 40],
    [12, 28],
  ];
  poly(d, cloak, '3');
  // shade on the right half and a lit rim on the left
  for (let y = 11; y <= 46; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < S; x++) {
      if (d.g.get(x, y) === '3') {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first < 0) continue;
    d.g.set(first, y, '4');
    for (let x = Math.max(first, 25 + (y > 30 ? 0 : 1)); x <= last; x++) d.g.set(x, y, '2');
    if (y > 20 && (y & 3) === 0) d.g.set(first + 1, y, '4');
  }
  // ragged hem folds
  dots(d, [
    [21, 41, '2'],
    [22, 44, '2'],
    [27, 40, '3'],
  ]);
  // the hood and the face in the dark
  ellipse(d, 24, 12 + b, 6, 5, '2');
  ellipse(d, 24, 13 + b, 4, 3, '1');
  dots(d, [
    [21, 13 + b, '8'],
    [22, 13 + b, '8'],
    [26, 13 + b, '8'],
    [27, 13 + b, '8'],
  ]);
  // the crown of shards: a broad spread, tallest at the middle and the outer pair
  const shard = (x: number, h: number, w: number): void => {
    poly(
      d,
      [
        [x - w, 8 + b],
        [x, 8 - h + b],
        [x + w, 8 + b],
      ],
      '6',
    );
    d.g.set(x, 8 - h + 2 + b, '7');
  };
  shard(11, 5, 2);
  shard(17, 8, 2);
  shard(24, 11, 2);
  shard(31, 8, 2);
  shard(37, 5, 2);
  // the star-filled cleft down the chest
  ellipse(d, 24, 28, cl, 9, '1');
  for (const [sx, sy] of [
    [24, 22],
    [23, 26],
    [25, 29],
    [24, 33],
    [23, 36],
  ] as const) {
    d.g.set(sx, sy, sy % 2 === 0 ? '7' : '8');
  }
  d.g.set(24, 19, '6');
  d.g.set(24, 37, '6');
  // two detached hands
  const hy = 30 + (p.handY ?? 0) + b;
  const dx = -(p.thrust ?? 0) + (p.pull ?? 0);
  const lx = Math.max(4, 6 + dx);
  const rx = Math.min(43, 42 - Math.min(dx, 0) - (p.pull ?? 0));
  hand(d, lx, hy);
  hand(d, rx, hy - 2);
  // a few bright specks in the hood lining
  dots(d, [
    [14, 15, '5'],
    [34, 16, '5'],
  ]);
  const out = finish(d);
  return p.sink ? lift(out, -p.sink) : out;
}

export const VOID_SOVEREIGN: SpriteTemplate = enemyTemplate(
  'void-sovereign',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [sovereignFrame({}), sovereignFrame({ bob: 1 })],
    walk: [sovereignFrame({ handY: -1 }), sovereignFrame({ bob: 1, handY: 1 })],
    attack: [
      sovereignFrame({ pull: 2, handY: 1 }),
      sovereignFrame({ thrust: 4, handY: -2 }),
      sovereignFrame({ thrust: 2 }),
    ],
    telegraph: [
      sovereignFrame({ handY: -8, cleft: 3 }),
      sovereignFrame({ handY: -14, cleft: 4, bob: 1 }),
    ],
    intro: [sovereignFrame({ sink: 24 }), sovereignFrame({ sink: 8 })],
  },
);
