// Stage 4, "Ancient Catacombs": tiles, backdrop, and props (batch E2, step A-E2-3).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['ancient-catacombs'] laid over the master palette:
//   1 deepest shadow / outline   2 dark stone   3 mid stone   4 lit stone
//   5 bone beige   6 cold candle flame   7 bone white   8 violet accent
// Mood: dusty purple masonry, bone beige trim, cold mint candle light. Skull niches are
// stylized and cute-spooky (no gore). Tiles are 16x16 and join side by side (columns 0 and 15
// identical across a set; wall variants also keep rows 0 and 15 identical). Generated at module
// load from fixed seeds. Template ids are `ancient-catacombs/<name>`.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'ancient-catacombs';
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

function chip(g: Grid, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 2 + Math.floor(rng() * 12);
    if (g.get(x, y) === '3') g.set(x, y, rng() < 0.6 ? '2' : '4');
  }
}

function skull(g: Grid, x: number, y: number): void {
  g.blit(['.7777.', '777777', '717717', '.7777.', '.7557.'], x, y);
}

function wallMid(variant: number): Grid {
  const g = bricks();
  const rng = seeded(21000 + variant);
  chip(g, rng, 3);
  if (variant === 1) {
    // a crack running down two courses
    g.plot([
      [8, 3, '1'],
      [8, 4, '1'],
      [9, 5, '1'],
      [9, 6, '1'],
      [9, 7, '1'],
      [8, 8, '1'],
      [8, 9, '1'],
    ]);
  }
  if (variant === 2) {
    // a skull set into the wall
    g.rect(4, 4, 8, 8, '1');
    g.rect(3, 3, 10, 1, '5');
    skull(g, 5, 5);
    g.rect(3, 12, 10, 1, '2');
  }
  if (variant === 3) {
    // violet rune scratches
    g.plot([
      [7, 5, '8'],
      [8, 6, '8'],
      [7, 7, '8'],
      [8, 8, '8'],
      [7, 9, '8'],
      [9, 7, '8'],
    ]);
  }
  if (variant === 4) {
    // a barred arch: openings show the backdrop between the bars
    for (let y = 3; y <= 13; y++) for (let x = 4; x <= 11; x++) g.set(x, y, '.');
    for (let x = 4; x <= 11; x++) {
      g.set(x, 2, '5');
    }
    g.set(3, 2, '5');
    g.set(12, 2, '5');
    for (let y = 3; y <= 13; y++) {
      g.set(3, y, '5');
      g.set(12, y, '3');
    }
    for (const bx of [6, 9]) for (let y = 3; y <= 13; y++) g.set(bx, y, '2');
    for (let x = 4; x <= 11; x++) g.set(x, 14, '2');
    g.set(5, 3, '.');
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = bricks();
  const rng = seeded(22000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) === '3') g.set(x, y, '2');
  }
  // a hanging cobweb-like corbel and a beige stone lip
  const xs = variant === 0 ? [3, 12] : [7];
  for (const x of xs) {
    g.set(x, 5, '5');
    g.set(x, 6, '5');
    g.set(x, 7, '4');
  }
  chip(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = bricks();
  const rng = seeded(23000 + variant);
  chip(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '5');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 7) === 7 ? '2' : '3');
    g.set(x, 15, '1');
  }
  if (variant === 1) {
    g.plot([
      [5, 12, '7'],
      [6, 12, '7'],
      [6, 13, '5'],
      [10, 13, '7'],
      [11, 13, '7'],
    ]);
  }
  return g;
}

/** Flagstone floor: slabs with seams; a crack and a violet rune in two variants. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const seam = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 24000 : 25000) + variant);
  g.rect(0, 0, T, T, base);
  // slab seams at x 7 and a staggered row seam
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
  for (let i = 0; i < 8; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 3 + Math.floor(rng() * 11);
    if (g.get(x, y) === base) g.set(x, y, kind === 'back' ? '2' : '3');
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
      [2, 5, '8'],
      [4, 5, '8'],
      [3, 6, '8'],
      [3, 5, '2'],
    ]);
  }
  return g;
}

function foreground(variant: number): Grid {
  const g = new Grid(T, T);
  for (let x = 0; x < T; x++) {
    g.set(x, 0, '3');
    g.set(x, 1, '2');
    g.set(x, 2, '2');
    for (let y = 3; y < T; y++) g.set(x, y, '1');
  }
  if (variant === 1) {
    // loose bones above the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '2');
    g.rect(4, 0, 3, 1, '5');
    g.rect(10, 0, 2, 1, '.');
    g.rect(10, 1, 2, 1, '5');
  }
  return g;
}

// ---- Backdrop: 128x128, long vaults of pointed arches receding; period 64 ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(16180);
  const speck = new Set<number>();
  for (let i = 0; i < 60; i++) speck.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 128));
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
      // stone course lines
      if (y % 12 === 11 && ch === '2') ch = '1';
      // outer arch rim, then dark opening
      if (inside(px, y, 25, 26, 66)) ch = '3';
      if (inside(px, y, 22, 30, 66)) ch = '1';
      // a nearer inner arch (dim) farther down the vault
      if (inside(px, y, 13, 58, 84) && inside(px, y, 22, 30, 66)) ch = '2';
      if (inside(px, y, 11, 62, 84) && inside(px, y, 22, 30, 66)) ch = '1';
      // pillars between arches (at the period edge)
      if ((px <= 3 || px >= 60) && y >= 20) ch = px === 3 || px === 60 ? '4' : '3';
      if ((px === 0 || px === 63) && y >= 20) ch = '2';
      // ground shadow and ceiling
      if (y >= 108) ch = y === 108 ? '1' : '2';
      if (y < 12) ch = '1';
      else if (y < 16 && ch === '2') ch = '1';
      g.set(x, y, ch);
    }
  }
  for (const ox of [0, 64]) {
    // distant candle glints deep in the vault and a few violet dust marks
    g.plot([
      [ox + 28, 96, '6'],
      [ox + 35, 98, '6'],
      [ox + 29, 74, '2'],
      [ox + 32, 70, '8'],
      [ox + 24, 92, '8'],
      [ox + 40, 88, '8'],
    ]);
    // bone-beige capitals on the pillars
    for (let x = ox; x <= ox + 3; x++) g.set(x, 20, '5');
    for (let x = ox + 60; x <= ox + 63; x++) g.set(x, 20, '5');
  }
  return g.rows();
}

// ---- Props ----

function skullNiche(): string[] {
  const g = new Grid(16, 32);
  g.rect(0, 0, 16, 32, '3');
  g.rect(0, 0, 16, 1, '4');
  g.rect(0, 0, 1, 32, '4');
  g.rect(15, 0, 1, 32, '2');
  for (let n = 0; n < 3; n++) {
    const y = 1 + n * 10;
    g.rect(3, y, 10, 9, '1');
    g.rect(3, y, 10, 1, '2');
    g.rect(2, y + 9, 12, 1, '5');
    skull(g, 5, y + 2);
    if (n === 1) g.plot([[7, y + 2, '8']]);
  }
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function candelabra(frame: number): string[] {
  const g = new Grid(16, 20);
  // stand: a dark iron arm with three candle cups, a stem, and a bracket
  g.rect(7, 9, 2, 8, '2');
  g.rect(6, 17, 4, 2, '2');
  g.rect(5, 18, 6, 1, '4');
  g.rect(2, 9, 12, 1, '4');
  g.rect(2, 9, 1, 2, '2');
  g.rect(13, 9, 1, 2, '2');
  g.rect(7, 8, 2, 1, '2');
  const cups: readonly number[] = [2, 7, 12];
  for (const cx of cups) {
    g.rect(cx, 5, 2, 4, '7'); // wax
    g.set(cx, 5, '5');
    g.set(cx + 1, 8, '5');
  }
  // flames: a 4-frame sway and height flicker, bright core
  const sway = [0, 1, 0, -1][frame] ?? 0;
  const tall = [3, 2, 3, 2][frame] ?? 3;
  cups.forEach((cx, i) => {
    const h = i === 1 ? tall + 1 : tall;
    const s = i === 1 ? -sway : sway;
    for (let k = 0; k < h; k++) g.set(cx + (k === h - 1 ? s : 0), 4 - k, '6');
    g.set(cx + 1, 4, '6');
    g.set(cx, 4, '7');
    g.set(cx, 3, '6');
  });
  g.outline('1');
  return g.rows();
}

function crackedPillar(): string[] {
  const g = new Grid(16, 112);
  // capital
  g.rect(0, 0, 16, 5, '5');
  g.rect(0, 0, 16, 1, '7');
  g.rect(0, 4, 16, 1, '3');
  g.rect(1, 5, 14, 2, '4');
  // shaft with flutes
  for (let y = 7; y < 104; y++) {
    for (let x = 2; x <= 13; x++) {
      let ch = '3';
      if (x === 2) ch = '4';
      else if (x >= 12) ch = '2';
      else if (x === 5 || x === 8) ch = '2';
      else if (x === 4 || x === 7) ch = '4';
      g.set(x, y, ch);
    }
  }
  // base
  g.rect(0, 104, 16, 3, '4');
  g.rect(0, 107, 16, 5, '5');
  g.rect(0, 107, 16, 1, '7');
  g.rect(0, 111, 16, 1, '3');
  // cracks and a chipped corner
  const crack: readonly [number, number][] = [
    [9, 20],
    [9, 21],
    [10, 22],
    [10, 23],
    [9, 24],
    [9, 25],
    [8, 26],
    [8, 27],
    [7, 28],
    [6, 52],
    [6, 53],
    [7, 54],
    [7, 55],
    [8, 56],
    [8, 57],
    [9, 58],
    [9, 59],
    [10, 60],
    [10, 61],
    [10, 78],
    [9, 79],
    [9, 80],
    [8, 81],
  ];
  for (const [x, y] of crack) g.set(x, y, '1');
  g.plot([
    [13, 8, '1'],
    [13, 9, '1'],
    [12, 9, '1'],
    [3, 66, '7'],
    [3, 90, '7'],
    [10, 40, '8'],
    [10, 41, '8'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function sarcophagus(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '................',
      '...5555555555...',
      '..577777777775..',
      '.55777777777755.',
      '.57775577557775.',
      '.55555555555555.',
      '.53333333333335.',
      '.53444444444435.',
      '.53444484444435.',
      '.53444888844435.',
      '.53444484444435.',
      '.53333333333335.',
      '.22222222222222.',
      '................',
      '................',
    ],
    0,
    0,
  );
  // lid face: two dark eyes and a brow line
  g.plot([
    [5, 4, '2'],
    [6, 4, '2'],
    [9, 4, '2'],
    [10, 4, '2'],
  ]);
  g.outline('1');
  return g.rows();
}

function urn(): string[] {
  const g = new Grid(12, 14);
  g.blit(
    [
      '............',
      '...555555...',
      '..77555577..',
      '....5555....',
      '...555555...',
      '..55555553..',
      '.5555555533.',
      '.5888888833.',
      '.5555555533.',
      '.5555555533.',
      '..55555533..',
      '..55555333..',
      '...333333...',
      '............',
    ],
    0,
    0,
  );
  g.plot([
    [3, 6, '7'],
    [3, 9, '7'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 12));
}

function boneRubble(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '................',
      '.......7777.....',
      '..77...7177..4..',
      '.7557.5777..444.',
      '.55..333.57.555.',
      '..33333333333...',
      '................',
    ],
    0,
    0,
  );
  g.plot([
    [8, 3, '1'],
    [10, 3, '1'],
  ]);
  g.outline('1');
  return g.rows();
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
  // a carved passage: bone-beige lintel at y 40 with a skull, stone posts, dark opening
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      if (x >= 5 && x <= 10 && y >= 47) g.set(x, y, '1');
      else if (y <= 46) g.set(x, y, y === 40 ? '7' : y === 46 ? '2' : '5');
      else g.set(x, y, x === 2 || x === 5 ? '2' : x <= 4 || x >= 11 ? '4' : '2');
    }
  }
  g.blit(['.7777.', '717717', '.7557.'], 5, 42);
  for (let y = 52; y < 128; y += 12) {
    g.set(3, y, '8');
    g.set(12, y + 5, '8');
  }
  return g.rows();
}

export const ANCIENT_CATACOMBS: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    skullNiche: staticTemplate(id('skullNiche'), skullNiche(), { x: 0, y: 0 }),
    candelabra: loopTemplate(id('candelabra'), frames(4, candelabra), { x: 0, y: 0 }),
    crackedPillar: staticTemplate(id('crackedPillar'), crackedPillar(), { x: 0, y: 0 }),
    sarcophagus: staticTemplate(id('sarcophagus'), sarcophagus(), { x: 8, y: 14 }),
    urn: staticTemplate(id('urn'), urn(), { x: 6, y: 12 }),
    boneRubble: staticTemplate(id('boneRubble'), boneRubble(), { x: 8, y: 6 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
