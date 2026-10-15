// Stage 5 boss "Elder Dryad" (batch E3, step A-E3-6). Owned by the pixel-artist.
// `enemies/elder-dryad`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. A tall tree-spirit
// woman: an antler-branch crown carrying white and gold blossoms, leafy hair trailing back, a
// bark-brown face with glowing eyes, and a gown of trailing vines. She carries a vine staff topped
// with a glowing blossom in front (left). Colors (10): 1 W V L N 5 w a Y e. Phase 2
// (BOSS_PHASE_PALETTES_E3 in palettesE3.ts) overrides `L N w a` so the leaves and blossoms turn warm
// autumn orange and white-gold over the same silhouette. `telegraph` raises the staff while the
// blossoms open wide and the eyes glare; `attack` thrusts the staff forward in a long reach; `intro`
// rises out of the ground.

import { dots, draft, ellipse, enemyTemplate, finish, poly, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { lift } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

interface DryadPose {
  /** Horizontal sway of the crown and the gown hem (-2..2). */
  readonly sway?: number;
  /** Body bob in rows (0 or 1). */
  readonly bob?: number;
  /** Staff: rest held upright in front, lifted high, or thrust forward. */
  readonly staff: 'rest' | 'lift' | 'thrust';
  /** Blossom size: 0 closed buds, 1 normal, 2 open wide. */
  readonly bloom: 0 | 1 | 2;
  readonly glare?: boolean;
  readonly mouth?: boolean;
  /** Intro: rows the whole figure is sunk into the ground. */
  readonly sink?: number;
}

function blossom(d: Draft, x: number, y: number, size: 0 | 1 | 2): void {
  if (size === 0) {
    dots(d, [
      [x, y, 'w'],
      [x, y + 1, 'a'],
    ]);
    return;
  }
  put(d, ['.w.', 'waw', '.w.'], x - 1, y - 1);
  if (size === 2) {
    dots(d, [
      [x - 2, y, 'w'],
      [x + 2, y, 'w'],
      [x, y - 2, 'w'],
      [x, y + 2, 'w'],
    ]);
  }
}

function dryadFrame(p: DryadPose): string[] {
  const d: Draft = draft(S, S);
  const sw = p.sway ?? 0;
  const bob = p.bob ?? 0;
  const cx = 25;
  // gown of vines: a long trapezoid from the waist to a scalloped hem
  poly(
    d,
    [
      [cx - 5, 27 + bob],
      [cx + 5, 27 + bob],
      [cx + 14 + sw, 46],
      [cx - 14 + sw, 46],
    ],
    'N',
  );
  for (let y = 28 + bob; y <= 46; y++) {
    for (let x = 0; x < S; x++) {
      if (d.g.get(x, y) !== 'N') continue;
      if ((x + (y >> 2)) % 4 === 0) d.g.set(x, y, 'L');
      else if (x > cx + 4 + (y - 27) / 3) d.g.set(x, y, '5');
    }
  }
  // scalloped hem
  for (let x = cx - 14 + sw; x <= cx + 14 + sw; x++) {
    if ((x & 3) === 0) d.g.set(x, 46, '.');
    if ((x & 3) === 2) d.g.set(x, 45, '.');
  }
  // torso, a leafy bodice, and bare bark arms
  ellipse(d, cx, 22 + bob, 5.5, 6, 'V');
  put(d, ['LLLLLLLLL', '.LNLLNLL.', '..LLLLL..'], cx - 4, 25 + bob);
  // head and a bark-brown face
  ellipse(d, cx - 1, 12 + bob, 4.5, 5, 'V');
  const ey = 12 + bob;
  dots(d, [
    [cx - 5, ey, p.glare ? 'Y' : 'e'],
    [cx - 4, ey, p.glare ? 'Y' : 'e'],
    [cx - 1, ey, p.glare ? 'Y' : 'e'],
    [cx, ey, p.glare ? 'Y' : 'e'],
    [cx - 5, ey - 1, 'w'],
    [cx - 1, ey - 1, 'w'],
  ]);
  if (p.mouth) put(d, ['eee', '.e.'], cx - 4, ey + 3);
  else
    dots(d, [
      [cx - 4, ey + 3, 'e'],
      [cx - 3, ey + 3, 'e'],
    ]);
  // leafy hair trailing back (right) and down the shoulder
  stroke(
    d,
    [
      [cx + 2, 9 + bob],
      [cx + 8 + sw, 14 + bob],
      [cx + 10 + sw, 24 + bob],
    ],
    'N',
    3,
  );
  dots(d, [
    [cx + 9 + sw, 18 + bob, 'L'],
    [cx + 10 + sw, 21 + bob, 'L'],
    [cx + 8 + sw, 13 + bob, 'L'],
    [cx + 11 + sw, 25 + bob, 'L'],
  ]);
  // antler-branch crown with blossoms
  const ty = 8 + bob;
  stroke(
    d,
    [
      [cx - 4, ty],
      [cx - 8 + sw, 4],
      [cx - 12 + sw, 1],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [cx - 8 + sw, 4],
      [cx - 14 + sw, 5],
    ],
    'W',
    1,
  );
  stroke(
    d,
    [
      [cx - 6 + sw, 6],
      [cx - 9 + sw, 8],
    ],
    'W',
    1,
  );
  stroke(
    d,
    [
      [cx + 2, ty],
      [cx + 6 + sw, 4],
      [cx + 11 + sw, 1],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [cx + 6 + sw, 4],
      [cx + 13 + sw, 5],
    ],
    'W',
    1,
  );
  stroke(
    d,
    [
      [cx + 5 + sw, 6],
      [cx + 9 + sw, 8],
    ],
    'W',
    1,
  );
  blossom(d, cx - 12 + sw, 2, p.bloom);
  blossom(d, cx - 14 + sw, 6, p.bloom);
  blossom(d, cx + 11 + sw, 2, p.bloom);
  blossom(d, cx + 13 + sw, 6, p.bloom);
  blossom(d, cx - 1 + sw, 4, p.bloom);
  // arms and the vine staff held in front (left)
  const sx = p.staff === 'lift' ? 8 : 9;
  const top = p.staff === 'lift' ? 0 : p.staff === 'thrust' ? 26 : 4;
  if (p.staff === 'thrust') {
    stroke(
      d,
      [
        [cx - 5, 22 + bob],
        [10, 28],
        [1, 29],
      ],
      'V',
      3,
    );
    stroke(
      d,
      [
        [0, 28],
        [14, 30],
      ],
      'W',
      2,
    );
    blossom(d, 1, 28, 2);
    dots(d, [
      [0, 25, 'Y'],
      [2, 24, 'Y'],
      [0, 32, 'Y'],
      [3, 33, 'Y'],
    ]);
  } else {
    stroke(
      d,
      [
        [cx - 5, 21 + bob],
        [sx + 2, 27 + bob],
      ],
      'V',
      3,
    );
    stroke(
      d,
      [
        [sx, 46],
        [sx, top + 4],
      ],
      'W',
      2,
    );
    stroke(
      d,
      [
        [sx, top + 8],
        [sx - 3, top + 5],
      ],
      'W',
      1,
    );
    stroke(
      d,
      [
        [sx, top + 11],
        [sx + 3, top + 8],
      ],
      'W',
      1,
    );
    ellipse(d, sx, top + 2, 2.5, 2.5, 'Y');
    blossom(d, sx - 4, top + 5, p.bloom);
    blossom(d, sx + 4, top + 8, p.bloom);
  }
  stroke(
    d,
    [
      [cx + 5, 21 + bob],
      [cx + 9 + sw, 30 + bob],
    ],
    'V',
    3,
  );
  dots(d, [
    [cx + 9 + sw, 31 + bob, 'L'],
    [cx + 10 + sw, 32 + bob, 'L'],
  ]);
  d.g.rect(0, 47, S, 1, '.');
  const out = finish(d);
  return p.sink ? lift(out, -p.sink) : out;
}

export const ELDER_DRYAD: SpriteTemplate = enemyTemplate(
  'elder-dryad',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [
      dryadFrame({ staff: 'rest', bloom: 1 }),
      dryadFrame({ staff: 'rest', bloom: 1, sway: 1, bob: 1 }),
    ],
    walk: [
      dryadFrame({ staff: 'rest', bloom: 1, sway: -1, bob: 1 }),
      dryadFrame({ staff: 'rest', bloom: 0, sway: 2 }),
    ],
    attack: [
      dryadFrame({ staff: 'lift', bloom: 1, sway: 1 }),
      dryadFrame({ staff: 'thrust', bloom: 2, mouth: true, sway: -2 }),
      dryadFrame({ staff: 'rest', bloom: 1, sway: 1, bob: 1 }),
    ],
    telegraph: [
      dryadFrame({ staff: 'lift', bloom: 1, glare: true }),
      dryadFrame({ staff: 'lift', bloom: 2, glare: true, mouth: true, sway: 1 }),
    ],
    intro: [
      dryadFrame({ staff: 'rest', bloom: 0, sink: 24 }),
      dryadFrame({ staff: 'rest', bloom: 1, sink: 9, sway: 1 }),
    ],
  },
);
