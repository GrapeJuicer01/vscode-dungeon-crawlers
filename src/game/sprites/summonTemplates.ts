// Summon sprites (batch A2-1): cosmetic allies a class may call. Owned by the pixel-artist.
// Convention (ratified, docs/architecture/plans/h2-classes.md section 3.5, docs/design/sprite-spec.md
// section 9): one composite (non-layered) template, id `summons/<name>`, at most 24x24, at most 8
// colours, master palette only (never class-swapped), anchor on the foot pixel, facing right, no
// shadow (the engine draws it). Animations: idle 2, walk 4, attack 3, rise 4, sink 3 (rise and
// sink play once). No hurt, death, or downed names exist: a summon is a cosmetic ally and only
// enemies have health.
// Skeleton, 16x20, anchor (8, 19). Colours (7): outline `o`, bone `m` with highlight `w` and shade
// `G`, scarf `d`, and the green glow `L` (eye) with `N` (puff shade), both appended to the master.
// `rise` climbs out of the floor in a small green puff; `sink` descends upright and thins into a
// green puff. It never collapses, falls apart, flashes, or shows red.

import { Grid } from './spriteBuilder';
import type { SpriteTemplate, SummonSpriteId } from './spriteTypes';

const W = 16;
const H = 20;

const SKULL = [
  '.mmmmmmm.',
  'mmwmmmmmm',
  'mmmmooomm',
  'mmmmoLomm',
  'mmmmmmmmm',
  '.mmGmGmm.',
  '..mmmmm..',
];
const RIBS = ['mGmmGm', 'mmmmmm', 'mGmmGm', '.mmmm.'];

const LEGS_STAND = ['mm..mm', 'mm..mm', 'Gm..Gm', 'mm..mm', 'mmm.mmm'];
const LEGS_STRIDE = ['.mmmmmm.', 'mm....mm', 'mm....mm', 'Gm....Gm', 'mmm..mmm'];
const LEGS_PASS_L = ['mmmmmm.', '.mm.mm.', 'mm..mm.', 'Gm..mm.', 'mmm.mmm'];
const LEGS_PASS_R = ['mmmmmm.', 'mm.mm..', 'mm..mm.', 'mm..mmG', 'mmm.mmm'];

interface Pose {
  /** Upper-body bob in pixels (0 or 1). */
  bob: number;
  /** Horizontal lean of skull and ribs. */
  lean: number;
  legs: readonly string[];
  legX: number;
  /** Where the bone sword is: held up, thrust forward, or raised back. */
  sword: 'up' | 'fwd' | 'back';
}

/** The standing skeleton without an outline (inner pixels), then outlined. */
function skeleton(p: Pose): Grid {
  const g = new Grid(W, H);
  const top = 2 + p.bob;
  g.blit(LEGS_STAND === p.legs ? p.legs : p.legs, p.legX, 14);
  g.blit(RIBS, 5 + p.lean, top + 8);
  g.rect(5 + p.lean, top + 7, 7, 1, 'd');
  g.plot([
    [4 + p.lean, top + 8, 'd'],
    [3 + p.lean, top + 9, 'd'],
  ]);
  g.blit(SKULL, 3 + p.lean, top);
  // near arm and a small bone sword
  const sx = 11 + p.lean;
  const sy = top + 8;
  g.rect(sx - 1, sy, 2, 1, 'm');
  if (p.sword === 'up') {
    g.rect(sx + 1, sy, 1, 2, 'm');
    g.rect(sx + 1, sy - 5, 1, 5, 'w');
    g.rect(sx, sy - 1, 3, 1, 'G');
  } else if (p.sword === 'fwd') {
    g.rect(sx, sy, 3, 1, 'm');
    g.rect(sx + 3, sy - 1, 1, 3, 'G');
    g.rect(sx + 4, sy, 4, 1, 'w');
  } else {
    g.rect(sx, sy - 1, 2, 2, 'm');
    g.line(sx + 1, sy - 2, sx - 2, sy - 7, 'w');
    g.rect(sx, sy - 2, 3, 1, 'G');
  }
  g.outline('o');
  return g;
}

const POSES: Readonly<Record<'idle' | 'walk' | 'attack', readonly Pose[]>> = {
  idle: [
    { bob: 0, lean: 0, legs: LEGS_STAND, legX: 5, sword: 'up' },
    { bob: 1, lean: 0, legs: LEGS_STAND, legX: 5, sword: 'up' },
  ],
  walk: [
    { bob: 1, lean: 0, legs: LEGS_STRIDE, legX: 4, sword: 'up' },
    { bob: 0, lean: 0, legs: LEGS_PASS_L, legX: 5, sword: 'up' },
    { bob: 1, lean: 0, legs: LEGS_STRIDE, legX: 4, sword: 'up' },
    { bob: 0, lean: 0, legs: LEGS_PASS_R, legX: 5, sword: 'up' },
  ],
  attack: [
    { bob: 0, lean: -1, legs: LEGS_STAND, legX: 5, sword: 'back' },
    { bob: 0, lean: 1, legs: LEGS_STRIDE, legX: 4, sword: 'fwd' },
    { bob: 0, lean: 0, legs: LEGS_STAND, legX: 5, sword: 'up' },
  ],
};

/**
 * The standing skeleton sunk into the floor by `sink` rows (clipped at the ground line, upright),
 * with a green puff. Used for both `rise` (sinking amount shrinks) and `sink` (grows).
 */
function floorFrame(sink: number, puff: readonly (readonly [number, number, string])[]): string[] {
  const full = skeleton(POSES.idle[0] as Pose);
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = full.get(x, y);
      const ty = y + sink;
      if (ch !== '.' && ty <= 18) g.set(x, ty, ch);
    }
  }
  if (sink > 0) {
    // close the clipped body with an outline row at the ground line
    for (let x = 0; x < W; x++) if (g.get(x, 18) !== '.' && g.get(x, 18) !== 'o') g.set(x, 19, 'o');
  }
  for (const [x, y, ch] of puff) if (g.get(x, y) === '.') g.set(x, y, ch);
  return g.rows();
}

type Puff = readonly (readonly [number, number, string])[];
const PUFF_LOW: Puff = [
  [3, 18, 'N'],
  [4, 17, 'L'],
  [5, 18, 'L'],
  [6, 17, 'N'],
  [9, 18, 'N'],
  [10, 17, 'L'],
  [11, 18, 'L'],
  [12, 18, 'N'],
];
const PUFF_WIDE: Puff = [
  [2, 18, 'N'],
  [3, 17, 'L'],
  [12, 17, 'L'],
  [13, 18, 'N'],
  [1, 16, 'N'],
  [14, 16, 'N'],
  [4, 16, 'L'],
  [11, 16, 'L'],
];
const PUFF_RISE_3: Puff = [
  [2, 18, 'N'],
  [13, 18, 'N'],
  [14, 16, 'L'],
  [1, 17, 'L'],
];
const PUFF_SINK_1: Puff = [
  [2, 18, 'N'],
  [3, 17, 'L'],
  [12, 17, 'L'],
  [13, 18, 'N'],
];
const PUFF_SINK_2: Puff = [
  [2, 18, 'N'],
  [3, 17, 'L'],
  [4, 16, 'N'],
  [11, 16, 'N'],
  [12, 17, 'L'],
  [13, 18, 'N'],
  [5, 18, 'L'],
  [10, 18, 'L'],
];
const PUFF_SINK_3: Puff = [
  [3, 18, 'N'],
  [4, 17, 'L'],
  [6, 18, 'N'],
  [8, 17, 'L'],
  [10, 18, 'N'],
  [11, 17, 'L'],
  [5, 15, 'N'],
  [9, 15, 'N'],
  [7, 13, 'L'],
  [12, 15, 'L'],
  [2, 16, 'L'],
];

function build(): SpriteTemplate {
  const anim = (poses: readonly Pose[]): string[][] => poses.map((p) => skeleton(p).rows());
  return {
    id: 'summons/skeleton',
    w: W,
    h: H,
    anchor: { x: 8, y: 19 },
    animations: {
      idle: anim(POSES.idle),
      walk: anim(POSES.walk),
      attack: anim(POSES.attack),
      rise: [
        floorFrame(13, PUFF_LOW),
        floorFrame(9, PUFF_WIDE),
        floorFrame(4, PUFF_WIDE),
        floorFrame(0, PUFF_RISE_3),
      ],
      sink: [floorFrame(4, PUFF_SINK_1), floorFrame(9, PUFF_SINK_2), floorFrame(15, PUFF_SINK_3)],
    },
  };
}

/** Summon id -> sprite. Only the Necromancer's skeleton exists (H2). */
export const SUMMON_SPRITES: Readonly<Record<SummonSpriteId, SpriteTemplate>> = {
  skeleton: build(),
};
