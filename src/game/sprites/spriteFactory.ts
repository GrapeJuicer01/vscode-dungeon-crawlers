// Turns palette-character templates into bitmaps (docs/design/sprite-spec.md, ADR 0003).
// Pure rasterizing and compositing live here; bitmaps come from the BitmapFactory port.
// Hero sprites are composited in character space (layers aligned on their anchors over the union
// bounds of every layer), then recoloured through the skin and hair swaps, then rasterized.
import type { Bitmap, BitmapFactory } from '../ports';
import type { ParticleKind } from '../Particles';
import { ENEMIES } from '../data/enemies';
import { STAGES } from '../data/stages';
import { ENEMY_DISSOLVE_FRAMES } from '../data/tuning';
import { hashCell, hashId } from '../rng';
import type { Palette } from './palettes';
import type {
  CampfireSprites,
  DropSpriteId,
  HeroLayerSet,
  SpriteTemplate,
  StageSprites,
} from './spriteTypes';

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
  /** Summon id -> single non-layered template with idle, walk, attack, rise, sink (H2). */
  readonly summons: Readonly<Record<string, SpriteTemplate>>;
  /** Stage id -> partial overrides of the stage characters over the master palette (E1-2). */
  readonly stagePalettes: Readonly<Record<string, Palette>>;
  /** Enemy id -> single template `enemies/<id>`, left-facing, foot anchor (E1). */
  readonly enemies: Readonly<Record<string, SpriteTemplate>>;
  /** Boss id -> palettes for phases 2..n, partial overrides over the master palette (E1). */
  readonly enemyPhasePalettes: Readonly<Record<string, readonly Palette[]>>;
  /** Drop kind -> template `drops/<kind>` (E1). */
  readonly drops: Readonly<Record<DropSpriteId, SpriteTemplate>>;
  /** Enemy bar frames (outline, transparent interior) and the fill and back characters. */
  readonly enemyBar: {
    readonly frame: SpriteTemplate;
    readonly bossFrame: SpriteTemplate;
    readonly fillChar: string;
    readonly backChar: string;
  };
}

/** The character used for every white silhouette (hit flashes). It is a master character. */
const FLASH_CHAR = 'w';

/** Pure: every opaque character becomes the flash character; '.' stays transparent. */
export function silhouetteRows(rows: readonly string[]): string[] {
  return rows.map((row) => row.replace(/[^.]/g, FLASH_CHAR));
}

/**
 * Pure: the dissolve frame `step` (0-based, of ENEMY_DISSOLVE_FRAMES) of one frame. Each opaque
 * pixel gets a seeded rank; the frame keeps the pixels whose rank is at least
 * (step + 1) / (ENEMY_DISSOLVE_FRAMES + 1), so frames are nested and strictly lose pixels.
 */
export function dissolveRows(rows: readonly string[], seed: number, step: number): string[] {
  const threshold = (step + 1) / (ENEMY_DISSOLVE_FRAMES + 1);
  return rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row.charAt(x);
      const rank = (hashCell(x, y, seed & 0xffff, seed >>> 16) % 1000) / 1000;
      out += ch === '.' || rank < threshold ? '.' : ch;
    }
    return out;
  });
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

function heroKey(look: HeroLook, layers: HeroLayerSet): string {
  return [
    look.classId ?? '-',
    look.skin,
    look.hair,
    look.accent ?? '-',
    layers.body.id,
    layers.head.id,
    layers.gear?.id ?? '-',
    layers.weapon.id,
  ].join('|');
}

export class SpriteCache {
  readonly #bitmaps: BitmapFactory;
  readonly #art: ArtSet;
  readonly #heroes = new Map<string, HeroSprites>();
  readonly #sheets = new Map<string, FrameSet>();
  readonly #summons = new Map<string, HeroSprites>();
  readonly #heroFlashes = new Map<string, HeroSprites>();
  readonly #enemies = new Map<string, HeroSprites | null>();
  readonly #enemyFlashes = new Map<string, HeroSprites | null>();
  readonly #enemyDissolves = new Map<string, FrameSet | null>();
  readonly #stagePalettes = new Map<string, Palette>();

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
    return Object.hasOwn(this.#art.classLayers, id) ? (this.#art.classLayers[id] ?? null) : null;
  }

  /** The frames of a cosmetic effect, or null when the art set lacks it (the draw is skipped). */
  effect(id: string): FrameSet | null {
    // Own keys only: '__proto__' and other inherited names must not resolve to a template.
    const template = Object.hasOwn(this.#art.effects, id) ? this.#art.effects[id] : undefined;
    return template === undefined ? null : this.sheet(template);
  }

  /**
   * Every animation of a summon template, rasterized with the master palette (no class palette,
   * skin, or hair swap) and cached by template id. Null when the art set lacks it (H2).
   */
  summon(id: string): HeroSprites | null {
    const template = Object.hasOwn(this.#art.summons, id) ? this.#art.summons[id] : undefined;
    if (template === undefined) {
      return null;
    }
    const hit = this.#summons.get(template.id);
    if (hit !== undefined) {
      return hit;
    }
    const out: Record<string, FrameSet> = {};
    for (const [name, animation] of Object.entries(template.animations)) {
      const frames = animation.map((rows) =>
        this.#bitmaps.fromRgba(
          template.w,
          template.h,
          rasterizeFrame(rows, template.w, template.h, this.#art.palette),
        ),
      );
      out[name] = { w: template.w, h: template.h, anchor: template.anchor, frames };
    }
    this.#summons.set(template.id, out);
    return out;
  }

  /** Built lazily per look and layer set, then cached. */
  hero(look: HeroLook, layers: HeroLayerSet): HeroSprites {
    const key = heroKey(look, layers);
    const hit = this.#heroes.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const out = this.#buildHero(look, layers, false);
    this.#heroes.set(key, out);
    return out;
  }

  /**
   * White silhouettes of the composited hero rows (the cosmetic hit flash, E1), same sizes and
   * anchor as `hero(look, layers)`. Built lazily per look on the first flash.
   */
  heroFlash(look: HeroLook, layers: HeroLayerSet): HeroSprites {
    const key = heroKey(look, layers);
    const hit = this.#heroFlashes.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const out = this.#buildHero(look, layers, true);
    this.#heroFlashes.set(key, out);
    return out;
  }

  #buildHero(look: HeroLook, layers: HeroLayerSet, silhouette: boolean): HeroSprites {
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
        const composed = heroFrameRows(layers, name, i);
        const rows = silhouette ? silhouetteRows(composed) : composed;
        frames.push(this.#bitmaps.fromRgba(w, h, rasterizeFrame(rows, w, h, palette)));
      }
      out[name] = { w, h, anchor: { x: bounds.left, y: bounds.up }, frames };
    }
    return out;
  }

  /**
   * The master palette plus a stage's partial overrides (E1-2), cached by stage id. A stage with
   * no entry gets the master palette itself.
   */
  stagePalette(stageId: string): Palette {
    const hit = this.#stagePalettes.get(stageId);
    if (hit !== undefined) {
      return hit;
    }
    const overrides = Object.hasOwn(this.#art.stagePalettes, stageId)
      ? this.#art.stagePalettes[stageId]
      : undefined;
    const merged: Palette =
      overrides === undefined ? this.#art.palette : { ...this.#art.palette, ...overrides };
    this.#stagePalettes.set(stageId, merged);
    return merged;
  }

  /** A CSS colour for a palette character (the bar fill); white for an unknown one. */
  css(char: string): string {
    return this.#art.palette[char] ?? '#ffffff';
  }

  /**
   * Every animation of an enemy, rasterized over its stage's merged palette (master plus the
   * stage overrides, so Stage 2 characters 1-8 take the mine colors); phase 2 and later apply the
   * boss's phase palette on top of that. Null when the art set lacks the enemy (the draw is skipped).
   */
  enemy(id: string, phase: number): HeroSprites | null {
    const template = Object.hasOwn(this.#art.enemies, id) ? this.#art.enemies[id] : undefined;
    if (template === undefined) {
      return null;
    }
    const key = `${id}|${phase}`;
    const hit = this.#enemies.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const out = this.#buildAnimations(template, this.#enemyPalette(id, phase), false);
    this.#enemies.set(key, out);
    return out;
  }

  /** White silhouettes of every enemy animation frame (the hit flash), or null when no art. */
  enemyFlash(id: string): HeroSprites | null {
    const template = Object.hasOwn(this.#art.enemies, id) ? this.#art.enemies[id] : undefined;
    if (template === undefined) {
      return null;
    }
    const hit = this.#enemyFlashes.get(id);
    if (hit !== undefined) {
      return hit;
    }
    const out = this.#buildAnimations(template, this.#enemyPalette(id, 1), true);
    this.#enemyFlashes.set(id, out);
    return out;
  }

  /** ENEMY_DISSOLVE_FRAMES frames of idle frame 0, pixels removed in a seeded order; null if no art. */
  enemyDissolve(id: string): FrameSet | null {
    const template = Object.hasOwn(this.#art.enemies, id) ? this.#art.enemies[id] : undefined;
    const base = template?.animations['idle']?.[0];
    if (template === undefined || base === undefined) {
      return null;
    }
    const hit = this.#enemyDissolves.get(id);
    if (hit !== undefined) {
      return hit;
    }
    const seed = hashId(id);
    const frames: Bitmap[] = [];
    for (let step = 0; step < ENEMY_DISSOLVE_FRAMES; step++) {
      frames.push(
        this.#bitmaps.fromRgba(
          template.w,
          template.h,
          rasterizeFrame(
            dissolveRows(base, seed, step),
            template.w,
            template.h,
            this.#enemyPalette(id, 1),
          ),
        ),
      );
    }
    const set: FrameSet = { w: template.w, h: template.h, anchor: template.anchor, frames };
    this.#enemyDissolves.set(id, set);
    return set;
  }

  /** A drop's `idle` frames, or null when the art set lacks the kind. */
  drop(kind: string): FrameSet | null {
    const template = Object.hasOwn(this.#art.drops, kind)
      ? this.#art.drops[kind as DropSpriteId]
      : undefined;
    return template === undefined ? null : this.sheet(template);
  }

  /** The enemy bar frame (outline) or the boss bar frame. */
  barFrame(boss: boolean): FrameSet {
    return this.sheet(boss ? this.#art.enemyBar.bossFrame : this.#art.enemyBar.frame);
  }

  /** The fill and back characters of the bar. */
  get barChars(): { readonly fillChar: string; readonly backChar: string } {
    return this.#art.enemyBar;
  }

  /**
   * The enemy's stage palette (its ENEMIES row carries the stage index) with the boss phase palette
   * laid over it from phase 2. An unknown id or stage falls back to the master palette. The cache
   * keys stay `id|phase` because an enemy belongs to exactly one stage.
   */
  #enemyPalette(id: string, phase: number): Palette {
    const row = ENEMIES.find((r) => r.id === id);
    const stage = row === undefined ? undefined : STAGES.find((d) => d.index === row.stage);
    const base = stage === undefined ? this.#art.palette : this.stagePalette(stage.id);
    if (phase < 2) {
      return base;
    }
    const list = Object.hasOwn(this.#art.enemyPhasePalettes, id)
      ? this.#art.enemyPhasePalettes[id]
      : undefined;
    const override = list?.[Math.min(phase - 2, (list?.length ?? 1) - 1)];
    return override === undefined ? base : { ...base, ...override };
  }

  #buildAnimations(template: SpriteTemplate, palette: Palette, silhouette: boolean): HeroSprites {
    const out: Record<string, FrameSet> = {};
    for (const [name, animation] of Object.entries(template.animations)) {
      const frames = animation.map((rows) =>
        this.#bitmaps.fromRgba(
          template.w,
          template.h,
          rasterizeFrame(silhouette ? silhouetteRows(rows) : rows, template.w, template.h, palette),
        ),
      );
      out[name] = { w: template.w, h: template.h, anchor: template.anchor, frames };
    }
    return out;
  }

  /**
   * Any non-hero template: its `idle` frames, cached by template id. `palette` defaults to the
   * master palette; stage templates pass `stagePalette(stageId)`. Template ids are unique, so the
   * cache needs no palette key as long as a template is always built with the same palette.
   */
  sheet(template: SpriteTemplate, palette: Palette = this.#art.palette): FrameSet {
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
        rasterizeFrame(rows, template.w, template.h, palette),
      ),
    );
    const set: FrameSet = { w: template.w, h: template.h, anchor: template.anchor, frames };
    this.#sheets.set(template.id, set);
    return set;
  }
}
