// Stage 3 boss "Ooze Queen" (batch E2, step A-E2-6). Owned by the pixel-artist.
// `enemies/ooze-queen`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. A big lime slime
// queen with a drippy gold crown, large eyes, and bubbles rising inside her body. Colors (9):
// 1 L N a Y R w e q. Phase 2 (BOSS_PHASE_PALETTES_E2 in palettesE2.ts) overrides `L N a Y` for a
// hot pink-orange glow over the same silhouette. `telegraph` swells her up and tips her forward
// with a wide open mouth and glowing eyes; `attack` is a low forward lunge with a stretched
// arm of slime.

import { dots, draft, ellipse, enemyTemplate, finish, put } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

interface QueenPose {
  /** Half height of the upper body (14 is normal). */
  readonly h?: number;
  /** Half width of the skirt (20 is normal). */
  readonly w?: number;
  /** Horizontal shift of the upper body (negative = forward / left). */
  readonly tilt?: number;
  /** Half width of the upper body (15 is normal). */
  readonly rx?: number;
  readonly mouth?: 0 | 1 | 2;
  /** How far the bubbles have risen (0 to 3). */
  readonly bub?: number;
  /** Stretched arm of slime pointing forward. */
  readonly arm?: boolean;
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
  const h = p.h ?? 14;
  const w = p.w ?? 20;
  const tilt = p.tilt ?? 0;
  const sink = p.sink ?? 0;
  const cx = 25;
  const topCy = 17 + h + sink;
  ellipse(d, cx + tilt, topCy, p.rx ?? 15, h, 'L');
  ellipse(d, cx, 38 + Math.floor(sink / 2), w, 8, 'L');
  if (p.arm) {
    ellipse(d, 9 + tilt, 36, 5, 3, 'L');
    ellipse(d, 4, 35, 3, 2, 'L');
  }
  d.g.rect(0, 47, S, 1, '.');
  // shade on the lower and right parts
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (d.g.get(x, y) !== 'L') continue;
      if (y >= 43 || (x - cx > 8 && y > topCy - h + 8) || (x - cx > 12 && y > topCy - h + 4)) {
        d.g.set(x, y, 'N');
      }
    }
  }
  const ex = cx + tilt;
  const ey = topCy - 4;
  // eyes
  for (const dx of [-12, -3]) {
    put(d, ['.ww.', 'wwww', 'wwww', 'wwww', '.ww.'], ex + dx, ey);
    if (p.glare) {
      put(d, ['YY', 'YY', 'YY'], ex + dx, ey + 1);
    } else {
      put(d, ['ee', 'ee', 'ee'], ex + dx, ey + 1);
    }
  }
  // brow ridge of darker slime and cheeks
  put(d, ['NNNN'], ex - 12, ey - 1);
  put(d, ['NNNN'], ex - 3, ey - 1);
  // mouth
  const my = ey + 8;
  if (p.mouth === 2) {
    put(d, ['eeeeeeeeee', 'eeeeeeeeee', 'eRRRRRReee', '.eeRRRee..'], ex - 15, my);
    dots(d, [
      [ex - 15, my, 'w'],
      [ex - 11, my, 'w'],
      [ex - 7, my, 'w'],
    ]);
  } else if (p.mouth === 1) {
    put(d, ['eeeeee', 'eeeeee', '.eeee.'], ex - 14, my);
    dots(d, [
      [ex - 14, my, 'w'],
      [ex - 10, my, 'w'],
    ]);
  } else {
    put(d, ['eeeeeee'], ex - 14, my);
    dots(d, [
      [ex - 15, my - 1, 'e'],
      [ex - 8, my - 1, 'e'],
    ]);
  }
  // bubbles rising inside the body
  const b = p.bub ?? 0;
  const bubs: readonly (readonly [number, number])[] = [
    [cx + 6, 40 - b * 3],
    [cx + 12, 33 - b * 2],
    [cx + 3, 26 - b * 2],
    [cx + 14, 41 - b * 4],
    [cx + 17, 38 - b],
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
    [ex + 8, topCy - h + 4, 'w'],
    [ex + 9, topCy - h + 5, 'w'],
    [ex + 9, topCy - h + 6, 'w'],
    [ex + 10, topCy - h + 7, 'w'],
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

const IDLE: QueenPose = {};

export const OOZE_QUEEN: SpriteTemplate = enemyTemplate(
  'ooze-queen',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [queenFrame({ ...IDLE, bub: 0 }), queenFrame({ h: 13, w: 21, bub: 1 })],
    walk: [queenFrame({ h: 13, w: 22, tilt: -1, bub: 2 }), queenFrame({ h: 15, w: 19, bub: 3 })],
    attack: [
      queenFrame({ h: 16, w: 18, tilt: 3, bub: 1 }),
      queenFrame({ h: 11, w: 22, tilt: -4, mouth: 2, arm: true, bub: 2 }),
      queenFrame({ h: 13, w: 21, tilt: -2, mouth: 1, bub: 3 }),
    ],
    telegraph: [
      queenFrame({ h: 14, w: 23, rx: 18, tilt: 2, mouth: 1, glare: true, bub: 1 }),
      queenFrame({ h: 12, w: 22, rx: 17, tilt: -3, mouth: 2, glare: true, bub: 3 }),
    ],
    intro: [
      queenFrame({ h: 8, w: 21, sink: 9, bub: 0, drip: 0 }),
      queenFrame({ h: 12, w: 21, sink: 3, mouth: 1, bub: 2 }),
    ],
  },
);
