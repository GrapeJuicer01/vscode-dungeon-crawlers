// Stage 1, "The Forgotten Cellar": tiles, backdrop, and props. Batch A0.
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS):
//   1 deepest shadow / outline   2 stone dark / mortar   3 stone mid   4 stone light
//   5 wood   6 torch orange   7 bone / cobweb / flame core   8 damp water blue
// Mood: damp gray-brown stone, torch orange the only warm color, so lit heroes pop.
//
// Tiles are 16x16 and join side by side: every variant of a set keeps columns 0 and 15 identical
// (variation only touches columns 1-14), and wall variants keep rows 0 and 15 identical so the
// rows stack. Everything is drawn into character grids at module load from a fixed seed, so the
// art is identical on every load. Template ids are `forgotten-cellar/<name>`.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'forgotten-cellar';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });

// ---- Stone wall base pattern: two 8-px brick courses, offset by 4, periodic in 16 ----

function brickChar(x: number, y: number): string {
  const course = (y >> 3) & 1;
  const ry = y & 7;
  const jx = course === 0 ? x & 7 : (x + 4) & 7;
  if (ry === 7 || jx === 7) return '2';
  if (ry === 0 && (x * 5 + y * 3) % 4 !== 0) return '4';
  return '3';
}

function brickGrid(): Grid {
  const g = new Grid(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g.set(x, y, brickChar(x, y));
  return g;
}

/** Scatters `n` single-pixel chips on brick faces, never in columns 0/15 or rows 0/15. */
function chip(g: Grid, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 1 + Math.floor(rng() * 14);
    if (g.get(x, y) === '3') g.set(x, y, rng() < 0.6 ? '2' : '4');
  }
}

/** A jagged vertical crack of dark pixels. */
function crack(g: Grid, x0: number, y0: number, len: number): void {
  let x = x0;
  for (let i = 0; i < len; i++) {
    g.set(x, y0 + i, '1');
    if (i % 3 === 1) x += i % 2 === 0 ? 1 : -1;
  }
}

/** A damp streak: dark stone running down, ending in a water-blue pixel. */
function streak(g: Grid, x: number, y0: number, len: number): void {
  for (let i = 0; i < len; i++) g.set(x, y0 + i, g.get(x, y0 + i) === '3' ? '2' : g.get(x, y0 + i));
  g.set(x, y0 + len, '8');
}

function wallMid(variant: number): Grid {
  const g = brickGrid();
  const rng = seeded(1000 + variant);
  chip(g, rng, variant === 3 ? 2 : variant === 2 ? 4 : 3);
  if (variant === 1) crack(g, 6, 2, 7);
  if (variant === 3) streak(g, 10, 2, 7);
  if (variant === 4) {
    // barred window to the far dark: transparent opening, stone frame, three iron bars
    for (let y = 2; y <= 13; y++) for (let x = 4; x <= 11; x++) g.set(x, y, '.');
    for (let x = 3; x <= 12; x++) {
      g.set(x, 1, '4');
      g.set(x, 14, '2');
    }
    for (let y = 2; y <= 13; y++) {
      g.set(3, y, '4');
      g.set(12, y, '2');
    }
    for (const bx of [5, 7, 9]) for (let y = 2; y <= 13; y++) g.set(bx, y, '1');
    g.set(6, 6, '.');
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = brickGrid();
  const rng = seeded(2000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) === '3') g.set(x, y, '2');
  }
  // drips hanging from the ceiling edge
  const drips = variant === 0 ? [3, 11] : [6, 13];
  for (const dx of drips) {
    g.set(dx, 5, '2');
    g.set(dx, 6, '2');
  }
  if (variant === 1) g.set(9, 7, '8');
  chip(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = brickGrid();
  const rng = seeded(3000 + variant);
  chip(g, rng, 4);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '4');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 7) === 7 ? '2' : '3');
    g.set(x, 15, '1');
  }
  if (variant === 1) {
    g.set(5, 12, '2');
    g.set(6, 13, '2');
    g.set(5, 14, '8');
  }
  return g;
}

/** Flagstone floor: horizontal joint at row 8, staggered vertical joints, contact shadow on top. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const rng = seeded((kind === 'back' ? 4000 : 5000) + variant);
  const base = kind === 'back' ? '3' : '4';
  const joint = kind === 'back' ? '2' : '3';
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const row2 = y >= 8;
      const jx = row2 ? (x + 5) & 7 : x & 7;
      let ch = base;
      if (y === 8 || jx === 7) ch = joint;
      g.set(x, y, ch);
    }
  }
  if (kind === 'back') {
    // contact shadow under the wall
    for (let x = 0; x < T; x++) {
      g.set(x, 0, '1');
      g.set(x, 1, '2');
    }
  } else {
    for (let x = 0; x < T; x++) g.set(x, 15, '2');
  }
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(rng() * 14);
    const y = 2 + Math.floor(rng() * 12);
    if (g.get(x, y) === base) g.set(x, y, kind === 'back' ? '4' : '3');
  }
  if (variant === 1 && kind === 'front') crack(g, 5, 3, 5);
  if (variant === 2 && kind === 'front') {
    // a small puddle
    g.rect(5, 11, 5, 1, '8');
    g.rect(6, 10, 3, 1, '8');
    g.set(7, 10, '7');
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
    // rubble bumps rising above the lip; transparent top pixels show the floor behind
    g.rect(4, 0, 4, 1, '.');
    g.rect(3, 1, 6, 1, '2');
    g.set(10, 0, '.');
    g.set(11, 0, '.');
    g.set(10, 1, '2');
    g.set(4, 0, '3');
    g.set(5, 0, '3');
    g.set(6, 0, '3');
    g.set(7, 0, '3');
  }
  return g;
}

// ---- Backdrop: 128x128, two arches per 128 px, periodic at 64 so it tiles horizontally ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      // far wall: faint large blocks
      if (y % 24 === 23 || (px + (Math.floor(y / 24) % 2) * 32) % 64 === 63) ch = '1';
      const dx = px - 35.5;
      const dy = y - 70;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inCol = Math.abs(dx);
      const inOpening = y >= 70 ? inCol <= 26 : dist <= 26;
      const inRim = y >= 70 ? inCol <= 30 : dist <= 30;
      if (inOpening) {
        ch = '1';
        // a smaller, farther arch inside the opening
        const fdx = px - 35.5;
        const fdy = y - 92;
        const fd = Math.sqrt(fdx * fdx + fdy * fdy);
        const farOpen = y >= 92 ? Math.abs(fdx) <= 11 : fd <= 11;
        const farRim = y >= 92 ? Math.abs(fdx) <= 13 : fd <= 13;
        if (farRim && !farOpen) ch = '2';
      } else if (inRim) {
        ch = (Math.floor(Math.atan2(dy, dx) * 6) & 1) === 0 ? '3' : '4';
        if (y >= 70) ch = Math.floor(y / 8) % 2 === 0 ? '3' : '4';
      }
      // pillars between the arches
      if (px < 8) {
        ch = px === 0 ? '1' : px <= 2 ? '3' : px === 7 ? '1' : '2';
        if (y % 16 === 15) ch = '1';
      }
      // ceiling shadow
      if (y < 10) ch = '1';
      else if (y < 14 && ch !== '1') ch = '2';
      g.set(x, y, ch);
    }
  }
  return g.rows();
}

// ---- Props ----

function barrel(): string[] {
  const g = new Grid(16, 16);
  const widths = [10, 12, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 12, 10];
  widths.forEach((w, i) => {
    const y = 1 + i;
    const x0 = Math.floor((16 - w) / 2);
    for (let x = 0; x < w; x++) {
      const stave = (x + 1) % 4 === 0;
      g.set(x0 + x, y, stave || x >= w - 2 ? '2' : '5');
    }
  });
  for (const hy of [4, 11]) {
    for (let x = 1; x < 15; x++) {
      if (g.get(x, hy) !== '.') g.set(x, hy, '3');
      if (g.get(x, hy + 1) !== '.') g.set(x, hy + 1, '2');
    }
  }
  g.rect(5, 1, 6, 1, '4');
  g.outline('1');
  return g.rows();
}

function crate(): string[] {
  const g = new Grid(16, 16);
  g.rect(1, 2, 14, 13, '5');
  // border planks and an X brace
  for (let i = 0; i < 14; i++) {
    g.set(1 + i, 2, '2');
    g.set(1 + i, 14, '2');
    g.set(1, 2 + (i % 13), '2');
    g.set(14, 2 + (i % 13), '2');
  }
  for (let i = 0; i < 11; i++) {
    g.set(3 + i, 4 + i, '2');
    g.set(12 - i, 4 + i, '2');
  }
  g.rect(2, 3, 12, 1, '4');
  g.outline('1');
  return g.rows();
}

const BONE_PILE = [
  '................',
  '................',
  '....11..........',
  '...1771....11...',
  '..177771..1771..',
  '.17717771.17771.',
  '.17777717717771.',
  '..111111111111..',
];

function puddleFrame(spark: number): string[] {
  const rows = ['....22222222....', '..2888888888822.', '.288888888888882', '..22222222222222'];
  const g = new Grid(16, 4);
  g.blit(rows, 0, 0);
  g.set(spark, 1, '7');
  g.set(spark + 1, 2, '7');
  return g.rows();
}

function cobweb(): string[] {
  const g = new Grid(16, 16);
  const rays: [number, number][] = [
    [14, 0],
    [12, 6],
    [8, 10],
    [4, 13],
    [0, 14],
  ];
  for (const [rx, ry] of rays) g.line(0, 0, rx, ry, '7');
  // concentric threads joining the rays
  for (const r of [4, 8, 12]) {
    for (let i = 0; i < rays.length - 1; i++) {
      const a = rays[i];
      const b = rays[i + 1];
      if (!a || !b) continue;
      const k = r / 14;
      g.line(
        Math.round(a[0] * k),
        Math.round(a[1] * k),
        Math.round(b[0] * k),
        Math.round(b[1] * k),
        '4',
      );
    }
  }
  for (const [rx, ry] of rays) g.line(0, 0, Math.round(rx * 0.3), Math.round(ry * 0.3), '7');
  return g.rows();
}

function chains(): string[] {
  const ring = ['..1111..', '.134431.', '.13..31.', '.13..31.', '.134431.', '..1111..'];
  const link = ['...11...', '..1331..', '...11...'];
  const g = new Grid(8, 24);
  // ceiling bracket
  g.rect(1, 0, 6, 2, '3');
  g.rect(1, 2, 6, 1, '1');
  g.set(1, 0, '4');
  g.set(2, 0, '4');
  g.blit(ring, 0, 3);
  g.blit(link, 0, 9);
  g.blit(ring, 0, 12);
  g.blit(link, 0, 18);
  g.blit(ring.slice(0, 3), 0, 21);
  return g.rows();
}

function torchFrame(frame: number): string[] {
  const g = new Grid(8, 16);
  const flames = [
    ['...66...', '..6776..', '.667766.', '.677776.', '.667766.', '..6666..'],
    ['..66....', '.6776...', '.667766.', '.677776.', '.667766.', '..6666..'],
    ['...66...', '...66...', '..6776..', '.667766.', '.677776.', '..6666..'],
    ['....66..', '...6776.', '.667766.', '.677776.', '.667766.', '..6666..'],
  ];
  g.blit(flames[frame] ?? [], 0, 1);
  // iron cup and wooden handle
  g.blit(['.133331.', '.133331.', '..1331..'], 0, 7);
  g.rect(3, 10, 2, 6, '5');
  g.set(3, 11, '3');
  g.set(4, 11, '3');
  g.set(2, 10, '1');
  g.set(5, 10, '1');
  for (let y = 11; y < 16; y++) {
    g.set(2, y, '1');
    g.set(5, y, '1');
  }
  return g.rows();
}

function doorFrame(): string[] {
  const g = new Grid(16, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 16; x++) {
      let ch = '3';
      if (x === 0 || x === 15) ch = '1';
      else if (y % 16 === 15) ch = '2';
      else if (x === 8 && (y >> 4) % 2 === 0) ch = '2';
      else if (x === 1 && y % 16 !== 0) ch = '4';
      g.set(x, y, ch);
    }
  }
  // ceiling shadow matching wallTop
  g.rect(0, 0, 16, 4, '1');
  for (let x = 0; x < 16; x++) g.set(x, 4, '2');
  // arched passage: rounded top at y 56, straight sides down to the floor line
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      const dx = x - 7.5;
      const dy = y - 56;
      const inside = y >= 56 ? true : Math.sqrt(dx * dx + dy * dy) <= 6.2;
      const ring = y < 56 && Math.sqrt(dx * dx + dy * dy) <= 8;
      if (x >= 3 && x <= 12 && inside) g.set(x, y, '1');
      else if (ring && !inside) g.set(x, y, (x + y) % 3 === 0 ? '2' : '4');
      else if (y >= 56 && (x === 2 || x === 13)) g.set(x, y, '4');
    }
  }
  for (let y = 100; y < 128; y += 7) g.set(5 + (y % 3), y, '2');
  return g.rows();
}

const frames = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

export const FORGOTTEN_CELLAR: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    barrel: staticTemplate(id('barrel'), barrel(), { x: 8, y: 15 }),
    crate: staticTemplate(id('crate'), crate(), { x: 8, y: 15 }),
    bonePile: staticTemplate(id('bonePile'), BONE_PILE, { x: 8, y: 7 }),
    puddle: loopTemplate(id('puddle'), [puddleFrame(5), puddleFrame(9)], { x: 8, y: 3 }),
    cobweb: staticTemplate(id('cobweb'), cobweb(), { x: 0, y: 0 }),
    chains: staticTemplate(id('chains'), chains(), { x: 0, y: 0 }),
    torch: loopTemplate(id('torch'), frames(4, torchFrame), { x: 0, y: 0 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
