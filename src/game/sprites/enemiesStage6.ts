// Stage 6 "Molten Core" regular enemies (batch E3, step A-E3-5). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: ember-imp, slag-snail, magma-crab, furnace-guard.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row, idle 2 / walk 2 /
// attack 3; no hit or dissolve art (engine flash and dissolve). Characters: the stage's `1`
// outline and its `2 3 4 5 6 7 8` (recolored by STAGE_PALETTES['molten-core']) plus master
// accents; at most 12 colors per sprite. The stage stone is near-black, so the enemies use warm
// reds, oranges and glowing cracks. Silhouettes: imp a thin horned biped with a long tail tipped
// by a tiny flame; snail a low body under a high off-center spiral shell with eyestalks; crab a
// wide flat body with two raised claws; guard a box-torso iron guard with a horned helmet and a
// hammer carried low. Hand-drawn base frames (fill only, outlined by fromFill); the other frames
// come from the row-level helpers in enemyFrames.ts.

import { checked, fromFill, lift, patch, shiftRows, squash } from './enemyFrames';
import { enemyTemplate } from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const ANCHOR = { x: 8, y: 15 };

// ---------------------------------------------------------------- Ember Imp (16x16)
// A small horned imp with no wings: two pale horns, yellow eyes, a claw held forward, and a long
// curved tail that ends in a tiny flame. It hops. `attack` swipes the claw.
// Colors: 1 w R Y e O D = 7.

const IMP_FILL: readonly string[] = [
  '................',
  '..w..w..........',
  '..ww.ww.........',
  '..RRRRR.....OY..',
  '.RRRRRRR....Y...',
  '.RYRRYRR....D...',
  '.RReeRRR.....D..',
  '...RRRRR.....D..',
  'wRRRROOR.....D..',
  '...RROOR....D...',
  '....RRRR....D...',
  '....RRRRDDDD....',
  '...RR..RR.......',
  '...RR..RR.......',
  '..DDD...DDD.....',
  '................',
];
const IMP = fromFill(IMP_FILL);

export const EMBER_IMP: SpriteTemplate = enemyTemplate('ember-imp', W, W, ANCHOR, {
  idle: [checked(IMP, W, W), squash(IMP, 9)],
  walk: [lift(IMP, 2), squash(IMP, 9)],
  attack: [
    shiftRows(IMP, 3, 12, 1),
    patch(patch(IMP, 0, 7, ['Y']), 0, 9, ['Y..', '.Y.']),
    checked(IMP, W, W),
  ],
});

// ---------------------------------------------------------------- Slag Snail (16x16)
// A snail with two eyestalks, a dark red body with an orange belly, and a cooled basalt spiral
// shell that glows at the cracks. A high shell set off-center behind the head. `attack` thrusts the
// head forward with the stalks laid back. Colors: 1 D O e Y 4 3 2 6 = 9.

const SNAIL_FILL: readonly string[] = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.Y.Y............',
  '.D.D............',
  '.D.D.......4....',
  '.D.D......444...',
  '.DDD.....44344..',
  '.DeD.....43234..',
  '.DDD.....43634..',
  '.DDD.....44344..',
  '..DDDDDDDDDDDD..',
  '..OOOOOOOOOOOO..',
  '................',
];
const SNAIL = fromFill(SNAIL_FILL);

export const SLAG_SNAIL: SpriteTemplate = enemyTemplate('slag-snail', W, W, ANCHOR, {
  idle: [checked(SNAIL, W, W), squash(SNAIL, 7)],
  walk: [shiftRows(SNAIL, 13, 15, -1), shiftRows(squash(SNAIL, 7), 13, 15, 1)],
  attack: [
    shiftRows(squash(SNAIL, 7), 4, 12, 1),
    patch(shiftRows(SNAIL, 4, 12, -1), 0, 11, ['O', '.O']),
    checked(SNAIL, W, W),
  ],
});

// ---------------------------------------------------------------- Magma Crab (16x16)
// A wide flat crab: a basalt-plated body with a glowing crack, two long raised arms ending in big
// red claws, eyes on short stalks, and thin legs splayed out to the sides. `attack` snaps the claws
// shut as the body lunges forward. Colors: 1 R D Y 4 3 6 2 P = 9.

const CRAB_FILL: readonly string[] = [
  '................',
  'RR.RR......RR.RR',
  'RRRRR......RRRRR',
  '.DDD........DDD.',
  '.DD..........DD.',
  '..D..........D..',
  '..D..........D..',
  '..D..........D..',
  '..D...Y..Y...D..',
  '...4444444444...',
  '..444366663444..',
  '...2222222222...',
  '...P.P....P.P...',
  '..P..P....P..P..',
  '.P..P......P..P.',
  '................',
];
const CRAB = fromFill(CRAB_FILL);
/** Claws closed (the gap between the pincers filled). */
const CRAB_SNAP = patch(patch(CRAB, 2, 1, ['R']), 13, 1, ['R']);

export const MAGMA_CRAB: SpriteTemplate = enemyTemplate('magma-crab', W, W, ANCHOR, {
  idle: [checked(CRAB, W, W), squash(CRAB, 8)],
  walk: [shiftRows(CRAB, 12, 15, -1), shiftRows(squash(CRAB, 8), 12, 15, 1)],
  attack: [
    patch(patch(CRAB, 0, 0, ['RR.RR']), 11, 0, ['RR.RR']),
    shiftRows(CRAB_SNAP, 9, 15, -1),
    checked(CRAB, W, W),
  ],
});

// ---------------------------------------------------------------- Furnace Guard (elite 24x24)
// A squat iron-plated guard: a horned helmet with a small chimney that puffs gray smoke, rust
// shoulder plates, a box torso with a glowing grate, and a big hammer carried low in front. The
// figure is drawn about four pixels left of the frame center (the anchor stays at the foot
// center) so its silhouette stays clear of the Crate Mimic's solid block. `attack` rocks back and
// then swings the hammer up in front. Colors: 1 7 5 e Y 3 2 6 4 P = 10.

const TW = 24;
const GUARD_FILL: readonly string[] = [
  '...........P............',
  '.7.......P....7.........',
  '.77.....P.P..77.........',
  '..77..22....77..........',
  '...77.22...77...........',
  '....75555557............',
  '.....5eY5Y5.............',
  '.....555555.............',
  '......3333..............',
  '...5555555555...........',
  '...5555555555...........',
  '.33.33333333.33.........',
  '.33.36666663.33.........',
  '.33.32777723.33.........',
  '.33.36666663.33.........',
  '.33.32222223.33.........',
  '.33.33333333............',
  '.5...33..33.............',
  '5....33..33.............',
  '4444433..33.............',
  '4444433..33.............',
  '2222233..33.............',
  '....22222222............',
  '........................',
];
const GUARD = fromFill(GUARD_FILL);
/** The hammer swung up in front: the low head is cleared and drawn higher. */
const GUARD_SWING = patch(
  patch(GUARD, 0, 17, [',,,,,,,', ',,,,,,,', ',,,,,,,', ',,,,,,,', ',,,,,,,', ',,,,,,,']),
  0,
  6,
  ['111111', '144441', '144441', '122221', '111111'],
);

export const FURNACE_GUARD: SpriteTemplate = enemyTemplate(
  'furnace-guard',
  TW,
  TW,
  { x: 12, y: 23 },
  {
    idle: [checked(GUARD, TW, TW), squash(GUARD, 10)],
    walk: [shiftRows(GUARD, 17, 23, -1), shiftRows(squash(GUARD, 10), 17, 23, 1)],
    attack: [shiftRows(GUARD, 3, 16, 1), checked(GUARD_SWING, TW, TW), checked(GUARD, TW, TW)],
  },
);

/** Stage 6 regular enemies, id -> template. */
export const ENEMIES_STAGE6: Readonly<Record<string, SpriteTemplate>> = {
  'ember-imp': EMBER_IMP,
  'slag-snail': SLAG_SNAIL,
  'magma-crab': MAGMA_CRAB,
  'furnace-guard': FURNACE_GUARD,
};
