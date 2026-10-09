// Stage 1 "The Forgotten Cellar" regular enemies (batch E1, step A-E1-2). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: cellar-rat, cave-bat, web-spider, crate-mimic. Every template
// is `enemies/<id>`, authored LEFT-facing (the engine mirrors only while an enemy withdraws), foot
// anchor on the bottom outline row, animations idle 2 / walk 2 / attack 3. There is no hit, death,
// or hurt art: the engine makes the white flash and the dissolve from these frames.
// Characters: the stage's `1` (outline) plus master accents; at most 12 colors per sprite.
// Silhouettes (solid black): rat low and long with a curled tail; bat wide and winged; spider
// round with eight splayed legs and a thread; mimic a boxy crate with a slanted, jagged lid.

import {
  dots,
  draft,
  enemyTemplate,
  finish,
  looseDots,
  looseLine,
  poly,
  put,
} from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const H = 16;
const ANCHOR = { x: 8, y: 15 };

// ---------------------------------------------------------------- Cellar Rat (minion 16x16)
// Gray rat with big pink ears, a white-and-black eye, a pink nose, and a pink curled tail.
// Colors: 1 G P s w e (+ R in the attack frame mouth) = 7.

const RAT_BODY = [
  '.....ss.........',
  '....sPPs........',
  '....sPPs........',
  '...GGGGGG.......',
  '...GGGGGGGG.....',
  '...GewGGGGGGG...',
  '..sGewGGGGGGG...',
  '..sGGGGGGGGGG...',
  '...GGGPPPPPPG...',
  '....GGPPPPPPG...',
];

const RAT_TAIL_A: [number, number, string][] = [
  [13, 10, 's'],
  [14, 10, 's'],
  [14, 9, 's'],
  [14, 8, 's'],
  [14, 7, 's'],
  [13, 6, 's'],
];
const RAT_TAIL_B: [number, number, string][] = [
  [13, 10, 's'],
  [14, 10, 's'],
  [14, 9, 's'],
  [14, 8, 's'],
  [13, 7, 's'],
  [12, 7, 's'],
];

function ratFrame(
  legs: readonly number[],
  tail: readonly [number, number, string][],
  opts: { dx?: number; open?: boolean; lift?: number } = {},
): string[] {
  const d = draft(W, H);
  const dx = opts.dx ?? 0;
  put(d, RAT_BODY, 0, 3);
  // head and body slide together; the tail stays put and gains a bridge pixel when the body moves
  if (dx !== 0) {
    d.g.rect(0, 0, W, H, '.');
    put(d, RAT_BODY, dx, 3);
    dots(d, [[13, 10, 'G']]);
  }
  dots(d, tail);
  legs.forEach((x, i) => {
    const up = opts.lift !== undefined && i === opts.lift;
    dots(d, [[x, 13, i % 2 === 0 ? 'G' : 'P']]);
    if (!up) dots(d, [[x, 14, 's']]);
  });
  if (opts.open) {
    // open mouth under the nose: red mouth, two white fangs
    dots(d, [
      [3 + dx, 10, 'R'],
      [4 + dx, 10, 'R'],
      [3 + dx, 11, 'w'],
      [5 + dx, 11, 'w'],
    ]);
  }
  return finish(d);
}

export const CELLAR_RAT: SpriteTemplate = enemyTemplate('cellar-rat', W, H, ANCHOR, {
  idle: [ratFrame([4, 6, 10, 12], RAT_TAIL_A), ratFrame([4, 6, 10, 12], RAT_TAIL_B)],
  walk: [
    ratFrame([3, 7, 9, 13], RAT_TAIL_A, { lift: 1 }),
    ratFrame([5, 6, 11, 12], RAT_TAIL_B, { lift: 2 }),
  ],
  attack: [
    ratFrame([4, 6, 10, 12], RAT_TAIL_A, { dx: 1 }),
    ratFrame([3, 5, 9, 11], RAT_TAIL_B, { dx: -1, open: true }),
    ratFrame([4, 6, 10, 12], RAT_TAIL_A, { open: true }),
  ],
});

// ---------------------------------------------------------------- Cave Bat (minion 16x16)
// Indigo bat with big yellow eyes, pink-lined ears, two small fangs, and wide scalloped wings.
// Drawn mid-air: the engine adds the float offset. Colors: 1 b 2 P s Y e w R = 9.

type Pt = readonly [number, number];
interface WingPose {
  /** Shoulder, tip, then the scalloped trailing edge back to the body. */
  readonly s: Pt;
  readonly t: Pt;
  readonly edge: readonly Pt[];
}
const WING_UP: WingPose = {
  s: [5, 10],
  t: [1, 3],
  edge: [
    [1, 8],
    [2, 10],
    [1, 12],
    [5, 13],
  ],
};
const WING_MID: WingPose = {
  s: [5, 10],
  t: [1, 8],
  edge: [
    [1, 12],
    [2, 11],
    [3, 13],
    [5, 13],
  ],
};
const WING_DOWN: WingPose = {
  s: [5, 10],
  t: [1, 13],
  edge: [
    [2, 14],
    [3, 13],
    [5, 12],
  ],
};

function mirror(p: Pt): Pt {
  return [14 - p[0], p[1]];
}

function wing(d: Draft, w: WingPose): void {
  for (const flip of [false, true]) {
    const f = (p: Pt): Pt => (flip ? mirror(p) : p);
    poly(d, [f(w.s), f(w.t), ...w.edge.map(f)], 'b');
    const bone = new Set<string>();
    const first = w.edge[Math.min(1, w.edge.length - 1)] ?? w.t;
    const lines: [Pt, Pt][] = [
      [f(w.s), f(w.t)],
      [f(w.s), f(first)],
    ];
    for (const [a, c] of lines) {
      const n = Math.max(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(a[0] + ((c[0] - a[0]) * i) / (n || 1));
        const y = Math.round(a[1] + ((c[1] - a[1]) * i) / (n || 1));
        bone.add(`${x},${y}`);
      }
    }
    for (const k of bone) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      dots(d, [[x, y, '2']]);
    }
  }
}

const BAT_BODY = [
  '....b....b......',
  '....bb..bb......',
  '....bsbbbsb.....',
  '....bbbbbbb.....',
  '....beYbeYb.....',
  '....bYYbYYb.....',
  '....bbbbbbb.....',
  '.....bPPPb......',
  '.....bbbbb......',
  '......bbb.......',
  '......s.s.......',
];

function batFrame(w: WingPose, opts: { dx?: number; dy?: number; mouth?: boolean } = {}): string[] {
  const d = draft(W, H);
  wing(d, w);
  put(d, BAT_BODY, opts.dx ?? 0, 3 + (opts.dy ?? 0));
  if (opts.mouth) {
    const x = opts.dx ?? 0;
    const y = opts.dy ?? 0;
    dots(d, [
      [6 + x, 10 + y, 'w'],
      [7 + x, 10 + y, 'R'],
      [8 + x, 10 + y, 'w'],
    ]);
    dots(d, [[7 + x, 11 + y, 'R']]);
  }
  // drop one row so the claws' outline sits on the bottom row (the foot anchor)
  return ['.'.repeat(W), ...finish(d).slice(0, H - 1)];
}

export const CAVE_BAT: SpriteTemplate = enemyTemplate('cave-bat', W, H, ANCHOR, {
  idle: [batFrame(WING_MID), batFrame(WING_UP, { dy: -1 })],
  walk: [batFrame(WING_UP, { dy: -1 }), batFrame(WING_DOWN)],
  attack: [
    batFrame(WING_UP, { dy: -1, mouth: true }),
    batFrame(WING_MID, { dx: -1, mouth: true }),
    batFrame(WING_DOWN, { dx: -1 }),
  ],
});

// ---------------------------------------------------------------- Web Spider (minion 16x16)
// Round brown spider with a red hourglass, two big eyes, eight splayed legs, and a hanging thread.
// Legs are thin loose lines (no outline). Colors: 1 W V R w e 7 = 7.

const SPIDER_BODY = [
  '.....WWWWWW.....',
  '....WVVWWWWW....',
  '....WWeWWWWW....',
  '....WweWWWWW....',
  '....WWWWWWWW....',
  '....WWWWWWWW....',
  '.....WWWWWW.....',
];

const SPIDER_LEGS_A: Pt[][] = [
  [
    [4, 6],
    [3, 5],
    [2, 4],
  ],
  [
    [4, 7],
    [3, 7],
    [2, 7],
    [1, 8],
    [1, 9],
  ],
  [
    [4, 9],
    [3, 9],
    [2, 10],
    [1, 11],
    [1, 12],
  ],
  [
    [5, 11],
    [4, 12],
    [3, 14],
    [2, 15],
  ],
  [
    [11, 6],
    [12, 5],
    [13, 4],
  ],
  [
    [11, 7],
    [12, 7],
    [13, 7],
    [14, 8],
    [14, 9],
  ],
  [
    [11, 9],
    [12, 9],
    [13, 10],
    [14, 11],
    [14, 12],
  ],
  [
    [10, 11],
    [11, 12],
    [12, 14],
    [13, 15],
  ],
];
const SPIDER_LEGS_B: Pt[][] = [
  [
    [4, 6],
    [3, 6],
    [2, 6],
    [1, 5],
  ],
  [
    [4, 8],
    [3, 8],
    [2, 9],
    [1, 10],
    [1, 11],
  ],
  [
    [4, 9],
    [3, 10],
    [2, 11],
    [2, 12],
    [2, 13],
  ],
  [
    [5, 11],
    [4, 12],
    [4, 14],
    [3, 15],
  ],
  [
    [11, 6],
    [12, 6],
    [13, 6],
    [14, 5],
  ],
  [
    [11, 8],
    [12, 8],
    [13, 9],
    [14, 10],
    [14, 11],
  ],
  [
    [11, 9],
    [12, 10],
    [13, 11],
    [13, 12],
    [13, 13],
  ],
  [
    [10, 11],
    [11, 12],
    [11, 14],
    [12, 15],
  ],
];

function spiderFrame(
  legs: readonly (readonly Pt[])[],
  opts: { dx?: number; dy?: number; fangs?: boolean; thread?: number } = {},
): string[] {
  const d = draft(W, H);
  const dx = opts.dx ?? 0;
  const dy = opts.dy ?? 0;
  put(d, SPIDER_BODY, dx, 5 + dy);
  dots(d, [
    [9 + dx, 7 + dy + 0, 'R'],
    [10 + dx, 7 + dy, 'R'],
    [9 + dx, 8 + dy, 'R'],
    [9 + dx, 9 + dy, 'R'],
    [10 + dx, 9 + dy, 'R'],
  ]);
  if (opts.fangs) {
    dots(d, [
      [4 + dx, 10 + dy, 'w'],
      [4 + dx, 11 + dy, 'w'],
    ]);
  }
  const thread = opts.thread ?? 4;
  for (let y = 0; y < thread + dy; y++) looseDots(d, [[7 + dx, y, '7']]);
  const adjusted = finish(d);
  // legs are drawn after the outline and never outlined; rebuild with legs on top
  const g = draft(W, H);
  g.g.blit(adjusted, 0, 0);
  for (const leg of legs)
    looseLine(
      g,
      leg.map((p) => [p[0] + dx, p[1] + dy] as Pt),
      'V',
    );
  g.g.plot(g.loose);
  return g.g.rows();
}

export const WEB_SPIDER: SpriteTemplate = enemyTemplate('web-spider', W, H, ANCHOR, {
  idle: [spiderFrame(SPIDER_LEGS_A), spiderFrame(SPIDER_LEGS_A, { dy: 1, thread: 5 })],
  walk: [spiderFrame(SPIDER_LEGS_B), spiderFrame(SPIDER_LEGS_A, { dy: 1, thread: 5 })],
  attack: [
    spiderFrame(SPIDER_LEGS_B, { dy: 1, thread: 5 }),
    spiderFrame(SPIDER_LEGS_A, { dx: -1, dy: -1, fangs: true, thread: 3 }),
    spiderFrame(SPIDER_LEGS_B, { dx: -1, fangs: true }),
  ],
});

// ---------------------------------------------------------------- Crate Mimic (elite 24x24)
// A wooden crate that is secretly a monster: slanted jagged lid, yellow eyes on the lid, a dark
// red mouth with white teeth, a pink tongue in `attack`. Colors: 1 5 2 4 3 D w R Y e = 10.

const MW = 24;
const MH = 24;
const BASE_TOP = 14;
const BASE_BOT = 22;
const X0 = 3;
const X1 = 21;

function mimicFrame(
  open: number,
  opts: { snap?: boolean; tongue?: boolean; sway?: number } = {},
): string[] {
  const d = draft(MW, MH);
  const sway = opts.sway ?? 0;
  // base: planks with iron corners
  for (let y = BASE_TOP; y <= BASE_BOT; y++) {
    for (let x = X0; x <= X1; x++) {
      let ch = '5';
      if (y === BASE_TOP) ch = '4';
      else if (y === BASE_BOT) ch = '2';
      else if ((x - X0) % 6 === 5) ch = '2';
      if ((x <= X0 + 1 || x >= X1 - 1) && y > BASE_TOP) ch = '3';
      d.g.set(x, y, ch);
    }
  }
  dots(d, [
    [X0 + 1, BASE_TOP + 2, '4'],
    [X1 - 1, BASE_TOP + 2, '4'],
  ]);
  // mouth gap between base top and lid bottom: dark red inside
  const lidBottom = (x: number): number =>
    BASE_TOP - 1 - (opts.snap ? 0 : Math.round((open * (X1 - x)) / (X1 - X0)));
  for (let x = X0; x <= X1; x++) {
    for (let y = lidBottom(x); y < BASE_TOP; y++) d.g.set(x, y, 'D');
  }
  // lid: 6 rows thick, sheared by the opening
  for (let x = X0; x <= X1; x++) {
    const bottom = lidBottom(x) - 1;
    for (let k = 0; k < 7; k++) {
      const y = bottom - k;
      let ch = '5';
      if (k === 6) ch = '4';
      else if (k === 0) ch = '2';
      else if ((x - X0) % 6 === 5) ch = '2';
      if (x <= X0 + 1 || x >= X1 - 1) ch = k === 6 ? '4' : '3';
      d.g.set(x, y, ch);
    }
  }
  // jagged top edge: splinters
  for (const sx of [X0 + 4, X0 + 9, X0 + 14]) {
    const top = lidBottom(sx) - 7;
    dots(d, [[sx, top, '4']]);
  }
  // eyes on the lid: white-yellow with a pupil, looking left
  const eyeY = (x: number): number => lidBottom(x) - 4;
  for (const ex of [X0 + 4, X0 + 10]) {
    const y = eyeY(ex);
    dots(d, [
      [ex, y, 'e'],
      [ex + 1, y, 'Y'],
      [ex + 2, y, 'Y'],
      [ex, y + 1, 'Y'],
      [ex + 1, y + 1, 'Y'],
      [ex + 2, y + 1, 'Y'],
    ]);
  }
  // teeth: upper from the lid bottom, lower from the base top
  const openRows = (x: number): number => BASE_TOP - lidBottom(x);
  for (const tx of [X0 + 3, X0 + 8, X0 + 13]) {
    const n = Math.min(3, Math.max(1, openRows(tx)));
    for (let k = 0; k < n; k++) {
      dots(d, [
        [tx, lidBottom(tx) + k, 'w'],
        [tx + 1, lidBottom(tx + 1) + Math.max(0, k - 1), 'w'],
      ]);
    }
  }
  for (const tx of [X0 + 5, X0 + 10, X0 + 15]) {
    const n = Math.min(2, Math.max(1, openRows(tx)));
    for (let k = 0; k < n; k++) dots(d, [[tx, BASE_TOP - 1 - k, 'w']]);
  }
  if (opts.tongue) {
    dots(d, [
      [X0 - 1, BASE_TOP - 1, 'R'],
      [X0 - 2, BASE_TOP, 'R'],
      [X0 - 1, BASE_TOP, 'R'],
      [X0 - 2, BASE_TOP + 1, 'R'],
    ]);
  }
  if (sway !== 0) {
    const rows = finish(d);
    // shift the whole crate (bounded) for the walk frames
    const out = draft(MW, MH);
    out.g.blit(rows, sway, 0);
    return out.g.rows();
  }
  return finish(d);
}

export const CRATE_MIMIC: SpriteTemplate = enemyTemplate(
  'crate-mimic',
  MW,
  MH,
  { x: 12, y: 23 },
  {
    idle: [mimicFrame(3), mimicFrame(4)],
    walk: [mimicFrame(2), mimicFrame(5)],
    attack: [mimicFrame(5), mimicFrame(0, { snap: true }), mimicFrame(2, { tongue: true })],
  },
);

/** Stage 1 regular enemies, id -> template. */
export const ENEMIES_STAGE1: Readonly<Record<string, SpriteTemplate>> = {
  'cellar-rat': CELLAR_RAT,
  'cave-bat': CAVE_BAT,
  'web-spider': WEB_SPIDER,
  'crate-mimic': CRATE_MIMIC,
};
