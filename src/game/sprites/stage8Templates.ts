// Stage 8, "Shadow Realm": tiles, backdrop, and props (batch E4, step A-E4-3).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['shadow-realm'] laid over the master palette:
//   1 deep blue-black / outline   2 dark indigo stone   3 mid indigo stone   4 lit stone
//   5 violet crystal   6 lilac-white wisp light   7 pale highlight   8 cold cyan accent
// Mood: a dusk void of dark crystal slabs, drifting shards, and a pale violet horizon. Cute-spooky,
// no gore. Legibility: the floor stays mid-dark indigo (never black; no solid-black tile area beyond
// outline pixels); the bright parts (violet crystal, wisp light, cyan glints) live in props, wall
// tiles, and the backdrop, so enemies and heroes read lighter than the floor. Prop animation timing
// is engine-owned (every non-torch prop loops at PROP_FRAME_MS, 500 ms), so floatingShard and
// wispTorch are calm loops with small pixel differences. Tiles are 16x16 and join side by side
// (columns 0 and 15 identical across a set; wall variants also keep rows 0 and 15 identical).
// Generated at module load from fixed seeds. Template ids are `shadow-realm/<name>`.
// Props: wall props anchor at their top-left (0, 0); floor props anchor at the foot.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'shadow-realm';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Crystal slabs: 8 px wide panels, a lit left edge and a dark right seam, a lit top edge and
// a dark bottom seam every 16 rows. Periodic in 16. ----

function slabs(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      let ch = '3';
      if (y === 15) ch = '2';
      else if (x % 8 === 7) ch = '2';
      else if (y === 0) ch = '4';
      else if (x % 8 === 0) ch = '4';
      g.set(x, y, ch);
    }
  }
  return g;
}

function speck(g: Grid, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 2 + Math.floor(rng() * 12);
    if (g.get(x, y) === '3') g.set(x, y, rng() < 0.7 ? '2' : '4');
  }
}

function wallMid(variant: number): Grid {
  const g = slabs();
  const rng = seeded(81000 + variant);
  speck(g, rng, 4);
  if (variant === 1) {
    // a violet vein
    g.plot([
      [3, 2, '5'],
      [4, 3, '5'],
      [4, 4, '2'],
      [5, 5, '5'],
      [5, 6, '5'],
      [4, 7, '2'],
      [4, 8, '5'],
      [3, 9, '5'],
      [3, 10, '2'],
    ]);
  }
  if (variant === 2) {
    // a small carved rune: a diamond with a cold cyan point
    g.plot([
      [11, 4, '5'],
      [10, 5, '5'],
      [12, 5, '5'],
      [11, 6, '5'],
      [11, 5, '8'],
      [11, 8, '2'],
      [11, 9, '2'],
    ]);
  }
  if (variant === 3) {
    // a scatter of faint stars caught in the stone
    g.plot([
      [3, 3, '7'],
      [11, 5, '5'],
      [6, 10, '5'],
      [12, 12, '7'],
      [2, 13, '8'],
    ]);
  }
  if (variant === 4) {
    // a dark archway: the backdrop shows through, framed in lit stone and a violet rim
    for (let y = 4; y <= 13; y++) for (let x = 5; x <= 10; x++) g.set(x, y, '.');
    for (let x = 4; x <= 11; x++) g.set(x, 3, '4');
    for (let y = 4; y <= 13; y++) {
      g.set(4, y, '5');
      g.set(11, y, '5');
    }
    for (let x = 4; x <= 11; x++) g.set(x, 14, '2');
    g.plot([
      [3, 3, '2'],
      [12, 3, '2'],
    ]);
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = slabs();
  const rng = seeded(82000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) !== '2') g.set(x, y, '2');
  }
  // crystal points hanging from the lip
  const xs = variant === 0 ? [3, 8, 13] : [5, 11];
  for (const x of xs) {
    g.set(x, 7, '5');
    g.set(x, 8, '2');
    g.set(x + 1, 7, '2');
  }
  speck(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = slabs();
  const rng = seeded(83000 + variant);
  speck(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '4');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 3) === 3 ? '2' : '3');
    g.set(x, 15, '1');
  }
  if (variant === 1) {
    g.plot([
      [5, 11, '5'],
      [6, 11, '5'],
      [11, 12, '2'],
      [12, 12, '2'],
    ]);
  }
  return g;
}

/** Dusk flagstones: mid-dark indigo with lit seams. No violet or cyan on the walking floor. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const seam = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 84000 : 85000) + variant);
  g.rect(0, 0, T, T, base);
  for (let y = 2; y < T; y++) g.set(5, y, seam);
  for (let x = 0; x < T; x++) g.set(x, 9, seam);
  g.set(15, 9, base);
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
    // two lit flecks
    g.plot([
      [8, 12, '4'],
      [9, 12, '4'],
      [3, 4, '4'],
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
    // a crystal lump on the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '3');
    g.rect(4, 0, 3, 1, '5');
    g.rect(11, 0, 2, 1, '.');
    g.rect(11, 1, 2, 1, '4');
  }
  return g;
}

// ---- Backdrop: 128x128, a night void with floating shards and a pale horizon glow; period 64 ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(81803);
  const stars = new Set<number>();
  for (let i = 0; i < 40; i++) stars.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 96));
  const dust = new Set<number>();
  for (let i = 0; i < 80; i++) dust.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 128));
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      if (dust.has(px + 64 * y)) ch = '3';
      // pale horizon glow: a violet dither band that thickens toward y 104
      if (y >= 72 && y < 108) {
        const band = (y - 72) / 36;
        if (((px + y) & 1) === 0 && rng() < band) ch = '3';
        if (y >= 92 && ((px + y) & 3) === 0 && rng() < band) ch = '5';
      }
      if (stars.has(px + 64 * y) && y < 90) ch = (px + y) % 3 === 0 ? '7' : '5';
      if (y >= 108) {
        // a dark crystal plain with lit seams
        ch = y < 110 ? '5' : '2';
        if (y >= 110 && (px + (y >> 2)) % 9 === 0) ch = '3';
        if (y >= 110 && ((px >> 3) + (y >> 3)) % 2 === 0 && px % 8 === 0) ch = '4';
      }
      if (y < 12) ch = '1';
      else if (y < 16 && ch === '2') ch = '1';
      g.set(x, y, ch);
    }
  }
  // floating shards (crystal slivers with a lit edge), three per period at varied heights
  const shard = (ox: number, sx: number, sy: number, h: number, w: number): void => {
    for (let k = 0; k < h; k++) {
      const half = Math.min(w, Math.min(k + 1, h - k));
      for (let i = -half + 1; i < half; i++) {
        const ch = i < 0 ? '4' : i === 0 ? '5' : '3';
        g.set(ox + sx + i, sy + k, ch);
      }
    }
    g.set(ox + sx, sy + 1, '7');
  };
  for (const ox of [0, 64]) {
    shard(ox, 12, 30, 12, 3);
    shard(ox, 38, 52, 9, 2);
    shard(ox, 54, 24, 14, 3);
    shard(ox, 26, 78, 7, 2);
    shard(ox, 46, 88, 8, 2);
  }
  return g.rows();
}

// ---- Props ----

function duskPillar(): string[] {
  const g = new Grid(16, 112);
  // a faceted dark crystal column on a stepped base, with a pointed crystal capital
  g.rect(1, 0, 14, 5, '2');
  g.rect(1, 0, 14, 1, '4');
  g.plot([
    [4, 0, '5'],
    [5, 0, '5'],
    [10, 0, '5'],
  ]);
  g.rect(0, 5, 16, 3, '3');
  g.rect(0, 5, 16, 1, '4');
  g.rect(0, 7, 16, 1, '2');
  const facets = ['2', '4', '4', '3', '3', '3', '2', '2', '2', '1', '1', '1'];
  for (let y = 8; y < 104; y++) {
    for (let x = 2; x <= 13; x++) g.set(x, y, facets[x - 2] ?? '3');
  }
  g.rect(0, 104, 16, 3, '2');
  g.rect(0, 107, 16, 5, '3');
  g.rect(0, 107, 16, 1, '4');
  g.rect(0, 111, 16, 1, '2');
  // a thin violet inlay line down the lit facet, and a few star glints
  for (let y = 12; y < 100; y++) if (y % 12 !== 6) g.set(5, y, '5');
  for (const y of [20, 44, 70, 90]) {
    g.set(4, y, '7');
    g.set(8, y + 2, '7');
  }
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A hovering crystal shard; 2-frame slow bob (one pixel up and down) with a shifting glint. */
function floatingShard(frame: number): string[] {
  const g = new Grid(16, 24);
  const dy = frame === 0 ? 0 : 1;
  const rows = [
    '.......66.......',
    '......6556......',
    '.....655555.....',
    '.....655555.....',
    '....65555555....',
    '....65555545....',
    '....65555545....',
    '....65555445....',
    '....55554445....',
    '....55554445....',
    '.....555444.....',
    '.....555444.....',
    '......5544......',
    '......5544......',
    '.......54.......',
    '.......44.......',
  ];
  g.blit(rows, 0, 2 + dy);
  g.plot([
    [6, 5 + dy + frame, '7'],
    [6, 6 + dy + frame, '7'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function mirrorFrame(): string[] {
  const g = new Grid(16, 48);
  // an ornate dark frame: a scrolled crown, a lit bevel, an inner dark glass with faint stars
  g.rect(3, 0, 10, 3, '3');
  g.rect(3, 0, 10, 1, '4');
  g.plot([
    [7, 0, '5'],
    [8, 0, '5'],
    [2, 2, '3'],
    [13, 2, '3'],
  ]);
  g.rect(1, 3, 14, 40, '3');
  g.rect(1, 3, 14, 1, '4');
  g.rect(1, 3, 1, 40, '4');
  g.rect(14, 4, 1, 39, '2');
  g.rect(1, 42, 14, 1, '2');
  // the glass
  g.rect(3, 6, 10, 34, '2');
  for (let y = 6; y < 40; y++) {
    // a pale diagonal sheen across the glass
    const sx = 4 + ((y * 3) % 9);
    if (sx <= 11 && y % 4 < 2) g.set(sx, y, '3');
  }
  g.rect(3, 6, 10, 1, '1');
  g.rect(3, 6, 1, 34, '1');
  g.plot([
    [5, 12, '7'],
    [10, 18, '5'],
    [7, 25, '7'],
    [11, 31, '5'],
    [5, 35, '8'],
    [9, 9, '5'],
  ]);
  // feet
  g.rect(2, 43, 4, 3, '3');
  g.rect(10, 43, 4, 3, '3');
  g.rect(2, 43, 4, 1, '4');
  g.rect(10, 43, 4, 1, '4');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A sconce with a pale violet-white wisp flame; slow 4-frame loop (the flame leans and rises). */
function wispTorch(frame: number): string[] {
  const g = new Grid(16, 24);
  // dark crystal bracket and cup
  g.rect(6, 14, 4, 6, '3');
  g.rect(6, 14, 4, 1, '4');
  g.rect(4, 12, 8, 2, '3');
  g.rect(4, 12, 8, 1, '4');
  g.rect(5, 19, 6, 2, '2');
  g.rect(7, 21, 2, 2, '2');
  // the wisp: a soft teardrop whose tip sways left and right over four frames
  const sway = [0, -1, 0, 1][frame] ?? 0;
  g.blit(['...5...', '..565..', '.56765.', '.56765.', '..565..'], 4, 7);
  g.set(8 + sway, 6, '5');
  g.set(8 + sway * 2, 5, frame % 2 === 0 ? '6' : '5');
  if (frame === 2) g.set(8, 4, '5');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function duskAltar(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '................',
      '................',
      '.4444444444444..',
      '.4333333333322..',
      '..43333333332...',
      '..22222222222...',
      '..2223333222....',
      '..2223333222....',
      '..2223333222....',
      '..2222222222....',
      '.442222222222...',
      '.43333333333322.',
      '.22222222222222.',
      '................',
      '................',
    ],
    0,
    0,
  );
  // a glowing violet rune on the face and a cyan spark on the top
  g.plot([
    [8, 8, '5'],
    [7, 9, '5'],
    [9, 9, '5'],
    [8, 10, '5'],
    [8, 9, '8'],
    [5, 3, '7'],
  ]);
  g.outline('1');
  return g.rows();
}

function shardPatch(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '.......5........',
      '......565.......',
      '....5.545..6....',
      '...565.54.656...',
      '.5.554.....544..',
      '565.44...5..4...',
      '.54..2222554.2..',
    ],
    0,
    0,
  );
  g.plot([
    [7, 2, '7'],
    [12, 4, '7'],
    [1, 5, '8'],
  ]);
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
  // a black arch with a violet rim and a faint star glint in the gap
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      if (x >= 5 && x <= 10 && y >= 47) {
        g.set(x, y, '1');
      } else if (y <= 46) {
        g.set(x, y, y === 40 ? '5' : y === 46 ? '2' : '3');
      } else if (x === 4 || x === 11) g.set(x, y, '5');
      else g.set(x, y, x === 2 || x === 13 ? '2' : x <= 3 || x >= 12 ? '4' : '2');
    }
  }
  g.plot([
    [7, 44, '5'],
    [8, 44, '5'],
    [6, 60, '7'],
    [9, 84, '8'],
    [7, 108, '7'],
    [8, 118, '5'],
  ]);
  return g.rows();
}

export const SHADOW_REALM: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    duskPillar: staticTemplate(id('duskPillar'), duskPillar(), { x: 0, y: 0 }),
    floatingShard: loopTemplate(id('floatingShard'), frames(2, floatingShard), { x: 0, y: 0 }),
    mirrorFrame: staticTemplate(id('mirrorFrame'), mirrorFrame(), { x: 0, y: 0 }),
    wispTorch: loopTemplate(id('wispTorch'), frames(4, wispTorch), { x: 0, y: 0 }),
    duskAltar: staticTemplate(id('duskAltar'), duskAltar(), { x: 8, y: 14 }),
    shardPatch: staticTemplate(id('shardPatch'), shardPatch(), { x: 8, y: 7 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
