// Stage 4 boss "Tomb Lich" (batch E2, step A-E2-6). Owned by the pixel-artist.
// `enemies/tomb-lich`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. Reworked in A-E5-0
// (body leaning to the right, slim robe with ragged tatters, staff alone in the upper left) to clear
// rat-king. A robed skeleton
// with a tall spiked gold crown, glowing green eyes, and a staff topped by a floating gem. Colors
// (11): 1 8 2 7 5 a k L N Y e. Phase 2 (BOSS_PHASE_PALETTES_E2 in palettesE2.ts) overrides
// `L N 8 Y`: a white-hot gem and eyes and a hot magenta robe over the same silhouette.
// `telegraph` lifts the staff high while the gem swells and throws out rays; `attack` winds the
// staff back, then thrusts it forward.

import { dots, draft, ellipse, enemyTemplate, finish, poly, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

type Pt = readonly [number, number];
const S = 48;
/**
 * The whole upper body leans back to the right (skull and crown over the right half, a slim robe
 * skewing to the left hem) so the silhouette keeps clear of the big central bosses; the staff
 * stands alone in the empty upper-left corner. `lean` in a pose is relative to this base.
 */
const LEAN_BASE = 4;

interface LichPose {
  readonly bob?: number;
  /** Staff top (the tip below the gem prongs). */
  readonly top?: Pt;
  /** Hand position on the staff. */
  readonly hand?: Pt;
  readonly gem?: 0 | 1 | 2;
  readonly hem?: number;
  readonly mouth?: boolean;
  readonly lean?: number;
  /** Rows the figure is sunk into the floor (intro). */
  readonly sink?: number;
  readonly glare?: boolean;
}

function gem(d: Draft, cx: number, cy: number, size: 0 | 1 | 2): void {
  if (size === 0) {
    put(d, ['.L.', 'LYL', '.L.'], cx - 1, cy - 1);
    return;
  }
  put(d, ['..L..', '.LYL.', 'LYYYL', '.LYL.', '..L..'], cx - 2, cy - 2);
  dots(d, [
    [cx - 3, cy, 'N'],
    [cx + 3, cy, 'N'],
    [cx, cy - 3, 'N'],
    [cx, cy + 3, 'N'],
  ]);
  if (size === 2) {
    dots(d, [
      [cx - 5, cy, 'Y'],
      [cx + 5, cy, 'Y'],
      [cx, cy - 5, 'Y'],
      [cx - 4, cy - 4, 'Y'],
      [cx + 4, cy - 4, 'Y'],
      [cx - 4, cy + 4, 'Y'],
      [cx + 4, cy + 4, 'Y'],
    ]);
  }
}

function lichFrame(p: LichPose): string[] {
  const d = draft(S, S);
  const bob = p.bob ?? 0;
  const lean = (p.lean ?? 0) + LEAN_BASE;
  const sink = p.sink ?? 0;
  const top = p.top ?? [5, 10];
  const hand = p.hand ?? [9, 29];
  const hem = p.hem ?? 0;
  const by = bob + sink;
  // staff first (behind the robe)
  stroke(
    d,
    [
      [top[0] + 2, 46],
      [top[0], top[1]],
    ],
    'k',
    2,
  );
  // prongs holding the gem
  dots(d, [
    [top[0] - 2, top[1] - 1, 'a'],
    [top[0] - 2, top[1] - 2, 'a'],
    [top[0] + 3, top[1] - 1, 'a'],
    [top[0] + 3, top[1] - 2, 'a'],
    [top[0], top[1] + 4, 'a'],
    [top[0] + 1, top[1] + 4, 'a'],
  ]);
  gem(d, top[0] + 1, top[1] - 6, p.gem ?? 1);
  // robe: a wide cone ending in a ragged hem
  poly(
    d,
    [
      [19 + lean, 26 + by],
      [35 + lean, 26 + by],
      [30 + lean, 36 + by],
      [32, 47],
      [14, 47],
      [16 + lean, 36 + by],
    ],
    '8',
  );
  // fold shading, right side darker
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (d.g.get(x, y) !== '8') continue;
      if (x - lean > 30 - Math.floor((y - 26) / 5) || (x + y) % 9 === 0) d.g.set(x, y, '2');
    }
  // gold belt and hem trim
  for (let x = 14; x <= 36; x++) {
    if (d.g.get(x, 35 + by) === '8' || d.g.get(x, 35 + by) === '2') d.g.set(x, 35 + by, 'a');
  }
  for (let x = 13; x <= 44; x++) {
    if (d.g.get(x, 41) === '8' || d.g.get(x, 41) === '2') d.g.set(x, 41, 'a');
    // ragged hem: pointed tatters that thin to single threads at the floor
    for (let y = 42; y <= 46; y++) {
      if ((x + hem) % 7 < y - 41) d.g.set(x, y, '.');
    }
  }
  d.g.rect(0, 47, S, 1, '.');
  if (sink > 0) d.g.rect(0, 47 - sink, S, sink, '.');
  // sleeve and hand on the staff
  stroke(
    d,
    [
      [19 + lean, 29 + by],
      [hand[0] + 3, hand[1] + by],
    ],
    '8',
    4,
  );
  put(d, ['77', '77'], hand[0], hand[1] - 1 + by);
  dots(d, [
    [hand[0] - 1, hand[1] + by, '7'],
    [hand[0], hand[1] + 2 + by, '5'],
  ]);
  // skull, jaw, eye sockets with a green glow, teeth
  const hx = 23 + lean;
  const hy = 19 + by;
  // hood behind the skull
  ellipse(d, hx + 2, hy + 2, 8, 8, '2');
  ellipse(d, hx, hy, 6, 6, '7');
  put(d, ['7777777', '7577577', '.5757.'], hx - 4, hy + 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) if (d.g.get(x, y) === '7' && x >= hx + 4) d.g.set(x, y, '5');
  put(d, ['eee', 'eLe', 'eee'], hx - 5, hy - 2);
  put(d, ['eee', 'eLe', 'eee'], hx + 1, hy - 2);
  if (p.glare) {
    dots(d, [
      [hx - 5, hy - 1, 'L'],
      [hx - 3, hy - 1, 'L'],
      [hx + 1, hy - 1, 'L'],
      [hx + 3, hy - 1, 'L'],
    ]);
  }
  dots(d, [
    [hx - 1, hy + 2, 'e'],
    [hx, hy + 2, 'e'],
  ]);
  if (p.mouth) put(d, ['eeeee', 'eeeee'], hx - 3, hy + 5);
  // crown: gold band and tall spikes with bright tips
  put(d, ['aaaaaaaaaaaaa', 'aYaaaYaaaYaaa'], hx - 6, hy - 8);
  const spikes: readonly (readonly [number, number])[] = [
    [hx - 5, 5],
    [hx - 2, 8],
    [hx + 1, 11],
    [hx + 4, 8],
    [hx + 6, 5],
  ];
  for (const [sx, h] of spikes) {
    for (let k = 1; k <= h; k++) dots(d, [[sx, hy - 8 - k, 'a']]);
    dots(d, [[sx, hy - 8 - h, 'Y']]);
  }
  return finish(d);
}

const IDLE: LichPose = {};

export const TOMB_LICH: SpriteTemplate = enemyTemplate(
  'tomb-lich',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [lichFrame({ ...IDLE }), lichFrame({ bob: 1, hem: 3, top: [5, 11], hand: [9, 30] })],
    walk: [
      lichFrame({ bob: 1, hem: 2, lean: -1 }),
      lichFrame({ hem: 4, top: [6, 10], hand: [10, 29] }),
    ],
    attack: [
      lichFrame({ lean: 1, top: [12, 14], hand: [12, 30], gem: 1, bob: 1 }),
      lichFrame({ lean: -2, top: [1, 20], hand: [6, 31], gem: 2, mouth: true, hem: 2 }),
      lichFrame({ top: [4, 11], hand: [8, 30], gem: 1 }),
    ],
    telegraph: [
      lichFrame({ top: [5, 8], hand: [9, 24], gem: 1, glare: true, bob: -1 }),
      lichFrame({
        top: [4, 7],
        hand: [9, 22],
        gem: 2,
        glare: true,
        mouth: true,
        bob: -2,
        lean: 1,
      }),
    ],
    intro: [
      lichFrame({ sink: 18, top: [5, 18], hand: [9, 34], gem: 0 }),
      lichFrame({ sink: 6, top: [5, 9], hand: [9, 27], gem: 1, mouth: true, glare: true }),
    ],
  },
);
