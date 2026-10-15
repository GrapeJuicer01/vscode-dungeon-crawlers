// Boss phase palettes for batch E5 (Stages 9 and 10). Owned by the pixel-artist.
// Kept apart from palettesE1.ts to palettesE4.ts so the new bosses are not live until the barrel
// wiring step (enemyTemplates.ts merges this table). Each entry overrides at most four characters
// and applies once, at the phase transition; neither adds a large bright area.

import type { Palette } from './palettes';

export const BOSS_PHASE_PALETTES_E5: Readonly<Record<string, readonly Palette[]>> = {
  // Hoard Dragon phase 2: the scales (R shade, D shadow) turn bright gold and deep amber, the
  // pale belly (a) turns pale amber, and the eye (Y) a hot white-gold, over the same silhouette
  'hoard-dragon': [{ R: '#e8a62a', D: '#a8641a', a: '#ffe7a8', Y: '#fff6d0' }],
  // Void Sovereign phase 2: the cleft glow and eyes (8) move from cyan to pale magenta-white, the
  // shard tips (6) to a soft pink, and the stars (7) to near-white, while the cloak (2 3 4) stays dark
  'void-sovereign': [{ '8': '#f2b8ff', '6': '#d890e8', '7': '#fff0fa', '5': '#6a3a8c' }],
};
