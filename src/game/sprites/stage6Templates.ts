// Stage 6, "Molten Core": tiles, backdrop, and props (batch E3, step A-E3-3).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['molten-core'] laid over the master palette:
//   1 basalt black / outline   2 dark charcoal   3 mid charcoal   4 lit basalt
//   5 rust iron   6 glowing orange   7 hot yellow-white   8 deep red-brown
// Mood: black basalt columns, rust iron, a distant orange glow. Cute-spooky, no gore.
// Glow rules (docs/design/art-style-guide.md): the orange `6` and hot `7` appear only in the
// backdrop and in wall-layer props and wall tiles (lavaFall, lavaChannel, the lit opening, the
// door gap); floor tiles and floor props use only the dark `8` and rust `5`. Tiles are 16x16 and
// join side by side (columns 0 and 15 identical across a set; wall variants also keep rows 0 and
// 15 identical). Generated at module load from fixed seeds. Template ids are `molten-core/<name>`.
// Props: wall props anchor at their top-left (0, 0); floor props anchor at the foot.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'molten-core';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Basalt: 4 px wide columns with a lit left edge and dark seams, 8 px courses. Periodic in 16. ----

function basalt(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) {
    const course = Math.floor(y / 8);
    const off = (course % 2) * 2;
    for (let x = 0; x < T; x++) {
      let ch = '3';
      if (y % 8 === 7) ch = '2';
      else if ((x + off) % 4 === 3) ch = '2';
      else if ((x + off) % 4 === 0) ch = '4';
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

function wallMid(variant: number): Grid {
  const g = basalt();
  const rng = seeded(41000 + variant);
  chip(g, rng, 4);
  if (variant === 1) {
    // a crack with a faint dark-red glow inside
    g.plot([
      [8, 1, '1'],
      [8, 2, '8'],
      [9, 3, '8'],
      [9, 4, '1'],
      [10, 5, '8'],
      [10, 6, '6'],
      [9, 7, '8'],
      [9, 8, '1'],
      [8, 9, '8'],
      [8, 10, '1'],
      [7, 11, '8'],
      [7, 12, '1'],
    ]);
  }
  if (variant === 2) {
    // an iron band with rivets
    g.rect(1, 5, 14, 4, '5');
    g.rect(1, 5, 14, 1, '4');
    g.rect(1, 8, 14, 1, '2');
    g.plot([
      [3, 6, '4'],
      [8, 6, '4'],
      [12, 6, '4'],
    ]);
  }
  if (variant === 3) {
    // cooling embers: a few dark-red specks
    g.plot([
      [4, 4, '8'],
      [11, 6, '8'],
      [6, 10, '8'],
      [12, 12, '8'],
      [5, 12, '5'],
    ]);
  }
  if (variant === 4) {
    // a lit opening: the backdrop and its glow show through, framed in dark red
    for (let y = 3; y <= 13; y++) for (let x = 4; x <= 11; x++) g.set(x, y, '.');
    for (let x = 3; x <= 12; x++) g.set(x, 2, '8');
    for (let y = 3; y <= 13; y++) {
      g.set(3, y, '8');
      g.set(12, y, '8');
    }
    for (let x = 4; x <= 11; x++) g.set(x, 14, '2');
    g.plot([
      [4, 3, '6'],
      [11, 3, '6'],
      [3, 8, '6'],
      [12, 9, '6'],
    ]);
    for (const bx of [6, 9]) for (let y = 3; y <= 13; y++) g.set(bx, y, '1');
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = basalt();
  const rng = seeded(42000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) !== '2') g.set(x, y, '2');
  }
  // basalt points hanging from the lip
  const xs = variant === 0 ? [3, 8, 13] : [5, 11];
  for (const x of xs) {
    g.set(x, 7, '3');
    g.set(x, 8, '2');
    g.set(x + 1, 7, '2');
  }
  chip(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = basalt();
  const rng = seeded(43000 + variant);
  chip(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '8');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 3) === 3 ? '2' : '3');
    g.set(x, 15, '1');
  }
  if (variant === 1) {
    g.plot([
      [5, 11, '5'],
      [6, 11, '5'],
      [11, 12, '8'],
      [12, 12, '8'],
    ]);
  }
  return g;
}

/** Basalt flagstones. Dark red seams far away only; no glow colors on the walking floor. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const seam = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 44000 : 45000) + variant);
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
      [11, 6, '8'],
    ]);
  }
  if (variant === 2) {
    g.plot([
      [8, 12, '5'],
      [9, 12, '5'],
      [3, 4, '8'],
      [4, 5, '8'],
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
    // a lump of basalt on the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '3');
    g.rect(4, 0, 3, 1, '4');
    g.rect(11, 0, 2, 1, '.');
    g.rect(11, 1, 2, 1, '5');
  }
  return g;
}

// ---- Backdrop: 128x128, a far lava river under a red-orange horizon glow, black basalt
// columns; period 64 ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(61803);
  const speck = new Set<number>();
  for (let i = 0; i < 60; i++) speck.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 128));
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      if (speck.has(px + 64 * y)) ch = '3';
      // horizon glow: dark red dither rising above the river
      if (y >= 70 && y < 84) {
        const band = (y - 70) / 14;
        if (((px + y) & 1) === 0 && rng() < band + 0.2) ch = '8';
      }
      // black basalt columns (three per period) with a lit left edge
      const cols = [
        [4, 12, 30],
        [24, 14, 22],
        [44, 11, 36],
      ] as const;
      for (const [cx, w, top] of cols) {
        if (px >= cx && px < cx + w && y >= top && y < 108) {
          ch = px === cx ? '4' : (px - cx) % 5 === 4 ? '2' : '1';
        }
      }
      // the lava river: dark red bank, orange body, a few hot flecks
      if (y >= 108 && y < 128) {
        ch = y < 110 ? '8' : '6';
        // darker ripples and a cooler far bank
        if (y >= 110 && y < 112 && (px & 3) === 0) ch = '8';
        if (y >= 114 && (y + (px >> 3)) % 6 === 0 && (px & 7) < 5) ch = '8';
        if (y >= 124) ch = (px + y) % 3 === 0 ? '6' : '8';
      }
      if (y < 12) ch = '1';
      else if (y < 16 && ch === '2') ch = '1';
      g.set(x, y, ch);
    }
  }
  for (const ox of [0, 64]) {
    g.plot([
      [ox + 10, 114, '7'],
      [ox + 11, 114, '7'],
      [ox + 30, 118, '7'],
      [ox + 52, 112, '7'],
      [ox + 53, 112, '7'],
      [ox + 20, 122, '8'],
      [ox + 42, 120, '8'],
      [ox + 60, 116, '8'],
    ]);
  }
  return g.rows();
}

// ---- Props ----

function obsidianPillar(): string[] {
  const g = new Grid(16, 112);
  // capital and base blocks in charcoal, a glossy dark shaft with long highlights
  g.rect(0, 0, 16, 5, '3');
  g.rect(0, 0, 16, 1, '4');
  g.rect(0, 4, 16, 1, '2');
  g.rect(1, 5, 14, 2, '2');
  for (let y = 7; y < 104; y++) {
    for (let x = 2; x <= 13; x++) {
      let ch = '2';
      if (x === 3 || x === 4) ch = '4';
      else if (x === 6) ch = '3';
      else if (x >= 11) ch = '1';
      g.set(x, y, ch);
    }
  }
  g.rect(0, 104, 16, 3, '2');
  g.rect(0, 107, 16, 5, '3');
  g.rect(0, 107, 16, 1, '4');
  g.rect(0, 111, 16, 1, '2');
  // glossy glints and one rust bolt band
  for (const y of [20, 38, 63, 85]) {
    g.set(3, y, '7');
    g.set(4, y + 1, '7');
  }
  g.rect(2, 50, 12, 3, '5');
  g.rect(2, 50, 12, 1, '4');
  g.plot([
    [4, 51, '4'],
    [8, 51, '4'],
    [12, 51, '4'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A lava stream from a basalt spout: slow 4-frame flow, cooling crust at the edges. */
function lavaFall(frame: number): string[] {
  const g = new Grid(16, 96);
  // spout block at the top
  g.rect(3, 0, 10, 5, '3');
  g.rect(3, 0, 10, 1, '4');
  g.rect(3, 4, 10, 1, '2');
  g.rect(5, 3, 6, 2, '8');
  // the stream: crust, body, and bright streaks that move down with the frame
  for (let y = 5; y < 90; y++) {
    const wob = Math.round(Math.sin(y / 9));
    const x0 = 5 + wob;
    const x1 = 10 + wob;
    for (let x = x0; x <= x1; x++) {
      let ch = '6';
      if (x === x0 || x === x1) ch = '8';
      else if ((y + frame * 2) % 8 < 3 && x > x0 && x < x1 - 1) ch = '7';
      g.set(x, y, ch);
    }
  }
  // splash pool at the foot of the stream
  g.rect(2, 90, 12, 4, '8');
  g.rect(3, 90, 10, 2, '6');
  g.plot([
    [4 + (frame % 2), 90, '7'],
    [9 - (frame % 2), 91, '7'],
    [6, 92, '6'],
  ]);
  g.rect(2, 93, 12, 3, '2');
  g.rect(2, 93, 12, 1, '3');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A shallow trough of lava along the wall base; 2-frame shimmer. Edge columns repeat. */
function lavaChannel(frame: number): string[] {
  const g = new Grid(16, 8);
  g.rect(0, 0, 16, 2, '3');
  g.rect(0, 0, 16, 1, '4');
  g.rect(0, 2, 16, 4, '6');
  g.rect(0, 2, 16, 1, '8');
  g.rect(0, 5, 16, 1, '8');
  g.rect(0, 6, 16, 2, '2');
  const xs = frame === 0 ? [2, 7, 12] : [4, 9, 14];
  for (const x of xs) {
    g.set(x, 3, '7');
    g.set(x + 1, 4, '7');
  }
  return g.rows();
}

function anvil(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '................',
      '..4444444444....',
      '.44444444444444.',
      '.43333333332222.',
      '..222333333222..',
      '....2333332.....',
      '....2333332.....',
      '....2333332.....',
      '...223333322....',
      '..22333333322...',
      '..5555555555....',
      '..2222222222....',
      '................',
      '................',
      '................',
    ],
    0,
    0,
  );
  g.plot([
    [4, 3, '7'],
    [5, 3, '7'],
    [12, 2, '4'],
    [6, 11, '4'],
  ]);
  g.outline('1');
  return g.rows();
}

function slagHeap(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '................',
      '.......44.......',
      '.....4334.3.....',
      '..4.43333343.4..',
      '.4334333233334..',
      '.3233222233223..',
      '..222222222222..',
    ],
    0,
    0,
  );
  // a cooled crack: dark red and one rust fleck (no bright glow on the floor)
  g.plot([
    [8, 4, '8'],
    [8, 5, '8'],
    [9, 6, '8'],
    [5, 5, '5'],
    [11, 5, '5'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function toolRack(): string[] {
  const g = new Grid(16, 24);
  // a rust beam with two hooks, a hammer, tongs, and a hanging chain
  g.rect(0, 2, 16, 3, '5');
  g.rect(0, 2, 16, 1, '4');
  g.rect(0, 4, 16, 1, '2');
  g.plot([
    [1, 5, '5'],
    [1, 6, '5'],
    [14, 5, '5'],
    [14, 6, '5'],
  ]);
  // hammer: handle and head
  g.rect(3, 6, 2, 12, '3');
  g.rect(1, 17, 6, 4, '4');
  g.rect(1, 20, 6, 1, '2');
  g.set(2, 18, '7');
  // tongs
  g.plot([
    [9, 6, '4'],
    [9, 7, '4'],
    [10, 8, '4'],
    [10, 9, '4'],
    [10, 10, '4'],
    [9, 11, '4'],
    [11, 8, '4'],
    [11, 9, '4'],
    [12, 10, '4'],
    [12, 11, '4'],
    [12, 12, '4'],
    [12, 13, '4'],
    [11, 14, '5'],
    [10, 14, '5'],
    [9, 12, '4'],
    [9, 13, '4'],
    [9, 14, '4'],
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
  // a blackened iron-banded arch: rust lintel bands at y 40, dark posts, an orange glow in the gap
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      if (x >= 5 && x <= 10 && y >= 47) {
        g.set(x, y, x === 7 || x === 8 ? (y > 100 ? '6' : '8') : '1');
      } else if (y <= 46) {
        g.set(x, y, y === 40 ? '4' : y === 46 ? '2' : '5');
      } else g.set(x, y, x === 2 || x === 5 ? '2' : x <= 4 || x >= 11 ? '4' : '2');
    }
  }
  // iron bands across the posts
  for (let y = 52; y < 128; y += 14) {
    g.rect(2, y, 3, 2, '5');
    g.rect(11, y, 3, 2, '5');
  }
  g.plot([
    [7, 44, '8'],
    [8, 44, '8'],
    [7, 112, '7'],
    [8, 118, '7'],
  ]);
  return g.rows();
}

export const MOLTEN_CORE: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    obsidianPillar: staticTemplate(id('obsidianPillar'), obsidianPillar(), { x: 0, y: 0 }),
    lavaFall: loopTemplate(id('lavaFall'), frames(4, lavaFall), { x: 0, y: 0 }),
    lavaChannel: loopTemplate(id('lavaChannel'), frames(2, lavaChannel), { x: 0, y: 0 }),
    anvil: staticTemplate(id('anvil'), anvil(), { x: 8, y: 14 }),
    slagHeap: staticTemplate(id('slagHeap'), slagHeap(), { x: 8, y: 7 }),
    toolRack: staticTemplate(id('toolRack'), toolRack(), { x: 0, y: 0 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
