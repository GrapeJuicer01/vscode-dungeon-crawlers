// Legibility measurements shared by the E5 art test (test/game/stagesE5Art.test.ts), the calibration
// test (test/game/legibilityCalibration.test.ts), and the artist's scratch command
// (test/support/legibilityReport.mjs). Pure functions over an ArtSet and plain palettes: nothing here
// reads the wired art unless the caller passes SHIPPED_ART, so a candidate stage palette can be
// measured BEFORE it is wired in.
//
// Measures (E5 plan section 7, note 8):
//  - floor luminance: mean WCAG relative luminance of the floorBack and floorFront tile frame 0 after
//    the stage ambient multiply (`tile * g / 255` per channel), '.' pixels skipped;
//  - cloth contrast: WCAG contrast between that floor mean and the `c` cloth colour of each of the
//    twelve classes (the base hero cloth is reported too);
//  - mean floor colour: the mean RGB of the same tinted pixels, for the "distinct stages" rule.
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';

export type Rgb = readonly [number, number, number];

export function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of an sRGB colour (channels 0..255, fractions allowed). */
export function relLum([r, g, b]: Rgb): number {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two relative luminances. */
export const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Rows of the first frame of the first animation (tiles use one). */
export function firstFrame(t: SpriteTemplate): readonly string[] {
  const frames = Object.values(t.animations)[0];
  const frame = frames?.[0];
  if (!frame) throw new Error(`template ${t.id} has no frame`);
  return frame;
}

export interface FloorMeasure {
  /** Mean relative luminance of the tinted floor pixels. */
  readonly luminance: number;
  /** Mean tinted RGB, 0..255. */
  readonly color: Rgb;
}

/**
 * Measure a floor. `resolve` maps a template character to '#rrggbb' (stage palette over master);
 * `ambient` is the stage `g` colour. The two tiles are floorBack and floorFront.
 */
export function measureFloor(
  tiles: readonly SpriteTemplate[],
  resolve: (ch: string) => string,
  ambient: string,
): FloorMeasure {
  const g = rgb(ambient);
  let lum = 0;
  let count = 0;
  const sum = [0, 0, 0];
  for (const tile of tiles) {
    for (const line of firstFrame(tile)) {
      for (const ch of line) {
        if (ch === '.') continue;
        const c = rgb(resolve(ch));
        const t: Rgb = [(c[0] * g[0]) / 255, (c[1] * g[1]) / 255, (c[2] * g[2]) / 255];
        lum += relLum(t);
        sum[0]! += t[0];
        sum[1]! += t[1];
        sum[2]! += t[2];
        count += 1;
      }
    }
  }
  if (count === 0) throw new Error('floor tiles have no opaque pixel');
  return { luminance: lum / count, color: [sum[0]! / count, sum[1]! / count, sum[2]! / count] };
}

/** The `c` cloth colour of the base hero and of each class, by name. Twelve classes plus 'base'. */
export function clothColors(art: ArtSet): ReadonlyMap<string, string> {
  const base = art.palette['c'];
  if (!base) throw new Error('master palette has no c');
  const out = new Map<string, string>([['base', base]]);
  for (const id of Object.keys(art.classPalettes)) {
    out.set(id, art.classPalettes[id]?.['c'] ?? base);
  }
  return out;
}

/** Floor measure of one wired stage (E4 rules: `g` from the stage palette, then the master). */
export function stageFloor(art: ArtSet, stageId: string): FloorMeasure {
  const sprites = art.stageSprites[stageId];
  const back = sprites?.tiles.floorBack[0];
  const front = sprites?.tiles.floorFront[0];
  if (!back || !front) throw new Error(`${stageId}: no floor tiles`);
  const resolve = (ch: string): string => {
    const hex = art.stagePalettes[stageId]?.[ch] ?? art.palette[ch];
    if (!hex) throw new Error(`${stageId}: character ${ch} has no colour`);
    return hex;
  };
  return measureFloor([back, front], resolve, resolve('g'));
}

export interface ClothContrasts {
  readonly byClass: ReadonlyMap<string, number>;
  readonly min: number;
  readonly minClass: string;
}

export function clothContrasts(art: ArtSet, floorLuminance: number): ClothContrasts {
  const byClass = new Map<string, number>();
  let min = Infinity;
  let minClass = '';
  for (const [name, hex] of clothColors(art)) {
    const ratio = contrast(relLum(rgb(hex)), floorLuminance);
    byClass.set(name, ratio);
    if (ratio < min) {
      min = ratio;
      minClass = name;
    }
  }
  return { byClass, min, minClass };
}

/**
 * The highest floor luminance that keeps `required` contrast against every cloth when the floor is the
 * darker side (the case for every shipped stage): `(Lc + 0.05) / required - 0.05` minimised over the
 * cloths. This is the Necromancer-limited ceiling for a Stage 9 floor.
 */
export function floorCeiling(art: ArtSet, required: number): { value: number; limitedBy: string } {
  let value = Infinity;
  let limitedBy = '';
  for (const [name, hex] of clothColors(art)) {
    const ceiling = (relLum(rgb(hex)) + 0.05) / required - 0.05;
    if (ceiling < value) {
      value = ceiling;
      limitedBy = name;
    }
  }
  return { value, limitedBy };
}

export interface StageRow {
  readonly id: string;
  readonly floor: FloorMeasure;
  readonly cloth: ClothContrasts;
}

/** Rows for the given stage ids, in order. */
export function legibilityRows(art: ArtSet, stageIds: readonly string[]): readonly StageRow[] {
  return stageIds.map((id) => {
    const floor = stageFloor(art, id);
    return { id, floor, cloth: clothContrasts(art, floor.luminance) };
  });
}

export const colorDistance = (a: Rgb, b: Rgb): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Smallest pairwise distance between the mean floor colours of the rows (rule 4 calibration). */
export function minPairwiseDistance(rows: readonly StageRow[]): {
  value: number;
  a: string;
  b: string;
} {
  let best = { value: Infinity, a: '', b: '' };
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const d = colorDistance(rows[i]!.floor.color, rows[j]!.floor.color);
      if (d < best.value) best = { value: d, a: rows[i]!.id, b: rows[j]!.id };
    }
  }
  return best;
}

export interface Calibration {
  /** Smallest cloth contrast over all rows and classes (the E5 cloth rule is >= 2.0; this is the evidence). */
  readonly minContrast: number;
  readonly minContrastAt: string;
  readonly brightest: number;
  readonly darkest: number;
  /** Rule 2: Stage 9 floor <= 1.3 x brightest. */
  readonly stage9Ceiling: number;
  /** Rule 3: Stage 10 floor >= 0.7 x darkest. */
  readonly stage10Floor: number;
  readonly minDistance: { value: number; a: string; b: string };
  /** Cloth-limited ceiling for a floor to keep contrast 2.0 (rule 1). */
  readonly clothCeiling: { value: number; limitedBy: string };
}

export function calibrate(art: ArtSet, rows: readonly StageRow[]): Calibration {
  let minContrast = Infinity;
  let minContrastAt = '';
  for (const r of rows) {
    if (r.cloth.min < minContrast) {
      minContrast = r.cloth.min;
      minContrastAt = `${r.cloth.minClass} on ${r.id}`;
    }
  }
  const lums = rows.map((r) => r.floor.luminance);
  const brightest = Math.max(...lums);
  const darkest = Math.min(...lums);
  return {
    minContrast,
    minContrastAt,
    brightest,
    darkest,
    stage9Ceiling: 1.3 * brightest,
    stage10Floor: 0.7 * darkest,
    minDistance: minPairwiseDistance(rows),
    clothCeiling: floorCeiling(art, 2.0),
  };
}

export function formatTable(rows: readonly StageRow[], cal?: Calibration): string {
  const classNames = rows[0] ? [...rows[0].cloth.byClass.keys()] : [];
  const lines = [`stage floor lum  min  ${classNames.join(' ')}`];
  rows.forEach((r, i) => {
    const per = classNames.map((n) => r.cloth.byClass.get(n)!.toFixed(2)).join(' ');
    const [cr, cg, cb] = r.floor.color.map((v) => Math.round(v));
    lines.push(
      `${String(i + 1).padStart(2)} ${r.id} lum ${r.floor.luminance.toFixed(4)} rgb ${cr},${cg},${cb} ` +
        `min ${r.cloth.min.toFixed(3)} (${r.cloth.minClass}) | ${per}`,
    );
  });
  if (cal) {
    lines.push(
      `minimum cloth contrast ${cal.minContrast.toFixed(4)} (${cal.minContrastAt})`,
      `floor luminance brightest ${cal.brightest.toFixed(4)}, darkest ${cal.darkest.toFixed(4)}`,
      `rule 1 ceiling for a darker floor (contrast 2.0 vs every cloth) ${cal.clothCeiling.value.toFixed(4)} (limited by ${cal.clothCeiling.limitedBy})`,
      `rule 2 Stage 9 floor <= ${cal.stage9Ceiling.toFixed(4)}; rule 3 Stage 10 floor >= ${cal.stage10Floor.toFixed(4)}`,
      `rule 4 smallest pairwise mean floor colour distance ${cal.minDistance.value.toFixed(1)} (${cal.minDistance.a} vs ${cal.minDistance.b})`,
    );
  }
  return lines.join('\n');
}
