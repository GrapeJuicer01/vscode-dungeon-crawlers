// Stage 7, "Frozen Citadel": tiles, backdrop, and props (batch E4, step A-E4-2).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['frozen-citadel'] laid over the master palette:
//   1 deep blue-black / outline   2 dark citadel stone   3 mid stone   4 lit stone
//   5 ice blue   6 pale cyan light   7 frost white (sparse)   8 teal accent
// Mood: cold blue-gray battlements, rimed iron, pale cyan light. Cute-spooky, no gore.
// Ice and snow are scenery only: they sit in the backdrop, in wall tiles, in wall-layer props and
// as small floor decorations. The floor tiles keep to the stone tones `2 3 4` (a single `5` fleck);
// frost white `7` appears only as sparse highlights. Prop animation timing is engine-owned (every
// non-torch prop loops at PROP_FRAME_MS, 500 ms), so iceSheet and iceLamp are calm 2-frame loops
// with tiny pixel differences. Tiles are 16x16 and join side by side (columns 0 and 15 identical
// across a set; wall variants also keep rows 0 and 15 identical). Generated at module load from
// fixed seeds. Template ids are `frozen-citadel/<name>`.
// Props: wall props anchor at their top-left (0, 0); floor props anchor at the foot.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'frozen-citadel';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Citadel brickwork: 8 px courses, 8 px bricks offset by 4 on alternate courses. Periodic in 16. ----

function bricks(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) {
    const course = Math.floor(y / 8);
    const off = (course % 2) * 4;
    for (let x = 0; x < T; x++) {
      let ch = '3';
      if (y % 8 === 7) ch = '2';
      else if ((x + off) % 8 === 7) ch = '2';
      else if (y % 8 === 0) ch = '4';
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
  const g = bricks();
  const rng = seeded(71000 + variant);
  chip(g, rng, 4);
  if (variant === 1) {
    // frost creeping along a vertical seam
    g.plot([
      [7, 2, '5'],
      [7, 3, '5'],
      [6, 4, '5'],
      [7, 5, '4'],
      [6, 9, '5'],
      [7, 10, '5'],
      [7, 11, '5'],
      [8, 12, '4'],
    ]);
  }
  if (variant === 2) {
    // a carved diamond crest
    g.plot([
      [8, 3, '4'],
      [7, 4, '4'],
      [9, 4, '4'],
      [6, 5, '4'],
      [10, 5, '4'],
      [7, 6, '2'],
      [9, 6, '2'],
      [8, 4, '2'],
      [8, 5, '5'],
    ]);
  }
  if (variant === 3) {
    // an ice crack with a pale fill
    g.plot([
      [10, 1, '1'],
      [10, 2, '5'],
      [9, 3, '1'],
      [9, 4, '5'],
      [10, 5, '1'],
      [10, 6, '1'],
      [11, 9, '1'],
      [11, 10, '5'],
      [10, 11, '1'],
      [10, 12, '5'],
    ]);
  }
  if (variant === 4) {
    // a frost-rimed arrow slit: the backdrop shows through
    for (let y = 3; y <= 13; y++) for (let x = 6; x <= 9; x++) g.set(x, y, '.');
    for (let y = 2; y <= 14; y++) {
      g.set(5, y, '2');
      g.set(10, y, '2');
    }
    for (let x = 5; x <= 10; x++) g.set(x, 2, '4');
    for (let x = 5; x <= 10; x++) g.set(x, 14, '5');
    g.plot([
      [5, 3, '5'],
      [10, 3, '5'],
      [5, 8, '4'],
      [10, 8, '4'],
    ]);
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = bricks();
  const rng = seeded(72000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) !== '2') g.set(x, y, '2');
  }
  // small icicles hanging from the lip
  const xs = variant === 0 ? [3, 8, 13] : [5, 11];
  for (const x of xs) {
    g.set(x, 7, '5');
    g.set(x, 8, '4');
    g.set(x + 1, 7, '4');
  }
  chip(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = bricks();
  const rng = seeded(73000 + variant);
  chip(g, rng, 3);
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
      [11, 12, '4'],
      [12, 12, '4'],
    ]);
  }
  return g;
}

/** Cold flagstones. Mid-dark; ice only as a rare small glint. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const seam = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 74000 : 75000) + variant);
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
    // a faint frost sheen: two lit-stone glints (and one ice fleck on the far floor)
    g.plot([
      [8, 12, '4'],
      [9, 12, '4'],
      [3, 4, kind === 'back' ? '5' : '4'],
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
    // a snow-capped block on the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '4');
    g.rect(4, 0, 3, 1, '6');
    g.rect(11, 0, 2, 1, '.');
    g.rect(11, 1, 2, 1, '5');
  }
  return g;
}

// ---- Backdrop: 128x128, distant frozen towers and battlements under a pale sky, hanging
// icicles at the top; period 64 ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(71803);
  const speck = new Set<number>();
  for (let i = 0; i < 50; i++) speck.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 128));
  // towers: [left, width, top]; battlement teeth along the roofline
  const towers = [
    [3, 14, 40],
    [22, 10, 58],
    [38, 18, 30],
  ] as const;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      if (speck.has(px + 64 * y)) ch = '3';
      // pale sky: a lighter dither band toward the horizon
      if (y >= 52 && y < 100) {
        const band = (y - 52) / 48;
        if (((px + y) & 1) === 0 && rng() < band * 0.8) ch = '3';
      }
      for (const [tx, w, top] of towers) {
        const teeth = px >= tx && px < tx + w && y === top - 2 && (px - tx) % 4 < 2;
        if (teeth) ch = '4';
        if (px >= tx && px < tx + w && y >= top && y < 108) {
          ch = px === tx ? '4' : px >= tx + w - 2 ? '1' : y === top ? '4' : '3';
          if ((y - top) % 12 === 11) ch = '2';
          // a tiny lit window
          if (px === tx + 4 && y % 16 === 6 && y > top + 4) ch = '5';
        }
      }
      if (y >= 108) {
        // snowfield: lit bank with ice specks
        ch = y < 110 ? '4' : '3';
        if ((px * 3 + y * 5) % 11 === 0) ch = '4';
        if ((px * 7 + y) % 23 === 0) ch = '5';
      }
      if (y < 12) ch = '1';
      else if (y < 16 && ch === '2') ch = '1';
      g.set(x, y, ch);
    }
  }
  // hanging icicles under the dark top band
  for (const ox of [0, 64]) {
    for (const [ix, len] of [
      [6, 9],
      [14, 5],
      [27, 11],
      [41, 6],
      [50, 10],
      [58, 5],
    ] as const) {
      for (let k = 0; k < len; k++) {
        g.set(ox + ix, 12 + k, k < len - 2 ? '4' : '5');
        if (k < len - 4) g.set(ox + ix + 1, 12 + k, '3');
      }
    }
    g.plot([
      [ox + 11, 100, '5'],
      [ox + 33, 96, '5'],
      [ox + 52, 102, '5'],
      [ox + 20, 84, '6'],
      [ox + 46, 76, '6'],
    ]);
  }
  return g.rows();
}

// ---- Props ----

function icePillar(): string[] {
  const g = new Grid(16, 112);
  g.rect(0, 0, 16, 5, '3');
  g.rect(0, 0, 16, 1, '4');
  g.rect(0, 4, 16, 1, '2');
  g.rect(1, 5, 14, 2, '2');
  // a fluted shaft of blue ice: lit flutes on the left, dark ones on the right
  const flutes = ['2', '4', '5', '5', '4', '3', '3', '4', '3', '2', '2', '1'];
  for (let y = 7; y < 104; y++) {
    for (let x = 2; x <= 13; x++) g.set(x, y, flutes[x - 2] ?? '3');
  }
  g.rect(0, 104, 16, 3, '2');
  g.rect(0, 107, 16, 5, '3');
  g.rect(0, 107, 16, 1, '4');
  g.rect(0, 111, 16, 1, '2');
  // frost glints and a rime band
  for (const y of [18, 36, 61, 83]) {
    g.set(4, y, '7');
    g.set(5, y + 1, '7');
  }
  g.rect(2, 48, 12, 3, '4');
  g.rect(2, 48, 12, 1, '5');
  g.plot([
    [4, 50, '2'],
    [8, 50, '2'],
    [12, 50, '2'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function icicleCluster(): string[] {
  const g = new Grid(16, 40);
  g.rect(0, 0, 16, 4, '3');
  g.rect(0, 0, 16, 1, '4');
  g.rect(0, 3, 16, 1, '2');
  // icicles of different lengths: [x, length, width]
  const spikes = [
    [1, 20, 3],
    [5, 33, 4],
    [10, 25, 3],
    [13, 14, 2],
  ] as const;
  for (const [x, len, w] of spikes) {
    for (let k = 0; k < len; k++) {
      const taper = k > len - 8 ? Math.max(1, w - Math.floor((k - (len - 8)) / 2)) : w;
      for (let i = 0; i < taper; i++) {
        const ch = i === 0 ? '7' : i === taper - 1 && taper > 1 ? '4' : '5';
        g.set(x + i + Math.floor((w - taper) / 2), 4 + k, k === 0 ? '4' : ch);
      }
    }
  }
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function frostBanner(): string[] {
  const g = new Grid(16, 48);
  // iron rod with finials
  g.rect(0, 1, 16, 2, '4');
  g.plot([
    [0, 0, '5'],
    [15, 0, '5'],
    [0, 3, '2'],
    [15, 3, '2'],
  ]);
  // the stiff cloth, hung on rings; a swallow-tail edge below
  for (let y = 3; y < 44; y++) {
    for (let x = 2; x <= 13; x++) {
      let ch = '3';
      if (x >= 12) ch = '2';
      else if (x === 2) ch = '4';
      g.set(x, y, ch);
    }
  }
  // tattered hem
  for (let x = 2; x <= 13; x++) {
    const depth = [4, 2, 5, 3, 1, 4, 4, 1, 3, 5, 2, 3][x - 2] ?? 3;
    for (let k = 0; k < depth; k++) g.set(x, 44 + k - 4, '3');
    for (let k = depth; k < 4; k++) g.set(x, 44 + k - 4, '.');
  }
  g.rect(2, 8, 12, 1, '8');
  g.rect(2, 36, 12, 1, '8');
  // crest: a six-point snow star in ice blue
  g.plot([
    [8, 14, '5'],
    [8, 15, '5'],
    [8, 16, '7'],
    [8, 17, '5'],
    [8, 18, '5'],
    [6, 15, '5'],
    [7, 16, '5'],
    [9, 16, '5'],
    [10, 15, '5'],
    [6, 17, '5'],
    [10, 17, '5'],
    [7, 14, '4'],
    [9, 14, '4'],
    [7, 18, '4'],
    [9, 18, '4'],
  ]);
  // rime clinging to the hem
  g.plot([
    [4, 40, '5'],
    [9, 41, '5'],
    [11, 39, '4'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A crystal lantern on a bracket; 2-frame slow pulse (the core brightens by a shade). */
function iceLamp(frame: number): string[] {
  const g = new Grid(16, 24);
  // wall bracket and chain
  g.rect(5, 0, 6, 3, '3');
  g.rect(5, 0, 6, 1, '4');
  g.rect(5, 2, 6, 1, '2');
  g.plot([
    [8, 3, '4'],
    [8, 4, '4'],
  ]);
  // the crystal: a tall hexagonal lantern with a pale core
  const body = [
    '.....55555.....',
    '....5555555....',
    '...555666555...',
    '...556666655...',
    '...556666655...',
    '...555666555...',
    '....5555555....',
    '.....55555.....',
  ];
  g.blit(
    body.map((r) => r.slice(0, 16).padEnd(16, '.')),
    0,
    5,
  );
  g.rect(5, 13, 6, 1, '3');
  g.rect(6, 14, 4, 1, '2');
  // pulse: the core shade and a small halo
  const core: readonly (readonly [number, number])[] = [
    [8, 8],
    [7, 9],
    [8, 9],
    [9, 9],
    [8, 10],
  ];
  for (const [x, y] of core) g.set(x, y, frame === 0 ? '6' : '7');
  g.plot([
    [5, 7, '7'],
    [5, 8, '7'],
  ]);
  if (frame === 1) {
    g.plot([
      [6, 8, '6'],
      [10, 8, '6'],
    ]);
  }
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A frozen sheet along the wall base: slow 2-frame glint. Edge columns repeat. */
function iceSheet(frame: number): string[] {
  const g = new Grid(16, 8);
  g.rect(0, 0, 16, 2, '3');
  g.rect(0, 0, 16, 1, '4');
  g.rect(0, 2, 16, 4, '5');
  g.rect(0, 2, 16, 1, '4');
  g.rect(0, 5, 16, 1, '4');
  g.rect(0, 6, 16, 2, '2');
  // two crossing hairline cracks, then a glint that shifts by two columns
  g.plot([
    [4, 3, '3'],
    [5, 4, '3'],
    [11, 3, '3'],
    [10, 4, '3'],
  ]);
  const xs = frame === 0 ? [2, 9] : [4, 11];
  for (const x of xs) {
    g.set(x, 3, '7');
    g.set(x + 1, 4, '7');
  }
  return g.rows();
}

function iceThrone(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '...4555555554...',
      '..455555555554..',
      '..457555555354..',
      '..455555555354..',
      '..455555555354..',
      '..455555555354..',
      '.4455555555354..',
      '.44444444444432.',
      '.45555555555532.',
      '.45755555555532.',
      '.33333333333322.',
      '..2333333333222.',
      '..22222222222...',
      '................',
      '................',
    ],
    0,
    0,
  );
  g.plot([
    [5, 1, '7'],
    [4, 2, '7'],
    [6, 9, '6'],
    [3, 8, '5'],
  ]);
  g.outline('1');
  return g.rows();
}

function snowDrift(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '................',
      '.......776......',
      '.....6677666....',
      '...66667766556..',
      '..6666666665555.',
      '.665555555544444',
      '..44444444444...',
    ],
    0,
    0,
  );
  g.plot([
    [4, 4, '7'],
    [11, 5, '7'],
    [13, 6, '5'],
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
  // an iron-banded gate arch rimed with frost: lintel bands at y 40, dark gate, a pale glow low down
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      if (x >= 5 && x <= 10 && y >= 47) {
        g.set(x, y, x === 7 || x === 8 ? (y > 100 ? '6' : '2') : '1');
      } else if (y <= 46) {
        g.set(x, y, y === 40 ? '5' : y === 46 ? '2' : '4');
      } else g.set(x, y, x === 2 || x === 5 ? '2' : x <= 4 || x >= 11 ? '4' : '2');
    }
  }
  // iron bands across the posts, frost along their tops
  for (let y = 52; y < 128; y += 14) {
    g.rect(2, y, 3, 2, '2');
    g.rect(11, y, 3, 2, '2');
    g.set(2, y - 1, '5');
    g.set(12, y - 1, '5');
  }
  g.plot([
    [7, 44, '5'],
    [8, 44, '5'],
    [3, 41, '7'],
    [12, 41, '7'],
    [7, 112, '7'],
    [8, 118, '7'],
  ]);
  return g.rows();
}

export const FROZEN_CITADEL: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    icePillar: staticTemplate(id('icePillar'), icePillar(), { x: 0, y: 0 }),
    icicleCluster: staticTemplate(id('icicleCluster'), icicleCluster(), { x: 0, y: 0 }),
    frostBanner: staticTemplate(id('frostBanner'), frostBanner(), { x: 0, y: 0 }),
    iceLamp: loopTemplate(id('iceLamp'), frames(2, iceLamp), { x: 0, y: 0 }),
    iceSheet: loopTemplate(id('iceSheet'), frames(2, iceSheet), { x: 0, y: 0 }),
    iceThrone: staticTemplate(id('iceThrone'), iceThrone(), { x: 8, y: 14 }),
    snowDrift: staticTemplate(id('snowDrift'), snowDrift(), { x: 8, y: 7 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
