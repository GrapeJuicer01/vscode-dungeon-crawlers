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
  // Frozen Citadel (batch E4): cold blue-gray stone, ice blue, pale cyan light, frost white (sparse
  // highlights only). Floors stay mid-dark; the ambient tint is a cool blue-gray (blue-dominant, so
  // never red-dominant), and the stage's enemies stay brighter and warmer than the stone.
  'frozen-citadel': {
    '1': '#0e1424', // deepest shadow
    '2': '#27334d', // dark citadel stone
    '3': '#41567a', // mid stone
    '4': '#617da2', // lit stone
    '5': '#86cdf0', // ice blue
    '6': '#c4f6ff', // pale cyan light
    '7': '#f2fbff', // frost white
    '8': '#1fb2b8', // teal accent (away from the Mage's cloth blue)
    g: '#64759b', // ambient tint, cool blue-gray (kept dark so every class cloth has contrast >= 2.0)
    T: '#bfe8ff', // pale blue light
  },
  // Shadow Realm (batch E4): dark desaturated indigo stone, violet crystal, lilac-white wisp light,
  // cold cyan accent. The stone is bluer and grayer than the Necromancer's hood violet, never
  // black; entities are drawn after the light map so heroes are not darkened by the ambient tint.
  'shadow-realm': {
    '1': '#0c0b1c', // deepest shadow
    '2': '#25233f', // dark indigo stone
    '3': '#3f3d66', // mid indigo stone
    '4': '#65629a', // lit stone
    '5': '#9a6cf0', // violet crystal
    '6': '#e6d4ff', // lilac-white wisp light
    '7': '#f8f2ff', // pale highlight
    '8': '#38d0e8', // cold cyan accent
    g: '#6a62a0', // ambient tint, dark indigo-violet
    T: '#c8a0ff', // soft violet light
  },
  // Dragon's Lair (batch E5): dark red-brown cavern stone, bronze, warm gold light, pale gold
  // highlights (sparse), teal accent (away from the Mage's cloth blue). The floor tiles stay
  // mid-dark so every class cloth keeps contrast (the Necromancer's cloth caps the floor at about
  // 0.0325 luminance after the ambient multiply); the heat reads through the backdrop glow, lights,
  // and gold accents. The ambient tint is a warm sand-bronze (red at most 1.3 times green or blue).
  'dragons-lair': {
    '1': '#1a0a0c', // deepest shadow
    '2': '#3e1a16', // dark red-brown stone
    '3': '#6a281c', // mid stone
    '4': '#94422c', // lit stone
    '5': '#c8963e', // bronze
    '6': '#ffd45c', // warm gold light
    '7': '#fff1be', // pale gold highlight
    '8': '#2cb5a6', // teal accent
    g: '#8a7a68', // ambient tint, warm sand-bronze
    T: '#ffd070', // warm gold light
  },
  // Void Spire (batch E5): very dark slate-blue stone, deep teal-slate, pale magenta-white rift
  // light, cold highlight, cyan accent. Slate-blue, not the indigo of the Shadow Realm; floors stay
  // legible (never black); enemies stay brighter and more saturated than the stone.
  'void-spire': {
    '1': '#06080f', // deepest shadow
    '2': '#1c2538', // dark slate stone
    '3': '#2c3a56', // mid slate stone
    '4': '#44587c', // lit stone
    '5': '#2f6f86', // deep teal-slate
    '6': '#f2d2ff', // pale magenta-white rift light
    '7': '#d8f4ff', // cold highlight
    '8': '#3de0f0', // cyan accent
    g: '#4e5f86', // ambient tint, dark slate-blue
    T: '#f0c8ff', // pale magenta-white light
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
