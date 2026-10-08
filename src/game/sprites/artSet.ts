// Gathers the pixel-artist's exports into the ArtSet the engine consumes. Developer-owned glue:
// the art files stay untouched, and tests validate this exact object with spriteValidator.
import type { ArtSet } from './spriteFactory';
import {
  CLASS_PALETTES,
  HAIR_COLORS,
  LIGHT_CHARS,
  MASTER_PALETTE,
  PARTICLE_PALETTE,
  SKIN_TONES,
  STAGE_AMBIENT_CHAR,
  STAGE_CLEAR_CHAR,
  STAGE_TILE_CHARS,
} from './palettes';
import {
  BASE_HERO,
  CAMPFIRE,
  CLASS_LAYERS,
  EFFECT_SPRITES,
  STAGE_SPRITES,
} from './spriteTemplates';

export const SHIPPED_ART: ArtSet = {
  palette: MASTER_PALETTE,
  skinTones: SKIN_TONES,
  hairColors: HAIR_COLORS,
  baseHero: BASE_HERO,
  campfire: CAMPFIRE,
  stageSprites: STAGE_SPRITES,
  particlePalette: PARTICLE_PALETTE,
  lightChars: LIGHT_CHARS,
  stageAmbientChar: STAGE_AMBIENT_CHAR,
  stageClearChar: STAGE_CLEAR_CHAR,
  stageTileChars: STAGE_TILE_CHARS,
  classLayers: CLASS_LAYERS,
  classPalettes: CLASS_PALETTES,
  effects: EFFECT_SPRITES,
};
