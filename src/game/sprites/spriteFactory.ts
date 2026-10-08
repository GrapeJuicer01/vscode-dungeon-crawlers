// Turns palette-character templates into bitmaps (docs/design/sprite-spec.md, ADR 0003).
// Pure rasterizing and compositing live here; bitmaps come from the BitmapFactory port.
// Hero sprites are composited in character space (layers aligned on their anchors over the union
// bounds of every layer), then recoloured through the skin and hair swaps, then rasterized.
import type { Bitmap, BitmapFactory } from '../ports';
import type { ParticleKind } from '../Particles';
import type { Palette } from './palettes';
import type { CampfireSprites, HeroLayerSet, SpriteTemplate, StageSprites } from './spriteTypes';

/**
 * Skin and hair are indexes into the swap lists. `accent` is a CSS colour ('#rrggbb') that
 * overrides the `a` character (class accent colours, H1), or null for the master colour.
 */
export interface HeroLook {
  readonly skin: number;
  readonly hair: number;
  readonly accent: string | null;
  /** The class whose partial palette recolours the hero, or null for the base look (H1). */
  readonly classId: string | null;
}

export interface FrameSet {
  readonly w: number;
  readonly h: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly frames: readonly Bitmap[];
}

/** Animation name -> frames. */
export type HeroSprites = Readonly<Record<string, FrameSet>>;

/** Everything the engine reads from the art files, gathered once (see artSet.ts). */
export interface ArtSet {
  readonly palette: Palette;
  readonly skinTones: readonly Palette[];
  readonly hairColors: readonly Palette[];
  readonly baseHero: HeroLayerSet;
  readonly campfire: CampfireSprites;
  readonly stageSprites: Readonly<Record<string, StageSprites>>;
  readonly particlePalette: Readonly<Record<ParticleKind, readonly string[]>>;
  readonly lightChars: { readonly torch: string; readonly campfire: string };
  readonly stageAmbientChar: Readonly<Record<string, string>>;
  readonly stageClearChar: Readonly<Record<string, string>>;
  /** Stage id -> the (at most 8) characters its templates may use. */
  readonly stageTileChars: Readonly<Record<string, string>>;
  /** Class id -> layers. A missing entry falls back to the base hero look (H1). */
  readonly classLayers: Readonly<Record<string, HeroLayerSet>>;
  /** Class id -> partial palette over `a c d b k m`, applied before skin and hair (H1). */
  readonly classPalettes: Readonly<Record<string, Palette>>;
  /** Effect id -> template (animation `idle`, centre anchor) (H1). */
  readonly effects: Readonly<Record<string, SpriteTemplate>>;
}

/** Extents in pixels left of, right of, above, and below the anchor. */
export interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly up: number;
  readonly down: number;
}

export interface LayerFrame {
  readonly rows: readonly string[];
  readonly w: number;
  readonly h: number;
  readonly anchor: { readonly x: number; readonly y: number };
}

/** '#rrggbb' to [r, g, b]. Anything malformed gives magenta so a bad palette is visible. */
export function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (m === null) {
    return [255, 0, 255];
  }
  return [parseInt(m[1] ?? '0', 16), parseInt(m[2] ?? '0', 16), parseInt(m[3] ?? '0', 16)];
}

/**
 * Pure: row strings to RGBA. '.' is transparent. An unknown character or a row of the wrong
 * length throws a RangeError with a fixed message (never the offending text).
 */
export function rasterizeFrame(
  rows: readonly string[],
  w: number,
  h: number,
  palette: Palette,
): Uint8ClampedArray {
  if (rows.length !== h) {
    throw new RangeError('Sprite frame height mismatch');
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  const cache = new Map<string, readonly [number, number, number]>();
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    if (row.length !== w) {
      throw new RangeError('Sprite row width mismatch');
    }
    for (let x = 0; x < w; x++) {
      const ch = row.charAt(x);
      if (ch === '.') {
        continue;
      }
      let rgb = cache.get(ch);
      if (rgb === undefined) {
        const hex = palette[ch];
        if (hex === undefined) {
          throw new RangeError('Unknown palette character');
        }
        rgb = hexToRgb(hex);
        cache.set(ch, rgb);
      }
      const i = (y * w + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function layersOf(layers: HeroLayerSet): readonly SpriteTemplate[] {
  const out: SpriteTemplate[] = [layers.body, layers.head];
  if (layers.gear !== null) {
    out.push(layers.gear);
  }
  out.push(layers.weapon);
  return out;
}

/** Extents covering every layer, so all animations share one anchor. */
export function heroBounds(layers: HeroLayerSet): Bounds {
  let left = 0;
  let right = 0;
  let up = 0;
  let down = 0;
  for (const t of layersOf(layers)) {
    left = Math.max(left, t.anchor.x);
    right = Math.max(right, t.w - 1 - t.anchor.x);
    up = Math.max(up, t.anchor.y);
    down = Math.max(down, t.h - 1 - t.anchor.y);
  }
  return { left, right, up, down };
}

/**
 * Pure, in character space: layers in the given order (body, head, gear, weapon), aligned on
 * their anchors; later layers overwrite where they are not '.'. Swaps are applied afterwards by
 * the palette used in rasterizeFrame.
 */
export function compositeHeroFrame(layers: readonly LayerFrame[], bounds: Bounds): string[] {
  const w = bounds.left + bounds.right + 1;
  const h = bounds.up + bounds.down + 1;
  const grid: string[][] = [];
  for (let y = 0; y < h; y++) {
    grid.push(new Array<string>(w).fill('.'));
  }
  for (const layer of layers) {
    const ox = bounds.left - layer.anchor.x;
    const oy = bounds.up - layer.anchor.y;
    for (let y = 0; y < layer.h; y++) {
      const row = layer.rows[y] ?? '';
      const target = grid[y + oy];
      if (target === undefined) {
        continue;
      }
      for (let x = 0; x < layer.w; x++) {
        const ch = row.charAt(x);
        if (ch !== '.' && x + ox >= 0 && x + ox < w) {
          target[x + ox] = ch;
        }
      }
    }
  }
  return grid.map((r) => r.join(''));
}

/** The composited character rows of one hero animation frame (also used by the validator). */
export function heroFrameRows(layers: HeroLayerSet, animation: string, index: number): string[] {
  const bounds = heroBounds(layers);
  const frames: LayerFrame[] = [];
  for (const t of layersOf(layers)) {
    const rows = t.animations[animation]?.[index];
    if (rows !== undefined) {
      frames.push({ rows, w: t.w, h: t.h, anchor: t.anchor });
    }
  }
  return compositeHeroFrame(frames, bounds);
}

export function heroFrameNames(layers: HeroLayerSet): readonly string[] {
  return Object.keys(layers.body.animations);
}

export class SpriteCache {
  readonly #bitmaps: BitmapFactory;
  readonly #art: ArtSet;
  readonly #heroes = new Map<string, HeroSprites>();
  readonly #sheets = new Map<string, FrameSet>();

  constructor(bitmaps: BitmapFactory, art: ArtSet) {
    this.#bitmaps = bitmaps;
    this.#art = art;
  }

  /** The class-less base hero's layers. */
  get baseHero(): HeroLayerSet {
    return this.#art.baseHero;
  }

  /** The layers of a class, or null when the art set has none (the caller falls back to base). */
  classLayers(id: string): HeroLayerSet | null {
    return this.#art.classLayers[id] ?? null;
  }

  /** The frames of a cosmetic effect, or null when the art set lacks it (the draw is skipped). */
  effect(id: string): FrameSet | null {
    const template = this.#art.effects[id];
    return template === undefined ? null : this.sheet(template);
  }

  /** Built lazily per look and layer set, then cached. */
  hero(look: HeroLook, layers: HeroLayerSet): HeroSprites {
    const key = [
      look.classId ?? '-',
      look.skin,
      look.hair,
      look.accent ?? '-',
      layers.body.id,
      layers.head.id,
      layers.gear?.id ?? '-',
      layers.weapon.id,
    ].join('|');
    const hit = this.#heroes.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const palette: Palette = {
      ...this.#art.palette,
      ...(look.classId === null ? {} : (this.#art.classPalettes[look.classId] ?? {})),
      ...(this.#art.skinTones[look.skin] ?? {}),
      ...(this.#art.hairColors[look.hair] ?? {}),
    };
    if (look.accent !== null) {
      palette['a'] = look.accent;
    }
    const bounds = heroBounds(layers);
    const w = bounds.left + bounds.right + 1;
    const h = bounds.up + bounds.down + 1;
    const out: Record<string, FrameSet> = {};
    for (const name of heroFrameNames(layers)) {
      const count = layers.body.animations[name]?.length ?? 0;
      const frames: Bitmap[] = [];
      for (let i = 0; i < count; i++) {
        const rows = heroFrameRows(layers, name, i);
        frames.push(this.#bitmaps.fromRgba(w, h, rasterizeFrame(rows, w, h, palette)));
      }
      out[name] = { w, h, anchor: { x: bounds.left, y: bounds.up }, frames };
    }
    this.#heroes.set(key, out);
    return out;
  }

  /** Any non-hero template: its `idle` frames, cached by template id. */
  sheet(template: SpriteTemplate): FrameSet {
    const hit = this.#sheets.get(template.id);
    if (hit !== undefined) {
      return hit;
    }
    const idle = template.animations['idle'];
    if (idle === undefined || idle.length === 0) {
      throw new RangeError('Template has no idle animation');
    }
    const frames = idle.map((rows) =>
      this.#bitmaps.fromRgba(
        template.w,
        template.h,
        rasterizeFrame(rows, template.w, template.h, this.#art.palette),
      ),
    );
    const set: FrameSet = { w: template.w, h: template.h, anchor: template.anchor, frames };
    this.#sheets.set(template.id, set);
    return set;
  }
}
