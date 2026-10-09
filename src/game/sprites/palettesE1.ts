// Per-stage partial palettes (batch E1, decision E1-2). Owned by the pixel-artist.
// A stage palette overrides only the stage tile characters `1` to `8` (and `g` ambient, `T` torch
// light when the stage needs its own). The engine builds a stage sheet from the master palette
// plus STAGE_PALETTES[stageId]. Zero new master characters per stage. Stage 1 keeps the master
// values, so its entry is empty. Mood per docs/design/art-style-guide.md section 8.

import type { Palette } from './palettes';

export const STAGE_PALETTES: Readonly<Record<string, Palette>> = {
  'forgotten-cellar': {},
  // Goblin Mine Shafts: timber brown, ore glints, lantern yellow.
  'goblin-mine-shafts': {
    '1': '#1a120d', // deep shaft shadow
    '2': '#3b2a1e', // dark rock
    '3': '#5f4430', // rock and old timber
    '4': '#8c6a46', // lit rock
    '5': '#b07a3c', // fresh timber
    '6': '#ffd24a', // lantern yellow
    '7': '#f2e8c8', // chalk and ore sparkle
    '8': '#62d0bc', // ore glint (teal)
    g: '#7a6a84', // ambient tint, warmer than the cellar
    T: '#ffc94a', // lantern light
  },
};

/**
 * Boss id -> palettes for phases 2..n: partial overrides (at most four characters) applied over
 * the master (and stage) palette. Same silhouette, hotter colors. Enemy-only; heroes never get a
 * phase. Re-exported through enemyTemplates.ts as ENEMY_PHASE_PALETTES.
 */
export const BOSS_PHASE_PALETTES: Readonly<Record<string, readonly Palette[]>> = {
  // Rat King phase 2: hot red-orange cape (d main, b shade), orange crown, brighter jewel
  'rat-king': [{ d: '#d8452c', b: '#8f2a1c', a: '#ff9a2e', R: '#ff3a2a' }],
  // Goblin Foreman phase 2: white-hot lantern (Y core, O glow) and an orange hard hat (6)
  'goblin-foreman': [{ Y: '#fff6c0', O: '#ff5a1c', '6': '#ff8a2c' }],
};
