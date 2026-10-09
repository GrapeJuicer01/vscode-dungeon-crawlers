// Drop sprites (batch E1, step A-E1-1): four calm, cosmetic keepsakes that pop out of a defeated
// enemy and fade. Owned by the pixel-artist. They carry no value and are collected by nothing, so
// none looks like a potion, heart, or bar. Ids `drops/<kind>`, one `idle` animation of two frames
// (the second adds a single white glint), foot anchor (bottom-centre), master characters only,
// at most 8 colors including the outline. Format: docs/design/sprite-spec.md section 10.
//
// Design notes: coin 6x6 gold disc (o a Y w); gem 6x6 pale-blue facet (o q Q w); ore 6x6 gray
// rock lump with a gold fleck (o G P Y w); chest 12x10 wooden box with a gold lock (o V W k a w).

import { loopTemplate } from './spriteBuilder';
import type { DropSpriteId, SpriteTemplate } from './spriteTypes';

const COIN_A = ['.oooo.', 'oaYYao', 'oYaaao', 'oYaaao', 'oaaaao', '.oooo.'];
const COIN_B = ['.oooo.', 'owYYao', 'oYaaao', 'oYaaao', 'oaaaao', '.oooo.'];

const GEM_A = ['.oooo.', 'oqqqQo', 'oqqQQo', '.oQQQo', '..oQo.', '...o..'];
const GEM_B = ['.oooo.', 'owqqQo', 'oqqQQo', '.oQQQo', '..oQo.', '...o..'];

const ORE_A = ['..ooo.', '.oGGPo', 'oGGYPo', 'oGPPPo', 'oPPPPo', '.oooo.'];
const ORE_B = ['..ooo.', '.owGPo', 'oGGYPo', 'oGPPPo', 'oPPPPo', '.oooo.'];

const CHEST_A = [
  '.oooooooooo.',
  'oVVVVVVVVVVo',
  'oVWWWWWWWWVo',
  'oWWWWWWWWWWo',
  'oooooaaooooo',
  'oWWkWaaWkWWo',
  'oWWkWaoWkWWo',
  'oWWkWWWWkWWo',
  'oWWkWWWWkWWo',
  '.oooooooooo.',
];
const CHEST_B = [
  '.oooooooooo.',
  'oVVVVVVVVVVo',
  'oVwWWWWWWWVo',
  'oWWWWWWWWWWo',
  'oooooaaooooo',
  'oWWkWaaWkWWo',
  'oWWkWaoWkWWo',
  'oWWkWWWWkWWo',
  'oWWkWWWWkWWo',
  '.oooooooooo.',
];

/** Drop kind -> template. Keys equal DROP_KINDS in src/game/data/drops.ts (developer). */
export const DROP_SPRITES: Readonly<Record<DropSpriteId, SpriteTemplate>> = {
  coin: loopTemplate('drops/coin', [COIN_A, COIN_B], { x: 3, y: 5 }),
  gem: loopTemplate('drops/gem', [GEM_A, GEM_B], { x: 3, y: 5 }),
  ore: loopTemplate('drops/ore', [ORE_A, ORE_B], { x: 3, y: 5 }),
  chest: loopTemplate('drops/chest', [CHEST_A, CHEST_B], { x: 6, y: 9 }),
};
