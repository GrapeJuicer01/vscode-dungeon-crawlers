// Stage 2 "Goblin Mine Shafts" regular enemies (batch E1, step A-E1-5). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: goblin-miner, goblin-scout, ore-beetle, rock-golem.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row, idle 2 / walk 2 /
// attack 3; no hit or death art (engine flash and dissolve). Characters: the stage's `1` outline and
// `2 3 4 5 6 7 8` (recolored by STAGE_PALETTES['goblin-mine-shafts']) plus master accents; at most
// 12 colors per sprite. Silhouettes: miner upright with a pickaxe and long ears; scout leaning and
// stretched with trailing ears; beetle a low wide dome; golem a compact blocky stack of rocks.

import {
  dots,
  draft,
  ellipse,
  enemyTemplate,
  finish,
  looseLine,
  put,
  stroke,
} from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

type Pt = readonly [number, number];
const W = 16;
const ANCHOR = { x: 8, y: 15 };

// ---------------------------------------------------------------- Goblin Miner (16x16)
// Green goblin, big pointed ears, a gray helmet with a yellow lamp, a pickaxe over the shoulder.
// Colors: 1 N L m 6 e w 5 2 k = 10.

interface Pick {
  readonly hand: Pt;
  readonly tip: Pt;
  readonly head: readonly Pt[];
}
const PICK_CARRY: Pick = {
  hand: [8, 11],
  tip: [12, 4],
  head: [
    [10, 3],
    [11, 3],
    [12, 3],
    [13, 3],
    [14, 4],
    [10, 4],
  ],
};
const PICK_RAISED: Pick = {
  hand: [8, 11],
  tip: [11, 3],
  head: [
    [9, 2],
    [10, 2],
    [11, 1],
    [12, 2],
    [13, 2],
    [14, 3],
  ],
};
const PICK_SWING: Pick = {
  hand: [7, 12],
  tip: [2, 12],
  head: [
    [1, 9],
    [1, 10],
    [1, 11],
    [1, 12],
    [1, 13],
    [2, 14],
  ],
};

function minerFrame(
  legs: readonly [number, number],
  pick: Pick,
  opts: { bob?: number; open?: boolean; lampBlink?: boolean } = {},
): string[] {
  const d = draft(W, W);
  const bob = opts.bob ?? 0;
  // legs and boots
  for (const x of legs) {
    dots(d, [
      [x, 13, 'N'],
      [x + 1, 13, 'N'],
      [x, 14, 'k'],
      [x + 1, 14, 'k'],
      [x - 1, 14, 'k'],
    ]);
  }
  // torso: timber-colored tunic with a belt
  put(d, ['.5555.', '.5555.', '.2222.'], 4, 10 + bob);
  // arm holding the pick
  dots(d, [
    [7, 11 + bob, 'N'],
    [8, 11 + bob, 'N'],
  ]);
  // head, big ears, nose
  put(d, ['.NNNNN.', 'NLNNNNN', 'NNNNNNN', 'LNNNNNN', '.NNNNN.'], 2, 5 + bob);
  dots(d, [
    [9, 6 + bob, 'N'],
    [10, 5 + bob, 'N'],
    [11, 4 + bob, 'L'],
    [9, 7 + bob, 'N'],
    [10, 7 + bob, 'N'],
  ]);
  dots(d, [
    [1, 8 + bob, 'L'],
    [4, 7 + bob, 'e'],
    [4, 8 + bob, 'e'],
    [5, 7 + bob, 'w'],
    [5, 8 + bob, 'w'],
  ]);
  // helmet and lamp
  put(d, ['.mmmmm.', 'mmmmmmm'], 2, 3 + bob);
  dots(d, [
    [2, 4 + bob, 'm'],
    [1, 4 + bob, opts.lampBlink ? '6' : '6'],
    [1, 3 + bob, '6'],
  ]);
  if (opts.open)
    dots(d, [
      [2, 9 + bob, 'e'],
      [3, 9 + bob, 'e'],
      [3, 10 + bob, 'w'],
    ]);
  // pickaxe: handle then head
  stroke(d, [pick.hand, pick.tip], 'k', 1);
  dots(
    d,
    pick.head.map((p) => [p[0], p[1], 'm'] as const),
  );
  return finish(d);
}

export const GOBLIN_MINER: SpriteTemplate = enemyTemplate('goblin-miner', W, W, ANCHOR, {
  idle: [minerFrame([5, 8], PICK_CARRY), minerFrame([5, 8], PICK_CARRY, { bob: 1 })],
  walk: [minerFrame([4, 8], PICK_CARRY, { bob: 1 }), minerFrame([6, 9], PICK_CARRY)],
  attack: [
    minerFrame([5, 8], PICK_RAISED, { bob: 1 }),
    minerFrame([5, 9], PICK_SWING, { open: true }),
    minerFrame([5, 8], PICK_CARRY),
  ],
});

// ---------------------------------------------------------------- Goblin Scout (16x16)
// Lean goblin sprinting forward: head and chest low, long ears streaming back, leather vest.
// Colors: 1 N L 4 3 e w m k = 9.

function scoutFrame(
  stride: 0 | 1 | 2,
  opts: { dx?: number; open?: boolean; knife?: boolean; bob?: number } = {},
): string[] {
  const d = draft(W, W);
  const dx = opts.dx ?? 0;
  const bob = opts.bob ?? 0;
  // long ears streaming back
  stroke(
    d,
    [
      [8 + dx, 6 + bob],
      [11 + dx, 4 + bob],
      [14, 3 + bob],
    ],
    'N',
    1,
  );
  stroke(
    d,
    [
      [8 + dx, 7 + bob],
      [12 + dx, 6 + bob],
      [14, 6 + bob],
    ],
    'N',
    1,
  );
  dots(d, [
    [14, 3 + bob, 'L'],
    [14, 6 + bob, 'L'],
  ]);
  // leaning torso (vest), head forward
  put(d, ['..4444...', '.433333..', '.3333333.'], 4 + dx, 9 + bob);
  put(d, ['.NNNNN', 'NLNNNN', 'NNNNNN', '.NNNN.'], 2 + dx, 5 + bob);
  dots(d, [
    [1 + dx, 8 + bob, 'L'],
    [3 + dx, 7 + bob, 'e'],
    [3 + dx, 8 + bob, 'e'],
    [4 + dx, 7 + bob, 'w'],
    [4 + dx, 8 + bob, 'w'],
  ]);
  if (opts.open)
    dots(d, [
      [2 + dx, 9 + bob, 'e'],
      [3 + dx, 9 + bob, 'e'],
    ]);
  // legs: long stride (two poses) with boots
  const legsets: Pt[][] = [
    [
      [6, 12],
      [5, 13],
      [3, 14],
    ],
    [
      [8, 12],
      [9, 13],
      [11, 14],
    ],
  ];
  const legsB: Pt[][] = [
    [
      [6, 12],
      [6, 13],
      [6, 14],
    ],
    [
      [8, 12],
      [8, 13],
      [9, 14],
    ],
  ];
  const useSet =
    stride === 0
      ? legsB
      : stride === 1
        ? legsets
        : [
            [
              [6, 12],
              [4, 13],
              [2, 14],
            ] as Pt[],
            [
              [8, 12],
              [10, 13],
              [12, 14],
            ] as Pt[],
          ];
  for (const leg of useSet) stroke(d, leg, 'N', 1);
  for (const leg of useSet) {
    const foot = leg[leg.length - 1];
    if (foot)
      dots(d, [
        [foot[0], foot[1], 'k'],
        [foot[0] - 1, foot[1], 'k'],
      ]);
  }
  // arm and optional knife
  stroke(
    d,
    [
      [8 + dx, 10 + bob],
      [11, 11 + bob],
    ],
    'N',
    1,
  );
  if (opts.knife) {
    stroke(
      d,
      [
        [2, 11],
        [5, 11],
      ],
      'm',
      1,
    );
    dots(d, [[5, 11, 'N']]);
  }
  return finish(d);
}

export const GOBLIN_SCOUT: SpriteTemplate = enemyTemplate('goblin-scout', W, W, ANCHOR, {
  idle: [scoutFrame(0), scoutFrame(0, { bob: 1 })],
  walk: [scoutFrame(1), scoutFrame(2, { bob: 1 })],
  attack: [
    scoutFrame(0, { dx: 1, bob: 1 }),
    scoutFrame(2, { open: true, knife: true }),
    scoutFrame(1, { open: true }),
  ],
});

// ---------------------------------------------------------------- Ore Beetle (16x16)
// Round indigo shell crusted with teal ore crystals, big eyes, small mandibles, six stubby legs.
// Low and wide. Colors: 1 b d 8 7 Y e k P = 9.

function beetleFrame(
  leg: 0 | 1,
  opts: { dx?: number; bob?: number; open?: boolean; glint?: boolean } = {},
): string[] {
  const d = draft(W, W);
  const dx = opts.dx ?? 0;
  const bob = opts.bob ?? 0;
  // shell dome, shade, highlight
  ellipse(d, 8 + dx, 9 + bob, 6, 4, 'b');
  d.g.rect(0, 13, W, 3, '.');
  put(d, ['dddd', 'dd'], 6 + dx, 5 + bob);
  put(d, ['bbbbbbbbbb'], 3 + dx, 12);
  // head with eyes and mandibles
  put(d, ['.bbb', 'bbbb', 'bbbb'], 1 + dx, 8 + bob);
  dots(d, [
    [2 + dx, 9 + bob, 'e'],
    [3 + dx, 9 + bob, 'Y'],
    [2 + dx, 10 + bob, 'Y'],
    [3 + dx, 10 + bob, 'Y'],
  ]);
  dots(d, [
    [1 + dx, 11 + bob, 'k'],
    [2 + dx, opts.open ? 12 + bob : 11 + bob, 'k'],
  ]);
  // shell split line and ore crystals
  for (let y = 5; y <= 11; y++) dots(d, [[9 + dx, y + bob, '2']]);
  dots(d, [
    [11 + dx, 6 + bob, '8'],
    [11 + dx, 7 + bob, '8'],
    [12 + dx, 7 + bob, '8'],
    [12 + dx, 8 + bob, '8'],
    [6 + dx, 7 + bob, '8'],
    [6 + dx, 8 + bob, '8'],
    [5 + dx, 8 + bob, '8'],
  ]);
  dots(d, [
    [11 + dx, 5 + bob, opts.glint ? 'w' : '7'],
    [6 + dx, 6 + bob, opts.glint ? '7' : '8'],
  ]);
  const out = finish(d);
  // six loose legs below the shell
  const g = draft(W, W);
  g.g.blit(out, 0, 0);
  const xs = leg === 0 ? [4, 8, 12] : [5, 9, 11];
  for (const x of xs)
    looseLine(
      g,
      [
        [x + dx, 13],
        [x + dx + (x < 8 ? -1 : 1), 15],
      ],
      'P',
    );
  g.g.plot(g.loose);
  return g.g.rows();
}

export const ORE_BEETLE: SpriteTemplate = enemyTemplate('ore-beetle', W, W, ANCHOR, {
  idle: [beetleFrame(0), beetleFrame(0, { bob: 1, glint: true })],
  walk: [beetleFrame(0, { bob: 1 }), beetleFrame(1)],
  attack: [
    beetleFrame(0, { bob: 1 }),
    beetleFrame(1, { open: true }),
    beetleFrame(0, { glint: true }),
  ],
});

// ---------------------------------------------------------------- Rock Golem (elite 24x24)
// Stacked rocks: a big blocky head with a mossy top, glowing yellow eyes, a square torso, thick
// arms, and two stump legs. Compact (no fists above the head). Colors: 1 G P m N Y O 3 = 8.

const GW = 24;

function golemFrame(
  legs: 0 | 1 | 2,
  opts: { bob?: number; nearArm?: 'down' | 'back' | 'slam'; mouth?: boolean; dx?: number } = {},
): string[] {
  const d = draft(GW, GW);
  const bob = opts.bob ?? 0;
  const dx = opts.dx ?? 0;
  // legs: two stumps
  const lx = legs === 0 ? [7, 13] : legs === 1 ? [6, 14] : [8, 12];
  for (const x of lx) {
    put(d, ['PPPPP', 'GGGGP', 'GGGGP', 'PPPPP'], x + dx, 19);
  }
  // torso: layered rock slab with highlights
  put(
    d,
    [
      '..GGGGGGGGGGGG..',
      '.GmmGGGGGGGGGPP.',
      'GGmGGGGGGGGGGGPP',
      'GGGGGGGGGGGPPGPP',
      'GGGGGPPGGGGGGPPP',
      'GGGGGGGGGGGGPPPP',
      '.GGGGGGGGGGPPPP.',
      '..PPPPPPPPPPPP..',
    ],
    4 + dx,
    10 + bob,
  );
  // head: wide block, moss on top, glowing eyes, a nose ledge
  put(
    d,
    [
      '..NNNN.N..',
      '.GGNGGGGG.',
      'GmmGGGGGGG',
      'GGGGGGGGGP',
      'GGYYGYYGGP',
      'GGYOGYOGGP',
      'GGGGGGGGPP',
      '.GGPPPPPP.',
    ],
    3 + dx,
    2 + bob,
  );
  dots(d, [
    [3 + dx, 6 + bob, 'G'],
    [2 + dx, 7 + bob, 'G'],
    [2 + dx, 8 + bob, 'P'],
  ]);
  if (opts.mouth) put(d, ['.1111.', '.1PP1.'], 5 + dx, 8 + bob);
  // far arm (behind, right) and near arm (front, left)
  put(d, ['PPP', 'PPP', 'PPP', 'PPP', 'PPP', 'PPP'], 19 + dx, 11 + bob);
  const arm = opts.nearArm ?? 'down';
  if (arm === 'down') {
    put(d, ['GGG.', 'GGGG', 'GmGG', 'GGGG', 'GGGP', 'GGGP', 'PPPP'], 1 + dx, 11 + bob);
  } else if (arm === 'back') {
    put(d, ['GGG', 'GGG', 'GGG', 'GGG', 'GGP'], 9 + dx, 9 + bob);
    put(d, ['GGG.', 'GGGG'], 3 + dx, 10 + bob);
  } else {
    put(d, ['GGGG', 'GGGG', 'GmGG', 'GGGG', 'GGGG', 'PPPP', 'PPPP'], 1 + dx, 15 + bob);
    put(d, ['GGG'], 3 + dx, 12 + bob);
  }
  d.g.rect(0, 23, GW, 1, '.');
  return finish(d);
}

export const ROCK_GOLEM: SpriteTemplate = enemyTemplate(
  'rock-golem',
  GW,
  GW,
  { x: 12, y: 23 },
  {
    idle: [golemFrame(0), golemFrame(0, { bob: 1 })],
    walk: [golemFrame(1, { bob: 1 }), golemFrame(2)],
    attack: [
      golemFrame(0, { nearArm: 'back', bob: 1 }),
      golemFrame(0, { nearArm: 'slam', mouth: true }),
      golemFrame(0, { nearArm: 'down' }),
    ],
  },
);

/** Stage 2 regular enemies, id -> template. */
export const ENEMIES_STAGE2: Readonly<Record<string, SpriteTemplate>> = {
  'goblin-miner': GOBLIN_MINER,
  'goblin-scout': GOBLIN_SCOUT,
  'ore-beetle': ORE_BEETLE,
  'rock-golem': ROCK_GOLEM,
};
