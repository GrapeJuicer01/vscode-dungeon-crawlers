// Class palettes for batch H3 (Druid, Monk, Artificer, Berserker). Owned by the pixel-artist.
// Kept in its own file; palettes.ts merges it into the exported CLASS_PALETTES (docs/design/sprite-spec.md section 4).
// Same rules as H1/H2: partial palettes that recolor only `a c d b k m`, never `o s h e w`.
// Berserker rule: war-paint red appears ONLY as the accent `a`, used for 2 to 3 fixed stripe pixels
// that are identical in every frame. Red never appears on a body, fur, or any effect.

import type { Palette } from './palettes';
import type { ClassPaletteIdH3 } from './spriteTypes';

export const CLASS_PALETTES_H3: Readonly<Record<ClassPaletteIdH3, Palette>> = {
  // earth brown + leaf green: brown wrap, bright leaf accent, mossy pants, pale bark staff
  druid: {
    a: '#5cba4a',
    c: '#9a6a3a',
    d: '#6b4526',
    b: '#4a5a30',
    k: '#5a3c22',
    m: '#d8c9a0',
  },
  // orange + cream: orange gi, cream sash and headband, brown pants, warm chi-glow metal
  monk: {
    a: '#f3e6c4',
    c: '#f08a2c',
    d: '#b85a1a',
    b: '#6a3a22',
    k: '#5a3822',
    m: '#ffe6a8',
  },
  // copper + teal: copper plating, teal lenses and pipes, slate-teal pants, light steel wrench
  artificer: {
    a: '#2cb4a8',
    c: '#c8743a',
    d: '#8f4a24',
    b: '#35566a',
    k: '#4a2e22',
    m: '#bfd4dc',
  },
  // fur brown + war paint: brown fur, red paint stripes ONLY via `a`, dark leather, plain steel axe
  berserker: {
    a: '#d03030',
    c: '#9a6a3c',
    d: '#6b4426',
    b: '#4a3a34',
    k: '#3a2616',
    m: '#c4c8d0',
  },
};
