// Banded lighting (docs/architecture/game-engine.md section 10). A quarter-resolution light map is
// cleared to the stage ambient colour, radial banded bitmaps are added into it with the 'lighter'
// composite, and the map is scaled up onto the target with 'multiply' and smoothing off. Radial
// bitmaps are generated from pixel math at construction (alpha = intensity band), never drawn
// from art. Only the environment is lit: entities are drawn after compose().
import type { Palette } from './sprites/palettes';
import { hexToRgb } from './sprites/spriteFactory';
import type { Bitmap, BitmapFactory, OffscreenSurface, Surface } from './ports';
import {
  LIGHT_BANDS,
  LIGHT_MAP_HEIGHT,
  LIGHT_MAP_SCALE,
  LIGHT_MAP_WIDTH,
  LIGHT_RADIUS_MAX_PX,
  LIGHT_RADIUS_STEP_PX,
  MAX_LIGHTS,
} from './data/tuning';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './layout';

export interface LightSource {
  x: number;
  y: number;
  /** Radius in screen px; rounded to the nearest LIGHT_RADIUS_STEP_PX. */
  radius: number;
  /** 0..1, applied as the draw alpha. */
  intensity: number;
  /** Index into the `lightChars` the Lighting was constructed with. */
  colorIndex: number;
}

const RADIUS_STEPS = Math.floor(LIGHT_RADIUS_MAX_PX / LIGHT_RADIUS_STEP_PX);

export class Lighting {
  readonly #map: OffscreenSurface;
  readonly #ambient: string;
  /** colorIndex -> radius step (1-based) -> bitmap. */
  readonly #radial: readonly (readonly Bitmap[])[];
  readonly #radialSize: readonly number[];
  #count = 0;

  constructor(
    bitmaps: BitmapFactory,
    palette: Palette,
    ambientChar: string,
    lightChars: readonly string[],
  ) {
    this.#map = bitmaps.createOffscreen(LIGHT_MAP_WIDTH, LIGHT_MAP_HEIGHT);
    this.#ambient = palette[ambientChar] ?? '#808080';
    const sizes: number[] = [];
    const radial: Bitmap[][] = [];
    for (const ch of lightChars) {
      const rgb = hexToRgb(palette[ch] ?? '#ffffff');
      const list: Bitmap[] = [];
      for (let step = 1; step <= RADIUS_STEPS; step++) {
        const radiusCells = (step * LIGHT_RADIUS_STEP_PX) / LIGHT_MAP_SCALE;
        const size = Math.ceil(radiusCells) * 2 + 1;
        list.push(bitmaps.fromRgba(size, size, radialRgba(size, radiusCells, rgb)));
        if (sizes.length < RADIUS_STEPS) {
          sizes.push(size);
        }
      }
      radial.push(list);
    }
    this.#radial = radial;
    this.#radialSize = sizes;
  }

  /** Clears the light map to the ambient colour and resets the light count. */
  begin(): void {
    this.#map.setComposite('source-over');
    this.#map.setAlpha(1);
    this.#map.clear(this.#ambient);
    this.#count = 0;
  }

  /** Adds a light; false once MAX_LIGHTS are in or the light is unusable. */
  add(light: LightSource): boolean {
    if (this.#count >= MAX_LIGHTS) {
      return false;
    }
    const list = this.#radial[light.colorIndex];
    if (list === undefined || !(light.radius > 0)) {
      return false;
    }
    const step = Math.min(
      RADIUS_STEPS,
      Math.max(1, Math.round(light.radius / LIGHT_RADIUS_STEP_PX)),
    );
    const bitmap = list[step - 1];
    const size = this.#radialSize[step - 1];
    if (bitmap === undefined || size === undefined) {
      return false;
    }
    const half = (size - 1) / 2;
    this.#map.setComposite('lighter');
    this.#map.setAlpha(Math.min(1, Math.max(0, light.intensity)));
    this.#map.drawBitmap(
      bitmap,
      Math.round(light.x / LIGHT_MAP_SCALE - half),
      Math.round(light.y / LIGHT_MAP_SCALE - half),
      false,
    );
    this.#map.setAlpha(1);
    this.#map.setComposite('source-over');
    this.#count++;
    return true;
  }

  get lightCount(): number {
    return this.#count;
  }

  /** Multiplies the light map, scaled 4x without smoothing, onto the target: one blit. */
  compose(target: Surface): void {
    target.setComposite('multiply');
    target.drawBitmapRegion(
      this.#map.bitmap,
      0,
      0,
      LIGHT_MAP_WIDTH,
      LIGHT_MAP_HEIGHT,
      0,
      0,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
    );
    target.setComposite('source-over');
  }
}

/** A banded radial falloff: colour fixed, alpha stepped in LIGHT_BANDS bands. */
function radialRgba(
  size: number,
  radiusCells: number,
  rgb: readonly [number, number, number],
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / radiusCells;
      if (d >= 1) {
        continue;
      }
      const band = Math.ceil((1 - d) * LIGHT_BANDS) / LIGHT_BANDS;
      const i = (y * size + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = Math.round(band * 255);
    }
  }
  return rgba;
}
