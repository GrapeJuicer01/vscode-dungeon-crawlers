// Stage 9 "Dragon's Lair" regular enemies (batch E5, step A-E5-4). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: drake-whelp, kobold-sapper, gilded-crown, ash-wyvern.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row (minion (8, 15),
// elite (12, 23)), idle 2 / walk 2 / attack 3; no hit or dissolve art (engine flash and dissolve).
// Characters: the stage's `1` outline and `2 to 8` (recolored by STAGE_PALETTES['dragons-lair'])
// plus master accents; at most 12 colors per sprite. The lair's stone is dark red-brown, so the
// enemies carry teal, gold, bronze, ash-gray, and ember-orange and read lighter than the floor.
// Cute-spooky, never gory; nothing here is drawn leaving an enemy toward a hero.
// Silhouettes: whelp an upright round-headed hatchling with wing nubs and an S-curled tail; sapper
// a small lizard-folk figure under a big round powder keg; crown a wide spiked band with two eyes;
// wyvern a winged biped with both wings fanned wide and a long tail. Fill is drawn per frame
// (outlined by finish) from small primitives; the other frames come from the same functions.

import { dots, draft, ellipse, enemyTemplate, finish, poly, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { checked } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const ANCHOR = { x: 8, y: 15 };

// ---------------------------------------------------------------- Drake Whelp (16x16)
// A round-headed teal hatchling standing upright, facing left: big white eye, a pale horn, stubby
// bronze wing nubs behind, an ember-orange belly, two feet, and a tail that curls in an S at the
// right. `attack` snaps the head forward. Colors: 1 8 N w e 7 5 O Y 6 = 10.

function whelpFrame(bob: number, lunge: number, step: number, tail: number): string[] {
  const d: Draft = draft(W, W);
  const hx = 6.0 - lunge;
  const hy = 5.98 + bob;
  const tails: readonly (readonly (readonly [number, number])[])[] = [
    [
      [9.65, 13.29],
      [12.66, 12.52],
      [12.53, 10.55],
      [13.26, 6.34],
      [12.14, 7.67],
    ],
    [
      [9.65, 13.29],
      [12.66, 13.0],
      [12.9, 10.55],
      [13.26, 6.34],
      [12.14, 7.67],
    ],
  ];
  const t = tails[tail] ?? tails[0] ?? [];
  stroke(d, t, '8');
  // wing nubs, raised behind the shoulders
  poly(
    d,
    [
      [9.19, 8.26],
      [12.76, 4.39],
      [11.07, 0.66 + bob],
      [12.3, 5.3],
    ],
    '5',
  );
  // narrow body, then the big head over it
  ellipse(d, 8.65, 9.55, 2.14, 2.67, '8');
  ellipse(d, hx, hy, 3.12, 2.45, '8');
  const ix = Math.round(hx);
  const iy = Math.round(hy);
  d.g.rect(ix - 4, iy + 1, 2, 2, '8');
  // feet
  d.g.rect(5, step === 1 ? 12 : 13, 3, 2, '8');
  d.g.rect(9, step === 1 ? 13 : 12, 2, 2, '8');
  // colors only on existing fill, so the silhouette stays as measured
  const paint = (x: number, y: number, ch: string): void => {
    if (d.g.get(x, y) !== '.') d.g.set(x, y, ch);
  };
  paint(ix - 1, iy - 1, 'w');
  paint(ix, iy - 1, 'w');
  paint(ix - 1, iy, 'e');
  paint(ix, iy, 'w');
  paint(ix + 2, iy - 2, '7');
  paint(ix + 3, iy - 1, '7');
  for (const [x, y, ch] of [
    [7, 9, 'O'],
    [7, 10, 'O'],
    [7, 11, 'Y'],
    [8, 12, 'O'],
    [9, 9, 'N'],
    [10, 10, 'N'],
    [10, 11, 'N'],
  ] as const) {
    paint(x, y, ch);
  }
  const tip = t[t.length - 1];
  if (tip) paint(Math.round(tip[0]), Math.round(tip[1]), '6');
  d.g.rect(0, 15, W, 1, '.');
  return finish(d);
}

export const DRAKE_WHELP: SpriteTemplate = enemyTemplate('drake-whelp', W, W, ANCHOR, {
  idle: [checked(whelpFrame(0, 0, 0, 0), W, W), checked(whelpFrame(1, 0, 0, 1), W, W)],
  walk: [checked(whelpFrame(0, 0, 0, 0), W, W), checked(whelpFrame(0, 0, 1, 1), W, W)],
  attack: [
    checked(whelpFrame(0, -1, 0, 1), W, W),
    checked(whelpFrame(1, 1, 0, 0), W, W),
    checked(whelpFrame(0, 0, 0, 1), W, W),
  ],
});

// ---------------------------------------------------------------- Kobold Sapper (16x16)
// A small bronze-skinned lizard-folk figure in a steel hard hat, hauling a big round powder keg
// overhead with both arms (wooden staves, steel bands, an unlit fuse). A thin body, a tail, small
// feet. `attack` lowers the keg and lunges (no blast is drawn). Colors: 1 V W m 5 e w 2 R = 9.

function koboldFrame(bob: number, lunge: number, step: number, lower: number): string[] {
  const d: Draft = draft(W, W);
  const kx = 7.3 - lunge * 2;
  const ky = 4.96 + bob + lower;
  // the keg
  ellipse(d, kx, ky, 3.6, 3.0, 'V');
  const hat = (x: number, y: number, ch: string): void => {
    if (d.g.get(x, y) !== '.') d.g.set(x, y, ch);
  };
  const kcx = Math.round(kx);
  const kcy = Math.round(ky);
  for (let x = kcx - 5; x <= kcx + 5; x++) {
    hat(x, kcy - 1, 'm');
    hat(x, kcy + 2, 'm');
  }
  for (let y = kcy - 3; y <= kcy + 3; y++) {
    hat(kcx + 3, y, 'W');
    hat(kcx + 4, y, 'W');
  }
  dots(d, [
    [kcx + 1, kcy - 4, '2'],
    [kcx + 2, kcy - 5, 'R'],
  ]);
  // arms up to the keg
  stroke(
    d,
    [
      [kx - 2, 9 + bob],
      [kx - 4, 8 + bob],
    ],
    '5',
  );
  stroke(
    d,
    [
      [kx + 1, 9 + bob],
      [kx + 3, 8 + bob],
    ],
    '5',
  );
  // head with a snout, a steel hat, an eye
  const hx = 5.64 - lunge;
  const hy = 10.8 + bob;
  ellipse(d, hx, hy, 1.85, 1.6, '5');
  const ix = Math.round(hx);
  const iy = Math.round(hy);
  d.g.rect(ix - 4, iy + 1, 2, 1, '5');
  for (let x = ix - 2; x <= ix + 2; x++) hat(x, iy - 2, 'm');
  dots(d, [
    [ix - 1, iy, 'w'],
    [ix - 2, iy, 'e'],
  ]);
  // thin body, legs, tail
  const bx = Math.round(5.44 - lunge);
  d.g.rect(bx, 12, 2, 2, '5');
  d.g.rect(bx - 1, 14, 2, 1, '5');
  d.g.rect(bx + 2 + step, 14, 2, 1, '5');
  stroke(
    d,
    [
      [bx + 2, 13],
      [11.5, 13.6],
      [13.4, 10.9 - step],
    ],
    '5',
  );
  d.g.rect(0, 15, W, 1, '.');
  return finish(d);
}

export const KOBOLD_SAPPER: SpriteTemplate = enemyTemplate('kobold-sapper', W, W, ANCHOR, {
  idle: [checked(koboldFrame(0, 0, 0, 0), W, W), checked(koboldFrame(1, 0, 0, 0), W, W)],
  walk: [checked(koboldFrame(0, 0, 0, 0), W, W), checked(koboldFrame(0, 0, 1, 0), W, W)],
  attack: [
    checked(koboldFrame(0, -1, 0, 0), W, W),
    checked(koboldFrame(0, 1, 0, 1), W, W),
    checked(koboldFrame(0, 0, 0, 0), W, W),
  ],
});

// ---------------------------------------------------------------- Gilded Crown (16x16)
// A floating golden crown seen from the front: a comb of five spikes with pale tips, a bright band
// with two eyes and a teal gem between them, a bronze lower rim, and a fringe of pearls under it.
// It hovers. `attack` swoops the rim forward. Colors: 1 6 7 5 e w 8 = 7.

function crownFrame(bob: number, lunge: number, sparkle: boolean): string[] {
  const d: Draft = draft(W, W);
  const y0 = 6 + bob;
  const heights = [5, 3, 5, 3, 5];
  const tips = [2, 5, 7, 9, 12];
  tips.forEach((tx, i) => {
    const h = heights[i] ?? 3;
    for (let k = 0; k <= h; k++) {
      d.g.set(tx - lunge, y0 - h + k, k < 2 ? '7' : '6');
      if (k >= 2) d.g.set(tx + 1 - lunge, y0 - h + k, '6');
    }
  });
  d.g.rect(2 - lunge, y0, 12, 3, '6');
  d.g.rect(2 - lunge, y0, 12, 1, '7');
  d.g.rect(2 - lunge, y0 + 2, 12, 1, '5');
  dots(d, [
    [7 - lunge, y0 + 1, '8'],
    [8 - lunge, y0 + 1, '8'],
    [4 - lunge, y0 + 1, '5'],
    [11 - lunge, y0 + 1, '5'],
    // two eyes peering out from under the rim
    [4 - lunge, y0 + 4, 'w'],
    [5 - lunge, y0 + 4, 'w'],
    [4 - lunge, y0 + 5, 'e'],
    [5 - lunge, y0 + 5, 'w'],
    [10 - lunge, y0 + 4, 'w'],
    [11 - lunge, y0 + 4, 'w'],
    [10 - lunge, y0 + 5, 'e'],
    [11 - lunge, y0 + 5, 'w'],
  ]);
  if (sparkle) d.g.set(12 - lunge, y0 + 6, '7');
  d.g.rect(0, 15, W, 1, '.');
  return finish(d);
}

export const GILDED_CROWN: SpriteTemplate = enemyTemplate('gilded-crown', W, W, ANCHOR, {
  idle: [checked(crownFrame(0, 0, false), W, W), checked(crownFrame(1, 0, true), W, W)],
  walk: [checked(crownFrame(1, 0, false), W, W), checked(crownFrame(0, 0, true), W, W)],
  attack: [
    checked(crownFrame(0, -1, false), W, W),
    checked(crownFrame(1, 1, false), W, W),
    checked(crownFrame(1, 0, true), W, W),
  ],
});

// ---------------------------------------------------------------- Ash Wyvern (elite 24x24)
// An ash-gray winged biped facing left: a horned head with an ember eye, a short neck, a narrow
// body, two wings fanned wide in a Y with ember-orange leading edges and scalloped dark membranes,
// two legs, and a long tail with a spade tip. It hovers. `attack` sweeps the near wing forward at
// chest height. Colors: 1 G P O R Y e w 5 = 9.

const TW = 24;

function wyvernFrame(flap: number, sweep: number, lunge: number): string[] {
  const d: Draft = draft(TW, TW);
  const fy = flap; // wing tips rise or fall one pixel
  // far wing (up and left), membrane then bone
  poly(
    d,
    [
      [11, 11],
      [7, 3 + fy],
      [3, 1 + fy],
      [4, 6 + fy],
      [6, 8],
      [7, 12],
      [10, 14],
    ],
    'P',
  );
  stroke(
    d,
    [
      [11, 11],
      [8, 5 + fy],
      [4, 1 + fy],
    ],
    'O',
  );
  // near wing (up and right), larger
  poly(
    d,
    [
      [13, 11],
      [17, 3 + fy],
      [22, 1 + fy],
      [21, 6 + fy],
      [19, 9],
      [19, 13],
      [16, 12],
      [14, 15],
    ],
    'P',
  );
  stroke(
    d,
    [
      [13, 11],
      [17, 5 + fy],
      [22, 1 + fy],
    ],
    'O',
  );
  if (sweep > 0) {
    // the near wing sweeps forward (left) at chest height
    poly(
      d,
      [
        [11, 12],
        [5 - lunge, 13],
        [2 - lunge, 14],
        [5 - lunge, 16],
        [8, 16],
      ],
      'P',
    );
    stroke(
      d,
      [
        [11, 12],
        [6 - lunge, 12],
        [2 - lunge, 14],
      ],
      'O',
    );
  }
  // tail
  stroke(
    d,
    [
      [13, 17],
      [17, 19],
      [20, 18],
      [22, 20],
    ],
    'G',
  );
  poly(
    d,
    [
      [21, 19],
      [23, 18],
      [23, 21],
    ],
    'O',
  );
  // body and legs
  ellipse(d, 12, 14, 3, 4, 'G');
  d.g.rect(10, 18, 2, 4, 'G');
  d.g.rect(13, 18, 2, 4, 'P');
  d.g.rect(9, 21, 3, 1, 'G');
  d.g.rect(13, 21, 3, 1, 'P');
  dots(d, [
    [10, 14, 'w'],
    [10, 15, 'w'],
    [11, 15, 'w'],
    [10, 16, 'Y'],
  ]);
  // neck and horned head, forward at the left
  stroke(
    d,
    [
      [10, 12],
      [8 - lunge, 9],
    ],
    'G',
    2,
  );
  ellipse(d, 7 - lunge, 8, 2.5, 2, 'G');
  d.g.rect(3 - lunge, 8, 3, 2, 'G');
  dots(d, [
    [6 - lunge, 7, 'R'],
    [5 - lunge, 7, 'e'],
    [8 - lunge, 5, 'w'],
    [9 - lunge, 4, 'w'],
    [10 - lunge, 3, 'w'],
    [8 - lunge, 6, 'P'],
  ]);
  d.g.rect(0, 23, TW, 1, '.');
  return finish(d);
}

export const ASH_WYVERN: SpriteTemplate = enemyTemplate(
  'ash-wyvern',
  TW,
  TW,
  { x: 12, y: 23 },
  {
    idle: [checked(wyvernFrame(0, 0, 0), TW, TW), checked(wyvernFrame(1, 0, 0), TW, TW)],
    walk: [checked(wyvernFrame(1, 0, 0), TW, TW), checked(wyvernFrame(0, 0, 0), TW, TW)],
    attack: [
      checked(wyvernFrame(1, 0, 0), TW, TW),
      checked(wyvernFrame(0, 1, 0), TW, TW),
      checked(wyvernFrame(1, 1, 1), TW, TW),
    ],
  },
);

/** Stage 9 regular enemies, id -> template. */
export const ENEMIES_STAGE9: Readonly<Record<string, SpriteTemplate>> = {
  'drake-whelp': DRAKE_WHELP,
  'kobold-sapper': KOBOLD_SAPPER,
  'gilded-crown': GILDED_CROWN,
  'ash-wyvern': ASH_WYVERN,
};
