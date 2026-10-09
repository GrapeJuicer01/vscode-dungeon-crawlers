// Sprite data for the engine (the import point). Owned by the pixel-artist.
// Template types live in spriteTypes.ts; art lives in one file per subject so batches stay small:
// heroTemplates.ts (BASE_HERO), classTemplates.ts + classTemplatesH2.ts (merged CLASS_LAYERS here), effectTemplates.ts + effectTemplatesH2.ts (merged EFFECT_SPRITES), summonTemplates.ts (SUMMON_SPRITES), campfireTemplates.ts (CAMPFIRE), stage1Templates.ts (one file per
// stage). Format: docs/design/sprite-spec.md.

import { CAMPFIRE } from './campfireTemplates';
import { EFFECT_SPRITES, EFFECT_SPRITES_H1 } from './effectTemplates';
import { CLASS_LAYERS_H1 } from './classTemplates';
import { CLASS_LAYERS_H2 } from './classTemplatesH2';
import { EFFECT_SPRITES_H2 } from './effectTemplatesH2';
import { CLASS_PALETTES, CLASS_PALETTES_H1 } from './palettes';
import { CLASS_PALETTES_H2 } from './palettesH2';
import { SUMMON_SPRITES } from './summonTemplates';
import { BASE_HERO } from './heroTemplates';
import { FORGOTTEN_CELLAR } from './stage1Templates';
import type { HeroLayerSet, StageSprites } from './spriteTypes';

export type {
  CampfireSprites,
  ClassPaletteId,
  ClassPaletteIdH1,
  ClassPaletteIdH2,
  EffectSpriteId,
  EffectSpriteIdH1,
  EffectSpriteIdH2,
  HeroLayerSet,
  SpriteTemplate,
  StageSprites,
  SummonSpriteId,
} from './spriteTypes';
/** All eight classes (H1 + H2): class id -> layers. */
export const CLASS_LAYERS: Readonly<Record<string, HeroLayerSet>> = {
  ...CLASS_LAYERS_H1,
  ...CLASS_LAYERS_H2,
};

export { BASE_HERO, CAMPFIRE, CLASS_PALETTES, EFFECT_SPRITES, SUMMON_SPRITES };
// Per-batch tables, kept for tests and tools; the merged tables above are what the engine uses.
export { CLASS_LAYERS_H1, CLASS_LAYERS_H2, CLASS_PALETTES_H1, CLASS_PALETTES_H2 };
export { EFFECT_SPRITES_H1, EFFECT_SPRITES_H2 };

/** Stage id -> sprites. Keys equal the ids in src/game/data/stages.ts and palettes.ts. */
export const STAGE_SPRITES: Readonly<Record<string, StageSprites>> = {
  'forgotten-cellar': FORGOTTEN_CELLAR,
};
