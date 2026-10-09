// Palettes for every sprite, tile, light, and particle (batch A0).
// Owned by the pixel-artist. Sprites reference single characters; raw hex lives only in this file.
// Rules and meanings: docs/design/art-style-guide.md section 3 and docs/design/sprite-spec.md.

import { CLASS_PALETTES_H2 } from './palettesH2';
import { CLASS_PALETTES_H3 } from './palettesH3';
import { STAGE_PALETTES } from './palettesE1';
import type { ClassPaletteId, ClassPaletteIdH1 } from './spriteTypes';

/** One character -> '#rrggbb'. '.' is transparent and is never a key. */
export type Palette = Record<string, string>;

/**
 * The master palette (37 colors). Groups:
 * - hero:      o outline, s skin, h hair, e eye, c cloth, d cloth shade, b pants, k boots/wood trim,
 *              m metal, w white highlight, a accent (class color; neutral sand in the base hero)
 * - fire:      Y yellow core, O orange, R red-orange, D dark ember
 * - campfire:  W log, V log light, G stone, P stone shade
 * - stage 1:   1 to 8, the forgotten-cellar tile palette (see STAGE_TILE_CHARS)
 * - world:     n clear color (near-black), g ambient darkness tint
 * - light:     T torch light, F campfire light
 * - particle:  q water light, Q water mid
 * - summon:    L glow green, N shade green (skeleton eye and rise/sink puff)
 * - copper:    C copper, Z copper shade (Artificer wrench effect, A3-1)
 */
export const MASTER_PALETTE: Palette = {
  // hero
  o: '#1b1426',
  s: '#f6bf94',
  h: '#8a4f2a',
  e: '#14102a',
  c: '#4fa3e8',
  d: '#2f6fb5',
  b: '#4a4f8f',
  k: '#7a4426',
  m: '#b9c4d6',
  w: '#ffffff',
  a: '#e7c26a',
  // fire
  Y: '#ffe680',
  O: '#ff9a2e',
  R: '#e8501c',
  D: '#8f2a1c',
  // campfire stones and logs
  W: '#6b4226',
  V: '#946036',
  G: '#8a8794',
  P: '#5a5766',
  // stage 1, the forgotten cellar (damp stone gray-brown plus torch orange)
  '1': '#17131a',
  '2': '#342d33',
  '3': '#54483f',
  '4': '#7c6c5c',
  '5': '#8a5a32',
  '6': '#f08a2c',
  '7': '#e8dfc4',
  '8': '#4a7fae',
  // world
  n: '#0a0810',
  g: '#59638a',
  // light colors
  T: '#ffb04a',
  F: '#ff9638',
  // water particles
  q: '#cfeaff',
  Q: '#8fc0ec',
  // summon glow (appended in A2-1 for the skeleton's eye and rise/sink puff)
  L: '#8fe03c',
  N: '#3f9a3c',
  // copper (A3-1, the wrench effect; effects are never class-swapped so copper needs its own characters)
  C: '#d9824a',
  Z: '#9a4f26',
};

/** Four skin tones, partial palettes overriding only `s`. Index 0 equals the master skin. */
export const SKIN_TONES: readonly Palette[] = [
  { s: '#f6bf94' },
  { s: '#e0a070' },
  { s: '#b97a4e' },
  { s: '#7d4c30' },
];

/** Six hair colors, partial palettes overriding only `h`. Index 0 equals the master hair. */
export const HAIR_COLORS: readonly Palette[] = [
  { h: '#8a4f2a' },
  { h: '#2a2230' },
  { h: '#e8c04a' },
  { h: '#c8441f' },
  { h: '#9aa4b8' },
  { h: '#7a4cc0' },
];

/** Stage id -> the (at most 8) characters its tiles, props, and backdrop may use. */
export const STAGE_TILE_CHARS: Readonly<Record<string, string>> = {
  'forgotten-cellar': '12345678',
  'goblin-mine-shafts': '12345678',
};

/** Stage id -> the character that fills the background (near-black, luminance under 0.02). */
export const STAGE_CLEAR_CHAR: Readonly<Record<string, string>> = {
  'forgotten-cellar': 'n',
  'goblin-mine-shafts': 'n',
};

/** Stage id -> the darkness tint multiplied over the environment (cool gray-blue, never black). */
export const STAGE_AMBIENT_CHAR: Readonly<Record<string, string>> = {
  'forgotten-cellar': 'g',
  'goblin-mine-shafts': 'g',
};

/** Stage id -> partial palette over the master (characters 1 to 8, g, T). See palettesE1.ts. */
export { STAGE_PALETTES };

/** Warm light colors added into the light map. */
export const LIGHT_CHARS: { readonly torch: string; readonly campfire: string } = {
  torch: 'T',
  campfire: 'F',
};

/** Particle color ramps, bright to dim by age. */
export const PARTICLE_PALETTE: Readonly<
  Record<'ember' | 'spark' | 'drip' | 'splash' | 'mote', readonly string[]>
> = {
  ember: ['Y', 'O', 'R', 'D'],
  spark: ['w', 'Y', 'O'],
  drip: ['q', 'Q', '8'],
  splash: ['w', 'q', 'Q'],
  // warm dust (stage 2 ambient): sand, light wood, dark wood; master characters, no new colors
  mote: ['a', 'V', 'W'],
};

/**
 * Class palettes (batch A1-1): partial palettes that recolor only `a c d b k m` (accent, cloth,
 * cloth shade, pants, boots, metal). Never `o s h e w`. Applied after the master and before skin
 * and hair. Red stays on small parts (Warrior plume, accents, shield), never the whole body.
 * No new master characters were needed, so the master stays at 33 colors (cap 48).
 */
export const CLASS_PALETTES_H1: Readonly<Record<ClassPaletteIdH1, Palette>> = {
  // red + steel: steel cloth, red accent (plume, trim, shield), dark brown leather
  warrior: {
    a: '#d83a3a',
    c: '#8d9ab4',
    d: '#5c6886',
    b: '#5a4a52',
    k: '#5a3826',
    m: '#d8e0ee',
  },
  // blue + gold: royal blue robe, gold trim, indigo pants, pale blue orb metal
  mage: {
    a: '#f4c430',
    c: '#3f6fe0',
    d: '#2a47a8',
    b: '#35358a',
    k: '#6a4020',
    m: '#a9d6ff',
  },
  // forest green + brown: leaf-green tunic, brown leather accent, dark wood
  archer: {
    a: '#a8703a',
    c: '#3fa650',
    d: '#276b35',
    b: '#6b4a2a',
    k: '#46301c',
    m: '#c9d1c0',
  },
  // slate + purple: slate cloth, purple accent, near-black pants, cool steel
  rogue: {
    a: '#a05ae6',
    c: '#5f6e88',
    d: '#3e4862',
    b: '#2d3144',
    k: '#392a3c',
    m: '#c4cad8',
  },
};

/** All class palettes (H1 + H2 + H3, twelve classes). */
export const CLASS_PALETTES: Readonly<Record<ClassPaletteId, Palette>> = {
  ...CLASS_PALETTES_H1,
  ...CLASS_PALETTES_H2,
  ...CLASS_PALETTES_H3,
};
