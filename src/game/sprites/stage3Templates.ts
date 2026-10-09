// Stage 3, "Toxic Slime Caverns": tiles, backdrop, and props (batch E2, step A-E2-2).
// Owned by the pixel-artist. Only the stage's 8 characters are used (STAGE_TILE_CHARS); their
// colors come from STAGE_PALETTES['toxic-slime-caverns'] laid over the master palette:
//   1 deepest shadow / outline   2 dark rock   3 mid rock   4 lit rock
//   5 olive crust and old metal  6 acid glow   7 pale highlight   8 aqua slime accent
// Mood: murky teal rock with acid-green glow and aqua slime. The rock is kept dark and dull so the
// stage's enemies (bright lime slimes, pale shrooms) stand out. Tiles are 16x16 and join side by
// side (columns 0 and 15 identical across a set; wall variants also keep rows 0 and 15 identical).
// Generated at module load from fixed seeds. Template ids are `toxic-slime-caverns/<name>`.

import { Grid, loopTemplate, seeded, staticTemplate } from './spriteBuilder';
import type { SpriteTemplate, StageSprites } from './spriteTypes';

const STAGE = 'toxic-slime-caverns';
const T = 16;
const id = (name: string): string => `${STAGE}/${name}`;
const tile = (name: string, g: Grid): SpriteTemplate =>
  staticTemplate(id(name), g.rows(), { x: 0, y: 0 });
const frames = <U>(n: number, f: (i: number) => U): U[] =>
  Array.from({ length: n }, (_, i) => f(i));

// ---- Cave wall: rounded lumps (a wrapped Voronoi), lit top edges, dark seams. Periodic in 16. ----

const SEEDS: readonly (readonly [number, number])[] = (() => {
  const rng = seeded(9091);
  const pts: [number, number][] = [];
  for (let i = 0; i < 7; i++) pts.push([Math.floor(rng() * T), Math.floor(rng() * T)]);
  return pts;
})();

function cellAt(x: number, y: number): number {
  let best = 0;
  let bd = Infinity;
  SEEDS.forEach(([sx, sy], i) => {
    const dx = Math.min(Math.abs(x - sx), T - Math.abs(x - sx));
    const dy = Math.min(Math.abs(y - sy), T - Math.abs(y - sy));
    const dist = dx * dx + dy * dy * 1.3;
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
    const y = 2 + Math.floor(rng() * 12);
    if (g.get(x, y) === '3') g.set(x, y, rng() < 0.5 ? '2' : '4');
  }
}

/** A slime streak running down the wall, ending in a drop. */
function streak(g: Grid, x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) g.set(x, y, '8');
  g.set(x + 1, y0, '8');
  g.set(x + 1, y1, '8');
  g.set(x, y1 + 1, '8');
  g.set(x, y0 + 1, '7');
}

function wallMid(variant: number): Grid {
  const g = rockGrid();
  const rng = seeded(11000 + variant);
  chip(g, rng, 3);
  if (variant === 1) streak(g, 7, 2, 9);
  if (variant === 2) {
    // an olive pipe stub with a dark mouth
    g.rect(2, 8, 6, 3, '5');
    g.rect(2, 8, 6, 1, '7');
    g.rect(8, 7, 2, 5, '5');
    g.rect(2, 10, 6, 1, '3');
    g.rect(9, 8, 1, 3, '1');
    g.set(9, 12, '8');
  }
  if (variant === 3) {
    streak(g, 11, 3, 6);
    streak(g, 4, 6, 11);
  }
  if (variant === 4) {
    // a round opening framed by crusted metal; transparent so the backdrop shows
    for (let y = 3; y <= 12; y++) for (let x = 4; x <= 11; x++) g.set(x, y, '.');
    for (const [x, y] of [
      [4, 3],
      [11, 3],
      [4, 12],
      [11, 12],
    ] as const)
      g.set(x, y, '3');
    for (let x = 5; x <= 10; x++) {
      g.set(x, 2, '5');
      g.set(x, 13, '3');
    }
    for (let y = 3; y <= 12; y++) {
      g.set(3, y, '5');
      g.set(12, y, '3');
    }
    g.set(3, 2, '5');
    g.set(12, 2, '5');
    g.set(3, 13, '3');
    g.set(12, 13, '3');
    g.set(6, 14, '8');
    g.set(6, 13, '8');
  }
  return g;
}

function wallTop(variant: number): Grid {
  const g = rockGrid();
  const rng = seeded(12000 + variant);
  g.rect(0, 0, T, 4, '1');
  for (let x = 0; x < T; x++) g.set(x, 4, '2');
  for (let y = 5; y <= 6; y++) {
    for (let x = 0; x < T; x++) if (g.get(x, y) === '3') g.set(x, y, '2');
  }
  const drops = variant === 0 ? [4, 11] : [7, 13];
  for (const dx of drops) {
    g.set(dx, 5, '2');
    g.set(dx, 6, '2');
    g.set(dx, 7, '8');
    if (variant === 1) g.set(dx, 8, '8');
  }
  chip(g, rng, 3);
  return g;
}

function wallBase(variant: number): Grid {
  const g = rockGrid();
  const rng = seeded(13000 + variant);
  chip(g, rng, 3);
  for (let x = 0; x < T; x++) {
    g.set(x, 10, '2');
    g.set(x, 11, '4');
    for (let y = 12; y <= 14; y++) g.set(x, y, (x & 7) === 7 ? '2' : '3');
    g.set(x, 15, '1');
  }
  if (variant === 1) {
    for (let x = 4; x <= 10; x++) g.set(x, 13, '8');
    g.set(6, 12, '8');
    g.set(8, 13, '7');
  }
  return g;
}

/** Wet rock floor; slime films in some variants. */
function floor(kind: 'back' | 'front', variant: number): Grid {
  const g = new Grid(T, T);
  const base = kind === 'back' ? '3' : '4';
  const dark = kind === 'back' ? '2' : '3';
  const rng = seeded((kind === 'back' ? 14000 : 15000) + variant);
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
  if (variant === 1) {
    // a thin slime film
    g.rect(5, 8, 6, 1, '8');
    g.rect(4, 9, 8, 1, '8');
    g.rect(6, 10, 4, 1, '8');
    g.set(6, 8, '7');
  }
  if (variant === 2) {
    g.rect(2, 5, 3, 1, '8');
    g.rect(10, 11, 4, 1, '8');
    g.set(11, 11, '7');
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
    // loose lumps above the lip; transparent top pixels show the floor behind
    g.rect(3, 0, 5, 1, '.');
    g.rect(2, 1, 7, 1, '2');
    g.rect(4, 0, 3, 1, '4');
    g.rect(10, 0, 2, 1, '.');
    g.rect(10, 1, 2, 1, '3');
  }
  return g;
}

// ---- Backdrop: 128x128, dripping cavern arches with distant glowing growths; period 64 ----

function buildBackdrop(): string[] {
  const g = new Grid(128, 128);
  const rng = seeded(27182);
  const speck = new Set<number>();
  for (let i = 0; i < 70; i++) speck.add(Math.floor(rng() * 64) + 64 * Math.floor(rng() * 128));
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = x & 63;
      let ch = '2';
      if (speck.has(px + 64 * y)) ch = '3';
      // rounded arch opening: a dark cavern behind
      const cx = 31.5;
      const dx = (px - cx) / 22;
      const archTop = 52;
      if (y >= archTop + 6) {
        if (Math.abs(px - cx) <= 22) ch = '1';
      } else if (y >= 30) {
        const dy = (archTop + 6 - y) / 24;
        if (dx * dx + dy * dy <= 1) ch = '1';
      }
      // lit arch rim
      const rimDx = (px - cx) / 25;
      if (y >= 30 && y < archTop + 6) {
        const dy = (archTop + 6 - y) / 27;
        const d2 = rimDx * rimDx + dy * dy;
        if (d2 <= 1 && ch !== '1') ch = '3';
      } else if (y >= archTop + 6 && Math.abs(px - cx) <= 25 && Math.abs(px - cx) > 22) ch = '3';
      // ground shadow and ceiling
      if (y >= 108) ch = y === 108 ? '1' : '2';
      if (y < 12) ch = '1';
      else if (y < 16 && ch === '2') ch = '1';
      g.set(x, y, ch);
    }
  }
  // distant glowing growths inside each arch, a few dripping stalactites on the rim
  for (const ox of [0, 64]) {
    g.plot([
      [ox + 20, 98, '3'],
      [ox + 21, 97, '8'],
      [ox + 22, 98, '3'],
      [ox + 21, 98, '2'],
      [ox + 38, 96, '8'],
      [ox + 39, 95, '6'],
      [ox + 40, 96, '8'],
      [ox + 39, 97, '2'],
      [ox + 39, 98, '2'],
      [ox + 30, 84, '8'],
      [ox + 31, 84, '8'],
      [ox + 30, 83, '6'],
      [ox + 30, 85, '2'],
      [ox + 26, 72, '8'],
      [ox + 34, 78, '8'],
      [ox + 44, 90, '8'],
      [ox + 16, 88, '8'],
    ]);
    for (const [sx, len] of [
      [18, 7],
      [47, 10],
      [10, 5],
    ] as const) {
      for (let k = 0; k < len; k++) g.set(ox + sx, 16 + k, '2');
      g.set(ox + sx, 16 + len, '8');
    }
  }
  return g.rows();
}

// ---- Props ----

function pipe(): string[] {
  const g = new Grid(16, 16);
  // a horizontal olive pipe with a flange joint at x 5..6 and a leaking seam
  g.rect(0, 5, 16, 5, '5');
  g.rect(0, 5, 16, 1, '7');
  g.rect(0, 9, 16, 1, '3');
  g.rect(5, 3, 3, 9, '5');
  g.rect(5, 3, 3, 1, '7');
  g.rect(5, 11, 3, 1, '3');
  g.rect(11, 5, 1, 5, '3');
  g.plot([
    [2, 7, '3'],
    [3, 7, '3'],
    [13, 7, '3'],
    [14, 6, '4'],
    [6, 5, '4'],
    [6, 8, '2'],
  ]);
  // the leak: a slime drip from the joint
  g.plot([
    [6, 12, '8'],
    [6, 13, '8'],
    [6, 15, '8'],
    [7, 12, '8'],
    [6, 14, '7'],
  ]);
  g.outline('1');
  return g.rows();
}

function slimeDrape(): string[] {
  const g = new Grid(16, 40);
  const lens = [14, 22, 17, 30, 12, 26, 18, 8];
  // ceiling edge: a lumpy slime band
  g.rect(0, 0, 16, 6, '8');
  for (let x = 0; x < 16; x++) g.set(x, 6 + ((x * 5) % 3), '8');
  // dripping strands, each two wide with a drop at the end
  lens.forEach((len, i) => {
    const x = i * 2;
    for (let y = 6; y < len + 4; y++) {
      g.set(x, y, '8');
      g.set(x + 1, y, y % 5 === 0 ? '8' : '3');
    }
    g.set(x, len + 4, '8');
    g.set(x, len + 5, '8');
    g.set(x, len + 3, '7');
  });
  g.rect(0, 0, 16, 2, '3');
  for (let x = 0; x < 16; x += 3) g.set(x, 2, '7');
  g.outline('1');
  return g.rows();
}

function glowShroom(frame: number): string[] {
  const g = new Grid(16, 16);
  const cap = (rows: readonly string[], x: number, y: number): void => {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const c = row.charAt(dx);
        if (c === '.') continue;
        g.set(x + dx, y + dy, c === 'C' ? '6' : c === 'H' ? '7' : frame === 0 ? '8' : '7');
      }
    });
  };
  cap(['..EEEEEE..', '.ECCHHCCE.', 'ECCCHCCCCE', 'EEEEEEEEEE'], 3, 2);
  g.rect(7, 6, 2, 6, '4');
  cap(['.EEEE.', 'ECHCCE', 'EEEEEE'], 10, 7);
  g.rect(12, 10, 1, 3, '4');
  cap(['.EEEE.', 'ECCHCE', 'EEEEEE'], 0, 8);
  g.rect(2, 11, 1, 2, '4');
  // rock ledge
  g.rect(1, 12, 14, 3, '3');
  g.rect(2, 12, 12, 1, '4');
  g.rect(2, 15, 12, 1, '2');
  if (frame === 1) {
    g.plot([
      [5, 1, '6'],
      [11, 1, '6'],
      [13, 6, '6'],
      [1, 7, '6'],
    ]);
  }
  g.outline('1');
  return g.rows();
}

function toxicBarrel(): string[] {
  const g = new Grid(16, 16);
  g.blit(
    [
      '................',
      '...888888888....',
      '..88855555588...',
      '.2555555555552..',
      '.2577555555352..',
      '.2222222222222..',
      '.2575555555352..',
      '.2575555555352..',
      '.2575555555352..',
      '.2222222222222..',
      '.2575555555352..',
      '.2575555555352..',
      '.2555555555552..',
      '..22222222222...',
      '................',
      '................',
    ],
    0,
    0,
  );
  // ooze spilling over the lid and down one side
  g.plot([
    [13, 3, '8'],
    [13, 4, '8'],
    [13, 5, '8'],
    [14, 5, '8'],
    [13, 6, '7'],
    [13, 7, '8'],
    [14, 8, '8'],
    [14, 9, '8'],
    [14, 10, '8'],
    [14, 11, '7'],
    [13, 12, '8'],
  ]);
  // a glowing warning drop on the barrel
  g.plot([
    [7, 7, '6'],
    [7, 8, '6'],
    [6, 8, '6'],
    [8, 8, '6'],
    [7, 9, '6'],
  ]);
  g.rect(0, 13, 16, 1, '.');
  // flatten the base so the foot anchor sits on the bottom outline row 14
  g.rect(2, 13, 11, 1, '2');
  g.outline('1');
  return g.rows();
}

function slimePool(): string[] {
  const g = new Grid(16, 8);
  // a flat oval of slime with a darker rim, a highlight, and two bubble rings
  for (let y = 2; y <= 6; y++) {
    const half = y === 2 || y === 6 ? 5 : y === 3 || y === 5 ? 6 : 7;
    for (let x = 8 - half; x < 8 + half; x++) {
      const rim = y === 6 || x === 8 - half || x === 7 + half;
      g.set(x, y, rim ? '2' : '8');
    }
  }
  g.plot([
    [4, 3, '7'],
    [5, 3, '7'],
    [10, 4, '6'],
    [8, 5, '7'],
    [6, 4, '3'],
    [11, 3, '3'],
  ]);
  g.outline('1');
  return g.rows();
}

function mushrooms(): string[] {
  const g = new Grid(16, 12);
  g.blit(
    [
      '................',
      '....55555.......',
      '...5575575......',
      '..555555555.....',
      '..4444444444.88.',
      '.......44...8778',
      '..888..44...8888',
      '.8778..44....44.',
      '.8888.4444...44.',
      '..44..4444...44.',
      '..44.33333333...',
      '................',
    ],
    0,
    0,
  );
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
  // a crusted passage: metal lintel at y 40 (olive), rock posts, dark opening between
  for (let y = 40; y < 128; y++) {
    for (let x = 2; x <= 13; x++) {
      if (x >= 5 && x <= 10 && y >= 47) g.set(x, y, '1');
      else if (y <= 46) g.set(x, y, y === 40 ? '7' : y === 46 ? '3' : '5');
      else g.set(x, y, x === 2 || x === 5 ? '2' : x <= 4 || x >= 11 ? '3' : '2');
    }
  }
  // slime drips off the lintel and down the posts
  for (const [x, len] of [
    [4, 12],
    [7, 6],
    [10, 9],
    [12, 18],
  ] as const) {
    for (let k = 0; k < len; k++) g.set(x, 47 + k, x === 7 || x === 10 ? '1' : '8');
    if (x !== 7 && x !== 10) g.set(x, 47 + len, '7');
  }
  for (let y = 47 + 12; y < 128; y += 11) g.set(3, y, '8');
  return g.rows();
}

export const TOXIC_SLIME_CAVERNS: StageSprites = {
  tiles: {
    wallTop: frames(2, (i) => tile(`wallTop-${i}`, wallTop(i))),
    wallMid: frames(5, (i) => tile(`wallMid-${i}`, wallMid(i))),
    wallBase: frames(2, (i) => tile(`wallBase-${i}`, wallBase(i))),
    floorBack: frames(3, (i) => tile(`floorBack-${i}`, floor('back', i))),
    floorFront: frames(3, (i) => tile(`floorFront-${i}`, floor('front', i))),
    foreground: frames(2, (i) => tile(`foreground-${i}`, foreground(i))),
  },
  props: {
    pipe: staticTemplate(id('pipe'), pipe(), { x: 0, y: 0 }),
    slimeDrape: staticTemplate(id('slimeDrape'), slimeDrape(), { x: 0, y: 0 }),
    glowShroom: loopTemplate(id('glowShroom'), frames(2, glowShroom), { x: 0, y: 0 }),
    toxicBarrel: staticTemplate(id('toxicBarrel'), toxicBarrel(), { x: 8, y: 14 }),
    slimePool: staticTemplate(id('slimePool'), slimePool(), { x: 8, y: 7 }),
    mushrooms: staticTemplate(id('mushrooms'), mushrooms(), { x: 8, y: 10 }),
    doorFrame: staticTemplate(id('doorFrame'), doorFrame(), { x: 0, y: 0 }),
  },
  backdrop: staticTemplate(id('backdrop'), buildBackdrop(), { x: 0, y: 0 }),
};
