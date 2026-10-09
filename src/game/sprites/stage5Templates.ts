// Stage 5, "Enchanted Forest Ruins": tiles, backdrop, and props (batch E3, step A-E3-2).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['enchanted-forest-ruins'] laid over the master palette:
//   1 deepest shadow / outline   2 dark ruin stone   3 mid stone   4 lit stone
//   5 moss green   6 glowing blue flora   7 pale highlight   8 deep blue bloom
// Mood: mossy gray ruins swallowed by a forest, glowing blue flowers. The stone stays darker and
// less saturated than the enemies (moss, bright accents). Tiles are 16x16 and join side by side
// (columns 0 and 15 identical across a set; wall variants also keep rows 0 and 15 identical).
// Generated at module load from fixed seeds. Template ids are `enchanted-forest-ruins/<name>`.
// Props: wall props anchor at their top-left (0, 0); floor props anchor at the foot.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'enchanted-forest-ruins';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Masonry: 4 px courses of 8 px blocks, offset every other course. Periodic in 16. ----

function bricks(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) {
    const course = Math.floor(y / 4);
    const off = (course % 2) * 4;
    for (let x = 0; x < T; x++) {
      let ch = '3';
      if (y % 4 === 3) ch = '2';
      else if ((x + off) % 8 === 7) ch = '2';
      else if (y % 4 === 0) ch = '4';
      g.set(x, y, ch);
    }
  }
  return g;
}

/** Moss clumps on the stone (never on the edge rows or columns). */
function moss(g: Grid, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 2 + Math.floor(rng() * 12);
    const here = g.get(x, y);
    if (here === '3' || here === '4') {
      g.set(x, y, '5');
      if (rng() < 0.5 && g.get(x, y + 1) === '3' && y + 1 < 14) g.set(x, y + 1, '5');
      if (rng() < 0.4 && g.get(x + 1, y) === '3' && x + 1 < 15) g.set(x + 1, y, '5');
    }
  }
}

function wallMid(variant: number): Grid {
  const g = bricks();
  const rng = seeded(31000 + variant);
  moss(g, rng, 7);
  if (variant === 1) {
    // a vine climbing the wall with two leaves
    for (let y = 1; y <= 13; y++) g.set(y % 3 === 0 ? 9 : 8, y, '5');
    g.plot([
      [7, 4, '5'],
      [6, 5, '5'],
      [10, 8, '5'],
      [11, 8, '5'],
      [7, 10, '5'],
      [6, 10, '5'],
      [9, 6, '6'],
    ]);
  }
  if (variant === 2) {
    // a worn rune with a faint blue glow
    g.rect(5, 4, 6, 7, '2');
    g.plot([
      [7, 5, '8'],
      [8, 5, '8'],
      [6, 7, '8'],
      [9, 7, '8'],
      [7, 8, '8'],
      [8, 8, '8'],
      [7, 6, '6'],
      [8, 6, '6'],
      [7, 9, '8'],
      [8, 9, '8'],
    ]);
  }
  if (variant === 3) {
    // heavy moss low on the wall with tiny blooms
    g.rect(2, 9, 7, 5, '5');
    g.plot([
      [2, 9, '3'],
      [8, 9, '3'],
      [4, 9, '4'],
      [3, 11, '4'],
      [6, 12, '4'],
      [5, 10, '6'],
      [7, 12, '8'],
    ]);
  }
  if (variant === 4) {
    // a vine-wrapped window: the opening shows the backdrop
    for (let y = 3; y <= 13; y++) for (let x = 4; x <= 11; x++) g.set(x, y, '.');
    for (let x = 3; x <= 12; x++) g.set(x, 2, '5');
    for (let y = 3; y <= 13; y++) {
      g.set(3, y, '4');
      g.set(12, y, '2');
    }
    for (let x = 4; x <= 11; x++) g.set(x, 14, '2');
    g.plot([
      [4, 3, '5'],
      [4, 4, '5'],
      [5, 3, '5'],
      [11, 3, '5'],
      [11, 4, '5'],
      [11, 5, '5'],
      [10, 3, '5'],
      [5, 13, '5'],
      [6, 13, '5'],
    ]);
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = bricks();
  const rng = seeded(32000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) === '3') g.set(x, y, '2');
  }
  // vines and roots hanging from the lip
  const xs = variant === 0 ? [3, 7, 12] : [5, 10];
  for (const x of xs) {
    const len = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < len; k++) g.set(x, 5 + k, k === len - 1 ? '6' : '5');
    g.set(x + 1, 5 + Math.floor(len / 2), '5');
  }
  moss(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = bricks();
  const rng = seeded(33000 + variant);
  moss(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '5');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 7) === 7 ? '2' : '3');
    g.set(x, 15, '1');
  }
  g.plot([
    [3, 12, '5'],
    [9, 12, '5'],
    [10, 13, '5'],
  ]);
  if (variant === 1) {
    g.plot([
      [5, 10, '6'],
      [5, 9, '8'],
      [11, 10, '8'],
      [11, 9, '6'],
      [6, 10, '5'],
    ]);
  }
  return g;
}

/** Mossy flagstones: slabs with seams, grass tufts, a crack and glowing flowers in two variants. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const seam = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 34000 : 35000) + variant);
  g.rect(0, 0, T, T, base);
  for (let y = 2; y < T; y++) g.set(7, y, seam);
  for (let x = 0; x < T; x++) g.set(x, 8, seam);
  g.set(15, 8, base);
  if (kind === 'back') {
    for (let x = 0; x < T; x++) {
      g.set(x, 0, '1');
      g.set(x, 1, '2');
    }
  } else {
    for (let x = 0; x < T; x++) g.set(x, 15, '3');
  }
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 3 + Math.floor(rng() * 11);
    if (g.get(x, y) === base) g.set(x, y, kind === 'back' ? '2' : '3');
  }
  // grass tufts in the seams
  for (let i = 0; i < 4; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 3 + Math.floor(rng() * 10);
    if (g.get(x, y) === base) {
      g.set(x, y, '5');
      if (g.get(x, y + 1) === base && y + 1 < 15) g.set(x, y + 1, '5');
    }
  }
  if (variant === 1) {
    g.plot([
      [10, 3, seam],
      [11, 4, seam],
      [11, 5, seam],
      [12, 6, seam],
      [12, 7, seam],
    ]);
  }
  if (variant === 2) {
    g.plot([
      [3, 4, '8'],
      [3, 5, '6'],
      [2, 5, '5'],
      [4, 5, '5'],
      [11, 11, '6'],
      [11, 12, '5'],
    ]);
  }
  return g;
}

function foreground(variant: number): Grid {
  const g = new Grid(T, T);
  for (let x = 0; x < T; x++) {
    g.set(x, 1, '5');
    g.set(x, 2, '2');
    for (let y = 3; y < T; y++) g.set(x, y, '1');
  }
  // blades of grass on the lip (columns 0 and 15 stay the same in both variants)
  const blades = variant === 0 ? [1, 4, 5, 9, 12, 13] : [2, 3, 7, 10, 11, 14];
  for (const x of blades) g.set(x, 0, '5');
  if (variant === 1) {
    g.plot([
      [6, 0, '6'],
      [6, 1, '8'],
    ]);
  }
  return g;
}

// ---- Backdrop: 128x128, ruined arches among tree trunks, hanging vines, glowing flowers; period 64 ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(51015);
  const speck = new Set<number>();
  for (let i = 0; i < 70; i++) speck.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 128));
  const cx = 31.5;
  const inside = (px: number, y: number, half: number, top: number, spring: number): boolean => {
    const dx = Math.abs(px - cx);
    if (dx > half) return false;
    if (y >= spring) return true;
    const edge = top + (spring - top) * Math.pow(dx / half, 1.6);
    return y >= edge;
  };
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      if (speck.has(px + 64 * y)) ch = '3';
      // a ruined arch (its upper right broken away), dark opening
      const broken = px > 36 && y < 40;
      if (!broken && inside(px, y, 22, 30, 78)) ch = '3';
      if (!broken && inside(px, y, 19, 34, 78)) ch = '1';
      // tree trunks flanking the arch with a lit edge
      if ((px >= 0 && px <= 5) || px >= 58) ch = px === 5 || px === 58 ? '3' : '1';
      // canopy shadow at the top, ground at the bottom
      if (y < 14) ch = '1';
      else if (y < 20 && ch === '2') ch = '1';
      if (y >= 108) ch = y === 108 ? '1' : '2';
      g.set(x, y, ch);
    }
  }
  for (const ox of [0, 64]) {
    // hanging vines from the canopy and a few leaf clumps
    for (const vx of [12, 20, 46, 53]) {
      const len = 14 + Math.floor(rng() * 18);
      for (let k = 0; k < len; k++) g.set(ox + vx, 14 + k, k % 5 === 4 ? '3' : '5');
      g.set(ox + vx + 1, 14 + len - 2, '5');
    }
    // glowing flowers in the dim distance
    g.plot([
      [ox + 26, 92, '6'],
      [ox + 27, 92, '8'],
      [ox + 36, 97, '6'],
      [ox + 36, 98, '8'],
      [ox + 14, 100, '8'],
      [ox + 15, 100, '6'],
      [ox + 48, 90, '6'],
      [ox + 49, 90, '8'],
      [ox + 31, 62, '8'],
    ]);
    // moss on the arch rim
    for (const mx of [10, 11, 14, 50, 52]) g.set(ox + mx, 38 + (mx % 4), '5');
  }
  return g.rows();
}

// ---- Props ----

function brokenPillar(): string[] {
  const g = new Grid(16, 96);
  // snapped top: a jagged line, then the shaft with flutes
  const top = [14, 11, 13, 9, 12, 15, 10, 13, 11, 14, 12, 10];
  for (let y = 9; y < 88; y++) {
    for (let x = 2; x <= 13; x++) {
      const cut = top[x - 2] ?? 12;
      if (y < cut) continue;
      let ch = '3';
      if (x === 2) ch = '4';
      else if (x >= 12) ch = '2';
      else if (x === 5 || x === 8) ch = '2';
      else if (x === 4 || x === 7) ch = '4';
      g.set(x, y, ch);
    }
  }
  // base block
  g.rect(0, 88, 16, 3, '4');
  g.rect(0, 91, 16, 5, '3');
  g.rect(0, 91, 16, 1, '4');
  // roots wrapping the shaft and moss along the break and at the base
  const root: readonly [number, number][] = [
    [3, 20],
    [4, 21],
    [5, 22],
    [6, 23],
    [7, 24],
    [8, 25],
    [9, 26],
    [10, 27],
    [11, 28],
    [10, 40],
    [9, 41],
    [8, 42],
    [7, 43],
    [6, 44],
    [5, 45],
    [4, 46],
    [3, 47],
    [4, 60],
    [5, 61],
    [6, 62],
    [7, 63],
    [8, 64],
    [9, 65],
    [10, 66],
  ];
  for (const [x, y] of root) {
    g.set(x, y, '5');
    g.set(x, y + 1, '5');
  }
  for (let x = 2; x <= 13; x++)
    if (g.get(x, top[x - 2] ?? 12) !== '.') g.set(x, top[x - 2] ?? 12, '5');
  g.plot([
    [1, 88, '5'],
    [2, 88, '5'],
    [14, 90, '5'],
    [13, 90, '5'],
    [5, 33, '1'],
    [5, 34, '1'],
    [6, 35, '1'],
    [9, 78, '6'],
    [9, 79, '8'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function hangingRoots(): string[] {
  const g = new Grid(16, 40);
  const strands: readonly [number, number][] = [
    [2, 30],
    [5, 20],
    [8, 36],
    [11, 24],
    [13, 32],
  ];
  strands.forEach(([x, len], i) => {
    for (let y = 0; y < len; y++) {
      const sway = Math.round(Math.sin((y + i * 3) / 5));
      g.set(x + sway, y, y % 6 === 5 ? '4' : '3');
      if (y % 7 === 3) g.set(x + sway + 1, y, '5');
    }
    g.set(x, len - 1, '5');
    g.set(x + 1, len - 2, '5');
  });
  // leaves along the strands and a bloom
  g.plot([
    [3, 8, '5'],
    [4, 9, '5'],
    [6, 14, '5'],
    [10, 12, '5'],
    [12, 18, '5'],
    [12, 28, '6'],
    [12, 29, '8'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function glowBloom(frame: number): string[] {
  const g = new Grid(16, 20);
  // a vine drooping from the wall with leaves, carrying three glowing blooms
  const vine: readonly [number, number][] = [
    [8, 0],
    [8, 1],
    [7, 2],
    [7, 3],
    [8, 4],
    [9, 5],
    [9, 6],
    [8, 7],
    [7, 8],
    [7, 9],
    [8, 10],
    [8, 11],
    [8, 12],
  ];
  for (const [x, y] of vine) g.set(x, y, '5');
  g.plot([
    [6, 3, '5'],
    [5, 4, '5'],
    [10, 6, '5'],
    [11, 6, '5'],
    [6, 9, '5'],
    [5, 9, '5'],
    [9, 12, '5'],
    [10, 13, '5'],
  ]);
  const bloom = (cx: number, cy: number): void => {
    const petal = frame === 0 ? '8' : '6';
    const core = frame === 0 ? '6' : '7';
    g.plot([
      [cx - 1, cy, petal],
      [cx + 1, cy, petal],
      [cx, cy - 1, petal],
      [cx, cy + 1, petal],
      [cx, cy, core],
    ]);
  };
  bloom(4, 7);
  bloom(11, 9);
  bloom(7, 15);
  g.set(8, 13, '5');
  g.set(7, 14, '5');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function ruinedStatue(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '.....5555.......',
      '....543345......',
      '....533335......',
      '.....3333.......',
      '...55333355.....',
      '..5433333345....',
      '..4333333332....',
      '..4343333432....',
      '..4333333332....',
      '...22222222.....',
      '..5555555555....',
      '..4444444444....',
      '..3333333332....',
      '..2222222222....',
      '................',
    ],
    0,
    0,
  );
  g.plot([
    [5, 3, '2'],
    [8, 3, '2'],
    [4, 9, '5'],
    [5, 10, '5'],
    [11, 8, '5'],
    [9, 12, '6'],
  ]);
  g.outline('1');
  return g.rows();
}

function fernPatch(): string[] {
  const g = new Grid(16, 10);
  g.blit(
    [
      '................',
      '.....5..........',
      '..5..55....5....',
      '..55..5...55.5..',
      '...555.5.555.5..',
      '.5.5555555555.5.',
      '..555545555555..',
      '...55554555555..',
      '....3355553.....',
      '................',
    ],
    0,
    0,
  );
  g.plot([
    [7, 3, '4'],
    [4, 4, '4'],
    [12, 5, '4'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function flowerBed(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '..6.......8..6..',
      '.686.5...868.7..',
      '..6..5....8..5..',
      '.5.55.5.55.55.5.',
      '..5555555555555.',
      '..3333333333333.',
      '................',
    ],
    0,
    0,
  );
  g.set(2, 2, '7');
  g.set(10, 2, '7');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function doorFrame(): string[] {
  const g = new Grid(16, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 16; x++) {
      let ch = '3';
      if (x === 0 || x === 15) ch = '1';
      else if (y % 16 === 15) ch = '2';
      else if (x === 1 && y % 16 !== 0) ch = '4';
      g.set(x, y, ch);
    }
  }
  g.rect(0, 0, 16, 4, '1');
  for (let x = 0; x < 16; x++) g.set(x, 4, '2');
  // a ruined arch: stone posts, a mossy lintel at y 40, a dark opening
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      if (x >= 5 && x <= 10 && y >= 47) g.set(x, y, '1');
      else if (y <= 46) g.set(x, y, y === 40 ? '5' : y === 46 ? '2' : '4');
      else g.set(x, y, x === 2 || x === 5 ? '2' : x <= 4 || x >= 11 ? '4' : '2');
    }
  }
  // ivy hanging from the lintel and climbing the posts, a few glowing blooms
  for (let x = 3; x <= 12; x += 3) for (let k = 0; k < 4 + (x % 4); k++) g.set(x, 41 + k, '5');
  for (let y = 50; y < 128; y += 5) {
    g.set(3, y, '5');
    g.set(3, y + 1, '5');
    g.set(12, y + 2, '5');
    g.set(12, y + 3, '5');
  }
  g.plot([
    [4, 44, '6'],
    [11, 46, '8'],
    [3, 70, '6'],
    [12, 90, '8'],
    [3, 108, '6'],
  ]);
  return g.rows();
}

export const ENCHANTED_FOREST_RUINS: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    brokenPillar: staticTemplate(id('brokenPillar'), brokenPillar(), { x: 0, y: 0 }),
    hangingRoots: staticTemplate(id('hangingRoots'), hangingRoots(), { x: 0, y: 0 }),
    glowBloom: loopTemplate(id('glowBloom'), frames(2, glowBloom), { x: 0, y: 0 }),
    ruinedStatue: staticTemplate(id('ruinedStatue'), ruinedStatue(), { x: 8, y: 14 }),
    fernPatch: staticTemplate(id('fernPatch'), fernPatch(), { x: 8, y: 8 }),
    flowerBed: staticTemplate(id('flowerBed'), flowerBed(), { x: 8, y: 6 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
