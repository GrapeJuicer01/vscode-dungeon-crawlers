// Boss phase palettes for batch E2 (Stages 3 and 4). Owned by the pixel-artist.
// Kept apart from palettesE1.ts so the new bosses are not live until the barrel wiring step
// (enemyTemplates.ts merges this table). Each entry overrides at most four characters.

import type { Palette } from './palettes';

export const BOSS_PHASE_PALETTES_E2: Readonly<Record<string, readonly Palette[]>> = {
  // Ooze Queen phase 2: hot pink-orange glow in the body (L light, N shade) and a molten crown
  'ooze-queen': [{ L: '#ff9a6a', N: '#d8456a', a: '#ff5a1c', Y: '#fff6c0' }],
  // Tomb Lich phase 2: white-hot gem (Y core, O glow) and hotter violet trim (8, L)
  'tomb-lich': [{ Y: '#ffffff', O: '#ff7ac8', '8': '#ff5ad8', L: '#ffffff' }],
};
