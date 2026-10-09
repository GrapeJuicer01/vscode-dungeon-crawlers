// Effect sprites for batch H2 (A2-3): the cosmetic things Cleric, Paladin, Necromancer, and Bard do.
// Owned by the pixel-artist. Same rules as effectTemplates.ts: one `idle` animation, anchor at the
// sprite centre, master characters only (never class-swapped), at most 8 colours each, calm and
// never read as damage taken: no red, no full-body white, no cracks, no icons or gauges above a
// hero. Colors: gold `Y a`, white `w`, pale blue `q Q`, blue `c d` (all master characters).

import { Grid, loopTemplate } from './spriteBuilder';
import type { EffectSpriteIdH2, SpriteTemplate } from './spriteTypes';

/** Plots a connected 1px ellipse outline; `pick` chooses the character from the angle and step. */
function ellipse(
  g: Grid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pick: (angle: number, step: number) => string,
): void {
  const steps = Math.ceil(8 * Math.max(rx, ry));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const ch = pick(a, i);
    if (ch === '.') continue;
    g.set(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)), ch);
  }
}

// buffSparkle 16x16: four twinkling four-point stars, each a step apart in a 3-step cycle.
const SPARKLE_AT = [
  [3, 4],
  [11, 3],
  [5, 11],
  [12, 10],
] as const;

function twinkle(g: Grid, x: number, y: number, size: number): void {
  g.set(x, y, 'w');
  if (size >= 1) {
    g.plot([
      [x - 1, y, 'Y'],
      [x + 1, y, 'Y'],
      [x, y - 1, 'Y'],
      [x, y + 1, 'Y'],
    ]);
  }
  if (size >= 2) {
    g.plot([
      [x - 2, y, 'a'],
      [x + 2, y, 'a'],
      [x, y - 2, 'a'],
      [x, y + 2, 'a'],
    ]);
  }
}

function sparkleFrame(step: number): string[] {
  const g = new Grid(16, 16);
  SPARKLE_AT.forEach(([x, y], i) => twinkle(g, x, y - ((step + i) % 2), (step + i) % 3));
  g.set(8, 7 - step, 'a');
  g.set(2, 9 + step, 'Y');
  g.set(13, 14 - step, 'Y');
  return g.rows();
}

// blessGlow 24x12: a soft gold ring seen edge-on around the feet, widening, with motes rising.
function blessFrame(
  rx: number,
  ry: number,
  dashed: boolean,
  motes: readonly (readonly [number, number])[],
): string[] {
  const g = new Grid(24, 12);
  ellipse(g, 11.5, 6.5, rx, ry, (a, i) => {
    if (dashed && i % 5 > 2) return '.';
    if (dashed) return 'a';
    return Math.sin(a) > 0 ? 'Y' : 'a';
  });
  if (!dashed)
    ellipse(g, 11.5, 6.5, rx - 1.5, ry - 1, (a, i) => (Math.sin(a) > 0 && i % 3 === 0 ? 'w' : '.'));
  for (const [x, y] of motes) g.set(x, y, 'w');
  return g.rows();
}

// holyBurst 24x24: a small radiant cross, eight rays, a thin fading ring (gold and white).
function crossFrame(): string[] {
  const g = new Grid(24, 24);
  const c = 12;
  for (let i = -5; i <= 4; i++) {
    g.set(c + i, c - 1, 'Y');
    g.set(c - 1, c + i, 'Y');
  }
  g.rect(c - 2, c - 2, 4, 4, 'w');
  g.plot([
    [c - 4, c - 4, 'a'],
    [c + 3, c - 4, 'a'],
    [c - 4, c + 3, 'a'],
    [c + 3, c + 3, 'a'],
  ]);
  return g.rows();
}

function rayFrame(): string[] {
  const g = new Grid(24, 24);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const ch = k % 2 === 0 ? 'Y' : 'a';
    for (let r = 4; r <= 9; r++) {
      if (k % 2 === 1 && r > 7) continue;
      g.set(Math.round(11.5 + r * Math.cos(a)), Math.round(11.5 + r * Math.sin(a)), ch);
    }
  }
  ellipse(g, 11.5, 11.5, 3, 3, (_a, i) => (i % 2 === 0 ? 'w' : '.'));
  return g.rows();
}

function haloFrame(): string[] {
  const g = new Grid(24, 24);
  ellipse(g, 11.5, 11.5, 10.5, 10.5, (_a, i) => (Math.floor(i / 3) % 2 === 0 ? 'a' : '.'));
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    g.set(
      Math.round(11.5 + 7 * Math.cos(a)),
      Math.round(11.5 + 7 * Math.sin(a)),
      k % 2 === 0 ? 'Y' : 'w',
    );
  }
  return g.rows();
}

export const EFFECT_SPRITES_H2: Readonly<Record<EffectSpriteIdH2, SpriteTemplate>> = {
  buffSparkle: loopTemplate(
    'effects/buffSparkle',
    [sparkleFrame(0), sparkleFrame(1), sparkleFrame(2)],
    {
      x: 8,
      y: 8,
    },
  ),
  // a music note (eighth note, flag flips and the note drifts up a pixel on the second frame)
  note: loopTemplate(
    'effects/note',
    [
      ['....qq.', '....qQq', '....qQ.', '....q..', '....q..', '..qqq..', '.qwQQ..', '..qQ...'],
      ['.......', '....qq.', '....qQq', '....q.Q', '....q..', '..qqq..', '.qwQQ..', '..qQ...'],
    ],
    { x: 3, y: 4 },
  ),
  blessGlow: loopTemplate(
    'effects/blessGlow',
    [
      blessFrame(5, 2.4, false, [
        [9, 3],
        [14, 2],
      ]),
      blessFrame(8.5, 3.8, false, [
        [7, 2],
        [12, 1],
        [16, 3],
      ]),
      blessFrame(11, 5, true, [
        [5, 1],
        [18, 2],
      ]),
    ],
    { x: 12, y: 6 },
  ),
  holyBurst: loopTemplate('effects/holyBurst', [crossFrame(), rayFrame(), haloFrame()], {
    x: 12,
    y: 12,
  }),
  // a pale soul wisp that flies right, tail trailing behind and wavering
  soulWisp: loopTemplate(
    'effects/soulWisp',
    [
      [
        '..........',
        '......qq..',
        '.Q..qqqwq.',
        'QQqqqqqdqQ',
        '.Qq.qqqqQ.',
        '....QQQ...',
        '..........',
      ],
      [
        '..........',
        '.....qqq..',
        '..Qqqqqwq.',
        '.QQqqqqdqQ',
        'Q.qqqqqqQ.',
        '.....QQQ..',
        '..........',
      ],
      [
        '..........',
        '......qq..',
        'Q...qqqwq.',
        '.QQqqqqdqQ',
        '..qQqqqqQ.',
        '....QQQ...',
        '..........',
      ],
    ],
    { x: 5, y: 3 },
  ),
};
