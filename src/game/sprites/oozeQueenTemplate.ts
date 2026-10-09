// Stage 3 boss "Ooze Queen" (batch E2, step A-E2-6). Owned by the pixel-artist.
// `enemies/ooze-queen`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. A big lime slime
// queen with a drippy gold crown, large eyes, and bubbles rising inside her body. Colors (9):
// 1 L N a Y R w e q. Phase 2 (BOSS_PHASE_PALETTES_E2 in palettesE2.ts) overrides `L N a Y` for a
// hot pink-orange glow over the same silhouette. `telegraph` swells her up and tips her forward
// with a wide open mouth and glowing eyes; `attack` is a low forward lunge with a stretched
// arm of slime.

import { dots, draft, ellipse, enemyTemplate, finish, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

interface QueenPose {
  /** Half height of the head and chest (12 is normal). */
  readonly h?: number;
  /** Half width of the gown base (18 is normal). */
  readonly w?: number;
  /** Horizontal shift of the upper body (negative = forward / left). */
  readonly tilt?: number;
  /** Half width of the head and chest (11 is normal). */
  readonly rx?: number;
  readonly mouth?: 0 | 1 | 2;
  /** How far the bubbles have risen (0 to 3). */
  readonly bub?: number;
  /** Raised slime arms: 0 down at the sides, 1 half raised, 2 fully raised (a wave). */
  readonly arms?: 0 | 1 | 2;
  /** Stretched arm of slime pointing forward (the lunge). */
  readonly reach?: boolean;
  /** Eyes glow (telegraph): the pupils are replaced by bright cores. */
  readonly glare?: boolean;
  /** Sunk into a puddle: body height after the crown (intro). */
  readonly sink?: number;
  readonly drip?: number;
}

function crown(d: Draft, x: number, y: number): void {
  put(
    d,
    [
      '..Y.....Y.....Y..',
      '..a....aYa....a..',
      '..aa...aaa...aa..',
      '..aaa.aaRaa.aaa..',
      '.aaaaaaaaaaaaaaa.',
      'aaYaaaaaaaaaaaYaa',
      'aaaaaaaaaaaaaaaaa',
      '.a..aa...a...a.a.',
      '.a...a.......a...',
    ],
    x,
    y,
  );
}

function queenFrame(p: QueenPose): string[] {
  const d = draft(S, S);
  const h = p.h ?? 12;
  const w = p.w ?? 15;
  const tilt = p.tilt ?? 0;
  const sink = p.sink ?? 0;
  const arms = p.arms ?? 0;
  const cx = 25;
  const topCy = 15 + h + sink;
  // head and chest, then a gown that widens into a puddle
  ellipse(d, cx + tilt, topCy, p.rx ?? 11, h, 'L');
  stroke(
    d,
    [
      [cx + tilt, topCy + h - 4],
      [cx, 40],
    ],
    'L',
    14,
  );
  ellipse(d, cx, 38 + Math.floor(sink / 2), w - 4, 7, 'L');
  ellipse(d, cx, 44, w + 2, 3, 'L');
  // raised arms with round hands (the wave), or a reaching arm in the lunge
  if (arms > 0) {
    const up = arms === 2 ? 9 : 20;
    for (const sgn of [-1, 1]) {
      const sx = cx + tilt + sgn * 9;
      const hx = cx + sgn * (arms === 2 ? 21 : 18);
      stroke(
        d,
        [
          [sx, topCy + 4 + sink],
          [(sx + hx) / 2 + sgn * 2, (topCy + up) / 2 + 4],
          [hx, up + sink],
        ],
        'L',
        4,
      );
      ellipse(d, hx, up - 1 + sink, 3, 3, 'L');
    }
  }
  if (p.reach) {
    stroke(
      d,
      [
        [cx + tilt - 8, topCy + 8],
        [8 + tilt, 34],
      ],
      'L',
      4,
    );
    ellipse(d, 5, 34, 3, 3, 'L');
  }
  d.g.rect(0, 47, S, 1, '.');
  // shade on the lower and right parts
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (d.g.get(x, y) !== 'L') continue;
      if (y >= 43 || (x - cx > 6 && y > topCy - h + 8) || (x - cx > 10 && y > topCy - h + 4)) {
        d.g.set(x, y, 'N');
      }
    }
  }
  const ex = cx + tilt;
  const ey = topCy - 4;
  // eyes
  for (const dx of [-9, -2]) {
    put(d, ['.ww.', 'wwww', 'wwww', 'wwww', '.ww.'], ex + dx, ey);
    if (p.glare) {
      put(d, ['YY', 'YY', 'YY'], ex + dx, ey + 1);
    } else {
      put(d, ['ee', 'ee', 'ee'], ex + dx, ey + 1);
    }
  }
  // brow ridge of darker slime
  put(d, ['NNNN'], ex - 9, ey - 1);
  put(d, ['NNNN'], ex - 2, ey - 1);
  // mouth
  const my = ey + 8;
  if (p.mouth === 2) {
    put(d, ['eeeeeeeee', 'eeeeeeeee', 'eRRRRRRee', '.eeRRRee.'], ex - 11, my);
    dots(d, [
      [ex - 11, my, 'w'],
      [ex - 7, my, 'w'],
      [ex - 3, my, 'w'],
    ]);
  } else if (p.mouth === 1) {
    put(d, ['eeeeee', 'eeeeee', '.eeee.'], ex - 10, my);
    dots(d, [
      [ex - 10, my, 'w'],
      [ex - 6, my, 'w'],
    ]);
  } else {
    put(d, ['eeeeeee'], ex - 10, my);
    dots(d, [
      [ex - 11, my - 1, 'e'],
      [ex - 4, my - 1, 'e'],
    ]);
  }
  // bubbles rising inside the gown
  const b = p.bub ?? 0;
  const bubs: readonly (readonly [number, number])[] = [
    [cx + 5, 40 - b * 3],
    [cx + 9, 33 - b * 2],
    [cx + 2, 27 - b * 2],
    [cx + 11, 41 - b * 4],
    [cx + 14, 40 - b],
  ];
  for (const [bx, by] of bubs) {
    if (by < topCy - h + 3) continue;
    dots(d, [
      [bx, by, 'q'],
      [bx + 1, by, 'q'],
      [bx, by + 1, 'q'],
    ]);
  }
  // highlight streak on the upper right of the head
  dots(d, [
    [ex + 6, topCy - h + 4, 'w'],
    [ex + 7, topCy - h + 5, 'w'],
    [ex + 7, topCy - h + 6, 'w'],
    [ex + 8, topCy - h + 7, 'w'],
  ]);
  // crown last, sitting on the top of the head
  crown(d, ex - 8, topCy - h - 6);
  // slime drip falling in front
  if (p.drip) {
    dots(d, [
      [8, 40 + p.drip, 'L'],
      [8, 41 + p.drip, 'L'],
      [8, 42 + p.drip, 'N'],
    ]);
  }
  return finish(d);
}

export const OOZE_QUEEN: SpriteTemplate = enemyTemplate(
  'ooze-queen',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [queenFrame({ arms: 2, bub: 0 }), queenFrame({ h: 11, w: 19, arms: 1, bub: 1 })],
    walk: [
      queenFrame({ h: 11, w: 19, tilt: -1, arms: 1, bub: 2 }),
      queenFrame({ h: 13, w: 17, arms: 2, bub: 3 }),
    ],
    attack: [
      queenFrame({ h: 13, w: 16, tilt: 3, arms: 2, bub: 1 }),
      queenFrame({ h: 10, w: 20, tilt: -4, mouth: 2, reach: true, bub: 2 }),
      queenFrame({ h: 11, w: 19, tilt: -2, mouth: 1, arms: 1, bub: 3 }),
    ],
    telegraph: [
      queenFrame({ h: 12, w: 20, rx: 14, tilt: 2, mouth: 1, glare: true, arms: 2, bub: 1 }),
      queenFrame({ h: 11, w: 20, rx: 13, tilt: -3, mouth: 2, glare: true, arms: 2, bub: 3 }),
    ],
    intro: [
      queenFrame({ h: 8, w: 19, sink: 9, bub: 0, drip: 0 }),
      queenFrame({ h: 11, w: 19, sink: 3, mouth: 1, arms: 1, bub: 2 }),
    ],
  },
);
