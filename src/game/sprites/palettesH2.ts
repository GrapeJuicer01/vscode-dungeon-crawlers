// Class palettes for batch H2 (Cleric, Paladin, Necromancer, Bard). Owned by the pixel-artist.
// Kept in its own file; palettes.ts merges it into the exported CLASS_PALETTES (docs/design/sprite-spec.md section 4).
// Same rules as H1: partial palettes that recolor only `a c d b k m`, never `o s h e w`. No new
// master characters were needed, so the master palette stays at 33 colors (cap 48).

import type { Palette } from './palettes';
import type { ClassPaletteIdH2 } from './spriteTypes';

export const CLASS_PALETTES_H2: Readonly<Record<ClassPaletteIdH2, Palette>> = {
  // white + gold: cream-white robe, deep gold trim, pale gold mace head
  cleric: {
    a: '#e8a820',
    c: '#f3f0e6',
    d: '#b7bcd6',
    b: '#a8926c',
    k: '#7a5634',
    m: '#f6e49a',
  },
  // gold + white: gold plate, soft white tabard, wings and cape, pale glowing blade
  paladin: {
    a: '#dde3f4',
    c: '#f0b830',
    d: '#b27a18',
    b: '#c9ccd8',
    k: '#8a5a2a',
    m: '#fff1b0',
  },
  // dark purple + sickly green: violet robe, acid-green glow, bone-colored skull
  necromancer: {
    a: '#8fe03c',
    c: '#7a3fc0',
    d: '#4b2480',
    b: '#2d2238',
    k: '#3a2a30',
    m: '#e8e4c4',
  },
  // teal + magenta: teal doublet, magenta feather and sash, golden lute body
  bard: {
    a: '#e0409a',
    c: '#20b4a6',
    d: '#157d80',
    b: '#5a3f86',
    k: '#8a4e26',
    m: '#f0cf72',
  },
};
