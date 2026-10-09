// Stage 5 "Enchanted Forest Ruins" regular enemies (batch E3, step A-E3-4). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: thorn-sprout, moss-wolf, bramble-pixie, ancient-treant.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row, idle 2 / walk 2 /
// attack 3; no hit or dissolve art (engine flash and dissolve). Characters: the stage's `1`
// outline and its `3 4 5 6 7 8` (recolored by STAGE_PALETTES['enchanted-forest-ruins']) plus
// master accents; at most 12 colors per sprite. The forest stone is dark and gray-green, so the
// enemies use brighter lime and moss greens, warm browns, and glowing blue accents.
// Silhouettes: sprout a tall bulb with a spiked radial crown on root legs; wolf a standing
// four-legged hunter with tall ears and a raised tail; pixie an X of wings around a small body;
// treant a gnarled tree with a Y-shaped crown over a wide root base.

import {
  dots,
  draft,
  ellipse,
  enemyTemplate,
  finish,
  looseDots,
  put,
  stroke,
} from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { checked, lift, patch, shiftRows, squash } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const ANCHOR = { x: 8, y: 15 };

// ---------------------------------------------------------------- Thorn Sprout (16x16)
// A walking seedling: a round moss-green bulb with one big eye, a radial crown of thorny leaves
// fanning up and out, and three root legs. `attack` leans forward and flares the leaves wide.
// Colors: 1 L N 5 w e W Y = 8.

interface SproutPose {
  readonly bob?: number;
  /** Crown lean (negative = forward / left) and flare (extra spike length). */
  readonly lean?: number;
  readonly flare?: number;
  readonly legs: 0 | 1 | 2;
}

function sproutFrame(p: SproutPose): string[] {
  const d: Draft = draft(W, W);
  const bob = p.bob ?? 0;
  const lean = p.lean ?? 0;
  const fl = p.flare ?? 0;
  const by = 10 + bob;
  ellipse(d, 8, by, 4, 3, '5');
  // belly shade
  for (let x = 5; x <= 12; x++) if (d.g.get(x, by + 3) === '5') d.g.set(x, by + 3, 'N');
  const cx = 8 + lean;
  const base = by - 3;
  // radial crown: five thorny leaves from the top of the bulb
  const tips: readonly (readonly [number, number])[] = [
    [cx, 1 - fl],
    [cx - 4 - fl, 2],
    [cx + 5 + fl, 2],
    [cx - 5 - fl, 5],
    [cx + 7 + fl, 5],
  ];
  for (const [tx, ty] of tips) {
    stroke(
      d,
      [
        [8 + lean / 2, base],
        [Math.max(0, Math.min(14, tx)), Math.max(1, ty + bob)],
      ],
      'L',
      1,
    );
  }
  dots(d, [
    [cx, base - 1, 'L'],
    [cx - 1, base, 'L'],
    [cx + 1, base, 'L'],
  ]);
  // one big eye with a pale shine
  dots(d, [
    [5, by - 1, 'w'],
    [6, by - 1, 'w'],
    [7, by - 1, 'w'],
    [5, by, 'w'],
    [6, by, 'e'],
    [7, by, 'e'],
    [6, by + 1, 'e'],
    [7, by + 1, 'e'],
  ]);
  d.g.rect(0, 15, W, 1, '.');
  const out = finish(d);
  // three root legs (thin, not outlined)
  const g: Draft = draft(W, W);
  g.g.blit(out, 0, 0);
  const sets: readonly (readonly (readonly [number, number])[])[] = [
    [
      [5, 14],
      [8, 14],
      [11, 14],
    ],
    [
      [4, 14],
      [8, 14],
      [12, 14],
    ],
    [
      [6, 14],
      [8, 14],
      [10, 14],
    ],
  ];
  const feet = sets[p.legs] ?? [];
  for (const [fx, fy] of feet) {
    looseDots(g, [
      [fx, fy - 1 + bob, 'W'],
      [fx, fy, 'W'],
      [fx + (fx < 8 ? -1 : fx > 8 ? 1 : 0), fy + 1 - 0, 'W'],
    ]);
  }
  g.g.plot(g.loose);
  return g.g.rows();
}

export const THORN_SPROUT: SpriteTemplate = enemyTemplate('thorn-sprout', W, W, ANCHOR, {
  idle: [sproutFrame({ legs: 0 }), sproutFrame({ legs: 0, bob: 1 })],
  walk: [sproutFrame({ legs: 1, bob: 1 }), sproutFrame({ legs: 2 })],
  attack: [
    sproutFrame({ legs: 0, lean: 1, bob: 1 }),
    sproutFrame({ legs: 1, lean: -2, flare: 2 }),
    sproutFrame({ legs: 0, lean: -1, flare: 1 }),
  ],
});

// ---------------------------------------------------------------- Moss Wolf (16x16)
// A lean gray wolf standing on four thin legs: two tall pointed ears, a bright yellow eye, a mossy
// back and a tail raised high behind. Hand-drawn base frame; the other frames come from row-level
// helpers. `attack` crouches, then lunges the head forward with the jaws open.
// Colors: 1 G P 5 L Y e w = 8.

const WOLF_BASE: readonly string[] = [
  '................',
  '.1.1............',
  '1G11G1........1.',
  '1GGGG1.......1G1',
  '1GGGG1......1GG1',
  '.1GGG1111...1G1.',
  '1GGYG5L5G111G1..',
  '1eGGGGG5555GGG1.',
  '.1GGGGGGGGGGGG1.',
  '..11GGGGGGGPP1..',
  '....1G1P11G1P1..',
  '....1G1..1G1.1..',
  '....1G1..1G1.1..',
  '....1P1..1P1.1..',
  '...1PP1.1PP1.11.',
  '................',
];

export const MOSS_WOLF: SpriteTemplate = enemyTemplate('moss-wolf', W, W, ANCHOR, {
  idle: [checked(WOLF_BASE, W, W), squash(WOLF_BASE, 8)],
  walk: [shiftRows(squash(WOLF_BASE, 8), 12, 14, -1), shiftRows(WOLF_BASE, 12, 14, 1)],
  attack: [
    shiftRows(squash(WOLF_BASE, 8), 1, 9, 1),
    patch(shiftRows(WOLF_BASE, 1, 9, -1), 0, 8, ['.wRe', '..wG']),
    shiftRows(WOLF_BASE, 1, 9, -1),
  ],
});

// ---------------------------------------------------------------- Bramble Pixie (16x16)
// A tiny thorny pixie that hovers: a visible head, torso and dangling legs between two pairs of
// big glowing wings (an X), holding a bramble stick toward the front. `attack` flicks the stick
// and flares the wings. Colors: 1 6 7 s N 5 e W D = 9.

/** Rows the pixie is lowered so it hovers just above the ground. */
const HOVER = 3;

interface PixiePose {
  readonly bob?: number;
  /** Wing spread: 0 folded in, 1 normal, 2 flared. */
  readonly wing: 0 | 1 | 2;
  /** Stick angle: 0 carried low, 1 raised, 2 flicked forward. */
  readonly stick: 0 | 1 | 2;
}

function pixieFrame(p: PixiePose): string[] {
  const d: Draft = draft(W, W);
  const b = p.bob ?? 0;
  // wings: a thin X behind the body (rows of [y, x0, x1]); flared wings reach one row higher
  const up = p.wing === 2 ? -1 : 0;
  const inn = p.wing === 0 ? 1 : 0;
  const wingRows = (rows: readonly (readonly [number, number, number])[], ch: string): void => {
    for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) d.g.set(x, y, ch);
  };
  wingRows(
    [
      [2 + up, 1 + inn, 2 + inn],
      [3 + up, 1 + inn, 4],
      [4, 2 + inn, 5],
      [5 + b, 3 + inn, 6],
      [6 + b, 4 + inn, 6],
    ],
    '6',
  );
  wingRows(
    [
      [2 + up, 13 - inn, 14 - inn],
      [3 + up, 11, 14 - inn],
      [4, 10, 13 - inn],
      [5 + b, 9, 12 - inn],
      [6 + b, 9, 11 - inn],
    ],
    '6',
  );
  wingRows(
    [
      [9 + b, 4, 6],
      [10 + b, 3 + inn, 5],
      [11 + b, 2 + inn, 4],
      [12 + b, 2 + inn, 3 + inn],
    ],
    '8',
  );
  wingRows(
    [
      [9 + b, 9, 11],
      [10 + b, 10, 12 - inn],
      [11 + b, 11 - inn, 13 - inn],
      [12 + b, 12 - inn, 13 - inn],
    ],
    '8',
  );
  // body: head with leafy hair, torso, arm
  put(d, ['.NN.', 'ssss', 'ssss'], 6, 3 + b);
  put(d, ['5555', '5555', '.55.'], 6, 6 + b);
  dots(d, [
    [6, 4 + b, 'e'],
    [8, 2 + b, 'N'],
    [7, 1 + b, 'N'],
  ]);
  // bramble stick held toward the front (left)
  const tip: readonly (readonly [number, number])[] = [
    [1, 9],
    [1, 4],
    [0, 6],
  ];
  const t = tip[p.stick] ?? [1, 9];
  stroke(
    d,
    [
      [6, 8 + b],
      [t[0], t[1] + b],
    ],
    'W',
    1,
  );
  d.g.rect(0, 15, W, 1, '.');
  const out = finish(d);
  const g: Draft = draft(W, W);
  g.g.blit(out, 0, 0);
  // thorns on the stick, dangling legs (loose)
  looseDots(g, [
    [t[0] + 1, t[1] + b - 1, 'D'],
    [t[0] + 2, t[1] + b + 1, 'D'],
    [t[0], t[1] + b, 'D'],
    [7, 10 + b, 'N'],
    [7, 11 + b, 'k'],
    [9, 10 + b, 'N'],
    [9, 11 + b, 'k'],
  ]);
  g.g.plot(g.loose);
  // bright wing veins
  for (const [x, y] of [
    [3, 3],
    [5, 5],
    [12, 3],
    [10, 5],
  ] as const) {
    if (g.g.get(x, y) === '6') g.g.set(x, y, '7');
  }
  // hover just above the ground
  return lift(g.g.rows(), -HOVER);
}

export const BRAMBLE_PIXIE: SpriteTemplate = enemyTemplate('bramble-pixie', W, W, ANCHOR, {
  idle: [pixieFrame({ wing: 1, stick: 0 }), pixieFrame({ wing: 0, stick: 0, bob: 1 })],
  walk: [pixieFrame({ wing: 0, stick: 0, bob: 1 }), pixieFrame({ wing: 1, stick: 1 })],
  attack: [
    pixieFrame({ wing: 1, stick: 1 }),
    pixieFrame({ wing: 2, stick: 2 }),
    pixieFrame({ wing: 1, stick: 0 }),
  ],
});

// ---------------------------------------------------------------- Ancient Treant (elite 24x24)
// A gnarled walking tree: a wide root base, a thick bark trunk with a glowing-eyed face, a
// Y-shaped branching crown of leaf clumps, and two low branch arms held forward at chest height
// (never overhead). `attack` pulls the arms back, then thrusts them forward.
// Colors: 1 W V 5 L N 6 7 e = 9.

const TW = 24;

interface TreantPose {
  readonly bob?: number;
  /** Arm reach: -1 pulled back, 0 resting, 1 thrust forward. */
  readonly arm: -1 | 0 | 1;
  readonly sway?: number;
  readonly mouth?: boolean;
  readonly roots?: 0 | 1;
}

function treantFrame(p: TreantPose): string[] {
  const d: Draft = draft(TW, TW);
  const bob = p.bob ?? 0;
  const sw = p.sway ?? 0;
  // wide root base
  const r = p.roots ?? 0;
  stroke(
    d,
    [
      [11, 19],
      [3 - r, 22],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [12, 19],
      [8, 22],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [14, 19],
      [17 + r, 22],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [15, 19],
      [21, 21],
    ],
    'W',
    2,
  );
  // trunk, wider at the base
  for (let y = 9 + bob; y <= 19; y++) {
    const half = 3 + Math.floor((y - 9) / 4);
    for (let x = 12 - half; x <= 12 + half; x++) d.g.set(x, y, x > 12 + half - 2 ? 'W' : 'V');
  }
  // the Y of branches above the trunk
  stroke(
    d,
    [
      [12, 10 + bob],
      [12, 6 + bob],
      [7 + sw, 3 + bob],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [12, 7 + bob],
      [17 - sw, 3 + bob],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [8 + sw, 5 + bob],
      [4 + sw, 6 + bob],
    ],
    'W',
    1,
  );
  stroke(
    d,
    [
      [16 - sw, 5 + bob],
      [20 - sw, 6 + bob],
    ],
    'W',
    1,
  );
  // leaf clumps on the branch tips
  ellipse(d, 6 + sw, 3 + bob, 2.5, 1.5, 'L');
  ellipse(d, 18 - sw, 3 + bob, 2.5, 1.5, 'L');
  ellipse(d, 12, 3 + bob, 1, 1, 'L');
  ellipse(d, 3 + sw, 7 + bob, 1.5, 1, 'L');
  ellipse(d, 21 - sw, 7 + bob, 1.5, 1, 'L');
  // moss on the shoulders
  dots(d, [
    [9, 10 + bob, '5'],
    [10, 10 + bob, '5'],
    [14, 10 + bob, '5'],
    [15, 11 + bob, '5'],
    [9, 16, '5'],
    [10, 17, '5'],
  ]);
  // face: glowing eyes and a hollow mouth
  dots(d, [
    [9, 12 + bob, '6'],
    [10, 12 + bob, '6'],
    [13, 12 + bob, '6'],
    [14, 12 + bob, '6'],
    [9, 13 + bob, '7'],
    [13, 13 + bob, '7'],
  ]);
  if (p.mouth) {
    put(d, ['eeee', 'eeee'], 10, 15 + bob);
  } else {
    put(d, ['eee'], 10, 15 + bob);
  }
  // branch arms at chest height, held forward (left)
  const ax = p.arm === 1 ? 0 : p.arm === 0 ? 2 : 5;
  stroke(
    d,
    [
      [8, 14],
      [ax + 3, 15],
      [ax, 16],
    ],
    'W',
    2,
  );
  stroke(
    d,
    [
      [ax, 16],
      [ax - 1, 14],
    ],
    'W',
    1,
  );
  stroke(
    d,
    [
      [ax, 16],
      [ax - 1, 18],
    ],
    'W',
    1,
  );
  d.g.rect(0, TW - 1, TW, 1, '.');
  return finish(d);
}

export const ANCIENT_TREANT: SpriteTemplate = enemyTemplate(
  'ancient-treant',
  TW,
  TW,
  { x: 12, y: 23 },
  {
    idle: [treantFrame({ arm: 0 }), treantFrame({ arm: 0, bob: 1, sway: 1 })],
    walk: [
      treantFrame({ arm: 0, roots: 1, sway: 1 }),
      treantFrame({ arm: 0, bob: 1, roots: 0, sway: -1 }),
    ],
    attack: [
      treantFrame({ arm: -1, bob: 1 }),
      treantFrame({ arm: 1, mouth: true, sway: 1 }),
      treantFrame({ arm: 0 }),
    ],
  },
);

/** Stage 5 regular enemies, id -> template. */
export const ENEMIES_STAGE5: Readonly<Record<string, SpriteTemplate>> = {
  'thorn-sprout': THORN_SPROUT,
  'moss-wolf': MOSS_WOLF,
  'bramble-pixie': BRAMBLE_PIXIE,
  'ancient-treant': ANCIENT_TREANT,
};
