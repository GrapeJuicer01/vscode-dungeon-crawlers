// Effect sprites (batch A1-1): small cosmetic things heroes do. Owned by the pixel-artist.
// Each is a one-animation (`idle`) template with the anchor at the sprite centre; the engine moves,
// mirrors, and fades them. Master palette characters only (never class-swapped), at most 8 colours
// each. No red, no full-body white, no cracks, no stars, no ticks: nothing reads as damage taken.

import { Grid, loopTemplate } from './spriteBuilder';
import { EFFECT_SPRITES_H2 } from './effectTemplatesH2';
import { EFFECT_SPRITES_H3 } from './effectTemplatesH3';
import type { EffectSpriteId, EffectSpriteIdH1, SpriteTemplate } from './spriteTypes';

/** Plots a connected 1px ellipse outline; `pick` chooses the character from the angle (radians). */
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

// whirl 24x12: a steel arc ring seen edge-on, expanding; the front (lower) arc is brighter.
function whirlFrame(rx: number, ry: number, double: boolean, dashed: boolean): string[] {
  const g = new Grid(24, 12);
  const pick = (a: number, i: number): string => {
    if (dashed && i % 5 > 2) return '.';
    if (dashed) return 'G';
    return Math.sin(a) > 0 ? 'w' : 'm';
  };
  ellipse(g, 11.5, 5.5, rx, ry, pick);
  if (double) ellipse(g, 11.5, 5.5, rx - 1.3, ry - 1, (a) => (Math.sin(a) > 0 ? 'm' : 'G'));
  return g.rows();
}

// arcaneBurst 24x24: small star, ring, fading ring (blue and gold, with white centre sparkle).
function starFrame(): string[] {
  const g = new Grid(24, 24);
  const c = 12;
  for (let i = -4; i <= 3; i++) {
    g.set(c + i, c - 1, 'c');
    g.set(c + i, c, 'c');
    g.set(c - 1, c + i, 'c');
    g.set(c, c + i, 'c');
  }
  g.rect(c - 2, c - 2, 4, 4, 'w');
  for (const [dx, dy] of [
    [-4, -4],
    [3, -4],
    [-4, 3],
    [3, 3],
  ] as const) {
    g.set(c + dx, c + dy, 'a');
    g.set(c + dx + (dx < 0 ? 1 : -1), c + dy + (dy < 0 ? 1 : -1), 'd');
  }
  g.set(c - 5, c - 1, 'w');
  g.set(c + 4, c, 'w');
  return g.rows();
}

function burstRing(r: number, fade: boolean): string[] {
  const g = new Grid(24, 24);
  const pick = (a: number, i: number): string => {
    if (fade) return Math.floor(i / 3) % 2 === 0 ? 'd' : '.';
    return Math.sin(a) < -0.3 ? 'c' : 'd';
  };
  ellipse(g, 11.5, 11.5, r, r, pick);
  if (!fade) {
    ellipse(g, 11.5, 11.5, r - 1.4, r - 1.4, (_a, i) => (Math.floor(i / 4) % 3 === 0 ? 'w' : '.'));
  }
  // gold sparks at the four compass points
  const o = r + (fade ? 0.6 : 0);
  for (const [dx, dy] of [
    [o, 0],
    [-o, 0],
    [0, o],
    [0, -o],
  ] as const) {
    g.set(Math.round(11.5 + dx), Math.round(11.5 + dy), 'a');
    g.set(
      Math.round(11.5 + dx * 1.0 - (dx !== 0 ? Math.sign(dx) : 0)),
      Math.round(11.5 + dy - (dy !== 0 ? Math.sign(dy) : 0)),
      'a',
    );
  }
  return g.rows();
}

// smokePuff 12x10: slate and indigo wisp that grows and thins.
function puffFrame(blobs: readonly (readonly [number, number, number])[], thin: boolean): string[] {
  const g = new Grid(12, 10);
  for (const [bx, by, br] of blobs) {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 12; x++) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
        if (d > br) continue;
        if (thin && (x + y) % 2 === 1) continue;
        g.set(x, y, d > br - 1.1 ? 'P' : d < br * 0.45 ? 'G' : 'b');
      }
    }
  }
  return g.rows();
}

const arrow = loopTemplate('effects/arrow', [['ww.....m..', 'wkkkkkkmmm', 'ww.....m..']], {
  x: 5,
  y: 1,
});

export const EFFECT_SPRITES_H1: Readonly<Record<EffectSpriteIdH1, SpriteTemplate>> = {
  whirl: loopTemplate(
    'effects/whirl',
    [
      whirlFrame(6, 2.8, false, false),
      whirlFrame(9, 4, true, false),
      whirlFrame(11.4, 5.3, false, true),
    ],
    { x: 12, y: 6 },
  ),
  orbBolt: loopTemplate(
    'effects/orbBolt',
    [
      ['..dd..', '.dccd.', 'dcwwcd', 'dcwcca', '.dccd.', '..dd..'],
      ['.dccd.', 'dcwwcd', 'cwwwwc', 'cwwwca', 'dcwwcd', '.dccd.'],
    ],
    { x: 3, y: 3 },
  ),
  arcaneBurst: loopTemplate(
    'effects/arcaneBurst',
    [starFrame(), burstRing(8, false), burstRing(11, true)],
    { x: 12, y: 12 },
  ),
  arrow,
  dagger: loopTemplate(
    'effects/dagger',
    [
      ['...ooo.', '..bmmm.', 'bbbmmmw', '..booo.', '.......'],
      ['.....mw', '....mm.', '..bmm..', '.bbb...', 'bb.....'],
    ],
    { x: 3, y: 2 },
  ),
  smokePuff: loopTemplate(
    'effects/smokePuff',
    [
      puffFrame(
        [
          [6, 6, 3],
          [4.5, 7, 2.2],
        ],
        false,
      ),
      puffFrame(
        [
          [6, 5.5, 4.6],
          [3, 6.5, 2.6],
          [9, 6.5, 2.6],
        ],
        false,
      ),
      puffFrame(
        [
          [6, 4, 5],
          [2.5, 5.5, 2.5],
          [9.5, 5.5, 2.5],
        ],
        true,
      ),
    ],
    { x: 6, y: 5 },
  ),
};

/** All effect sprites (H1 + H2 + H3). */
export const EFFECT_SPRITES: Readonly<Record<EffectSpriteId, SpriteTemplate>> = {
  ...EFFECT_SPRITES_H1,
  ...EFFECT_SPRITES_H2,
  ...EFFECT_SPRITES_H3,
};
