// Effect sprites for batch H3 (A3-1): leaf (Druid), chiOrb and chiBurst (Monk), warCry (Berserker),
// wrench (Artificer). Owned by the pixel-artist. Same rules as effectTemplates.ts: one `idle`
// animation, anchor at the sprite centre, master characters only (never class-swapped), at most
// 8 colours each, calm, never damage-like: no red (no R, D, or class accent), no full-body white,
// no cracks, no stars over a head, no gauges, no persistent icons.

import { Grid, loopTemplate } from './spriteBuilder';
import type { EffectSpriteIdH3, SpriteTemplate } from './spriteTypes';

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

// chiOrb 7x7: a small warm glow, light core (w), cream-yellow body (Y), orange rim (O).
function orbFrame(outer: number, core: number, glints: boolean): string[] {
  const g = new Grid(7, 7);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const d = Math.hypot(x - 3, y - 3);
      if (d <= core) g.set(x, y, 'w');
      else if (d <= outer - 1) g.set(x, y, 'Y');
      else if (d <= outer) g.set(x, y, 'O');
    }
  }
  if (glints) {
    g.set(0, 3, 'O');
    g.set(6, 3, 'O');
    g.set(3, 0, 'O');
    g.set(3, 6, 'O');
  }
  return g.rows();
}

// chiBurst 24x24: small star, ring, fading ring (orange and cream, centre clear after frame 1).
function burstStar(): string[] {
  const g = new Grid(24, 24);
  const c = 12;
  for (let i = -5; i <= 4; i++) {
    g.set(c + i, c - 1, 'O');
    g.set(c - 1, c + i, 'O');
  }
  for (let i = -3; i <= 2; i++) {
    g.set(c + i, c, 'Y');
    g.set(c, c + i, 'Y');
  }
  g.rect(c - 1, c - 1, 2, 2, 'w');
  for (const [dx, dy] of [
    [-3, -3],
    [2, -3],
    [-3, 2],
    [2, 2],
  ] as const) {
    g.set(c + dx, c + dy, 'Y');
  }
  return g.rows();
}

function burstRing(): string[] {
  const g = new Grid(24, 24);
  ellipse(g, 11.5, 11.5, 7.5, 7.5, (a) => (Math.sin(a) > 0 ? 'Y' : 'O'));
  ellipse(g, 11.5, 11.5, 5.5, 5.5, (_a, i) => (i % 3 === 0 ? 'w' : '.'));
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    g.set(Math.round(11.5 + 10 * Math.cos(a)), Math.round(11.5 + 10 * Math.sin(a)), 'O');
  }
  return g.rows();
}

function burstFade(): string[] {
  const g = new Grid(24, 24);
  ellipse(g, 11.5, 11.5, 10.5, 10.5, (_a, i) => (Math.floor(i / 3) % 2 === 0 ? 'O' : '.'));
  ellipse(g, 11.5, 11.5, 8.5, 8.5, (_a, i) => (i % 6 === 0 ? 'Y' : '.'));
  return g.rows();
}

// warCry 28x12: dust ring seen edge-on plus short radial ticks, expanding and thinning. Tan and
// orange only (a, V, O, Y), transparent centre so the hero stays visible, no red anywhere.
function cryFrame(rx: number, ry: number, ticks: number, dashed: boolean, cool: boolean): string[] {
  const g = new Grid(28, 12);
  const cx = 13.5;
  const cy = 5.5;
  ellipse(g, cx, cy, rx, ry, (a, i) => {
    if (dashed && i % 4 > 1) return '.';
    if (cool) return 'V';
    return Math.sin(a) > 0 ? 'a' : 'V';
  });
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    for (let r = rx + 1; r <= rx + ticks; r++) {
      g.set(
        Math.round(cx + r * Math.cos(a)),
        Math.round(cy + (r * ry * Math.sin(a)) / rx),
        cool ? 'a' : 'O',
      );
    }
  }
  // a few dust motes riding the ring
  if (!cool) {
    g.set(Math.round(cx - rx + 1), Math.round(cy - 1), 'Y');
    g.set(Math.round(cx + rx - 1), Math.round(cy + 1), 'Y');
  }
  return g.rows();
}

// wrench 7x7: a copper-handled wrench with a light-metal open jaw, in two rotations.
function wrenchA(): string[] {
  return ['...mw.m', '...m..m', '...mmm.', '..CZ...', '.CZ....', 'CZ.....', '.......'];
}

function wrenchB(): string[] {
  const g = new Grid(7, 7);
  g.line(0, 3, 3, 3, 'C');
  g.line(0, 4, 3, 4, 'Z');
  g.plot([
    [4, 1, 'm'],
    [5, 1, 'w'],
    [6, 1, 'm'],
    [4, 2, 'm'],
    [4, 3, 'm'],
    [4, 4, 'm'],
    [5, 5, 'w'],
    [6, 5, 'm'],
    [4, 5, 'm'],
  ]);
  return g.rows();
}

export const EFFECT_SPRITES_H3: Readonly<Record<EffectSpriteIdH3, SpriteTemplate>> = {
  // a spinning leaf: broad face-on, then narrow edge-on
  leaf: loopTemplate(
    'effects/leaf',
    [
      ['...LL.', '..LwLN', '.LLLNN', '.LLNN.', 'kNN...', 'k.....'],
      ['..L...', '..LL..', '..LN..', '..LN..', '..NN..', '..k...'],
    ],
    { x: 3, y: 3 },
  ),
  chiOrb: loopTemplate('effects/chiOrb', [orbFrame(3.2, 1.2, false), orbFrame(2.9, 1.5, true)], {
    x: 3,
    y: 3,
  }),
  chiBurst: loopTemplate('effects/chiBurst', [burstStar(), burstRing(), burstFade()], {
    x: 12,
    y: 12,
  }),
  warCry: loopTemplate(
    'effects/warCry',
    [
      cryFrame(6, 2.6, 2, false, false),
      cryFrame(9.5, 4, 2, false, false),
      cryFrame(12.5, 5, 1, true, true),
    ],
    { x: 14, y: 6 },
  ),
  wrench: loopTemplate('effects/wrench', [wrenchA(), wrenchB()], { x: 3, y: 3 }),
};
