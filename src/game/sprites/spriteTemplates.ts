// Sprite data for the engine (the import point). Owned by the pixel-artist.
// Template types live in spriteTypes.ts; art lives in one file per subject so batches stay small:
// heroTemplates.ts (BASE_HERO), classTemplates.ts + classTemplatesH2.ts + classTemplatesH3.ts (merged CLASS_LAYERS here), effectTemplates.ts + effectTemplatesH2.ts + effectTemplatesH3.ts (merged EFFECT_SPRITES; palettes merged in palettes.ts), summonTemplates.ts + summonTemplatesH3.ts (SUMMON_SPRITES), campfireTemplates.ts (CAMPFIRE), stage1Templates.ts to stage8Templates.ts (one file per
// stage), enemyTemplates.ts + enemiesStage1.ts/ratKingTemplate.ts/enemiesStage2.ts/goblinForemanTemplate.ts (E1 enemies), enemiesStage3.ts/oozeQueenTemplate.ts/enemiesStage4.ts/tombLichTemplate.ts (E2 enemies; boss phase palettes in palettesE2.ts), enemiesStage5.ts/elderDryadTemplate.ts/enemiesStage6.ts/moltenColossusTemplate.ts (E3 enemies; boss phase palettes in palettesE3.ts; row helpers in enemyFrames.ts), enemiesStage7.ts/glacierMammothTemplate.ts/enemiesStage8.ts/eclipseWardenTemplate.ts (E4 enemies; boss phase palettes in palettesE4.ts). Format: docs/design/sprite-spec.md.

import { CAMPFIRE } from './campfireTemplates';
import { EFFECT_SPRITES, EFFECT_SPRITES_H1 } from './effectTemplates';
import { CLASS_LAYERS_H1 } from './classTemplates';
import { CLASS_LAYERS_H2 } from './classTemplatesH2';
import { CLASS_LAYERS_H3 } from './classTemplatesH3';
import { EFFECT_SPRITES_H2 } from './effectTemplatesH2';
import { EFFECT_SPRITES_H3 } from './effectTemplatesH3';
import { CLASS_PALETTES, CLASS_PALETTES_H1, STAGE_PALETTES } from './palettes';
import { DROP_SPRITES } from './dropTemplates';
import { ENEMY_BAR, ENEMY_PHASE_PALETTES, ENEMY_SPRITES } from './enemyTemplates';
import { CLASS_PALETTES_H2 } from './palettesH2';
import { CLASS_PALETTES_H3 } from './palettesH3';
import { SUMMON_SPRITES } from './summonTemplates';
import { BASE_HERO } from './heroTemplates';
import { FORGOTTEN_CELLAR } from './stage1Templates';
import { GOBLIN_MINE_SHAFTS } from './stage2Templates';
import { TOXIC_SLIME_CAVERNS } from './stage3Templates';
import { ANCIENT_CATACOMBS } from './stage4Templates';
import { ENCHANTED_FOREST_RUINS } from './stage5Templates';
import { MOLTEN_CORE } from './stage6Templates';
import { FROZEN_CITADEL } from './stage7Templates';
import { SHADOW_REALM } from './stage8Templates';
import type { HeroLayerSet, StageSprites } from './spriteTypes';

export type {
  CampfireSprites,
  ClassPaletteId,
  ClassPaletteIdH1,
  ClassPaletteIdH2,
  EffectSpriteId,
  EffectSpriteIdH1,
  EffectSpriteIdH2,
  EffectSpriteIdH3,
  ClassPaletteIdH3,
  DropSpriteId,
  HeroLayerSet,
  SpriteTemplate,
  StageSprites,
  SummonSpriteId,
} from './spriteTypes';
/** All twelve classes' layers (H1 + H2 + H3): class id -> layers. */
export const CLASS_LAYERS: Readonly<Record<string, HeroLayerSet>> = {
  ...CLASS_LAYERS_H1,
  ...CLASS_LAYERS_H2,
  ...CLASS_LAYERS_H3,
};

export { BASE_HERO, CAMPFIRE, CLASS_PALETTES, EFFECT_SPRITES, SUMMON_SPRITES };
// Batch E1 (enemy side): drops, health bar frames, enemies and boss phase palettes, stage palettes.
export { DROP_SPRITES, ENEMY_BAR, ENEMY_PHASE_PALETTES, ENEMY_SPRITES, STAGE_PALETTES };
// Per-batch tables, kept for tests and tools; the merged tables above are what the engine uses.
export {
  CLASS_LAYERS_H1,
  CLASS_LAYERS_H2,
  CLASS_LAYERS_H3,
  CLASS_PALETTES_H1,
  CLASS_PALETTES_H2,
  CLASS_PALETTES_H3,
};
export { EFFECT_SPRITES_H1, EFFECT_SPRITES_H2, EFFECT_SPRITES_H3 };

/** Stage id -> sprites. Keys equal the ids in src/game/data/stages.ts and palettes.ts. */
export const STAGE_SPRITES: Readonly<Record<string, StageSprites>> = {
  'forgotten-cellar': FORGOTTEN_CELLAR,
  'goblin-mine-shafts': GOBLIN_MINE_SHAFTS,
  'toxic-slime-caverns': TOXIC_SLIME_CAVERNS,
  'ancient-catacombs': ANCIENT_CATACOMBS,
  'enchanted-forest-ruins': ENCHANTED_FOREST_RUINS,
  'molten-core': MOLTEN_CORE,
  'frozen-citadel': FROZEN_CITADEL,
  'shadow-realm': SHADOW_REALM,
};
