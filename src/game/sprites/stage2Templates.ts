// Stage 2, "Goblin Mine Shafts": tiles, backdrop, and props (batch E1, step A-E1-4).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['goblin-mine-shafts'] laid over the master palette:
//   1 shaft shadow / outline   2 dark rock   3 rock and old timber   4 lit rock
//   5 fresh timber   6 lantern yellow   7 chalk and sparkle   8 ore glint (teal)
// Mood: timber brown, ore glints, lantern yellow. Tiles are 16x16 and join side by side (columns 0
// and 15 identical across a set; wall variants also keep rows 0 and 15 identical). Everything is
// generated at module load from fixed seeds, so the art is identical on every load.
// Template ids are `goblin-mine-shafts/<name>`.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'goblin-mine-shafts';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Rock wall: irregular blocks (a wrapped Voronoi), lit top edges, dark seams. Periodic in 16. ----

const SEEDS: readonly (readonly [number, number])[] = (() => {
  const rng = seeded(4242);
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) pts.push([Math.floor(rng() * T), Math.floor(rng() * T)]);
  return pts;
})();

function cellAt(x: number, y: number): number {
  let best = 0;
  let bd = Infinity;
  SEEDS.forEach(([sx, sy], i) => {
    const dx = Math.min(Math.abs(x - sx), T - Math.abs(x - sx));
    const dy = Math.min(Math.abs(y - sy), T - Math.abs(y - sy));
    const dist = dx * dx * 0.6 + dy * dy * 1.6;
    if (dist < bd) {
      bd = dist;
      best = i;
    }
  });
  return best;
}

function rockGrid(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const c = cellAt(x, y);
      let ch = '3';
      if (cellAt(x, (y + T - 1) % T) !== c) ch = '4';
      else if (cellAt((x + 1) % T, y) !== c || cellAt(x, (y + 1) % T) !== c) ch = '2';
      g.set(x, y, ch);
    }
  }
  return g;
}

function chip(g: Grid, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 1 + Math.floor(rng() * 14);
    if (g.get(x, y) === '3') g.set(x, y, rng() < 0.5 ? '2' : '4');
  }
}

function glints(g: Grid, x: number, y: number): void {
  g.plot([
    [x, y, '8'],
    [x + 1, y, '8'],
    [x, y + 1, '8'],
    [x + 1, y + 2, '8'],
    [x + 2, y + 1, '7'],
  ]);
}

function wallMid(variant: number): Grid {
  const g = rockGrid();
  const rng = seeded(5000 + variant);
  chip(g, rng, 3);
  if (variant === 1) glints(g, 6, 5);
  if (variant === 2) {
    // a crack and a small wooden peg
    for (let i = 0; i < 6; i++) g.set(8 + (i % 2), 3 + i, '1');
    g.rect(11, 10, 2, 2, '5');
  }
  if (variant === 3) glints(g, 9, 9);
  if (variant === 4) {
    // a shaft opening with a timber frame and one crossbeam; transparent so the backdrop shows
    for (let y = 2; y <= 13; y++) for (let x = 4; x <= 11; x++) g.set(x, y, '.');
    for (let x = 3; x <= 12; x++) {
      g.set(x, 1, '5');
      g.set(x, 14, '3');
    }
    for (let y = 2; y <= 13; y++) {
      g.set(3, y, '5');
      g.set(12, y, '3');
    }
    for (let x = 4; x <= 11; x++) g.set(x, 6, '5');
    g.set(4, 7, '3');
    g.set(11, 7, '3');
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = rockGrid();
  const rng = seeded(6000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) === '3') g.set(x, y, '2');
  }
  // hanging stalactites
  const drops = variant === 0 ? [4, 11] : [7, 13];
  for (const dx of drops) {
    g.set(dx, 5, '2');
    g.set(dx, 6, '2');
    g.set(dx, 7, '1');
  }
  chip(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = rockGrid();
  const rng = seeded(7000 + variant);
  chip(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '4');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 7) === 7 ? '2' : '3');
    g.set(x, 15, '1');
  }
  if (variant === 1)
    g.plot([
      [5, 12, '2'],
      [6, 13, '2'],
      [9, 12, '8'],
      [10, 12, '7'],
    ]);
  return g;
}

/** Packed dirt and gravel with a wooden sleeper in one variant. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const dark = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 8000 : 9000) + variant);
  g.rect(0, 0, T, T, base);
  if (kind === 'back') {
    for (let x = 0; x < T; x++) {
      g.set(x, 0, '1');
      g.set(x, 1, '2');
    }
  } else {
    for (let x = 0; x < T; x++) g.set(x, 15, '3');
  }
  for (let i = 0; i < 14; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 2 + Math.floor(rng() * 12);
    if (g.get(x, y) === base) g.set(x, y, rng() < 0.6 ? dark : kind === 'back' ? '4' : '5');
  }
  if (variant === 1)
    g.plot([
      [7, 8, '8'],
      [8, 8, '7'],
      [7, 9, '8'],
    ]);
  if (variant === 2) {
    // a half-buried timber sleeper
    g.rect(2, 7, 12, 3, '5');
    g.rect(2, 9, 12, 1, '3');
    g.set(4, 8, '3');
    g.set(11, 8, '3');
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
    // loose rocks above the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '2');
    g.rect(4, 0, 3, 1, '4');
    g.rect(10, 0, 2, 1, '.');
    g.rect(10, 1, 2, 1, '3');
  }
  return g;
}

// ---- Backdrop: 128x128, a receding timbered shaft, periodic at 64 so it tiles horizontally ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(31337);
  const speck = new Set<number>();
  for (let i = 0; i < 70; i++) speck.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 128));
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      if (speck.has(px + 64 * y)) ch = '3';
      // dark shaft behind the frame
      if (px >= 12 && px <= 51 && y >= 38) ch = '1';
      // a smaller, farther frame inside the opening
      const farPost = (px >= 24 && px <= 26) || (px >= 37 && px <= 39);
      if (px >= 24 && px <= 39 && y >= 62 && (farPost || (y >= 62 && y <= 64))) ch = '3';
      // near frame: posts and lintel with corner braces
      const post = (px >= 8 && px <= 12) || (px >= 51 && px <= 55);
      if (post && y >= 34) ch = px === 8 || px === 51 ? '3' : px === 12 || px === 55 ? '2' : '5';
      if (y >= 34 && y <= 40 && px >= 8 && px <= 55) ch = y === 34 ? '4' : y === 40 ? '2' : '5';
      const braceL = px - 12 === y - 41 && px > 12 && px <= 20;
      const braceR = 51 - px === y - 41 && px < 51 && px >= 43;
      if (braceL || braceR) ch = '3';
      // ground shadow and ceiling
      if (y >= 108) ch = y === 108 ? '1' : '2';
      if (y < 12) ch = '1';
      else if (y < 16 && ch === '2') ch = '1';
      g.set(x, y, ch);
    }
  }
  return g.rows();
}

// ---- Props ----

function support(): string[] {
  const g = new Grid(16, 96);
  // post
  for (let y = 6; y < 96; y++) {
    for (let x = 4; x <= 11; x++) {
      g.set(x, y, x === 4 ? '4' : x >= 10 ? '3' : (y + x) % 11 === 0 ? '3' : '5');
    }
  }
  // crossbeam on top with corner braces
  g.rect(0, 0, 16, 6, '5');
  g.rect(0, 5, 16, 1, '3');
  g.rect(0, 0, 16, 1, '4');
  for (let i = 0; i < 4; i++) {
    g.set(3 - i, 6 + i, '3');
    g.set(12 + i, 6 + i, '3');
  }
  // iron nails and a base stone
  g.plot([
    [7, 3, '7'],
    [8, 20, '7'],
    [7, 60, '7'],
    [6, 40, '3'],
    [9, 70, '3'],
  ]);
  g.rect(2, 92, 12, 4, '3');
  g.rect(2, 92, 12, 1, '4');
  g.outline('1');
  return g.rows();
}

function pickaxe(): string[] {
  const g = new Grid(16, 16);
  // handle along the diagonal, head across the top
  g.line(3, 14, 12, 4, '5');
  g.line(4, 14, 13, 4, '3');
  g.plot([
    [6, 3, '7'],
    [7, 2, '4'],
    [8, 2, '7'],
    [9, 2, '7'],
    [10, 3, '7'],
    [11, 4, '4'],
    [5, 4, '4'],
    [12, 5, '4'],
    [13, 5, '7'],
    [14, 6, '4'],
  ]);
  g.outline('1');
  return g.rows();
}

function oreVein(): string[] {
  const g = new Grid(16, 16);
  const rows = [
    '................',
    '.....2222.......',
    '...223333322....',
    '..23333433332...',
    '.2333433333332..',
    '.2333388433332..',
    '.2334838733432..',
    '.2333383333332..',
    '.2433433348332..',
    '..2333333883322.',
    '..22333333733322',
    '...22233333322..',
    '.....22222222...',
    '................',
    '................',
    '................',
  ];
  g.blit(rows, 0, 0);
  g.outline('1');
  return g.rows();
}

function lanternFrame(frame: number): string[] {
  const g = new Grid(8, 16);
  g.plot([
    [3, 0, '1'],
    [4, 0, '1'],
    [3, 1, '3'],
    [4, 1, '3'],
    [3, 2, '1'],
    [4, 2, '1'],
  ]);
  g.rect(1, 3, 6, 1, '2'); // cap
  g.rect(2, 2, 4, 1, '2');
  g.rect(1, 4, 6, 7, '6');
  g.rect(2, 5, 4, 5, '7');
  g.rect(3, 6, 2, 3, '6');
  if (frame % 2 === 1) g.set(3, 5, '6');
  // cage bars and base
  for (let y = 4; y <= 10; y++) {
    g.set(1, y, '2');
    g.set(6, y, '2');
  }
  g.rect(1, 11, 6, 2, '2');
  g.rect(2, 13, 4, 1, '1');
  g.set(3, 14, '1');
  g.set(4, 14, '1');
  // flicker: a stray spark above the cap in odd frames
  if (frame === 1 || frame === 3) g.set(frame === 1 ? 5 : 2, 1, '6');
  return g.rows();
}

function minecart(): string[] {
  const g = new Grid(16, 16);
  const body = [
    '................',
    '....8.78.8......',
    '...8878778......',
    '.2222222222222..',
    '.2555555555552..',
    '..25555555552...',
    '..23333333332...',
    '..25555555552...',
    '..23333333332...',
    '...2222222222...',
    '................',
  ];
  g.blit(body, 0, 1);
  g.rect(1, 4, 14, 1, '4');
  g.rect(3, 12, 3, 3, '2');
  g.rect(10, 12, 3, 3, '2');
  g.plot([
    [4, 13, '4'],
    [11, 13, '4'],
    [4, 14, '2'],
    [11, 14, '2'],
  ]);
  g.outline('1');
  return g.rows();
}

function rubble(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '................',
      '......2222......',
      '....22344322....',
      '..222333333322..',
      '.22334333333432.',
      '.23333333843332.',
      '..22222222222...',
    ],
    0,
    0,
  );
  g.plot([
    [9, 3, '4'],
    [4, 5, '7'],
    [10, 6, '7'],
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
  // timbered passage: lintel at y 40, posts down both sides, dark opening between
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      if (x >= 5 && x <= 10 && y >= 47) g.set(x, y, '1');
      else if (y <= 46) g.set(x, y, y === 40 ? '4' : y === 46 ? '2' : '5');
      else g.set(x, y, x === 2 || x === 5 ? '3' : x <= 4 || x >= 11 ? '5' : '3');
    }
  }
  for (let y = 47; y < 128; y += 9) {
    g.set(3, y, '7');
    g.set(12, y + 4, '7');
  }
  return g.rows();
}

export const GOBLIN_MINE_SHAFTS: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    support: staticTemplate(id('support'), support(), { x: 0, y: 0 }),
    pickaxe: staticTemplate(id('pickaxe'), pickaxe(), { x: 0, y: 0 }),
    oreVein: staticTemplate(id('oreVein'), oreVein(), { x: 0, y: 0 }),
    lantern: loopTemplate(id('lantern'), frames(4, lanternFrame), { x: 0, y: 0 }),
    minecart: staticTemplate(id('minecart'), minecart(), { x: 8, y: 15 }),
    rubble: staticTemplate(id('rubble'), rubble(), { x: 8, y: 7 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
