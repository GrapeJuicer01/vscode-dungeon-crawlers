// Stage 4 "Ancient Catacombs" regular enemies (batch E2, step A-E2-5). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: bone-soldier, wailing-ghost, tomb-scarab, crypt-mummy.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row, idle 2 / walk 2 /
// attack 3; no hit or dissolve art (engine flash and dissolve). Characters: the stage's `1`
// outline and `2 4 5 7 8` (recolored by STAGE_PALETTES['ancient-catacombs']) plus master accents;
// at most 12 colors per sprite. Silhouettes: soldier a tilted skeleton with a dented helmet,
// round shield and rusty sword; ghost a tall sheet with raised stub arms and a ragged trailing
// hem; scarab a low flat gold beetle with a horn and spread legs; mummy a bandaged shuffler with
// forward arms and one trailing wrap. The soldier differs from the Necromancer's skeleton summon
// (helmet, shield, rusty sword, amber eyes, lean) and the ghost from the Cave Bat (tall and
// pale versus a dark wide-winged flyer).

import {
  dots,
  draft,
  ellipse,
  enemyTemplate,
  finish,
  looseDots,
  looseLine,
  put,
  stroke,
} from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

type Pt = readonly [number, number];
const W = 16;
const ANCHOR = { x: 8, y: 15 };

// ---------------------------------------------------------------- Bone Soldier (16x16)
// Skeleton in a dented iron helmet, a round wooden shield in front, and a rusty short sword
// behind. Amber eyes. Colors: 1 7 5 G P Y R D k e = 10.

interface SoldierPose {
  readonly bob?: number;
  readonly legs: 0 | 1 | 2;
  /** Sword: tip point; the hand is fixed behind the torso. */
  readonly sword: 'carry' | 'raised' | 'swing';
  readonly shield?: number; // shield shift (negative = forward)
  readonly mouth?: boolean;
}

function soldierFrame(p: SoldierPose): string[] {
  const d = draft(W, W);
  const bob = p.bob ?? 0;
  const sh = p.shield ?? 0;
  // torso: neck, ribcage and pelvis
  put(d, ['.77.', '7777', '5775', '7777', '.55.'], 6, 8 + bob);
  // helmet (dented, with a brim) over a skull with amber eyes and teeth
  put(d, ['..GGGG.', '.GGGGGG', 'GGPGGGG', 'PPPPPPP'], 3, 1 + bob);
  put(d, ['eY7eY7', '777777', '.5757.'], 4, 5 + bob);
  if (p.mouth) put(d, ['.eeee.'], 4, 7 + bob);
  // sword arm and sword
  const hand: Pt = [12, 9 + bob];
  const tip: Pt = p.sword === 'raised' ? [12, 0] : p.sword === 'swing' ? [1, 13] : [14, 3 + bob];
  const handP: Pt = p.sword === 'swing' ? [6, 11] : hand;
  stroke(d, [[10, 10 + bob], handP], '7', 1);
  stroke(d, [handP, tip], 'R', 1);
  dots(d, [
    [handP[0], handP[1], 'k'],
    [tip[0], tip[1], 'D'],
  ]);
  // shield (front, round)
  put(d, ['.PPPP.', 'PkkkkP', 'PkGGkP', 'PkGGkP', 'PkkkkP', '.PPPP.'], 0 + sh, 8 + bob);
  d.g.rect(0, 15, W, 1, '.');
  const out = finish(d);
  // thin bone legs, loose (not outlined)
  const g = draft(W, W);
  g.g.blit(out, 0, 0);
  const legsets: Pt[][][] = [
    [
      [
        [7, 13],
        [7, 15],
      ],
      [
        [9, 13],
        [9, 15],
      ],
    ],
    [
      [
        [7, 13],
        [5, 15],
      ],
      [
        [9, 13],
        [11, 15],
      ],
    ],
    [
      [
        [7, 13],
        [8, 15],
      ],
      [
        [10, 13],
        [10, 15],
      ],
    ],
  ];
  for (const leg of legsets[p.legs] ?? []) {
    looseLine(g, leg, '7');
    const foot = leg[leg.length - 1];
    if (foot)
      looseDots(g, [
        [foot[0] - 1, foot[1], 'P'],
        [foot[0], foot[1], 'P'],
      ]);
  }
  g.g.plot(g.loose);
  return g.g.rows();
}

export const BONE_SOLDIER: SpriteTemplate = enemyTemplate('bone-soldier', W, W, ANCHOR, {
  idle: [
    soldierFrame({ legs: 0, sword: 'carry' }),
    soldierFrame({ legs: 0, sword: 'carry', bob: 1 }),
  ],
  walk: [
    soldierFrame({ legs: 1, sword: 'carry', bob: 1 }),
    soldierFrame({ legs: 2, sword: 'carry' }),
  ],
  attack: [
    soldierFrame({ legs: 0, sword: 'raised', shield: 1 }),
    soldierFrame({ legs: 1, sword: 'swing', shield: 0, mouth: true }),
    soldierFrame({ legs: 0, sword: 'carry' }),
  ],
});

// ---------------------------------------------------------------- Wailing Ghost (16x16)
// A tall tattered sheet: round head, hollow eyes, a big open wailing mouth, little stub arms raised
// on both sides and a ragged hem trailing back. Pale blue-white. Colors: 1 w q Q e = 5.

interface GhostPose {
  readonly bob?: number;
  readonly hem: 0 | 1 | 2;
  readonly arms: 'low' | 'up';
  readonly mouth: 0 | 1 | 2;
  readonly lean?: number;
  readonly wail?: boolean;
}

function ghostFrame(p: GhostPose): string[] {
  const d = draft(W, W);
  const bob = p.bob ?? 0;
  const lean = p.lean ?? 0;
  // body: a slim teardrop sheet, rounded head, narrowing to a tail that curls back to the right
  put(
    d,
    [
      '.wwww.....',
      'wwwwww....',
      'wwwwwwww..',
      'wwwwwwww..',
      'wwwwwwww..',
      'wwwwwwww..',
      'wwwwwwww..',
      '.wwwwwww..',
      '.wwwwwww..',
      '..wwwwww..',
      '..wwwwwww.',
      '...wwwwwww',
      '....wwwwww',
    ],
    4 + lean - 1,
    1 + bob,
  );
  // shade on the right side
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) if (d.g.get(x, y) === 'w' && x >= 9 + lean) d.g.set(x, y, 'q');
  // ragged hem tails
  const hemRows: string[] = ['.......www.w', '......www..w', '.......ww.ww'];
  put(d, [hemRows[p.hem] ?? hemRows[0] ?? ''], 3 + lean, 14 + bob);
  // trailing tail wisp to the right
  dots(d, [
    [14 + lean, 12 + bob, 'Q'],
    [15 + lean, 12 + bob, 'Q'],
  ]);
  // stub arms
  if (p.arms === 'up') {
    put(d, ['ww', 'w.'], 1 + lean, 5 + bob);
    put(d, ['ww', '.w'], 11 + lean, 4 + bob);
    dots(d, [
      [1 + lean, 4 + bob, 'w'],
      [12 + lean, 3 + bob, 'q'],
    ]);
  } else {
    put(d, ['ww', 'ww'], 1 + lean, 8 + bob);
    put(d, ['ww', 'ww'], 11 + lean, 8 + bob);
  }
  // face: hollow eyes and a wailing mouth
  dots(d, [
    [3 + lean, 3 + bob, 'e'],
    [3 + lean, 4 + bob, 'e'],
    [6 + lean, 3 + bob, 'e'],
    [6 + lean, 4 + bob, 'e'],
  ]);
  const mouths: string[][] = [
    ['ee', 'ee'],
    ['eee', 'eee', '.e.'],
    ['eeee', 'eeee', 'eeee', '.ee.'],
  ];
  const m = mouths[p.mouth] ?? [];
  put(d, m, 3 + lean, 6 + bob);
  d.g.rect(0, 15, W, 1, '.');
  const out = finish(d);
  if (!p.wail) return out;
  const g = draft(W, W);
  g.g.blit(out, 0, 0);
  g.loose.push([0, 6, 'q'], [0, 8, 'q'], [0, 10, 'Q'], [1, 3, 'Q'], [0, 4, 'q'], [0, 12, 'Q']);
  g.g.plot(g.loose);
  return g.g.rows();
}

export const WAILING_GHOST: SpriteTemplate = enemyTemplate('wailing-ghost', W, W, ANCHOR, {
  idle: [
    ghostFrame({ hem: 0, arms: 'low', mouth: 0 }),
    ghostFrame({ hem: 1, arms: 'low', mouth: 0, bob: -1 }),
  ],
  walk: [
    ghostFrame({ hem: 1, arms: 'low', mouth: 1, lean: -1, bob: -1 }),
    ghostFrame({ hem: 2, arms: 'up', mouth: 1 }),
  ],
  attack: [
    ghostFrame({ hem: 0, arms: 'up', mouth: 1, bob: 1 }),
    ghostFrame({ hem: 2, arms: 'up', mouth: 2, bob: -1, wail: true }),
    ghostFrame({ hem: 1, arms: 'low', mouth: 1 }),
  ],
});

// ---------------------------------------------------------------- Tomb Scarab (16x16)
// A flat golden beetle: segmented shell with a split line, a violet gem on the back, a horned
// head, small pale wing tips folded at the rear, six spread legs. Low and wide.
// Colors: 1 a Y O k e 8 q = 8.

function scarabFrame(
  leg: 0 | 1,
  opts: { bob?: number; open?: boolean; dx?: number; wings?: boolean } = {},
): string[] {
  const d = draft(W, W);
  const bob = opts.bob ?? 0;
  const dx = opts.dx ?? 0;
  // shell: a flat dome
  ellipse(d, 9 + dx, 11 + bob, 6.5, 2.6, 'a');
  d.g.rect(0, 13, W, 3, '.');
  // head with a short horn, and eye
  put(d, ['aaa', 'aaaa', 'aaaa'], 2 + dx, 10 + bob);
  put(d, ['OO', 'OO', 'O.'], 1 + dx, 6 + bob);
  dots(d, [
    [3 + dx, 9 + bob, 'e'],
    [4 + dx, 9 + bob, 'Y'],
  ]);
  // mandibles
  dots(d, [
    [1 + dx, 11 + bob, 'k'],
    [0 + dx, opts.open ? 10 + bob : 12 + bob, 'k'],
    [1 + dx, 12 + bob, 'k'],
  ]);
  // shell highlight, split line, segment arcs and a violet gem
  put(d, ['YYYYY'], 6 + dx, 8 + bob);
  for (let y = 8; y <= 12; y++) dots(d, [[10 + dx, y + bob, 'O']]);
  dots(d, [
    [7 + dx, 9 + bob, 'O'],
    [7 + dx, 10 + bob, 'O'],
    [13 + dx, 9 + bob, 'O'],
    [13 + dx, 10 + bob, 'O'],
    [8 + dx, 9 + bob, '8'],
    [9 + dx, 9 + bob, '8'],
    [8 + dx, 10 + bob, '8'],
  ]);
  // small pale wing tips peeking out at the rear
  dots(
    d,
    opts.wings
      ? [
          [14 + dx, 7 + bob, 'q'],
          [15 + dx, 8 + bob, 'q'],
          [14 + dx, 8 + bob, 'q'],
        ]
      : [
          [14 + dx, 8 + bob, 'q'],
          [15 + dx, 9 + bob, 'q'],
        ],
  );
  const out = finish(d);
  const g = draft(W, W);
  g.g.blit(out, 0, 0);
  const xs = leg === 0 ? [4, 8, 12] : [5, 9, 13];
  for (const x of xs) {
    const sign = x < 8 ? -1 : 1;
    looseLine(
      g,
      [
        [x + dx, 13 + bob],
        [x + dx + sign, 14],
        [x + dx + sign * 2, 15],
      ],
      'k',
    );
  }
  g.g.plot(g.loose);
  return g.g.rows();
}

export const TOMB_SCARAB: SpriteTemplate = enemyTemplate('tomb-scarab', W, W, ANCHOR, {
  idle: [scarabFrame(0), scarabFrame(0, { bob: 1, wings: true })],
  walk: [scarabFrame(0, { bob: 1 }), scarabFrame(1)],
  attack: [
    scarabFrame(0, { bob: 1, dx: 1 }),
    scarabFrame(1, { open: true, dx: -1, wings: true }),
    scarabFrame(0),
  ],
});

// ---------------------------------------------------------------- Crypt Mummy (elite 24x24)
// A bandaged shuffler leaning forward: glowing eyes in a dark gap, bands across the body, two
// arms reaching forward at chest height (no raised fists), one loose wrap trailing behind.
// Colors: 1 7 5 2 e Y 8 = 7.

const MW = 24;

interface MummyPose {
  readonly bob?: number;
  readonly legs: 0 | 1 | 2;
  readonly arms: 'out' | 'back' | 'lunge';
  readonly lean?: number;
  readonly wrap?: 0 | 1;
  readonly mouth?: boolean;
}

/** Fills a rectangle with the bandage placeholder `x` (striped later by `wrapBands`). */
function body(d: ReturnType<typeof draft>, x: number, y: number, w: number, h: number): void {
  d.g.rect(x, y, w, h, 'x');
}

/** Turns every placeholder into the bandage pattern: light wraps with diagonal darker seams. */
function wrapBands(d: ReturnType<typeof draft>): void {
  for (let y = 0; y < d.g.h; y++)
    for (let x = 0; x < d.g.w; x++)
      if (d.g.get(x, y) === 'x') d.g.set(x, y, (y + Math.floor(x / 3)) % 3 === 0 ? '5' : '7');
}

function mummyFrame(p: MummyPose): string[] {
  const d = draft(MW, MW);
  const bob = p.bob ?? 0;
  const lean = p.lean ?? 0;
  // legs (wrapped) with long feet pointing forward
  const lx = p.legs === 0 ? [8, 13] : p.legs === 1 ? [6, 14] : [9, 11];
  for (const x of lx) {
    body(d, x + lean, 17, 4, 6);
    body(d, x + lean - 3, 21, 7, 2);
  }
  // torso, narrower at the waist
  body(d, 6 + lean, 9 + bob, 10, 9);
  body(d, 7 + lean, 18 + bob, 8, 1);
  // head: a round wrapped skull with a dark gap for the eyes
  ellipse(d, 10 + lean, 5 + bob, 4, 4, 'x');
  for (let x = 5 + lean; x <= 15 + lean; x++)
    if (d.g.get(x, 5 + bob) === 'x') d.g.set(x, 5 + bob, '2');
  for (let x = 5 + lean; x <= 15 + lean; x++)
    if (d.g.get(x, 6 + bob) === 'x') d.g.set(x, 6 + bob, '2');
  // arms reach forward at chest height
  if (p.arms === 'out') {
    body(d, 0 + lean, 10 + bob, 8, 3);
    body(d, 3 + lean, 13 + bob, 5, 2);
  } else if (p.arms === 'back') {
    body(d, 3 + lean, 11 + bob, 5, 3);
  } else {
    body(d, 0, 12 + bob, 9, 3);
    body(d, 2, 15 + bob, 6, 2);
  }
  wrapBands(d);
  dots(d, [
    [7 + lean, 5 + bob, 'Y'],
    [8 + lean, 5 + bob, 'Y'],
    [11 + lean, 5 + bob, 'Y'],
    [12 + lean, 5 + bob, 'Y'],
  ]);
  if (p.mouth) put(d, ['eeee'], 7 + lean, 8 + bob);
  // a dark patch and a violet charm on the chest
  dots(d, [
    [11 + lean, 13 + bob, '8'],
    [10 + lean, 13 + bob, '8'],
    [10 + lean, 14 + bob, '2'],
  ]);
  d.g.rect(0, 23, MW, 1, '.');
  const out = finish(d);
  // trailing wrap
  const g = draft(MW, MW);
  g.g.blit(out, 0, 0);
  const wr: Pt[] =
    p.wrap === 1
      ? [
          [16 + lean, 11 + bob],
          [18 + lean, 13 + bob],
          [20 + lean, 14 + bob],
          [21 + lean, 17 + bob],
          [20 + lean, 20 + bob],
        ]
      : [
          [16 + lean, 11 + bob],
          [19 + lean, 12 + bob],
          [21 + lean, 15 + bob],
          [20 + lean, 18 + bob],
          [21 + lean, 21 + bob],
        ];
  looseLine(g, wr, '7');
  looseLine(
    g,
    wr.map((q) => [q[0], q[1] + 1] as Pt),
    '5',
  );
  g.g.plot(g.loose);
  return g.g.rows();
}

export const CRYPT_MUMMY: SpriteTemplate = enemyTemplate(
  'crypt-mummy',
  MW,
  MW,
  { x: 12, y: 23 },
  {
    idle: [
      mummyFrame({ legs: 0, arms: 'out' }),
      mummyFrame({ legs: 0, arms: 'out', bob: 1, wrap: 1 }),
    ],
    walk: [
      mummyFrame({ legs: 1, arms: 'out', bob: 1, wrap: 1 }),
      mummyFrame({ legs: 2, arms: 'out', wrap: 0 }),
    ],
    attack: [
      mummyFrame({ legs: 0, arms: 'back', lean: 1, wrap: 1 }),
      mummyFrame({ legs: 1, arms: 'lunge', lean: 0, mouth: true }),
      mummyFrame({ legs: 0, arms: 'out' }),
    ],
  },
);

/** Stage 4 regular enemies, id -> template. */
export const ENEMIES_STAGE4: Readonly<Record<string, SpriteTemplate>> = {
  'bone-soldier': BONE_SOLDIER,
  'wailing-ghost': WAILING_GHOST,
  'tomb-scarab': TOMB_SCARAB,
  'crypt-mummy': CRYPT_MUMMY,
};
