// Enemy-side shared art (batch E1). Owned by the pixel-artist.
// Step A-E1-1 delivers the health bar frames and the (still empty) enemy and phase-palette tables;
// the enemies themselves arrive in steps A-E1-2 to A-E1-6, each adding rows to ENEMY_SPRITES.
//
// Health bars belong to enemies only; no hero ever gets a bar. The frames are outlines with a
// transparent interior: the engine paints the back color across the interior, then the fill
// color proportionally to the enemy's health, then draws the frame on top (or just the interior
// rectangle for the fill; the interior is the inset rectangle (1, 1) of size (w - 2) x (h - 2)).
// Anchor is top-left (0, 0). Master characters only (`o`).

import { ENEMIES_STAGE1 } from './enemiesStage1';
import { ENEMIES_STAGE2 } from './enemiesStage2';
import { ENEMIES_STAGE3 } from './enemiesStage3';
import { ENEMIES_STAGE4 } from './enemiesStage4';
import { ENEMIES_STAGE5 } from './enemiesStage5';
import { ENEMIES_STAGE6 } from './enemiesStage6';
import { ELDER_DRYAD } from './elderDryadTemplate';
import { GOBLIN_FOREMAN } from './goblinForemanTemplate';
import { MOLTEN_COLOSSUS } from './moltenColossusTemplate';
import { OOZE_QUEEN } from './oozeQueenTemplate';
import type { Palette } from './palettes';
import { BOSS_PHASE_PALETTES } from './palettesE1';
import { BOSS_PHASE_PALETTES_E2 } from './palettesE2';
import { BOSS_PHASE_PALETTES_E3 } from './palettesE3';
import { RAT_KING } from './ratKingTemplate';
import type { SpriteTemplate } from './spriteTypes';
import { TOMB_LICH } from './tombLichTemplate';

function frame(id: string, w: number, h: number): SpriteTemplate {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    rows.push(y === 0 || y === h - 1 ? 'o'.repeat(w) : 'o' + '.'.repeat(w - 2) + 'o');
  }
  return { id, w, h, anchor: { x: 0, y: 0 }, animations: { idle: [rows] } };
}

/**
 * Bar art. `frame` is 18x4 (interior 16x2) for minions and elites; `bossFrame` is 34x5 (interior
 * 32x3). `fillChar` is the warm health color, `backChar` the empty-bar color (both master).
 */
export const ENEMY_BAR: {
  readonly frame: SpriteTemplate;
  readonly bossFrame: SpriteTemplate;
  readonly fillChar: string;
  readonly backChar: string;
} = {
  frame: frame('ui/enemyBar', 18, 4),
  bossFrame: frame('ui/bossBar', 34, 5),
  fillChar: 'R',
  backChar: 'P',
};

/** Enemy id -> template `enemies/<id>`, left-facing, foot anchor. Stages 1 and 2 (E1), 3 and 4 (E2), 5 and 6 (E3). */
export const ENEMY_SPRITES: Readonly<Record<string, SpriteTemplate>> = {
  ...ENEMIES_STAGE1,
  ...ENEMIES_STAGE2,
  ...ENEMIES_STAGE3,
  ...ENEMIES_STAGE4,
  ...ENEMIES_STAGE5,
  ...ENEMIES_STAGE6,
  'rat-king': RAT_KING,
  'goblin-foreman': GOBLIN_FOREMAN,
  'ooze-queen': OOZE_QUEEN,
  'tomb-lich': TOMB_LICH,
  'elder-dryad': ELDER_DRYAD,
  'molten-colossus': MOLTEN_COLOSSUS,
};

/**
 * Boss id -> palettes for phases 2..n (partial overrides of at most four characters, applied over
 * the master). Filled with the bosses in steps A-E1-3 and A-E1-6.
 */
export const ENEMY_PHASE_PALETTES: Readonly<Record<string, readonly Palette[]>> = {
  ...BOSS_PHASE_PALETTES,
  ...BOSS_PHASE_PALETTES_E2,
  ...BOSS_PHASE_PALETTES_E3,
};
