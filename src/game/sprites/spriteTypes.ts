// Template types shared by the sprite data files. Re-exported from spriteTemplates.ts, which is
// the import point for the engine. Owned by the pixel-artist; format in docs/design/sprite-spec.md.

export interface SpriteTemplate {
  /** Matches the data id (stage props are `<stage id>/<name>`). */
  id: string;
  w: number;
  h: number;
  /** The foot pixel used for placement and mirroring. */
  anchor: { x: number; y: number };
  /** Animation name -> frames -> rows (one palette character per pixel, '.' transparent). */
  animations: Record<string, string[][]>;
}

export interface HeroLayerSet {
  body: SpriteTemplate;
  head: SpriteTemplate;
  gear: SpriteTemplate | null;
  weapon: SpriteTemplate;
}

export interface CampfireSprites {
  logs: SpriteTemplate;
  flameSmall: SpriteTemplate;
  flameLarge: SpriteTemplate;
}

export interface StageSprites {
  tiles: {
    wallTop: SpriteTemplate[];
    wallMid: SpriteTemplate[];
    wallBase: SpriteTemplate[];
    floorBack: SpriteTemplate[];
    floorFront: SpriteTemplate[];
    foreground: SpriteTemplate[];
  };
  props: Record<string, SpriteTemplate>;
  backdrop: SpriteTemplate;
}

/** Effect sprite ids delivered by H1 (batch A1-1). Ids are `effects/<name>`. */
export type EffectSpriteIdH1 =
  'whirl' | 'orbBolt' | 'arcaneBurst' | 'arrow' | 'dagger' | 'smokePuff';

/** Effect sprite ids delivered by H2 (ids `effects/<name>`). `blessGlow` is the Cleric blessing (H2-7). */
export type EffectSpriteIdH2 = 'buffSparkle' | 'note' | 'blessGlow' | 'holyBurst' | 'soulWisp';

/** Effect sprite ids delivered by H3 (ids `effects/<name>`). */
export type EffectSpriteIdH3 = 'leaf' | 'chiOrb' | 'chiBurst' | 'warCry' | 'wrench';

/**
 * All effect sprite ids. Mirrors `EFFECT_IDS` in src/game/data/effects.ts (developer); the sprite
 * files cannot import data, so the list is repeated and the validator checks the keys.
 */
export type EffectSpriteId = EffectSpriteIdH1 | EffectSpriteIdH2 | EffectSpriteIdH3;

/** The classes delivered by H1. */
export type ClassPaletteIdH1 = 'warrior' | 'mage' | 'archer' | 'rogue';

/** The classes delivered by H2. */
export type ClassPaletteIdH2 = 'cleric' | 'paladin' | 'necromancer' | 'bard';

/** The classes delivered by H3. */
export type ClassPaletteIdH3 = 'druid' | 'monk' | 'artificer' | 'berserker';

/** All classes with a palette (twelve). */
export type ClassPaletteId = ClassPaletteIdH1 | ClassPaletteIdH2 | ClassPaletteIdH3;

/**
 * Summon sprite ids (convention ratified in docs/architecture/plans/h2-classes.md section 3.5; see docs/design/sprite-spec.md section 9). A summon is a
 * cosmetic ally drawn from a single (non-layered) template with ids `summons/<name>`.
 */
export type SummonSpriteId = 'skeleton' | 'beast' | 'turret';

/** Drop kinds (ids `drops/<kind>`). Mirrors DROP_KINDS in src/game/data/drops.ts (developer). */
export type DropSpriteId = 'coin' | 'gem' | 'ore' | 'chest';
