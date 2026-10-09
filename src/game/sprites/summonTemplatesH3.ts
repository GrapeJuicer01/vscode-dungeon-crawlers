// Summon sprites for H3 (batches A3-2 beast, A3-3 turret). Owned by the pixel-artist.
// Same convention as summonTemplates.ts (docs/design/sprite-spec.md section 9): one composite
// template, id `summons/<name>`, at most 24x24, at most 8 colours, master palette only, anchor on the
// foot pixel, faces right, no shadow (the engine draws it). Animations: idle 2, walk 4, attack 3,
// rise 4, sink 3 (rise and sink play once). No hurt, death, or downed names: a summon is a cosmetic
// ally and only enemies have health.
//
// Beast, 20x16, anchor (10, 15). A small friendly wolf cub. Colours (7): outline `o`, fur `h` with
// shade `W`, cream muzzle/belly/paw tips/tail tip `7`, eye and nose `e`, leaf collar `L`/`N`.
// `rise` sprouts up out of the floor in a small green leaf puff; `sink` goes down upright and thins
// into leaves. `attack` is a short playful snap. Never feral, never collapses, no red.
//
// Turret, 16x16, anchor (8, 15). A clockwork walker (a small copper dome on two stubby legs, a
// steel back cog, a teal-blue lens, a short steel barrel). Colours (7): outline `o`, copper `C` with
// shade `Z`, steel `m`, lens `Q` with glint `q`, muzzle pixel `Y`. Master characters only (the
// "teal" lens is the master light blue `Q`; no new master character was needed). `attack`: the
// barrel swivels up, levels with one pale `Y` muzzle pixel for one frame (no projectile, no beam),
// then settles. `rise` unfolds out of the floor with a hop of cog sparks; `sink` folds down into the
// floor. It never smokes, breaks, or shows red.

import { Grid } from './spriteBuilder';
import type { SpriteTemplate } from './spriteTypes';

type Puff = readonly (readonly [number, number, string])[];

/**
 * The finished figure sunk into the floor by `sink` rows (clipped at the ground line `ground`,
 * upright), a closing outline row at `ground + 1`, plus a puff. Shared by `rise` and `sink`.
 */
function floorFrame(
  full: Grid,
  w: number,
  h: number,
  ground: number,
  sink: number,
  puff: Puff,
): string[] {
  const g = new Grid(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = full.get(x, y);
      const ty = y + sink;
      if (ch !== '.' && ty <= ground) g.set(x, ty, ch);
    }
  }
  if (sink > 0) {
    for (let x = 0; x < w; x++) {
      if (g.get(x, ground) !== '.' && g.get(x, ground) !== 'o') g.set(x, ground + 1, 'o');
    }
  }
  for (const [x, y, ch] of puff) if (g.get(x, y) === '.') g.set(x, y, ch);
  return g.rows();
}

// ---- Beast ----

const BW = 20;
const BH = 16;
const BGROUND = 14;

interface BeastPose {
  /** Whole upper body down by this many rows (0 or 1). */
  bob: number;
  /** Whole upper body forward by this many columns. */
  dx: number;
  /** Extra head forward / down offsets (a lunge). */
  headDx: number;
  headDy: number;
  mouth: boolean;
  /** Tail style: 0 curled up, 1 high, 2 low. */
  tail: 0 | 1 | 2;
  /** Per leg [dx, length]: hindFar, hindNear, frontFar, frontNear. */
  legs: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
}

const STAND_LEGS: BeastPose['legs'] = [
  [0, 4],
  [0, 4],
  [0, 4],
  [0, 4],
];

function beast(p: BeastPose): Grid {
  const g = new Grid(BW, BH);
  const by = p.bob;
  const bx = p.dx;
  // legs first (the body covers their tops): [x, shade colour]
  const legX = [3, 6, 8, 11] as const;
  const legCol = ['W', 'h', 'W', 'h'] as const;
  p.legs.forEach(([ldx, len], i) => {
    const x = (legX[i] ?? 3) + ldx + (i >= 2 ? bx : 0);
    const col = legCol[i] ?? 'h';
    g.rect(x, 11, 2, len, col);
    if (len >= 4 && col === 'h') g.rect(x, 14, 2, 1, '7');
    if (len >= 4 && col === 'W') g.set(x, 14, '7');
  });
  // tail
  const tail =
    p.tail === 0
      ? [
          [2, 4, '7'],
          [2, 5, 'h'],
          [2, 6, 'h'],
          [3, 7, 'h'],
          [3, 8, 'h'],
        ]
      : p.tail === 1
        ? [
            [2, 3, '7'],
            [2, 4, 'h'],
            [2, 5, 'h'],
            [3, 6, 'h'],
            [3, 7, 'h'],
            [3, 8, 'h'],
          ]
        : [
            [1, 8, '7'],
            [2, 8, 'h'],
            [3, 8, 'h'],
            [3, 7, 'h'],
          ];
  for (const [x, y, ch] of tail) g.set((x as number) + bx, (y as number) + by, ch as string);
  // body
  const rows: [number, number, number][] = [
    [6, 4, 11],
    [7, 3, 11],
    [8, 3, 11],
    [9, 3, 11],
    [10, 4, 11],
  ];
  for (const [y, x0, x1] of rows) g.rect(x0 + bx, y + by, x1 - x0 + 1, 1, 'h');
  g.rect(4 + bx, 6 + by, 8, 1, 'W'); // back shade
  g.rect(5 + bx, 10 + by, 6, 1, '7'); // belly
  g.rect(3 + bx, 9 + by, 2, 1, 'W'); // rump shade
  // chest and neck
  g.rect(11 + bx, 5 + by, 3, 6, 'h');
  g.rect(12 + bx, 9 + by, 2, 2, '7'); // chest fur
  // head
  const hx = p.headDx + bx;
  const hy = p.headDy + by;
  g.rect(13 + hx, 3 + hy, 3, 1, 'h');
  g.rect(12 + hx, 4 + hy, 5, 1, 'h');
  g.rect(12 + hx, 5 + hy, 6, 1, 'h');
  g.rect(12 + hx, 6 + hy, 6, 3, 'h');
  g.rect(16 + hx, 6 + hy, 3, 3, '7'); // muzzle
  g.set(18 + hx, 6 + hy, 'e'); // nose
  g.set(15 + hx, 5 + hy, 'e'); // eye
  g.plot([
    [13 + hx, 1 + hy, 'W'],
    [16 + hx, 2 + hy, 'W'],
    [13 + hx, 2 + hy, 'h'],
    [14 + hx, 2 + hy, 'h'],
    [16 + hx, 3 + hy, 'h'],
  ]);
  if (p.mouth) {
    // open snap: dark gap under the muzzle with a cream tooth
    g.rect(16 + hx, 8 + hy, 3, 1, 'e');
    g.set(17 + hx, 7 + hy, 'W');
  }
  // leaf collar
  g.plot([
    [11 + bx, 8 + by, 'N'],
    [12 + bx, 8 + by, 'L'],
    [12 + bx, 9 + by, 'N'],
  ]);
  g.outline('o');
  return g;
}

const BEAST_POSES = {
  idle: [
    { bob: 0, dx: 0, headDx: 0, headDy: 0, mouth: false, tail: 0, legs: STAND_LEGS },
    {
      bob: 1,
      dx: 0,
      headDx: 0,
      headDy: 0,
      mouth: false,
      tail: 1,
      legs: [
        [0, 3],
        [0, 3],
        [0, 3],
        [0, 3],
      ],
    },
  ],
  walk: [
    {
      bob: 1,
      dx: 0,
      headDx: 0,
      headDy: 0,
      mouth: false,
      tail: 1,
      legs: [
        [1, 4],
        [-1, 3],
        [-1, 3],
        [1, 4],
      ],
    },
    { bob: 0, dx: 0, headDx: 0, headDy: 0, mouth: false, tail: 0, legs: STAND_LEGS },
    {
      bob: 1,
      dx: 0,
      headDx: 0,
      headDy: 0,
      mouth: false,
      tail: 1,
      legs: [
        [-1, 3],
        [1, 4],
        [1, 4],
        [-1, 3],
      ],
    },
    { bob: 0, dx: 0, headDx: 0, headDy: 0, mouth: false, tail: 0, legs: STAND_LEGS },
  ],
  attack: [
    {
      bob: 1,
      dx: -1,
      headDx: 0,
      headDy: 1,
      mouth: false,
      tail: 1,
      legs: [
        [0, 3],
        [0, 3],
        [0, 3],
        [0, 3],
      ],
    },
    {
      bob: 0,
      dx: 1,
      headDx: 1,
      headDy: 0,
      mouth: true,
      tail: 2,
      legs: [
        [0, 4],
        [0, 4],
        [1, 4],
        [1, 4],
      ],
    },
    { bob: 0, dx: 0, headDx: 0, headDy: 0, mouth: false, tail: 0, legs: STAND_LEGS },
  ],
} as const satisfies Record<string, readonly BeastPose[]>;

const B_PUFF_LOW: Puff = [
  [4, 13, 'N'],
  [5, 12, 'L'],
  [9, 13, 'L'],
  [10, 12, 'N'],
  [14, 13, 'N'],
  [15, 12, 'L'],
  [2, 14, 'N'],
  [17, 14, 'L'],
];
const B_PUFF_WIDE: Puff = [
  [2, 13, 'N'],
  [3, 12, 'L'],
  [16, 12, 'L'],
  [17, 13, 'N'],
  [1, 11, 'N'],
  [18, 11, 'N'],
  [5, 11, 'L'],
  [14, 11, 'L'],
];
const B_PUFF_RISE_3: Puff = [
  [2, 13, 'N'],
  [17, 13, 'N'],
  [18, 11, 'L'],
  [1, 12, 'L'],
];
const B_PUFF_SINK_1: Puff = [
  [2, 13, 'N'],
  [3, 12, 'L'],
  [16, 12, 'L'],
  [17, 13, 'N'],
];
const B_PUFF_SINK_2: Puff = [
  [2, 13, 'N'],
  [3, 12, 'L'],
  [4, 11, 'N'],
  [15, 11, 'N'],
  [16, 12, 'L'],
  [17, 13, 'N'],
  [6, 13, 'L'],
  [13, 13, 'L'],
];
const B_PUFF_SINK_3: Puff = [
  [3, 13, 'N'],
  [4, 12, 'L'],
  [7, 13, 'N'],
  [10, 12, 'L'],
  [13, 13, 'N'],
  [15, 12, 'L'],
  [6, 10, 'N'],
  [11, 9, 'L'],
  [9, 7, 'N'],
  [14, 10, 'L'],
  [4, 9, 'L'],
];

function buildBeast(): SpriteTemplate {
  const anim = (poses: readonly BeastPose[]): string[][] => poses.map((p) => beast(p).rows());
  const full = beast(BEAST_POSES.idle[0]);
  const ff = (sink: number, puff: Puff): string[] => floorFrame(full, BW, BH, BGROUND, sink, puff);
  return {
    id: 'summons/beast',
    w: BW,
    h: BH,
    anchor: { x: 10, y: 15 },
    animations: {
      idle: anim(BEAST_POSES.idle),
      walk: anim(BEAST_POSES.walk),
      attack: anim(BEAST_POSES.attack),
      rise: [ff(12, B_PUFF_LOW), ff(8, B_PUFF_WIDE), ff(3, B_PUFF_WIDE), ff(0, B_PUFF_RISE_3)],
      sink: [ff(3, B_PUFF_SINK_1), ff(8, B_PUFF_SINK_2), ff(13, B_PUFF_SINK_3)],
    },
  };
}

// ---- Turret ----

const TW = 16;
const TH = 16;
const TGROUND = 14;

interface TurretPose {
  /** Body down by this many rows (0 or 1). */
  bob: number;
  /** Cog frame: 0 or 1. */
  cog: 0 | 1;
  /** Lens closed (a blink). */
  blink: boolean;
  /** Barrel vertical offset: -1 up, 0 level, 1 down. */
  barrel: -1 | 0 | 1;
  /** One pale muzzle pixel at the barrel tip. */
  muzzle: boolean;
  /** Per leg [dx, lifted]: near-back leg, near-front leg. */
  legs: readonly [readonly [number, number], readonly [number, number]];
}

function turret(p: TurretPose): Grid {
  const g = new Grid(TW, TH);
  const by = p.bob;
  // legs: steel feet, copper-shade shins
  p.legs.forEach(([ldx, lift], i) => {
    const x = (i === 0 ? 5 : 9) + ldx;
    const len = 3 - lift;
    g.rect(x, 11, 2, len, 'Z');
    g.rect(x - 1, 11 + len, 3, 1, 'm');
  });
  // back cog
  g.blit(p.cog === 0 ? ['.mmm.', 'mmZmm', '.mmm.'] : ['m.m.m', '.mZm.', 'm.m.m'], 1, 3 + by);
  // barrel
  const bo = p.barrel;
  g.rect(12, 7 + by + bo, 3, 2, 'm');
  g.rect(14, 7 + by + bo, 1, 2, 'Z');
  // dome body
  const rows: [number, number, number][] = [
    [4, 5, 10],
    [5, 4, 11],
    [6, 4, 11],
    [7, 4, 11],
    [8, 4, 11],
    [9, 4, 11],
    [10, 5, 10],
  ];
  for (const [y, x0, x1] of rows) g.rect(x0, y + by, x1 - x0 + 1, 1, 'C');
  g.rect(4, 8 + by, 8, 1, 'Z'); // plating seam
  g.rect(5, 10 + by, 6, 1, 'Z'); // shade
  g.rect(4, 9 + by, 1, 1, 'Z');
  g.plot([
    [6, 5 + by, 'm'],
    [8, 5 + by, 'm'],
  ]); // rivets
  // lens
  if (p.blink) {
    g.rect(9, 7 + by, 2, 1, 'm');
  } else {
    g.rect(9, 6 + by, 2, 2, 'Q');
    g.set(9, 6 + by, 'q');
  }
  g.outline('o');
  if (p.muzzle) g.set(15, 7 + by + bo, 'Y');
  return g;
}

const TURRET_POSES = {
  idle: [
    {
      bob: 0,
      cog: 0,
      blink: false,
      barrel: 0,
      muzzle: false,
      legs: [
        [0, 0],
        [0, 0],
      ],
    },
    {
      bob: 0,
      cog: 1,
      blink: true,
      barrel: 0,
      muzzle: false,
      legs: [
        [0, 0],
        [0, 0],
      ],
    },
  ],
  walk: [
    {
      bob: 1,
      cog: 0,
      blink: false,
      barrel: 0,
      muzzle: false,
      legs: [
        [0, 0],
        [1, 1],
      ],
    },
    {
      bob: 0,
      cog: 1,
      blink: false,
      barrel: 0,
      muzzle: false,
      legs: [
        [0, 0],
        [0, 0],
      ],
    },
    {
      bob: 1,
      cog: 0,
      blink: false,
      barrel: 0,
      muzzle: false,
      legs: [
        [1, 1],
        [0, 0],
      ],
    },
    {
      bob: 0,
      cog: 1,
      blink: false,
      barrel: 0,
      muzzle: false,
      legs: [
        [0, 0],
        [0, 0],
      ],
    },
  ],
  attack: [
    {
      bob: 0,
      cog: 0,
      blink: false,
      barrel: -1,
      muzzle: false,
      legs: [
        [0, 0],
        [0, 0],
      ],
    },
    {
      bob: 0,
      cog: 1,
      blink: false,
      barrel: 0,
      muzzle: true,
      legs: [
        [0, 0],
        [0, 0],
      ],
    },
    {
      bob: 0,
      cog: 0,
      blink: false,
      barrel: 1,
      muzzle: false,
      legs: [
        [0, 0],
        [0, 0],
      ],
    },
  ],
} as const satisfies Record<string, readonly TurretPose[]>;

const T_SPARKS_LOW: Puff = [
  [3, 13, 'm'],
  [12, 13, 'Y'],
  [7, 12, 'm'],
  [1, 14, 'Y'],
];
const T_SPARKS_HOP: Puff = [
  [2, 12, 'Y'],
  [13, 12, 'm'],
  [1, 9, 'm'],
  [14, 10, 'Y'],
  [6, 3, 'Y'],
];
const T_SPARKS_RISE_3: Puff = [
  [1, 12, 'm'],
  [14, 12, 'Y'],
];
const T_SPARKS_SINK_1: Puff = [
  [2, 12, 'm'],
  [13, 12, 'm'],
];
const T_SPARKS_SINK_2: Puff = [
  [3, 12, 'Y'],
  [12, 12, 'm'],
  [7, 11, 'm'],
];
const T_SPARKS_SINK_3: Puff = [
  [4, 13, 'm'],
  [11, 13, 'm'],
];

function buildTurret(): SpriteTemplate {
  const anim = (poses: readonly TurretPose[]): string[][] => poses.map((p) => turret(p).rows());
  const full = turret(TURRET_POSES.idle[0]);
  const ff = (sink: number, puff: Puff): string[] => floorFrame(full, TW, TH, TGROUND, sink, puff);
  return {
    id: 'summons/turret',
    w: TW,
    h: TH,
    anchor: { x: 8, y: 15 },
    animations: {
      idle: anim(TURRET_POSES.idle),
      walk: anim(TURRET_POSES.walk),
      attack: anim(TURRET_POSES.attack),
      rise: [
        ff(10, T_SPARKS_LOW),
        ff(6, T_SPARKS_HOP),
        ff(2, T_SPARKS_HOP),
        ff(0, T_SPARKS_RISE_3),
      ],
      sink: [ff(3, T_SPARKS_SINK_1), ff(7, T_SPARKS_SINK_2), ff(11, T_SPARKS_SINK_3)],
    },
  };
}

/** H3 summons: the Druid's beast and the Artificer's turret. Merged into SUMMON_SPRITES. */
export const SUMMON_SPRITES_H3: Readonly<Record<'beast' | 'turret', SpriteTemplate>> = {
  beast: buildBeast(),
  turret: buildTurret(),
};
