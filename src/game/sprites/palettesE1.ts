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
  // Toxic Slime Caverns (batch E2): murky teal rock, olive crust, acid-green glow, aqua slime.
  // Rock stays darker and less saturated than the stage's enemies.
  'toxic-slime-caverns': {
    '1': '#0b1816', // deepest shadow
    '2': '#1d3836', // dark rock
    '3': '#2f5652', // mid rock
    '4': '#4b7d73', // lit rock
    '5': '#7b7a3a', // olive crust and old metal
    '6': '#b4ff3c', // acid glow
    '7': '#dcf5c6', // pale highlight
    '8': '#3fd0a0', // aqua slime accent
    g: '#5a8a80', // ambient tint, teal gray
    T: '#8fe84a', // glow light
  },
  // Ancient Catacombs (batch E2): dusty purple stone, bone beige, cold mint candle light.
  'ancient-catacombs': {
    '1': '#150f1c', // deepest shadow
    '2': '#2e2438', // dark stone
    '3': '#4f4160', // mid stone
    '4': '#76668a', // lit stone
    '5': '#b8a67c', // bone beige
    '6': '#b8fff0', // cold candle flame
    '7': '#f2ead2', // bone white
    '8': '#a85cf0', // violet accent
    g: '#6a5a92', // ambient tint, dusty violet
    T: '#8fe8d8', // candle light
  },
  // Enchanted Forest Ruins (batch E3): moss green over ruin gray, glowing blue flora. The stone
  // stays darker and less saturated than the stage's enemies (moss and bright accents).
  'enchanted-forest-ruins': {
    '1': '#0b1511', // deepest shadow
    '2': '#222f29', // dark ruin stone
    '3': '#3b4f43', // mid stone
    '4': '#62786a', // lit stone
    '5': '#5fa24a', // moss green
    '6': '#7fe4ff', // glowing blue flora
    '7': '#e6f3dc', // pale highlight
    '8': '#3f8cff', // deep blue bloom
    g: '#3f7468', // ambient tint, dark blue-green
    T: '#7fd0ff', // soft blue bloom light
  },
  // Molten Core (batch E3): basalt black and charcoal, rust iron, orange glow, hot yellow-white.
  // The ambient tint is a dark neutral warm gray-brown (red at most 1.3 times the larger of green
  // and blue); the glow reads through lights and bright art, never a red wash over a hero.
  'molten-core': {
    '1': '#0e0a0c', // basalt black
    '2': '#241d22', // dark charcoal
    '3': '#3a3238', // mid charcoal
    '4': '#5d5059', // lit basalt
    '5': '#a8643c', // rust iron
    '6': '#ff7a1c', // glowing orange
    '7': '#ffe49a', // hot yellow-white
    '8': '#7a2a1c', // deep red-brown
    g: '#6b6058', // ambient tint, gray-brown
    T: '#ffa040', // warm orange light
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
