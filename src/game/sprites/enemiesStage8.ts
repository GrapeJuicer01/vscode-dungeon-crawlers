// Stage 8 "Shadow Realm" regular enemies (batch E4, step A-E4-5). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: lantern-wraith, shard-cluster, mirror-mimic, gloom-stag.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row (minion (8, 15),
// elite (12, 23)), idle 2 / walk 2 / attack 3; no hit or dissolve art (engine flash and dissolve).
// Characters: the stage's `1` outline and `2 to 8` (recolored by STAGE_PALETTES['shadow-realm'])
// plus master accents; at most 12 colors per sprite. The realm's stone is dark indigo, so the
// enemies carry violet crystal (`5`), lilac-white light (`6` `7`) and cyan accents (`8`) and read
// lighter than the floor. Cute-spooky, never gory.
// Silhouettes: wraith a ring handle over a boxy lantern with a trailing wisp tail, drawn left of
// the foot anchor; shard cluster four detached crystal shards at the corners around a small glowing
// core; mirror mimic an oval frame with a hollow glass and two eyes inside, on short legs; gloom
// stag a low quadruped with a wide fan of thin antlers. Hand-drawn base frames (fill only,
// outlined by fromFill or finish); the other frames come from enemyFrames.ts.

import { dots, draft, ellipse, enemyTemplate, finish, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { checked, fromFill, patch, recolorRows, shiftRows, squash } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const ANCHOR = { x: 8, y: 15 };

// ---------------------------------------------------------------- Lantern Wraith (16x16)
// A floating hooked lantern: a ring handle on top, a violet-framed glass box with a pale flame and
// two dark eyes in it, and a wisp of smoke trailing off to the lower right. It hovers. `attack`
// leans the lantern forward. Colors: 1 5 4 6 e 7 = 6.

const WRAITH_FILL: readonly string[] = [
  '................',
  '....5555........',
  '...55..55.......',
  '...5....5.......',
  '..44444444......',
  '..56666665......',
  '..56e66e65......',
  '..56677665......',
  '..56777765......',
  '..56677665......',
  '..55666655......',
  '..44444444......',
  '....555555......',
  '.....5555555....',
  '........555555..',
  '................',
];
const WRAITH = fromFill(WRAITH_FILL);
/** The flame gutters (white core shrinks) and the smoke tail shifts a pixel. */
const WRAITH_B = shiftRows(recolorRows(WRAITH, '7', '6', 7, 9), 12, 15, 1);

export const LANTERN_WRAITH: SpriteTemplate = enemyTemplate('lantern-wraith', W, W, ANCHOR, {
  idle: [checked(WRAITH, W, W), checked(WRAITH_B, W, W)],
  walk: [shiftRows(WRAITH, 12, 15, 1), shiftRows(WRAITH, 12, 15, -1)],
  attack: [
    shiftRows(WRAITH, 1, 11, 1),
    shiftRows(patch(WRAITH, 3, 7, ['7', '7']), 1, 11, -2),
    checked(WRAITH, W, W),
  ],
});

// ---------------------------------------------------------------- Shard Cluster (16x16)
// Four detached violet crystal shards hang at the corners around a small glowing core. They
// hover and slowly drift. `attack` draws the shards in and thrusts them left.
// Colors: 1 5 7 6 = 4.

function shardFrame(spread: number, thrust = 0, pulse = false): string[] {
  const d: Draft = draft(W, W);
  const shard = ['.5.', '575', '577', '575', '.5.'];
  put(d, shard, 1 - thrust + spread, 1 + spread);
  put(d, shard, 12 - 2 * thrust - spread, 1 + spread);
  put(d, shard, 1 - thrust + spread, 9 - spread);
  put(d, shard, 12 - 2 * thrust - spread, 9 - spread);
  put(d, ['.66.', pulse ? '6666' : '6776', pulse ? '6666' : '6776', '6776', '.66.'], 6 - thrust, 5);
  return finish(d);
}

export const SHARD_CLUSTER: SpriteTemplate = enemyTemplate('shard-cluster', W, W, ANCHOR, {
  idle: [checked(shardFrame(0), W, W), checked(shardFrame(1, 0, true), W, W)],
  walk: [checked(shardFrame(1), W, W), checked(shardFrame(0), W, W)],
  attack: [
    checked(shardFrame(1), W, W),
    checked(shardFrame(0, 1), W, W),
    checked(shardFrame(0), W, W),
  ],
});

// ---------------------------------------------------------------- Mirror Mimic (16x16)
// An oval standing mirror: a violet frame with a hollow glass, two pale eyes peering out of the dark
// inside, a lilac glint on the frame, and two short legs. `attack` leans the frame forward.
// Colors: 1 5 6 w 4 = 5.

const MIMIC_FILL: readonly string[] = [
  '................',
  '...5555555555...',
  '..556666666655..',
  '.55..........55.',
  '.55..........55.',
  '.55..........55.',
  '.55...w..w...55.',
  '.55..........55.',
  '.55..........55.',
  '.55..........55.',
  '..555555555555..',
  '...5555555555...',
  '....44....44....',
  '...444....444...',
  '................',
  '................',
];
const MIMIC = fromFill(MIMIC_FILL);

export const MIRROR_MIMIC: SpriteTemplate = enemyTemplate('mirror-mimic', W, W, ANCHOR, {
  idle: [checked(MIMIC, W, W), squash(MIMIC, 5)],
  walk: [shiftRows(MIMIC, 12, 14, -1), shiftRows(squash(MIMIC, 5), 12, 14, 1)],
  attack: [
    shiftRows(MIMIC, 1, 11, 1),
    shiftRows(patch(MIMIC, 6, 5, ['6', '6']), 1, 11, -2),
    checked(MIMIC, W, W),
  ],
});

// ---------------------------------------------------------------- Gloom Stag (elite 24x24)
// A low, dark-violet stag walking left: a pale-lilac muzzle, a cyan eye, a long back, four thin
// legs, and a very wide fan of thin antlers whose tips glow lilac. `attack` lowers the antlers and
// thrusts the head forward. Colors: 1 4 3 6 8 5 7 = 7.

const TW = 24;

function stagFrame(dip: number, lunge: number): string[] {
  const d: Draft = draft(TW, TW);
  // legs
  for (const x of [8, 10, 15, 17]) d.g.rect(x, 17, 2, 5, '3');
  // body, tail, neck, head
  ellipse(d, 13, 14.5, 6, 3, '4');
  dots(d, [
    [19, 12, '4'],
    [20, 11, '4'],
    [12, 17, '3'],
    [14, 17, '3'],
  ]);
  stroke(
    d,
    [
      [9, 13],
      [7 - lunge, 11 + dip],
    ],
    '4',
    3,
  );
  ellipse(d, 5.5 - lunge, 11.5 + dip, 2.8, 2.2, '4');
  dots(d, [
    [2 - lunge, 12 + dip, '6'],
    [3 - lunge, 12 + dip, '6'],
    [4 - lunge, 10 + dip, '8'],
  ]);
  // antler fan: four main beams rising to the top rows with side tines; the tips glow
  const beam = (pts: readonly (readonly [number, number])[]): void => {
    stroke(
      d,
      pts.map(([x, y]) => [x - lunge, y + dip] as const),
      '5',
    );
  };
  beam([
    [5, 9],
    [4, 6],
    [2, 3],
    [1, 1],
  ]);
  beam([
    [5, 9],
    [6, 6],
    [7, 3],
    [8, 1],
  ]);
  beam([
    [6, 9],
    [9, 6],
    [12, 3],
    [13, 1],
  ]);
  beam([
    [6, 9],
    [12, 7],
    [17, 5],
    [20, 3],
    [21, 1],
  ]);
  beam([
    [4, 6],
    [1, 6],
  ]);
  beam([
    [9, 6],
    [9, 3],
  ]);
  beam([
    [17, 5],
    [17, 2],
  ]);
  beam([
    [20, 3],
    [22, 2],
  ]);
  beam([
    [12, 3],
    [15, 2],
  ]);
  dots(
    d,
    (
      [
        [1, 1],
        [8, 1],
        [13, 1],
        [21, 1],
        [1, 6],
        [9, 3],
        [17, 2],
      ] as const
    ).map(([x, y]) => [x - lunge, y + dip, '7'] as const),
  );
  d.g.rect(0, 23, TW, 1, '.');
  return finish(d);
}
const STAG = stagFrame(0, 0);

export const GLOOM_STAG: SpriteTemplate = enemyTemplate(
  'gloom-stag',
  TW,
  TW,
  { x: 12, y: 23 },
  {
    idle: [checked(STAG, TW, TW), squash(STAG, 6)],
    walk: [shiftRows(STAG, 17, 23, -1), shiftRows(squash(STAG, 6), 17, 23, 1)],
    attack: [stagFrame(0, 0), stagFrame(3, 0), stagFrame(3, 3)],
  },
);

/** Stage 8 regular enemies, id -> template. */
export const ENEMIES_STAGE8: Readonly<Record<string, SpriteTemplate>> = {
  'lantern-wraith': LANTERN_WRAITH,
  'shard-cluster': SHARD_CLUSTER,
  'mirror-mimic': MIRROR_MIMIC,
  'gloom-stag': GLOOM_STAG,
};
