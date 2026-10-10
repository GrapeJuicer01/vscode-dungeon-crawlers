// Stage 7 boss "Glacier Mammoth" (batch E4, step A-E4-6). Owned by the pixel-artist.
// `enemies/glacier-mammoth`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. The first
// horizontal boss: a wide, low, shaggy mammoth with a tall domed head at the upper left, a long
// trunk hanging down in front, two curved ivory tusks, a frost-rimed coat, four thick legs, and a
// torn banner stripe across its flank. Colors (9): 1 outline, 2 shadow, 4 and 5 coat, 6 and 7 frost
// and ivory, 8 banner, e eye, w glint. Phase 2 (BOSS_PHASE_PALETTES_E4 in palettesE4.ts)
// overrides `5 6 7 8` so the coat and tusks turn aurora teal and white over the same silhouette.
// `telegraph` lowers the head while the tusks glint; `attack` sweeps the tusks up and forward; `intro`
// rises out of a snow drift. The silhouette numbers (head dome left, low body, short legs) were
// tuned so the idle frame clears every older boss under the look-alike policy.

import { dots, draft, ellipse, enemyTemplate, finish, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { lift } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

type TuskPose = 'rest' | 'glint' | 'up' | 'sweep';

interface MammothPose {
  /** Whole-body bob in rows (0 or 1). */
  readonly bob?: number;
  /** Legs: 0 planted, 1 front pair lifted, 2 back pair lifted. */
  readonly step?: 0 | 1 | 2;
  /** Head lowered by this many rows (the telegraph). */
  readonly dip?: number;
  readonly tusk?: TuskPose;
  /** Head pushed forward (left) by this many columns. */
  readonly lunge?: number;
  /** Intro: rows the whole figure is sunk into the drift. */
  readonly sink?: number;
}

/** The tuned silhouette numbers: head dome centre and radii, body centre and radii, leg top row. */
export interface MammothGeom {
  readonly hx: number;
  readonly hy: number;
  readonly hrx: number;
  readonly hry: number;
  readonly bx: number;
  readonly by: number;
  readonly brx: number;
  readonly bry: number;
  readonly legTop: number;
}

export const MAMMOTH_GEOM: MammothGeom = {
  hx: 9,
  hy: 13,
  hrx: 8,
  hry: 10,
  bx: 32,
  by: 25,
  brx: 15,
  bry: 8,
  legTop: 29,
};

export function mammothFrame(p: MammothPose, g: MammothGeom = MAMMOTH_GEOM): string[] {
  const d: Draft = draft(S, S);
  const HX = g.hx;
  const HY = g.hy;
  const b = p.bob ?? 0;
  const dip = p.dip ?? 0;
  const lunge = p.lunge ?? 0;
  const lf = p.step === 1 ? 3 : 0;
  const lb = p.step === 2 ? 3 : 0;
  // four thick legs with a shadow side and a wide foot
  const legs: readonly [number, number][] = [
    [g.bx - 14, lf],
    [g.bx - 6, lf],
    [g.bx + 4, lb],
    [g.bx + 12, lb],
  ];
  for (const [x, lift3] of legs) {
    d.g.rect(x, 31 - lift3, 6, 16, '4');
    d.g.rect(x + 4, 31 - lift3, 2, 16, '2');
    d.g.rect(x, 44 - lift3, 6, 3, '2');
    d.g.rect(x, 44 - lift3, 5, 1, '4');
  }
  // long body, humped at the shoulder
  ellipse(d, g.bx, g.by + b, g.brx, g.bry, '5');
  ellipse(d, g.bx - 6, g.by - 5 + b, 9, 4, '5');
  // belly shade and a ragged fringe of coat hanging under it
  for (let x = 14; x < 46; x++) {
    d.g.set(x, 29 + b + (x % 3 === 0 ? 1 : 0), '4');
    d.g.set(x, 30 + b, x % 4 === 1 ? '4' : '5');
  }
  // head dome
  ellipse(d, HX - lunge, HY + dip + b, g.hrx, g.hry, '5');
  // forehead tuft and cheek shading
  ellipse(d, HX - lunge + 1, HY + dip + b - 7, 4, 2, '7');
  for (let y = 18; y < 26; y++) {
    d.g.set(HX - lunge + 8, y + dip + b, '4');
    d.g.set(HX - lunge + 7, y + dip + b, '4');
  }
  // ear
  ellipse(d, HX - lunge + 6, HY + dip + b - 1, 3, 3.5, '4');
  // trunk: a thick stroke hanging down in front of the chest, ringed with shade
  const trunk: readonly (readonly [number, number])[] = [
    [HX - lunge - 4, HY + dip + b + 8],
    [HX - lunge - 6, 32 + dip],
    [HX - lunge - 7, 40],
    [HX - lunge - 5, 44],
  ];
  stroke(d, trunk, '5', 5);
  for (let y = 30 + dip; y <= 44; y += 4) d.g.rect(HX - lunge - 9, y, 5, 1, '4');
  // eye and brow
  dots(d, [
    [HX - lunge - 3, HY + dip + b + 2, 'e'],
    [HX - lunge - 2, HY + dip + b + 2, 'e'],
    [HX - lunge - 3, HY + dip + b + 1, 'w'],
    [HX - lunge - 4, HY + dip + b, '4'],
    [HX - lunge - 3, HY + dip + b, '4'],
    [HX - lunge - 2, HY + dip + b, '4'],
  ]);
  // tusks
  const t = p.tusk ?? 'rest';
  const base: readonly [number, number] = [HX - lunge - 3, HY + dip + b + 10];
  const tuskPts: Record<TuskPose, readonly (readonly [number, number])[]> = {
    rest: [
      base,
      [HX - lunge - 8, HY + dip + b + 15],
      [HX - lunge - 11, HY + dip + b + 11],
      [HX - lunge - 12, HY + dip + b + 5],
    ],
    glint: [
      base,
      [HX - lunge - 8, HY + dip + b + 15],
      [HX - lunge - 11, HY + dip + b + 11],
      [HX - lunge - 12, HY + dip + b + 5],
    ],
    up: [
      base,
      [HX - lunge - 8, HY + dip + b + 12],
      [HX - lunge - 12, HY + dip + b + 5],
      [HX - lunge - 12, HY + dip + b - 3],
    ],
    sweep: [
      base,
      [HX - lunge - 9, HY + dip + b + 11],
      [HX - lunge - 13, HY + dip + b + 8],
      [HX - lunge - 14, HY + dip + b + 2],
    ],
  };
  stroke(d, tuskPts[t], '7', 3);
  dots(
    d,
    tuskPts[t].map(([x, y]) => [x + 1, y + 1, '6'] as const),
  );
  if (t === 'glint') {
    dots(d, [
      [HX - lunge - 12, HY + dip + b + 4, 'w'],
      [HX - lunge - 11, HY + dip + b + 11, 'w'],
      [HX - lunge - 6, HY + dip + b + 14, 'w'],
    ]);
  }
  // shaggy coat: short darker strands scattered over the flank
  for (let y = 19; y <= 29; y += 3) {
    for (let x = 21 + (y % 2) * 2; x <= 44; x += 5) {
      dots(d, [
        [x, y + b, '4'],
        [x + 1, y + 1 + b, '4'],
      ]);
    }
  }
  // banner stripe across the flank, torn at the ends, and frost rime along the back
  stroke(
    d,
    [
      [24, 17 + b],
      [30, 24 + b],
      [36, 31 + b],
    ],
    '8',
    3,
  );
  dots(d, [
    [23, 17 + b, '8'],
    [37, 32 + b, '8'],
    [38, 33 + b, '8'],
    [28, 16 + b, '7'],
    [32, 17 + b, '7'],
    [36, 18 + b, '7'],
    [40, 21 + b, '7'],
    [26, 14 + b, '7'],
    [22, 15 + b, '7'],
    [19, 23 + b, '6'],
    [44, 25 + b, '6'],
  ]);
  d.g.rect(0, 47, S, 1, '.');
  const out = finish(d);
  return p.sink ? lift(out, -p.sink) : out;
}

export const GLACIER_MAMMOTH: SpriteTemplate = enemyTemplate(
  'glacier-mammoth',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [mammothFrame({}), mammothFrame({ bob: 1 })],
    walk: [mammothFrame({ step: 1 }), mammothFrame({ step: 2, bob: 1 })],
    attack: [
      mammothFrame({ tusk: 'up', bob: 1 }),
      mammothFrame({ tusk: 'sweep', lunge: 3 }),
      mammothFrame({ tusk: 'rest' }),
    ],
    telegraph: [
      mammothFrame({ dip: 3, tusk: 'rest' }),
      mammothFrame({ dip: 3, tusk: 'glint', bob: 1 }),
    ],
    intro: [mammothFrame({ sink: 24 }), mammothFrame({ sink: 8, tusk: 'rest' })],
  },
);
