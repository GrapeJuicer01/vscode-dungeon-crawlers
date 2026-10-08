// Sprite data for the engine (the import point). Owned by the pixel-artist.
// Template types live in spriteTypes.ts; art lives in one file per subject so batches stay small:
// heroTemplates.ts (BASE_HERO), campfireTemplates.ts (CAMPFIRE), stage1Templates.ts (one file per
// stage). Format: docs/design/sprite-spec.md.

import { CAMPFIRE } from './campfireTemplates';
import { BASE_HERO } from './heroTemplates';
import { FORGOTTEN_CELLAR } from './stage1Templates';
import type { StageSprites } from './spriteTypes';

export type { CampfireSprites, HeroLayerSet, SpriteTemplate, StageSprites } from './spriteTypes';
export { BASE_HERO, CAMPFIRE };

/** Stage id -> sprites. Keys equal the ids in src/game/data/stages.ts and palettes.ts. */
export const STAGE_SPRITES: Readonly<Record<string, StageSprites>> = {
  'forgotten-cellar': FORGOTTEN_CELLAR,
};
