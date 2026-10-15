// Stage 10, "Void Spire": tiles, backdrop, and props (batch E5, step A-E5-3).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['void-spire'] laid over the master palette:
//   1 night-black / outline   2 dark slate stone   3 mid slate stone   4 lit stone
//   5 deep teal-slate   6 pale magenta-white rift light   7 cold highlight   8 cyan accent
// Mood: a tall black spire under a star-filled sky, thin pale rifts, a calm and strange finale.
// Cute-spooky, no gore. Legibility: the floor stays mid-dark slate-blue (never black; no
// solid-black tile area beyond outline pixels); the pale parts (rift light, stars, cyan glints) live
// in props, wall tiles, and the backdrop, so enemies and heroes read lighter than the floor. Prop
// animation timing is engine-owned (every prop not named torch or lantern loops at PROP_FRAME_MS,
// 500 ms), so the rift pulse is a slow four-frame swell and the ring a slow two-frame turn. Tiles
// are 16x16 and join side by side (columns 0 and 15 identical across a set; wall variants also
// keep rows 0 and 15 identical). Generated at module load from fixed seeds. Template ids are
// `void-spire/<name>`. Props: wall props anchor at their top-left (0, 0); floor props anchor at
// the foot. Rifts, rings, and stars are scenery only.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'void-spire';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Polished panels: a lit left column and top row, a dark right column and bottom row, and a
// thin inset frame. Periodic in 16. ----

function panel(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      let ch = '3';
      if (y === 15 || x === 15) ch = '2';
      else if (y === 0 || x === 0) ch = '4';
      else if (y === 2 || y === 13 || x === 2 || x === 13) ch = (x + y) % 2 === 0 ? '2' : '3';
      g.set(x, y, ch);
    }
  }
  return g;
}

function speck(g: Grid, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = 3 + Math.floor(rng() * 10);
    const y = 3 + Math.floor(rng() * 10);
    if (g.get(x, y) === '3') g.set(x, y, rng() < 0.6 ? '2' : '4');
  }
}

function wallMid(variant: number): Grid {
  const g = panel();
  const rng = seeded(101000 + variant);
  speck(g, rng, 4);
  if (variant === 1) {
    // a diamond inlay in teal-slate with a cyan heart
    g.plot([
      [8, 4, '5'],
      [7, 5, '5'],
      [9, 5, '5'],
      [6, 6, '5'],
      [10, 6, '5'],
      [5, 7, '5'],
      [11, 7, '5'],
      [6, 8, '5'],
      [10, 8, '5'],
      [7, 9, '5'],
      [9, 9, '5'],
      [8, 10, '5'],
      [8, 7, '8'],
    ]);
  }
  if (variant === 2) {
    // a small cluster of stars set into the stone
    g.plot([
      [4, 4, '7'],
      [10, 6, '5'],
      [7, 9, '7'],
      [11, 11, '6'],
      [5, 12, '8'],
      [12, 3, '5'],
    ]);
  }
  if (variant === 3) {
    // a thin pale seam, as if a rift once opened here
    g.plot([
      [9, 3, '5'],
      [9, 4, '5'],
      [10, 5, '6'],
      [10, 6, '6'],
      [9, 7, '6'],
      [9, 8, '6'],
      [8, 9, '5'],
      [8, 10, '5'],
      [8, 11, '2'],
    ]);
  }
  if (variant === 4) {
    // a tall arched window onto the stars: the backdrop shows through
    for (let y = 4; y <= 13; y++) for (let x = 5; x <= 10; x++) g.set(x, y, '.');
    g.plot([
      [5, 4, '3'],
      [10, 4, '3'],
    ]);
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
  const g = panel();
  const rng = seeded(102000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let y = 4; y <= 6; y++) for (let x = 0; x < T; x++) g.set(x, y, '2');
  // thin spires hanging from the lip, each with a pale tip
  const xs = variant === 0 ? [3, 8, 13] : [5, 11];
  for (const x of xs) {
    g.set(x, 7, '3');
    g.set(x - 1, 7, '2');
    g.set(x + 1, 7, '2');
    g.set(x, 8, '3');
    g.set(x, 9, variant === 0 ? '5' : '2');
  }
  speck(g, rng, 2);
  return g;
}

function wallBase(variant: number): Grid {
  const g = panel();
  const rng = seeded(103000 + variant);
  speck(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '4');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 3) === 3 ? '2' : '3');
    g.set(x, 15, '1');
  }
  // a faint teal-slate seam along the plinth
  if (variant === 1) {
    g.plot([
      [4, 13, '5'],
      [5, 13, '5'],
      [6, 13, '5'],
      [11, 12, '5'],
      [12, 12, '5'],
    ]);
  }
  return g;
}

/** Slate flagstones: mid-dark blue with lit seams. No pale glows on the walking floor. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const seam = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 104000 : 105000) + variant);
  g.rect(0, 0, T, T, base);
  for (let y = 2; y < T; y++) g.set(8, y, seam);
  for (let x = 0; x < T; x++) g.set(x, 7, seam);
  g.set(15, 7, base);
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
      [3, 9, seam],
      [4, 10, seam],
      [4, 11, seam],
      [5, 12, seam],
      [5, 13, seam],
    ]);
  }
  if (variant === 2) {
    // two lit flecks
    g.plot([
      [11, 11, kind === 'back' ? '4' : '3'],
      [12, 11, kind === 'back' ? '4' : '3'],
      [3, 4, kind === 'back' ? '4' : '3'],
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
    // a slate lump on the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '3');
    g.rect(11, 0, 2, 1, '.');
    g.rect(11, 1, 2, 1, '4');
  }
  return g;
}

// ---- Backdrop: 128x128, a black sky with stars, a distant tower, and a pale rift on the horizon;
// period 64 ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(101803);
  const stars = new Map<number, string>();
  for (let i = 0; i < 46; i++) {
    const roll = rng();
    stars.set(
      Math.floor(rng() * 64) + 64 * Math.floor(rng() * 92),
      roll < 0.12 ? '8' : roll < 0.3 ? '6' : roll < 0.65 ? '7' : '5',
    );
  }
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = y < 56 ? '1' : '2';
      if (y >= 40 && y < 56 && ((px + y) & 3) === 0 && rng() < (y - 40) / 16) ch = '2';
      // the horizon glow: a teal-slate dither band thickening toward the rift at y 96
      if (y >= 70 && y < 96) {
        const band = (y - 70) / 26;
        if (((px + y) & 1) === 0 && rng() < band) ch = '3';
        if (y >= 84 && ((px + y) & 3) === 1 && rng() < band) ch = '5';
      }
      const star = stars.get(px + 64 * y);
      if (star !== undefined && y < 92) ch = star;
      g.set(x, y, ch);
    }
  }
  // the pale rift: a thin glowing seam on the horizon, brightest at its core
  for (let x = 0; x < 128; x++) {
    const px = x & 63;
    const sway = Math.round(Math.sin((px / 64) * Math.PI * 2) * 1.2);
    g.set(x, 95 + sway, '5');
    g.set(x, 96 + sway, '6');
    g.set(x, 97 + sway, '5');
    if (px % 5 === 0) g.set(x, 94 + sway, '5');
    if (px % 7 === 0) g.set(x, 98 + sway, '5');
  }
  // a distant tower per period: a slim dark spire with a lit edge and a few pale windows
  for (const ox of [0, 64]) {
    for (let y = 40; y < 97; y++) {
      const half = y < 52 ? Math.max(0, Math.floor((y - 40) / 4)) : 3 + Math.floor((y - 52) / 22);
      for (let i = -half; i <= half; i++) {
        g.set(ox + 22 + i, y, i === -half ? '4' : i === half ? '1' : '3');
      }
    }
    g.plot([
      [ox + 22, 62, '6'],
      [ox + 21, 72, '6'],
      [ox + 23, 82, '7'],
      [ox + 22, 38, '7'],
    ]);
    // a broken arch at the other side of the period
    for (let k = 0; k < 14; k++) {
      const h = Math.round(Math.sin((k / 13) * Math.PI) * 10);
      g.set(ox + 44 + k, 86 - h, '3');
      g.set(ox + 44 + k, 87 - h, '2');
    }
    for (let y = 87; y < 96; y++) {
      g.set(ox + 44, y, '3');
      g.set(ox + 57, y, '3');
    }
  }
  // the dark plain below the horizon: slate flags with lit seams
  for (let y = 100; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = y < 102 ? '5' : '2';
      if (y >= 102 && (px + (y >> 2)) % 9 === 0) ch = '3';
      if (y >= 102 && ((px >> 3) + (y >> 3)) % 2 === 0 && px % 8 === 0) ch = '4';
      g.set(x, y, ch);
    }
  }
  return g.rows();
}

// ---- Props ----

function spirePillar(): string[] {
  const g = new Grid(16, 112);
  // a dark column of long facets on a stepped base, with a pointed capital
  g.rect(2, 0, 12, 5, '2');
  g.rect(2, 0, 12, 1, '4');
  g.plot([
    [7, 0, '5'],
    [8, 0, '5'],
  ]);
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
  // star inlays down the lit face: small five-point stars in cold highlight with a cyan heart
  for (const cy of [22, 52, 82]) {
    g.plot([
      [5, cy - 3, '7'],
      [5, cy - 2, '7'],
      [3, cy - 1, '7'],
      [4, cy - 1, '7'],
      [5, cy - 1, '7'],
      [6, cy - 1, '7'],
      [7, cy - 1, '7'],
      [4, cy, '7'],
      [5, cy, '8'],
      [6, cy, '7'],
      [4, cy + 1, '7'],
      [6, cy + 1, '7'],
    ]);
  }
  for (let y = 12; y < 100; y++) if (y % 30 > 8 && y % 30 < 28) g.set(9, y, '5');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A tall thin tear with a pale core; 4-frame slow pulse (the core swells and fades, no flash). */
function voidRift(frame: number): string[] {
  const g = new Grid(16, 48);
  const swell = [1.4, 2.2, 3.0, 2.2][frame] ?? 1.4;
  for (let y = 3; y < 45; y++) {
    const t = (y - 3) / 41;
    const half = Math.sin(t * Math.PI);
    const outer = 1.6 + swell * half * 1.2;
    const core = swell * half * 0.75;
    for (let x = 0; x < 16; x++) {
      const d = Math.abs(x - 7.5 - (t < 0.5 ? 0 : 0.5));
      if (d < core) g.set(x, y, '6');
      else if (d < outer * 0.6 + 0.4) g.set(x, y, '5');
      else if (d < outer + 0.4) g.set(x, y, '2');
    }
  }
  // cyan flecks at the tips and a few stars drifting in the glow
  g.plot([
    [7, 3, '8'],
    [8, 44, '8'],
    [7, 4, '5'],
    [8, 43, '5'],
  ]);
  const stars: [number, number][] = [
    [7, 16],
    [8, 30],
    [7, 24],
    [8, 36],
  ];
  const star = stars[frame] ?? stars[0] ?? [7, 16];
  g.set(star[0], star[1], '7');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function starWindow(): string[] {
  const g = new Grid(16, 48);
  // a tall arched frame in lit slate around dark glass; the stars are fixed (no twinkle)
  g.rect(2, 4, 12, 42, '3');
  g.rect(3, 2, 10, 2, '3');
  g.rect(5, 0, 6, 2, '3');
  g.rect(5, 0, 6, 1, '4');
  g.rect(3, 2, 10, 1, '4');
  g.rect(2, 4, 1, 42, '4');
  g.rect(13, 4, 1, 42, '2');
  g.rect(2, 45, 12, 1, '2');
  // the glass
  g.rect(4, 6, 8, 37, '1');
  g.rect(5, 4, 6, 2, '1');
  g.rect(6, 3, 4, 1, '1');
  g.plot([
    [6, 9, '7'],
    [9, 13, '5'],
    [7, 18, '6'],
    [10, 22, '7'],
    [5, 26, '5'],
    [8, 30, '8'],
    [10, 35, '7'],
    [6, 38, '6'],
    [9, 7, '5'],
    [5, 15, '5'],
  ]);
  // a crossbar and a sill
  g.rect(4, 24, 8, 1, '3');
  g.rect(1, 45, 14, 2, '3');
  g.rect(1, 45, 14, 1, '4');
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

/** A floating ring with two small beads; 2-frame slow turn (the beads move a quarter around). */
function orbitRing(frame: number): string[] {
  const g = new Grid(16, 24);
  const cx = 7.5;
  const cy = 11.5;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= 5.0 && d <= 6.9) {
        const lit = x + y < 19;
        g.set(x, y, lit ? '4' : '5');
      }
    }
  }
  g.plot([
    [3, 8, '8'],
    [12, 15, '8'],
  ]);
  const beads: [number, number][][] = [
    [
      [2, 7],
      [13, 16],
    ],
    [
      [4, 5],
      [11, 18],
    ],
  ];
  for (const [bx, by] of beads[frame] ?? []) {
    g.rect(bx - 1, by - 1, 2, 2, '6');
  }
  g.outline('1');
  return g.rows().map((r) => r.slice(0, 16));
}

function riftPedestal(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '................',
      '................',
      '..444444444444..',
      '.43333333333332.',
      '.43222222222232.',
      '..2222222222222.',
      '..222222222222..',
      '..222266662222..',
      '..222256652222..',
      '..222222222222..',
      '.4222222222222..',
      '.43333333333332.',
      '.22222222222222.',
      '................',
      '................',
    ],
    0,
    0,
  );
  // the glowing seam splits the face; a cyan spark sits on top
  g.plot([
    [8, 7, '5'],
    [8, 11, '5'],
    [7, 10, '8'],
    [5, 2, '7'],
  ]);
  g.outline('1');
  return g.rows();
}

function crackedSlab(): string[] {
  const g = new Grid(16, 8);
  g.blit(
    [
      '................',
      '................',
      '..444444444444..',
      '.43333533333332.',
      '.43355633353332.',
      '.43335333563332.',
      '..2222232222222.',
      '................',
    ],
    0,
    0,
  );
  g.plot([
    [6, 3, '6'],
    [10, 5, '6'],
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
  // a black spire arch with a teal-slate rim and a thin pale rift glowing in the gap
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
  for (let y = 52; y < 126; y++) {
    if (y % 24 < 18) {
      g.set(7, y, '6');
      if (y % 24 > 3 && y % 24 < 15) g.set(8, y, '5');
    }
  }
  g.plot([
    [7, 44, '5'],
    [8, 44, '5'],
    [6, 30, '7'],
    [9, 20, '8'],
    [4, 60, '7'],
  ]);
  return g.rows();
}

export const VOID_SPIRE: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    spirePillar: staticTemplate(id('spirePillar'), spirePillar(), { x: 0, y: 0 }),
    voidRift: loopTemplate(id('voidRift'), frames(4, voidRift), { x: 0, y: 0 }),
    starWindow: staticTemplate(id('starWindow'), starWindow(), { x: 0, y: 0 }),
    orbitRing: loopTemplate(id('orbitRing'), frames(2, orbitRing), { x: 0, y: 0 }),
    riftPedestal: staticTemplate(id('riftPedestal'), riftPedestal(), { x: 8, y: 14 }),
    crackedSlab: staticTemplate(id('crackedSlab'), crackedSlab(), { x: 8, y: 7 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
