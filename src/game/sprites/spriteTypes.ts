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

/**
 * Effect sprite ids (batch A1-1). Mirrors `EFFECT_IDS` in src/game/data/effects.ts (developer, H1);
 * the sprite files cannot import data, so the list is repeated and the validator checks the keys.
 */
export type EffectSpriteId = 'whirl' | 'orbBolt' | 'arcaneBurst' | 'arrow' | 'dagger' | 'smokePuff';

/** The classes delivered by H1; H2 and H3 widen this to 12. */
export type ClassPaletteId = 'warrior' | 'mage' | 'archer' | 'rogue';

/** The classes delivered by batch H2. Kept as a separate union so H1's `Record<ClassPaletteId, ...>` still type-checks until the developer merges the two. */
export type ClassPaletteIdH2 = 'cleric' | 'paladin' | 'necromancer' | 'bard';

/** Effect sprite ids added by batch H2 (ids `effects/<name>`). Merge with `EffectSpriteId` when wiring. */
export type EffectSpriteIdH2 = 'buffSparkle' | 'note' | 'healGlow' | 'holyBurst' | 'soulWisp';

/**
 * Summon sprite ids (proposal, UNREVIEWED; see docs/design/sprite-spec.md section 9). A summon is a
 * cosmetic ally drawn from a single (non-layered) template with ids `summons/<name>`.
 */
export type SummonSpriteId = 'skeleton';
