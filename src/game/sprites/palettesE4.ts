// Boss phase palettes for batch E4 (Stages 7 and 8). Owned by the pixel-artist.
// Kept apart from palettesE1.ts to palettesE3.ts so the new bosses are not live until the barrel
// wiring step (enemyTemplates.ts merges this table). Each entry overrides at most four characters
// and applies once, at the phase transition.

import type { Palette } from './palettes';

export const BOSS_PHASE_PALETTES_E4: Readonly<Record<string, readonly Palette[]>> = {
  // Glacier Mammoth phase 2: the coat (5) turns aurora teal, its frost and tusk shade (6) a pale
  // mint, the ivory and tufts (7) pure white, and the torn banner stripe (8) a deep sky blue
  'glacier-mammoth': [{ '5': '#35c9b3', '6': '#a6f2e2', '7': '#ffffff', '8': '#2e8fe0' }],
  // Eclipse Warden phase 2: the corona (5 outer rim, 6 ring, 7 hot spots and flares) moves to pale
  // magenta-white and the eyes (8) to hot pink, while the dark disc (2 3 4) stays as it is
  'eclipse-warden': [{ '5': '#c84fd6', '6': '#ffc6ef', '7': '#fff0fa', '8': '#ff62c8' }],
};
