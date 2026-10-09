// Validates the art against the contract in docs/design/sprite-spec.md section 7 and
// docs/architecture/data-model.md section 3. Pure. Tests run it over all shipped art, so invalid
// art fails the test, not the user's panel. Error strings contain only template ids, animation
// names, and indexes, never pixels or agent data.
import { hexToRgb, heroBounds, heroFrameNames, heroFrameRows } from './spriteFactory';
import type { ArtSet } from './spriteFactory';
import type { Palette } from './palettes';
import { ENEMIES } from '../data/enemies';
import { STAGES } from '../data/stages';
import { DROP_KINDS } from '../data/drops';
import type { EnemyRow, EnemyTier } from '../data/enemies';
import type { HeroLayerSet, SpriteTemplate, StageSprites } from './spriteTypes';

/** Required hero animation name -> frame count (docs/design/sprite-spec.md section 3). */
export const REQUIRED_HERO_ANIMATIONS: Readonly<Record<string, number>> = {
  idle: 2,
  walk: 4,
  attack: 3,
  ability: 3,
  sit: 2,
  eat: 2,
  sleep: 2,
  polish: 2,
  read: 2,
  warmHands: 2,
  victory: 2,
};

/** Required summon animation name -> frame count (plan h2-classes.md section 3.5). */
export const REQUIRED_SUMMON_ANIMATIONS: Readonly<Record<string, number>> = {
  idle: 2,
  walk: 4,
  attack: 3,
  rise: 4,
  sink: 3,
};

/** Hero animations must never imply damage or defeat (Core invariant 1 at the asset level). */
const FORBIDDEN_HERO_ANIMATION = /hurt|downed|death|dead|die|dying/i;
const HERO_CHARS = 'oshecdbkmwa';
/** The only master characters a class palette may recolour (never o s h e w). */
const CLASS_PALETTE_CHARS = 'acdbkm';
const MAX_EFFECT_COLORS = 8;
const MAX_SUMMON_COLORS = 8;
const MAX_SUMMON_SIZE = 24;
const MAX_EFFECT_SIZE = 32;
const MAX_HERO_COLORS = 12;
const MAX_STAGE_COLORS = 8;
const TILE_SIZE = 16;
const BACKDROP_SIZE = 128;
/** Required props per stage id (sprite-spec section 5 and 10). A stage not listed has none. */
const REQUIRED_PROPS: Readonly<Record<string, readonly string[]>> = {
  'forgotten-cellar': [
    'barrel',
    'crate',
    'bonePile',
    'puddle',
    'cobweb',
    'chains',
    'torch',
    'doorFrame',
  ],
  'goblin-mine-shafts': [
    'support',
    'pickaxe',
    'oreVein',
    'lantern',
    'minecart',
    'rubble',
    'doorFrame',
  ],
};
/** Animated light props: prop name -> minimum idle frames of the flame loop. */
const FLAME_PROPS: Readonly<Record<string, number>> = { torch: 2, lantern: 4 };
const ENEMY_MAX_SIZE: Readonly<Record<EnemyTier, number>> = { minion: 16, elite: 24, boss: 48 };
const ENEMY_ANIMATIONS: Readonly<Record<string, number>> = { idle: 2, walk: 2, attack: 3 };
const BOSS_EXTRA_ANIMATIONS: Readonly<Record<string, number>> = { telegraph: 2, intro: 2 };
const FORBIDDEN_ENEMY_ANIMATION = /hit|death|dead|die|dying|hurt|downed/i;
const MAX_ENEMY_COLORS = 12;
const MAX_PHASE_OVERRIDES = 4;
const MAX_DROP_COLORS = 8;
const MIN_TILE_VARIANTS: Readonly<Record<keyof StageSprites['tiles'], number>> = {
  wallTop: 2,
  wallMid: 4,
  wallBase: 2,
  floorBack: 3,
  floorFront: 3,
  foreground: 2,
};

/**
 * Checks one template: sizes, anchor, rows, characters, optional allowed-character set, and the
 * colour limit.
 */
export function validateTemplate(
  t: SpriteTemplate,
  palette: Palette,
  allowedChars: string | null,
  maxColors: number,
): readonly string[] {
  const errors: string[] = [];
  const id = t.id;
  if (!Number.isInteger(t.w) || !Number.isInteger(t.h) || t.w < 1 || t.h < 1) {
    errors.push(`${id}: size must be positive integers`);
    return errors;
  }
  if (
    !Number.isInteger(t.anchor.x) ||
    !Number.isInteger(t.anchor.y) ||
    t.anchor.x < 0 ||
    t.anchor.y < 0 ||
    t.anchor.x >= t.w ||
    t.anchor.y >= t.h
  ) {
    errors.push(`${id}: anchor outside the sprite`);
  }
  const names = Object.keys(t.animations);
  if (names.length === 0) {
    errors.push(`${id}: no animations`);
  }
  const used = new Set<string>();
  for (const name of names) {
    const frames = t.animations[name] ?? [];
    if (frames.length === 0) {
      errors.push(`${id}: animation ${name} has no frames`);
    }
    frames.forEach((rows, f) => {
      if (rows.length !== t.h) {
        errors.push(`${id}: animation ${name} frame ${f} has ${rows.length} rows, expected ${t.h}`);
        return;
      }
      let badWidth = false;
      let unknown = false;
      let outside = false;
      for (const row of rows) {
        if (row.length !== t.w) {
          badWidth = true;
          continue;
        }
        for (const ch of row) {
          if (ch === '.') {
            continue;
          }
          if (palette[ch] === undefined) {
            unknown = true;
            continue;
          }
          used.add(ch);
          if (allowedChars !== null && !allowedChars.includes(ch)) {
            outside = true;
          }
        }
      }
      if (badWidth) {
        errors.push(`${id}: animation ${name} frame ${f} has a row of the wrong width`);
      }
      if (unknown) {
        errors.push(
          `${id}: animation ${name} frame ${f} uses a character missing from the palette`,
        );
      }
      if (outside) {
        errors.push(`${id}: animation ${name} frame ${f} uses a character outside the stage set`);
      }
    });
  }
  if (used.size > maxColors) {
    errors.push(`${id}: uses ${used.size} colors, limit ${maxColors}`);
  }
  return errors;
}

function layerEntries(layers: HeroLayerSet): readonly (readonly [string, SpriteTemplate])[] {
  const out: (readonly [string, SpriteTemplate])[] = [
    ['body', layers.body],
    ['head', layers.head],
  ];
  if (layers.gear !== null) {
    out.push(['gear', layers.gear]);
  }
  out.push(['weapon', layers.weapon]);
  return out;
}

/** Checks a hero layer set: every layer, required animations and counts, names, composite colours. */
export function validateHeroLayers(layers: HeroLayerSet, palette: Palette): readonly string[] {
  const errors: string[] = [];
  const entries = layerEntries(layers);
  for (const [, t] of entries) {
    errors.push(...validateTemplate(t, palette, null, MAX_HERO_COLORS));
  }
  const bodyNames = Object.keys(layers.body.animations).sort();
  for (const [slot, t] of entries) {
    const names = Object.keys(t.animations);
    if (names.slice().sort().join() !== bodyNames.join()) {
      errors.push(`${t.id}: ${slot} layer animation names differ from the body layer`);
    }
    for (const name of names) {
      if (FORBIDDEN_HERO_ANIMATION.test(name)) {
        errors.push(`${t.id}: forbidden hero animation name ${name}`);
      }
    }
    for (const [name, count] of Object.entries(REQUIRED_HERO_ANIMATIONS)) {
      const frames = t.animations[name];
      if (frames === undefined) {
        errors.push(`${t.id}: missing required animation ${name}`);
      } else if (frames.length !== count) {
        errors.push(`${t.id}: animation ${name} has ${frames.length} frames, expected ${count}`);
      }
    }
  }
  for (const name of bodyNames) {
    const counts = new Set(entries.map(([, t]) => t.animations[name]?.length ?? -1));
    if (counts.size > 1) {
      errors.push(`${layers.body.id}: layers disagree on the frame count of ${name}`);
    }
  }
  if (errors.length === 0) {
    // The composited default hero stays within 12 colors (skin and hair swaps replace, not add).
    const used = new Set<string>();
    const bounds = heroBounds(layers);
    const w = bounds.left + bounds.right + 1;
    for (const name of heroFrameNames(layers)) {
      const count = layers.body.animations[name]?.length ?? 0;
      for (let i = 0; i < count; i++) {
        for (const row of heroFrameRows(layers, name, i)) {
          if (row.length !== w) {
            errors.push(`${layers.body.id}: composite width mismatch`);
          }
          for (const ch of row) {
            if (ch !== '.') {
              used.add(ch);
            }
          }
        }
      }
    }
    if (used.size > MAX_HERO_COLORS) {
      errors.push(`${layers.body.id}: composited hero uses ${used.size} colors, limit 12`);
    }
  }
  return errors;
}

function validateClassPalette(id: string, cp: Palette, master: Palette): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(cp)) {
    if (master[key] === undefined || !CLASS_PALETTE_CHARS.includes(key) || key.length !== 1) {
      errors.push(
        `${id}: class palette may override only ${CLASS_PALETTE_CHARS.split('').join(' ')}`,
      );
      break;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      errors.push(`${id}: class palette value is not #rrggbb`);
      break;
    }
  }
  return errors;
}

/**
 * One class: its layers and palette. The color limit needs no per-swap check: a look can use at
 * most the 11 hero characters, which validateHeroLayers already caps at 12.
 */
function validateClassLook(art: ArtSet, id: string, layers: HeroLayerSet): string[] {
  const errors = [...validateHeroLayers(layers, art.palette)];
  const cp = art.classPalettes[id];
  if (cp === undefined) {
    return errors;
  }
  errors.push(...validateClassPalette(id, cp, art.palette));
  if (errors.length > 0) {
    return errors;
  }
  return errors;
}

function validateEffectTemplate(key: string, t: SpriteTemplate, palette: Palette): string[] {
  const errors = [...validateTemplate(t, palette, null, MAX_EFFECT_COLORS)];
  if (Object.keys(t.animations).join() !== 'idle') {
    errors.push(`${t.id}: effect templates use only the idle animation`);
  }
  if (t.w > MAX_EFFECT_SIZE || t.h > MAX_EFFECT_SIZE) {
    errors.push(`${t.id}: effect is larger than ${MAX_EFFECT_SIZE}x${MAX_EFFECT_SIZE}`);
  }
  if (t.id !== `effects/${key}`) {
    errors.push(`${t.id}: effect id does not match its key ${key}`);
  }
  return errors;
}

/**
 * The cross-check between the code tables and the art: every class id has layers and a palette,
 * every effect id has a template, the layer ids belong to the class, and nothing is extra.
 */
export function validateClassArt(
  art: ArtSet,
  classIds: readonly string[],
  effectIds: readonly string[],
): readonly string[] {
  const errors: string[] = [];
  for (const id of classIds) {
    const layers = art.classLayers[id];
    if (layers === undefined) {
      errors.push(`${id}: no class layers`);
    } else {
      const slots: [string, SpriteTemplate | null][] = [
        ['head', layers.head],
        ['gear', layers.gear],
        ['weapon', layers.weapon],
      ];
      for (const [slot, t] of slots) {
        if (t !== null && t.id !== `${id}/${slot}`) {
          errors.push(`${t.id}: ${slot} layer id must be ${id}/${slot}`);
        }
      }
      if (layers.body.id !== art.baseHero.body.id && layers.body.id !== `${id}/body`) {
        errors.push(`${layers.body.id}: body layer id must be ${id}/body or the base body`);
      }
    }
    if (art.classPalettes[id] === undefined) {
      errors.push(`${id}: no class palette`);
    }
  }
  for (const id of Object.keys(art.classLayers)) {
    if (!classIds.includes(id)) {
      errors.push(`${id}: class layers for an unknown class`);
    }
  }
  for (const id of Object.keys(art.classPalettes)) {
    if (!classIds.includes(id)) {
      errors.push(`${id}: class palette for an unknown class`);
    }
  }
  for (const id of effectIds) {
    if (art.effects[id] === undefined) {
      errors.push(`${id}: no effect template`);
    }
  }
  for (const key of Object.keys(art.effects)) {
    if (!effectIds.includes(key)) {
      errors.push(`${key}: effect template for an unknown effect`);
    }
  }
  return errors;
}

function validateSummonTemplate(key: string, t: SpriteTemplate, palette: Palette): string[] {
  const errors = [...validateTemplate(t, palette, null, MAX_SUMMON_COLORS)];
  if (t.w > MAX_SUMMON_SIZE || t.h > MAX_SUMMON_SIZE) {
    errors.push(`${t.id}: summon is larger than ${MAX_SUMMON_SIZE}x${MAX_SUMMON_SIZE}`);
  }
  if (t.id !== `summons/${key}`) {
    errors.push(`${t.id}: summon id does not match its key ${key}`);
  }
  for (const name of Object.keys(t.animations)) {
    if (FORBIDDEN_HERO_ANIMATION.test(name)) {
      errors.push(`${t.id}: forbidden summon animation name ${name}`);
    }
  }
  for (const [name, count] of Object.entries(REQUIRED_SUMMON_ANIMATIONS)) {
    const frames = t.animations[name];
    if (frames === undefined) {
      errors.push(`${t.id}: missing required animation ${name}`);
    } else if (frames.length !== count) {
      errors.push(`${t.id}: animation ${name} has ${frames.length} frames, expected ${count}`);
    }
  }
  return errors;
}

/**
 * Summons: every template is well formed (master palette characters only, at most 8 colors,
 * 24x24, the five animations), every summon id has a template, and nothing is extra.
 */
export function validateSummonArt(art: ArtSet, summonIds: readonly string[]): readonly string[] {
  const errors: string[] = [];
  for (const [key, t] of Object.entries(art.summons)) {
    errors.push(...validateSummonTemplate(key, t, art.palette));
    if (!summonIds.includes(key)) {
      errors.push(`${key}: summon template for an unknown summon`);
    }
  }
  for (const id of summonIds) {
    if (art.summons[id] === undefined) {
      errors.push(`${id}: no summon template`);
    }
  }
  return errors;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function column(t: SpriteTemplate, x: number): string {
  return (t.animations['idle']?.[0] ?? []).map((row) => row.charAt(x)).join('');
}

function row(t: SpriteTemplate, y: number): string {
  return t.animations['idle']?.[0]?.[y] ?? '';
}

function validateTileSet(
  stageId: string,
  setName: string,
  tiles: readonly SpriteTemplate[],
  min: number,
  stackable: boolean,
  palette: Palette,
  chars: string,
): string[] {
  const errors: string[] = [];
  if (tiles.length < min) {
    errors.push(`${stageId}: tile set ${setName} has ${tiles.length} variants, need ${min}`);
  }
  for (const t of tiles) {
    errors.push(...validateTemplate(t, palette, chars, MAX_STAGE_COLORS));
    if (t.w !== TILE_SIZE || t.h !== TILE_SIZE) {
      errors.push(`${t.id}: tile must be ${TILE_SIZE}x${TILE_SIZE}`);
    }
    if (Object.keys(t.animations).join() !== 'idle') {
      errors.push(`${t.id}: stage templates use only the idle animation`);
    }
  }
  const first = tiles[0];
  if (first !== undefined) {
    for (const t of tiles) {
      if (
        column(t, 0) !== column(first, 0) ||
        column(t, TILE_SIZE - 1) !== column(first, TILE_SIZE - 1)
      ) {
        errors.push(`${t.id}: edge columns differ from the first variant of ${setName}`);
      }
      if (
        stackable &&
        (row(t, 0) !== row(first, 0) || row(t, TILE_SIZE - 1) !== row(first, TILE_SIZE - 1))
      ) {
        errors.push(`${t.id}: edge rows differ from the first variant of ${setName}`);
      }
    }
  }
  return errors;
}

function validateStageSprites(
  stageId: string,
  sprites: StageSprites,
  palette: Palette,
  chars: string,
): string[] {
  const errors: string[] = [];
  const stackable: Readonly<Record<keyof StageSprites['tiles'], boolean>> = {
    wallTop: true,
    wallMid: true,
    wallBase: true,
    floorBack: false,
    floorFront: false,
    foreground: false,
  };
  for (const setName of Object.keys(MIN_TILE_VARIANTS) as (keyof StageSprites['tiles'])[]) {
    errors.push(
      ...validateTileSet(
        stageId,
        setName,
        sprites.tiles[setName],
        MIN_TILE_VARIANTS[setName],
        stackable[setName],
        palette,
        chars,
      ),
    );
  }
  const hasWindow = sprites.tiles.wallMid.some((t) =>
    (t.animations['idle']?.[0] ?? []).some((r) => r.includes('.')),
  );
  if (!hasWindow) {
    errors.push(`${stageId}: no wallMid variant has transparent pixels for the backdrop`);
  }
  errors.push(...validateTemplate(sprites.backdrop, palette, chars, MAX_STAGE_COLORS));
  if (sprites.backdrop.w !== BACKDROP_SIZE || sprites.backdrop.h !== BACKDROP_SIZE) {
    errors.push(`${sprites.backdrop.id}: backdrop must be ${BACKDROP_SIZE}x${BACKDROP_SIZE}`);
  }
  for (const key of REQUIRED_PROPS[stageId] ?? []) {
    if (sprites.props[key] === undefined) {
      errors.push(`${stageId}: missing required prop ${key}`);
    }
  }
  for (const t of Object.values(sprites.props)) {
    errors.push(...validateTemplate(t, palette, chars, MAX_STAGE_COLORS));
    if (Object.keys(t.animations).join() !== 'idle') {
      errors.push(`${t.id}: stage templates use only the idle animation`);
    }
  }
  for (const [name, min] of Object.entries(FLAME_PROPS)) {
    const flame = sprites.props[name];
    if (flame !== undefined && (flame.animations['idle']?.length ?? 0) < min) {
      errors.push(`${flame.id}: ${name} needs a flame loop of at least ${min} frames`);
    }
  }
  return errors;
}

function validateEnemyTemplate(row: EnemyRow, t: SpriteTemplate, palette: Palette): string[] {
  const errors = [...validateTemplate(t, palette, null, MAX_ENEMY_COLORS)];
  if (t.id !== `enemies/${row.id}`) {
    errors.push(`${t.id}: enemy id does not match its key ${row.id}`);
  }
  const limit = ENEMY_MAX_SIZE[row.tier];
  if (t.w > limit || t.h > limit) {
    errors.push(`${t.id}: ${row.tier} is larger than ${limit}x${limit}`);
  }
  const expected: Record<string, number> =
    row.tier === 'boss'
      ? { ...ENEMY_ANIMATIONS, ...BOSS_EXTRA_ANIMATIONS }
      : { ...ENEMY_ANIMATIONS };
  for (const name of Object.keys(t.animations)) {
    if (FORBIDDEN_ENEMY_ANIMATION.test(name)) {
      errors.push(`${t.id}: forbidden enemy animation name ${name}`);
    } else if (expected[name] === undefined) {
      errors.push(`${t.id}: unexpected animation ${name}`);
    }
  }
  for (const [name, count] of Object.entries(expected)) {
    const frames = t.animations[name];
    if (frames === undefined) {
      errors.push(`${t.id}: missing required animation ${name}`);
    } else if (frames.length !== count) {
      errors.push(`${t.id}: animation ${name} has ${frames.length} frames, expected ${count}`);
    }
  }
  return errors;
}

/**
 * Enemies: every ENEMIES row has a well-formed template (exact animation set, tier size limit, at
 * most 12 colors, no forbidden names), nothing is extra, and boss phase palettes override at most
 * four single characters that exist in the master palette.
 */
export function validateEnemyArt(art: ArtSet): readonly string[] {
  const errors: string[] = [];
  const rows = new Map<string, EnemyRow>(ENEMIES.map((row) => [row.id, row]));
  for (const row of rows.values()) {
    const t = Object.hasOwn(art.enemies, row.id) ? art.enemies[row.id] : undefined;
    if (t === undefined) {
      errors.push(`${row.id}: no enemy template`);
      continue;
    }
    // Enemies are drawn over their stage's merged palette (phase palettes are checked below).
    const stageId = STAGES.find((d) => d.index === row.stage)?.id;
    const palette: Palette =
      stageId !== undefined && Object.hasOwn(art.stagePalettes, stageId)
        ? { ...art.palette, ...art.stagePalettes[stageId] }
        : art.palette;
    errors.push(...validateEnemyTemplate(row, t, palette));
  }
  for (const key of Object.keys(art.enemies)) {
    if (!rows.has(key)) {
      errors.push(`${key}: enemy template for an unknown enemy`);
    }
  }
  for (const [id, list] of Object.entries(art.enemyPhasePalettes)) {
    if (rows.get(id)?.tier !== 'boss') {
      errors.push(`${id}: phase palettes belong to bosses only`);
    }
    for (const override of list) {
      const keys = Object.keys(override);
      if (keys.length > MAX_PHASE_OVERRIDES) {
        errors.push(`${id}: phase palette overrides ${keys.length} characters, limit 4`);
      }
      for (const [key, value] of Object.entries(override)) {
        if (key.length !== 1 || art.palette[key] === undefined) {
          errors.push(`${id}: phase palette overrides an unknown character`);
          break;
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
          errors.push(`${id}: phase palette value is not #rrggbb`);
          break;
        }
      }
    }
  }
  for (const frame of [art.enemyBar.frame, art.enemyBar.bossFrame]) {
    errors.push(...validateTemplate(frame, art.palette, null, MAX_ENEMY_COLORS));
  }
  for (const ch of [art.enemyBar.fillChar, art.enemyBar.backChar]) {
    if (art.palette[ch] === undefined) {
      errors.push('enemy bar: a fill or back character is not in the palette');
    }
  }
  return errors;
}

/** Drops: one `drops/<kind>` template per DROP_KINDS entry, idle only, at most 8 colors. */
export function validateDropArt(art: ArtSet): readonly string[] {
  const errors: string[] = [];
  for (const kind of DROP_KINDS) {
    const t = Object.hasOwn(art.drops, kind) ? art.drops[kind] : undefined;
    if (t === undefined) {
      errors.push(`${kind}: no drop template`);
      continue;
    }
    errors.push(...validateTemplate(t, art.palette, null, MAX_DROP_COLORS));
    if (t.id !== `drops/${kind}`) {
      errors.push(`${t.id}: drop id does not match its key ${kind}`);
    }
    if (Object.keys(t.animations).join() !== 'idle') {
      errors.push(`${t.id}: drop templates use only the idle animation`);
    }
  }
  for (const key of Object.keys(art.drops)) {
    if (!(DROP_KINDS as readonly string[]).includes(key)) {
      errors.push(`${key}: drop template for an unknown kind`);
    }
  }
  return errors;
}

/** Everything above plus the palette, swaps, campfire, particles, and stage checks. */
export function validateArtSet(art: ArtSet): readonly string[] {
  const errors: string[] = [];
  const palette = art.palette;
  for (const [key, value] of Object.entries(palette)) {
    if (key.length !== 1 || key === '.') {
      errors.push(`palette: key at ${key.length} characters or '.' is not allowed`);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      errors.push('palette: a value is not #rrggbb');
    }
  }
  for (const ch of HERO_CHARS) {
    if (palette[ch] === undefined) {
      errors.push(`palette: hero character ${ch} is not defined`);
    }
  }
  if (art.skinTones.length !== 4) {
    errors.push(`palette: ${art.skinTones.length} skin tones, expected 4`);
  }
  if (art.hairColors.length !== 6) {
    errors.push(`palette: ${art.hairColors.length} hair colors, expected 6`);
  }
  art.skinTones.forEach((s, i) => {
    if (Object.keys(s).join() !== 's') {
      errors.push(`palette: skin tone ${i} must override only s`);
    }
  });
  art.hairColors.forEach((s, i) => {
    if (Object.keys(s).join() !== 'h') {
      errors.push(`palette: hair color ${i} must override only h`);
    }
  });
  errors.push(...validateHeroLayers(art.baseHero, palette));
  for (const [id, layers] of Object.entries(art.classLayers)) {
    // Classes may share the base body template; report its faults once, not once per class.
    for (const message of validateClassLook(art, id, layers)) {
      if (!errors.includes(message)) {
        errors.push(message);
      }
    }
  }
  for (const [id, cp] of Object.entries(art.classPalettes)) {
    if (art.classLayers[id] === undefined) {
      errors.push(...validateClassPalette(id, cp, palette));
    }
  }
  for (const [key, t] of Object.entries(art.effects)) {
    errors.push(...validateEffectTemplate(key, t, palette));
  }
  errors.push(...validateSummonArt(art, Object.keys(art.summons)));
  for (const t of [art.campfire.logs, art.campfire.flameSmall, art.campfire.flameLarge]) {
    errors.push(...validateTemplate(t, palette, null, MAX_HERO_COLORS));
    if (Object.keys(t.animations).join() !== 'idle') {
      errors.push(`${t.id}: campfire templates use only the idle animation`);
    }
  }
  for (const t of [art.campfire.flameSmall, art.campfire.flameLarge]) {
    if ((t.animations['idle']?.length ?? 0) < 3) {
      errors.push(`${t.id}: flame needs at least 3 frames`);
    }
  }
  for (const [kind, ramp] of Object.entries(art.particlePalette)) {
    if (ramp.length < 2 || ramp.some((ch) => palette[ch] === undefined)) {
      errors.push(`palette: particle ramp ${kind} is too short or uses an unknown character`);
    }
  }
  for (const ch of [art.lightChars.torch, art.lightChars.campfire]) {
    if (palette[ch] === undefined) {
      errors.push('palette: a light character is not defined');
    }
  }
  errors.push(...validateEnemyArt(art), ...validateDropArt(art));
  for (const [stageId, sprites] of Object.entries(art.stageSprites)) {
    // A stage sprite is checked against master plus the stage's overrides (sprite-spec section 10).
    const stagePalette: Palette = { ...palette, ...(art.stagePalettes[stageId] ?? {}) };
    const chars = art.stageTileChars[stageId];
    if (chars === undefined || chars.length > MAX_STAGE_COLORS) {
      errors.push(`${stageId}: tile characters missing or more than ${MAX_STAGE_COLORS}`);
      continue;
    }
    for (const ch of chars) {
      if (stagePalette[ch] === undefined) {
        errors.push(`${stageId}: tile character ${ch} is not in the stage palette`);
      }
    }
    const clear = art.stageClearChar[stageId];
    const ambient = art.stageAmbientChar[stageId];
    const clearHex = clear === undefined ? undefined : stagePalette[clear];
    if (clearHex === undefined) {
      errors.push(`${stageId}: clear character missing`);
    } else if (luminance(clearHex) >= 0.02) {
      errors.push(`${stageId}: clear color is not near-black`);
    }
    if (ambient === undefined || stagePalette[ambient] === undefined) {
      errors.push(`${stageId}: ambient character missing`);
    }
    errors.push(...validateStageSprites(stageId, sprites, stagePalette, chars));
  }
  return errors;
}
