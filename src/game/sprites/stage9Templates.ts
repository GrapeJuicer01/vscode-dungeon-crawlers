// Stage 9, "Dragon's Lair": tiles, backdrop, and props (batch E5, step A-E5-2).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['dragons-lair'] laid over the master palette:
//   1 soot-black / outline   2 dark red-brown stone   3 mid stone   4 lit stone
//   5 bronze   6 warm gold light   7 pale gold highlight   8 teal accent
// Mood: scorched stone, a hoard of gold, an ember glow on the far horizon. Cute-spooky, no gore.
// Legibility: the floor stays mid-dark maroon (its mean luminance after the ambient tint is capped
// by the Necromancer's cloth); the heat comes from the backdrop glow, the gold accents in props,
// and the lights, so enemies and heroes read lighter than the floor. Prop animation timing is
// engine-owned (every prop not named torch or lantern loops at PROP_FRAME_MS, 500 ms), so the
// brazier flame is a calm four-frame loop and the gold vein a slow two-frame glint. Tiles are
// 16x16 and join side by side (columns 0 and 15 identical across a set; wall variants also keep
// rows 0 and 15 identical). Generated at module load from fixed seeds. Template ids are
// `dragons-lair/<name>`. Props: wall props anchor at their top-left (0, 0); floor props anchor at
// the foot. Dragon scales, claw marks, gold, and flame are scenery only.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'dragons-lair';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Hewn blocks in two courses: the upper course has joints at x 7 and 15, the lower course at
// x 3 and 11 (a running bond). Column 0 is lit in the upper course and plain in the lower; column
// 15 is a joint in the upper course. Periodic in 16. ----

function blocks(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      let ch = '3';
      if (y === 15 || y === 7) ch = '2';
      else if (y === 0 || y === 8) ch = '4';
      else if (y < 7) {
        if (x === 7 || x === 15) ch = '2';
        else if (x === 0 || x === 8) ch = '4';
      } else if (x === 3 || x === 11) ch = '2';
      else if (x === 4 || x === 12) ch = '4';
      g.set(x, y, ch);
    }
  }
  return g;
}

/** Speckle inside the blocks (never the edge columns or rows). */
function speck(g: Grid, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 2 + Math.floor(rng() * 12);
    if (g.get(x, y) === '3') g.set(x, y, rng() < 0.7 ? '2' : '4');
  }
}

function wallMid(variant: number): Grid {
  const g = blocks();
  const rng = seeded(91000 + variant);
  speck(g, rng, 4);
  if (variant === 1) {
    // claw gouges: three parallel slashes
    g.line(5, 9, 8, 14, '1');
    g.line(7, 9, 10, 14, '1');
    g.line(9, 9, 12, 14, '1');
    g.plot([
      [6, 9, '4'],
      [8, 9, '4'],
    ]);
  }
  if (variant === 2) {
    // a thin bronze seam running through the stone, with two gold flecks
    g.plot([
      [2, 1, '5'],
      [3, 2, '5'],
      [3, 3, '2'],
      [4, 4, '5'],
      [5, 5, '5'],
      [5, 6, '2'],
      [9, 10, '5'],
      [10, 11, '5'],
      [10, 12, '6'],
      [11, 13, '5'],
      [6, 2, '6'],
    ]);
  }
  if (variant === 3) {
    // scattered gold dust caught in the stone
    g.plot([
      [3, 3, '6'],
      [11, 5, '5'],
      [6, 10, '5'],
      [13, 12, '6'],
      [2, 13, '5'],
      [10, 2, '5'],
    ]);
  }
  if (variant === 4) {
    // a high cave mouth: the backdrop shows through, framed in dark stone and a lit lip
    for (let y = 5; y <= 13; y++) for (let x = 5; x <= 10; x++) g.set(x, y, '.');
    for (let x = 6; x <= 9; x++) g.set(x, 4, '.');
    for (let x = 5; x <= 10; x++) g.set(x, 3, '4');
    g.plot([
      [4, 4, '4'],
      [11, 4, '2'],
    ]);
    for (let y = 5; y <= 13; y++) {
      g.set(4, y, '2');
      g.set(11, y, '2');
    }
    g.plot([
      [3, 5, '1'],
      [12, 5, '1'],
      [3, 8, '1'],
      [12, 9, '1'],
    ]);
    for (let x = 4; x <= 11; x++) g.set(x, 14, '2');
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = blocks();
  const rng = seeded(92000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let y = 4; y <= 6; y++) for (let x = 0; x < T; x++) g.set(x, y, '2');
  // stalactite points hanging from the lip
  const xs = variant === 0 ? [3, 8, 13] : [5, 11];
  for (const x of xs) {
    g.set(x, 7, '3');
    g.set(x - 1, 7, '2');
    g.set(x + 1, 7, '2');
    g.set(x, 8, '3');
    g.set(x, 9, '2');
  }
  speck(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = blocks();
  const rng = seeded(93000 + variant);
  speck(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '4');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 3) === 3 ? '2' : '3');
    g.set(x, 15, '1');
  }
  // a little gold dust drifted along the foot of the wall
  const dust: [number, number, string][] =
    variant === 0
      ? [
          [5, 13, '5'],
          [6, 14, '6'],
          [12, 14, '5'],
        ]
      : [
          [2, 14, '5'],
          [9, 13, '6'],
          [10, 14, '5'],
          [14, 14, '5'],
        ];
  g.plot(dust);
  return g;
}

/** Scorched flagstones: mid-dark maroon with darker seams; no gold or teal on the walking floor. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const seam = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 94000 : 95000) + variant);
  g.rect(0, 0, T, T, base);
  for (let y = 2; y < T; y++) g.set(6, y, seam);
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
    // a hairline crack
    g.plot([
      [11, 2, seam],
      [11, 3, seam],
      [12, 4, seam],
      [12, 5, seam],
      [13, 6, seam],
      [13, 7, seam],
    ]);
  }
  if (variant === 2) {
    // a scorch smudge and two lit flecks
    g.plot([
      [2, 11, seam],
      [3, 11, seam],
      [3, 12, seam],
      [9, 12, base === '3' ? '4' : '3'],
      [10, 12, base === '3' ? '4' : '3'],
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
    // a rock lump on the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '3');
    g.rect(4, 0, 3, 1, '.');
    g.rect(11, 0, 2, 1, '.');
    g.rect(11, 1, 2, 1, '4');
  }
  return g;
}

// ---- Backdrop: 128x128, a vast cavern with distant gold heaps, a small dragon far off, and a
// warm glow on the horizon; period 64 ----

const DRAGON: readonly string[] = [
  '............1...........',
  '...........111..........',
  '..1.......1111.....1....',
  '..11.....111111...11....',
  '...111..11111111.111....',
  '...1111111111111111.....',
  '....111111111111111111..',
  '1....1111111111111.1111.',
  '111...1111111111...11...',
  '.11111..111..111.....1..',
  '...111..1.1..1.1........',
];

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(91803);
  const grit = new Set<number>();
  for (let i = 0; i < 90; i++) grit.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 100));
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      if (grit.has(px + 64 * y)) ch = '3';
      // the horizon glow: a bronze dither band that thickens toward y 100
      if (y >= 66 && y < 104) {
        const band = (y - 66) / 38;
        if (((px + y) & 1) === 0 && rng() < band) ch = '3';
        if (y >= 80 && ((px + y) & 1) === 1 && rng() < band * 0.8) ch = '4';
        if (y >= 92 && ((px + 2 * y) & 3) === 0 && rng() < band) ch = '5';
      }
      if (y < 12) ch = '1';
      else if (y < 18 && ch === '2') ch = '1';
      g.set(x, y, ch);
    }
  }
  // stalactites hanging into the glow
  for (const ox of [0, 64]) {
    for (const [sx, len] of [
      [8, 22],
      [22, 14],
      [38, 26],
      [54, 16],
    ] as const) {
      for (let k = 0; k < len; k++) {
        const half = Math.max(0, 3 - Math.floor((k * 4) / len));
        for (let i = -half; i <= half; i++) g.set(ox + sx + i, 12 + k, k > len - 5 ? '2' : '1');
      }
    }
  }
  // a small dragon gliding far off, in soot black against the glow
  for (const ox of [0, 64]) g.blit(DRAGON, ox + 20, 46);
  // distant heaps of gold: lumpy mounds with bronze flanks and warm glints
  const heap = (ox: number, cx: number, top: number, half: number): void => {
    for (let k = 0; k < 128 - top; k++) {
      const span = Math.min(half, Math.floor((k * half) / 12) + 1);
      for (let i = -span; i <= span; i++) {
        const edge = Math.abs(i) >= span - 1;
        g.set(ox + cx + i, top + k, edge ? '3' : k < 3 ? '5' : '4');
      }
    }
    g.plot([
      [ox + cx - 2, top + 1, '6'],
      [ox + cx + 3, top + 3, '6'],
      [ox + cx, top + 5, '5'],
    ]);
  };
  for (const ox of [0, 64]) {
    heap(ox, 10, 100, 12);
    heap(ox, 34, 104, 9);
    heap(ox, 52, 98, 10);
  }
  // the cavern floor: dark stone with a lit rim
  for (let y = 112; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = y < 114 ? '4' : '2';
      if (y >= 114 && (px + (y >> 2)) % 7 === 0) ch = '3';
      if (y >= 120 && ((px >> 2) + (y >> 2)) % 3 === 0) ch = '3';
      g.set(x, y, ch);
    }
  }
  // gold coins scattered along the rim
  for (const ox of [0, 64]) {
    g.plot([
      [ox + 6, 112, '6'],
      [ox + 19, 113, '5'],
      [ox + 31, 112, '6'],
      [ox + 47, 113, '5'],
      [ox + 58, 112, '6'],
    ]);
  }
  return g.rows();
}

// ---- Props ----

function scorchedPillar(): string[] {
  const g = new Grid(16, 112);
  // a sooted column on a stepped base, with a heavy capital
  g.rect(1, 0, 14, 5, '2');
  g.rect(1, 0, 14, 1, '3');
  g.rect(0, 5, 16, 3, '3');
  g.rect(0, 5, 16, 1, '4');
  g.rect(0, 7, 16, 1, '2');
  const facets = ['2', '4', '4', '3', '3', '3', '3', '2', '2', '2', '1', '1'];
  for (let y = 8; y < 104; y++) {
    for (let x = 2; x <= 13; x++) g.set(x, y, facets[x - 2] ?? '3');
  }
  g.rect(0, 104, 16, 3, '2');
  g.rect(0, 107, 16, 5, '3');
  g.rect(0, 107, 16, 1, '4');
  g.rect(0, 111, 16, 1, '2');
  // soot: the upper column is darker, dithered down to the stone
  for (let y = 8; y < 36; y++) {
    for (let x = 2; x <= 13; x++) {
      if (((x + y) & 1) === 0 && y < 8 + (36 - y) / 2) g.set(x, y, '1');
    }
  }
  // two sets of claw scrapes down the face and a couple of bronze flecks
  for (const y0 of [44, 78]) {
    g.line(4, y0, 6, y0 + 10, '1');
    g.line(7, y0 - 2, 9, y0 + 8, '1');
    g.line(10, y0, 12, y0 + 10, '1');
    g.plot([
      [5, y0, '4'],
      [8, y0 - 2, '4'],
    ]);
  }
  g.plot([
    [3, 26, '5'],
    [11, 62, '5'],
    [4, 96, '5'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function drakeSkull(): string[] {
  // a huge horned skull carved in relief, with a spine of vertebrae descending below it
  const rows = [
    '................',
    '.44..........44.',
    '.344........443.',
    '..344......443..',
    '..334444444433..',
    '...3444444443...',
    '..234444444432..',
    '..234444444432..',
    '..232111111232..',
    '..231611161132..',
    '..231111111132..',
    '..232211112232..',
    '...2323443232...',
    '...2233443322...',
    '....23333332....',
    '....22111122....',
    '.....211112.....',
    '.....242242.....',
    '.....222222.....',
    '................',
    '......3443......',
    '.....344443.....',
    '......2222......',
    '.......22.......',
    '.....344443.....',
    '....34444443....',
    '.....222222.....',
    '.......22.......',
    '......3443......',
    '.....344443.....',
    '......2222......',
    '.......22.......',
    '.....344443.....',
    '....34444443....',
    '.....222222.....',
    '.......22.......',
    '......3443......',
    '......2222......',
    '................',
    '................',
  ];
  const g = new Grid(16, 40);
  g.blit(rows, 0, 0);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A bronze brazier with a calm gold flame; 4-frame slow loop (the flame leans and breathes). */
function hoardBrazier(frame: number): string[] {
  const g = new Grid(16, 24);
  // the bowl, stem, and feet
  g.rect(3, 13, 10, 2, '5');
  g.rect(3, 13, 10, 1, '6');
  g.rect(4, 15, 8, 2, '5');
  g.rect(5, 17, 6, 1, '2');
  g.rect(7, 18, 2, 3, '5');
  g.rect(5, 21, 6, 1, '5');
  g.rect(4, 22, 2, 1, '2');
  g.rect(10, 22, 2, 1, '2');
  g.plot([
    [4, 14, '2'],
    [11, 15, '2'],
  ]);
  // coals in the bowl
  g.plot([
    [5, 12, '5'],
    [7, 12, '6'],
    [9, 12, '5'],
    [10, 12, '6'],
  ]);
  // the flame: rises from the bowl and sways one pixel over four frames
  const widths = [6, 6, 5, 5, 4, 3, 2, 1];
  const sway = [0, 1, 0, -1][frame] ?? 0;
  const tall = [8, 8, 7, 7][frame] ?? 8;
  for (let i = 0; i < tall; i++) {
    const w = widths[i] ?? 1;
    const shift = Math.round((sway * i) / 4);
    const x0 = 8 - Math.floor(w / 2) + shift;
    for (let k = 0; k < w; k++) g.set(x0 + k, 11 - i, w - 2 >= 2 && k > 0 && k < w - 1 ? '7' : '6');
  }
  g.plot([[8 + sway, 11 - tall, '6']]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A rock outcrop with a gold seam; 2-frame slow glint (a pale spark moves between nuggets). */
function goldVein(frame: number): string[] {
  const rows = [
    '................',
    '.....222222.....',
    '...2233333322...',
    '..233444333332..',
    '..234563334333..',
    '.2343566653332..',
    '.2335666563432..',
    '.2334556663332..',
    '.2334355633332..',
    '..234335563342..',
    '..233333556332..',
    '..223333345222..',
    '...22333334522..',
    '....222233222...',
    '................',
    '................',
  ];
  const g = new Grid(16, 16);
  g.blit(rows, 0, 0);
  g.outline('1');
  const spots: [number, number][] = [
    [6, 5],
    [9, 7],
  ];
  const s = spots[frame] ?? spots[0] ?? [6, 5];
  g.set(s[0], s[1], '7');
  return g.rows().map((r) => r.slice(0, 16));
}

function scaleBanner(): string[] {
  const g = new Grid(16, 48);
  // the rod with bronze knobs
  g.rect(0, 0, 16, 2, '5');
  g.rect(0, 0, 16, 1, '6');
  g.rect(0, 1, 1, 1, '6');
  g.rect(15, 1, 1, 1, '6');
  // the cloth: dark red with a scale pattern of lit half-rings and a bronze border
  for (let y = 2; y < 42; y++) {
    for (let x = 2; x <= 13; x++) {
      let ch = '3';
      if (x === 2 || x === 13) ch = '5';
      else {
        const row = (y - 2) >> 1;
        const off = (row & 1) * 2;
        const u = (x + off) & 3;
        if ((y & 1) === 0 && u !== 3) ch = '4';
        if ((y & 1) === 1 && u === 0) ch = '2';
      }
      g.set(x, y, ch);
    }
  }
  // tattered hem: ragged teeth of different lengths
  const teeth = [4, 1, 6, 2, 5, 0];
  for (let i = 0; i < teeth.length; i++) {
    const len = teeth[i] ?? 0;
    for (let k = 0; k < len; k++) {
      g.set(2 + i * 2, 42 + k, '3');
      g.set(3 + i * 2, 42 + k, k < len - 1 ? '3' : '.');
    }
  }
  // a tear
  g.plot([
    [7, 20, '.'],
    [8, 21, '.'],
    [8, 22, '.'],
  ]);
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function hoardPile(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '................',
      '................',
      '................',
      '.......66.......',
      '......6756......',
      '.....657655.....',
      '....65566765....',
      '...6556575655...',
      '..655657655655..',
      '.65565755565555.',
      '.55558555655455.',
      '.55455655455555.',
      '.44445544454444.',
      '..222222222222..',
      '................',
    ],
    0,
    0,
  );
  // a few gems poke out of the heap
  g.plot([
    [5, 9, '8'],
    [10, 7, '8'],
    [11, 11, '7'],
  ]);
  g.outline('1');
  return g.rows();
}

function goldScatter(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '................',
      '....66..........',
      '...6756.....6...',
      '....55.....656..',
      '.6.......8..55..',
      '656...56........',
      '.55..656..6.....',
    ],
    0,
    0,
  );
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
  // a scorched arch with a bronze rim and a warm glint in the gap
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
  // claw gouges on the lintel and a few lower on the jambs
  g.line(3, 12, 5, 22, '1');
  g.line(6, 11, 8, 21, '1');
  g.line(9, 12, 11, 22, '1');
  g.line(2, 60, 3, 68, '1');
  g.line(12, 80, 13, 88, '1');
  g.plot([
    [7, 44, '6'],
    [8, 44, '6'],
    [6, 62, '6'],
    [9, 86, '6'],
    [7, 110, '5'],
    [8, 120, '6'],
  ]);
  return g.rows();
}

export const DRAGONS_LAIR: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    scorchedPillar: staticTemplate(id('scorchedPillar'), scorchedPillar(), { x: 0, y: 0 }),
    drakeSkull: staticTemplate(id('drakeSkull'), drakeSkull(), { x: 0, y: 0 }),
    hoardBrazier: loopTemplate(id('hoardBrazier'), frames(4, hoardBrazier), { x: 0, y: 0 }),
    goldVein: loopTemplate(id('goldVein'), frames(2, goldVein), { x: 0, y: 0 }),
    scaleBanner: staticTemplate(id('scaleBanner'), scaleBanner(), { x: 0, y: 0 }),
    hoardPile: staticTemplate(id('hoardPile'), hoardPile(), { x: 8, y: 14 }),
    goldScatter: staticTemplate(id('goldScatter'), goldScatter(), { x: 8, y: 7 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
