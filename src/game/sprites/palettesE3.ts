// Boss phase palettes for batch E3 (Stages 5 and 6). Owned by the pixel-artist.
// Kept apart from palettesE1.ts and palettesE2.ts so the new bosses are not live until the barrel
// wiring step (enemyTemplates.ts merges this table). Each entry overrides at most four characters.

import type { Palette } from './palettes';

export const BOSS_PHASE_PALETTES_E3: Readonly<Record<string, readonly Palette[]>> = {
  // Elder Dryad phase 2: the leaves (L light, N shade) turn warm autumn orange and the blossoms
  // (w petals, a centers) turn white-gold, over the same silhouette
  'elder-dryad': [{ L: '#ff9a3c', N: '#c8501c', w: '#fff6d8', a: '#ffe08a' }],
  // Molten Colossus phase 2: the cracks and the furnace glow go white-hot (6 glow, 7 core, 8 deep
  // glow) and the rust bands heat up (5)
  'molten-colossus': [{ '6': '#ffd24a', '7': '#ffffff', '8': '#ff7a1c', '5': '#d8883c' }],
};
