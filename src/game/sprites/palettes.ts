// Palettes for every sprite, tile, light, and particle (batch A0).
// Owned by the pixel-artist. Sprites reference single characters; raw hex lives only in this file.
// Rules and meanings: docs/design/art-style-guide.md section 3 and docs/design/sprite-spec.md.

/** One character -> '#rrggbb'. '.' is transparent and is never a key. */
export type Palette = Record<string, string>;

/**
 * The master palette (33 colors). Groups:
 * - hero:      o outline, s skin, h hair, e eye, c cloth, d cloth shade, b pants, k boots/wood trim,
 *              m metal, w white highlight, a accent (class color; neutral sand in the base hero)
 * - fire:      Y yellow core, O orange, R red-orange, D dark ember
 * - campfire:  W log, V log light, G stone, P stone shade
 * - stage 1:   1 to 8, the forgotten-cellar tile palette (see STAGE_TILE_CHARS)
 * - world:     n clear color (near-black), g ambient darkness tint
 * - light:     T torch light, F campfire light
 * - particle:  q water light, Q water mid
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
};

/** Stage id -> the character that fills the background (near-black, luminance under 0.02). */
export const STAGE_CLEAR_CHAR: Readonly<Record<string, string>> = {
  'forgotten-cellar': 'n',
};

/** Stage id -> the darkness tint multiplied over the environment (cool gray-blue, never black). */
export const STAGE_AMBIENT_CHAR: Readonly<Record<string, string>> = {
  'forgotten-cellar': 'g',
};

/** Warm light colors added into the light map. */
export const LIGHT_CHARS: { readonly torch: string; readonly campfire: string } = {
  torch: 'T',
  campfire: 'F',
};

/** Particle color ramps, bright to dim by age. */
export const PARTICLE_PALETTE: Readonly<
  Record<'ember' | 'spark' | 'drip' | 'splash', readonly string[]>
> = {
  ember: ['Y', 'O', 'R', 'D'],
  spark: ['w', 'Y', 'O'],
  drip: ['q', 'Q', '8'],
  splash: ['w', 'q', 'Q'],
};
