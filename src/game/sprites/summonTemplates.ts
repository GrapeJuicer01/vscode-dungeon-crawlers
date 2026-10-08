// Summon sprites (batch A2-3): cosmetic allies a class may call. Owned by the pixel-artist.
// PROPOSAL, UNREVIEWED by the architect: the convention is described in docs/design/sprite-spec.md
// section 9. A summon is one composite (non-layered) template, 16x20, anchor (8, 19), with the
// animations idle 2, walk 4, attack 3, and spawn 3 (a pop-in; despawn plays it in reverse). No
// hurt, death, or downed names exist: a summon is a cosmetic ally and only enemies have health.
// Drawn with master characters: bone `m` (highlight `w`, shade `G`), a scarf `d`, and an eye glint
// `a` (sand in the master palette; the engine may recolor `a d m` through the owner's class
// palette, which turns them green, purple, and bone for the Necromancer). Dust `G P` for the pop.

import { Grid } from './spriteBuilder';
import type { SpriteTemplate, SummonSpriteId } from './spriteTypes';

const W = 16;
const H = 20;

const SKULL = [
  '.mmmmmmm.',
  'mmwmmmmmm',
  'mmmmooomm',
  'mmmmoaomm',
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

/** Rises from the ground: the standing skeleton sunk by `sink` rows, clipped at the ground line. */
function spawnFrame(sink: number, dust: readonly (readonly [number, number, string])[]): string[] {
  const full = skeleton(POSES.idle[0] as Pose);
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = full.get(x, y);
      const ty = y + sink;
      if (ch !== '.' && ty <= 18) g.set(x, ty, ch === 'o' && ty === 18 ? 'o' : ch);
    }
  }
  if (sink > 0) {
    // close the clipped body with an outline row at the ground line
    for (let x = 0; x < W; x++) if (g.get(x, 18) !== '.' && g.get(x, 18) !== 'o') g.set(x, 19, 'o');
  }
  g.plot(dust);
  return g.rows();
}

const DUST_MOUND: readonly (readonly [number, number, string])[] = [
  [3, 18, 'P'],
  [4, 17, 'G'],
  [5, 18, 'G'],
  [6, 17, 'G'],
  [9, 18, 'G'],
  [10, 17, 'G'],
  [11, 18, 'P'],
  [12, 18, 'G'],
];
const DUST_WIDE: readonly (readonly [number, number, string])[] = [
  [2, 18, 'G'],
  [3, 17, 'P'],
  [12, 17, 'P'],
  [13, 18, 'G'],
  [1, 16, 'G'],
  [14, 16, 'G'],
];
const DUST_SPECK: readonly (readonly [number, number, string])[] = [
  [2, 18, 'G'],
  [13, 18, 'G'],
  [14, 16, 'P'],
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
      spawn: [spawnFrame(10, DUST_MOUND), spawnFrame(5, DUST_WIDE), spawnFrame(0, DUST_SPECK)],
    },
  };
}

/** Summon id -> sprite. Only the Necromancer's skeleton exists (H2). */
export const SUMMON_SPRITES: Readonly<Record<SummonSpriteId, SpriteTemplate>> = {
  skeleton: build(),
};
