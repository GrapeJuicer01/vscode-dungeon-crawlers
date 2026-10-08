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
