// The campfire: logs and stones, a small flame, and a large flame. Batch A0.
// Owned by the pixel-artist. Drawn identically in every stage, so it uses master characters only
// (o W V G P for the base; R O Y for the flames). Flames are 4-frame loops.
//
// Design note: a squat stone ring with two crossed logs, plus a decorative log lying on each side so
// the whole piece reads as a camp spot. Flames have no outline: red rim, orange body, yellow core.

import { Grid } from './spriteBuilder';
import { loopTemplate, staticTemplate } from './spriteBuilder';
import type { CampfireSprites } from './spriteTypes';

/** A flame frame. `t` is the height ratio above the base; `sway` leans the tip in pixels. */
function flameFrame(w: number, h: number, heightScale: number, sway: number): string[] {
  const g = new Grid(w, h);
  const maxHalf = (w - 1) / 2;
  const top = Math.round((h - 1) * (1 - heightScale));
  const span = h - 1 - top;
  for (let y = top; y < h; y++) {
    const t = span === 0 ? 0 : (h - 1 - y) / span; // 0 at the base, 1 at the tip
    const half = maxHalf * Math.pow(1 - Math.pow(t, 1.7), 0.65);
    const cx = (w - 1) / 2 + sway * t * t;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - cx);
      if (d > half + 0.01) continue;
      if (d <= half * 0.34 && t < 0.55) g.set(x, y, 'Y');
      else if (d <= half * 0.68 && t < 0.88) g.set(x, y, 'O');
      else g.set(x, y, 'R');
    }
  }
  return g.rows();
}

function buildLogs(): string[] {
  const g = new Grid(48, 12);
  // decorative flanking logs, each with a lighter end cap facing the viewer's side
  g.rect(2, 6, 12, 3, 'W');
  g.rect(2, 6, 12, 1, 'V');
  g.rect(2, 6, 2, 3, 'V');
  g.rect(34, 6, 12, 3, 'W');
  g.rect(34, 6, 12, 1, 'V');
  g.rect(44, 6, 2, 3, 'V');
  // crossed logs in the pit
  g.line(16, 8, 31, 4, 'W');
  g.line(16, 7, 31, 3, 'V');
  g.line(17, 4, 30, 8, 'W');
  g.line(17, 3, 30, 7, 'V');
  // front stone ring
  for (let i = 0; i < 5; i++) {
    const x = 14 + i * 4;
    g.rect(x, 8, 3, 2, 'G');
    g.rect(x, 10, 3, 1, 'P');
  }
  g.set(14, 8, 'P');
  g.set(30, 8, 'P');
  g.outline('o');
  return g.rows();
}

export const CAMPFIRE: CampfireSprites = {
  logs: staticTemplate('campfire/logs', buildLogs(), { x: 24, y: 11 }),
  flameSmall: loopTemplate(
    'campfire/flameSmall',
    [
      flameFrame(8, 12, 1, 0),
      flameFrame(8, 12, 0.85, -1),
      flameFrame(8, 12, 0.95, 1),
      flameFrame(8, 12, 0.8, 0),
    ],
    { x: 4, y: 11 },
  ),
  flameLarge: loopTemplate(
    'campfire/flameLarge',
    [
      flameFrame(12, 20, 1, 0),
      flameFrame(12, 20, 0.88, -2),
      flameFrame(12, 20, 0.96, 2),
      flameFrame(12, 20, 0.82, 0),
    ],
    { x: 6, y: 19 },
  ),
};
