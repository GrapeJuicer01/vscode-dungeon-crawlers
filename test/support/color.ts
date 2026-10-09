// Color helpers for the art tests.

/**
 * True for a saturated red or red-orange (hue within 18 degrees of red, saturation above 0.5):
 * blood or war-paint red, and the master fire red `R`. Fur brown (hue about 30) is not red.
 * The 18 degree cutoff is pinned in test/game/color.test.ts. Margins: master `R` (hue 15.3) is
 * 2.7 degrees inside; copper `Z` (hue 21.2) is 3.2 degrees outside and `C` (23.5) 5.5 outside.
 */
export function isRedHex(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (max === 0 || chroma / max <= 0.5) {
    return false;
  }
  let hue: number;
  if (max === r) {
    hue = (60 * (g - b)) / chroma;
  } else if (max === g) {
    hue = 60 * (2 + (b - r) / chroma);
  } else {
    hue = 60 * (4 + (r - g) / chroma);
  }
  hue = (hue + 360) % 360;
  return hue <= 18 || hue >= 342;
}
