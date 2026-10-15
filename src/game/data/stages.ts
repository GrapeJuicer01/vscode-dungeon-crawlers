// Stage rows (docs/architecture/data-model.md section 4). A stage references art by id and prop
// key; it never embeds pixels. M4 shipped Stage 1; E1 appends Stage 2; E2-E5 append the rest.

export interface LightDef {
  readonly radius: number;
  readonly intensity: number;
  /** One of the LIGHT_CHARS (torch or campfire). */
  readonly colorChar: string;
  readonly flicker: boolean;
}

/** Foot footprint in px; blocks pathfinding. Alcove floor props only. */
export interface SolidDef {
  readonly w: number;
  readonly h: number;
}

/**
 * Where a placement lives. `door` (the one-tile door column between the alcove and the corridor)
 * is an addition to the architecture's `alcove | corridor` union: the door frame needs a home
 * because the alcove ends at x 127 and the corridor starts at x 144.
 */
export type StageZone = 'alcove' | 'door' | 'corridor';

export interface PropPlacement {
  /** Key in StageSprites.props. */
  readonly prop: string;
  readonly zone: StageZone;
  readonly layer: 'wall' | 'floor';
  /** Left edge in px within the zone (corridor positions repeat every 384 px). */
  readonly x: number;
  /** Wall: top edge. Floor: foot y in screen px. */
  readonly y: number;
  readonly solid: SolidDef | null;
  readonly light: LightDef | null;
}

export type AmbientEffect =
  | { readonly kind: 'drip'; readonly perSecond: number }
  /** Drifting motes (E1, Stage 2). */
  | { readonly kind: 'dust'; readonly perSecond: number }
  /** Rising bubbles (E2, Stage 3). */
  | { readonly kind: 'bubbles'; readonly perSecond: number }
  /** Low drifting fog wisps plus a few dust motes (E2, Stage 4). */
  | { readonly kind: 'fog'; readonly perSecond: number; readonly dustPerSecond: number }
  /** Blinking fireflies wandering in the corridor view (E3, Stage 5). */
  | { readonly kind: 'fireflies'; readonly perSecond: number }
  /** Rising embers, the existing ember kind used as decoration (E3, Stage 6). */
  | { readonly kind: 'embers'; readonly perSecond: number }
  /** Slow falling snow in the corridor view (E4, Stage 7). */
  | { readonly kind: 'snow'; readonly perSecond: number }
  /** Dim indigo murk motes drifting upward and sideways (E4, Stage 8). */
  | { readonly kind: 'murk'; readonly perSecond: number }
  /** Faint tall heat-haze streaks rising slowly from the floor band (E5, Stage 9). */
  | { readonly kind: 'shimmer'; readonly perSecond: number }
  /** Tiny stationary slits that pulse slowly in the mid band (E5, Stage 10). */
  | { readonly kind: 'rifts'; readonly perSecond: number };

export interface StageDef {
  /** Kebab-case; matches the StageSprites key. */
  readonly id: string;
  /** 1-based, contiguous. */
  readonly index: number;
  readonly name: string;
  readonly props: readonly PropPlacement[];
  readonly ambient: AmbientEffect;
}

const TORCH_LIGHT: LightDef = { radius: 56, intensity: 0.85, colorChar: 'T', flicker: true };
/** Lanterns light Stage 2 like torches do Stage 1 (same light character; the stage palette recolors `T`). */
const LANTERN_LIGHT: LightDef = { radius: 52, intensity: 0.85, colorChar: 'T', flicker: true };

/** Glow shrooms (Stage 3): a slow pulse, no flicker. */
const SHROOM_LIGHT: LightDef = { radius: 48, intensity: 0.8, colorChar: 'T', flicker: false };
/** Candelabra (Stage 4) flicker like torches. */
const CANDLE_LIGHT: LightDef = { radius: 52, intensity: 0.8, colorChar: 'T', flicker: true };

/** Glow blooms (Stage 5): a soft blue-teal pulse, no flicker. */
const BLOOM_LIGHT: LightDef = { radius: 48, intensity: 0.8, colorChar: 'T', flicker: false };
/** Lava falls and channels (Stage 6): decoration light only, slow, no flicker (decision E3-11). */
const LAVA_FALL_LIGHT: LightDef = { radius: 52, intensity: 0.7, colorChar: 'T', flicker: false };
const LAVA_CHANNEL_LIGHT: LightDef = { radius: 44, intensity: 0.6, colorChar: 'T', flicker: false };

/**
 * Ice lamps and ice sheets (Stage 7) and wisp torches and floating shards (Stage 8): decoration
 * light only, slow and steady, no flicker (decision E4-2; light radius and intensity per the E4
 * plan section 5.2).
 */
const ICE_LAMP_LIGHT: LightDef = { radius: 48, intensity: 0.8, colorChar: 'T', flicker: false };
const ICE_SHEET_LIGHT: LightDef = { radius: 44, intensity: 0.5, colorChar: 'T', flicker: false };
const WISP_TORCH_LIGHT: LightDef = { radius: 48, intensity: 0.7, colorChar: 'T', flicker: false };
const SHARD_LIGHT: LightDef = { radius: 40, intensity: 0.5, colorChar: 'T', flicker: false };

/**
 * Brazier, gold seam, void rift, and orbit ring (Stages 9 and 10): decoration light only, slow and
 * steady, no flicker (E5 plan section 5.3). The animated props loop at 500 ms per frame because
 * none is named torch or lantern.
 */
const BRAZIER_LIGHT: LightDef = { radius: 52, intensity: 0.8, colorChar: 'T', flicker: false };
const GOLD_VEIN_LIGHT: LightDef = { radius: 40, intensity: 0.5, colorChar: 'T', flicker: false };
const RIFT_LIGHT: LightDef = { radius: 48, intensity: 0.7, colorChar: 'T', flicker: false };
const RING_LIGHT: LightDef = { radius: 40, intensity: 0.5, colorChar: 'T', flicker: false };

function wall(
  prop: string,
  zone: StageZone,
  x: number,
  y: number,
  light: LightDef | null = null,
): PropPlacement {
  return { prop, zone, layer: 'wall', x, y, solid: null, light };
}

function floor(
  prop: string,
  zone: StageZone,
  x: number,
  y: number,
  solid: SolidDef | null = null,
): PropPlacement {
  return { prop, zone, layer: 'floor', x, y, solid, light: null };
}

/**
 * Stage 1, "The Forgotten Cellar". Barrels and crates stand against the back wall (foot y 134,
 * floor row 0) where no seat or formation slot lives, so they are solid without ever blocking a
 * hero's route. Torch positions are corridor-relative so they scroll past.
 */
export const STAGES: readonly StageDef[] = [
  {
    id: 'forgotten-cellar',
    index: 1,
    name: 'The Forgotten Cellar',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('cobweb', 'alcove', 0, 16),
      wall('chains', 'alcove', 46, 16),
      wall('torch', 'alcove', 28, 40, TORCH_LIGHT),
      wall('torch', 'alcove', 92, 40, TORCH_LIGHT),
      floor('barrel', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('crate', 'alcove', 106, 134, { w: 12, h: 5 }),
      floor('bonePile', 'alcove', 10, 152),
      floor('puddle', 'alcove', 88, 148),
      wall('torch', 'corridor', 60, 40, TORCH_LIGHT),
      wall('torch', 'corridor', 252, 40, TORCH_LIGHT),
      wall('chains', 'corridor', 150, 16),
      wall('chains', 'corridor', 330, 16),
      wall('cobweb', 'corridor', 368, 16),
      floor('puddle', 'corridor', 120, 150),
      floor('puddle', 'corridor', 300, 148),
      floor('bonePile', 'corridor', 200, 154),
    ],
    ambient: { kind: 'drip', perSecond: 1.5 },
  },
  /**
   * Stage 2, "Goblin Mine Shafts". Same room geometry as Stage 1 (heroes keep their seats and
   * formation), so only the dressing differs. The minecart stands against the back wall like the
   * cellar's barrels (foot y 134, never on a seat or slot). Assumption: prop positions are chosen
   * before the art (A-E1-4) lands, from the plan's sizes (wall props about 16 px, lantern about
   * 8 x 16, minecart 16 x 16); `validateStages` re-checks them against the real sizes.
   */
  {
    id: 'goblin-mine-shafts',
    index: 2,
    name: 'Goblin Mine Shafts',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('support', 'alcove', 0, 16),
      wall('pickaxe', 'alcove', 52, 44),
      wall('lantern', 'alcove', 28, 40, LANTERN_LIGHT),
      wall('lantern', 'alcove', 92, 40, LANTERN_LIGHT),
      wall('oreVein', 'alcove', 108, 72),
      floor('minecart', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('rubble', 'alcove', 88, 150),
      wall('lantern', 'corridor', 60, 40, LANTERN_LIGHT),
      wall('lantern', 'corridor', 252, 40, LANTERN_LIGHT),
      wall('support', 'corridor', 150, 16),
      wall('support', 'corridor', 330, 16),
      wall('oreVein', 'corridor', 190, 72),
      wall('pickaxe', 'corridor', 120, 44),
      floor('rubble', 'corridor', 100, 152),
      floor('rubble', 'corridor', 300, 148),
    ],
    ambient: { kind: 'dust', perSecond: 6 },
  },
  /**
   * Stage 3, "Toxic Slime Caverns". Same room geometry as Stages 1 and 2. The toxic barrel is the
   * only solid prop (alcove, foot y 134, never on a seat or slot). Glow shrooms light the stage
   * with the stage-recolored `T` character; their 2-frame pulse does not flicker (decision E2-10).
   */
  {
    id: 'toxic-slime-caverns',
    index: 3,
    name: 'Toxic Slime Caverns',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('slimeDrape', 'alcove', 0, 16),
      wall('pipe', 'alcove', 52, 44),
      wall('glowShroom', 'alcove', 28, 40, SHROOM_LIGHT),
      wall('glowShroom', 'alcove', 92, 40, SHROOM_LIGHT),
      wall('pipe', 'alcove', 108, 72),
      floor('toxicBarrel', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('slimePool', 'alcove', 60, 150),
      floor('mushrooms', 'alcove', 88, 146),
      wall('glowShroom', 'corridor', 60, 40, SHROOM_LIGHT),
      wall('glowShroom', 'corridor', 252, 40, SHROOM_LIGHT),
      wall('slimeDrape', 'corridor', 150, 16),
      wall('slimeDrape', 'corridor', 330, 16),
      wall('pipe', 'corridor', 190, 72),
      wall('pipe', 'corridor', 120, 44),
      floor('slimePool', 'corridor', 100, 152),
      floor('mushrooms', 'corridor', 200, 148),
      floor('slimePool', 'corridor', 300, 150),
    ],
    ambient: { kind: 'bubbles', perSecond: 7 },
  },
  /**
   * Stage 4, "Ancient Catacombs". The sarcophagus is the only solid prop (alcove, foot y 134, a
   * 12 x 5 footprint under a 16 px sprite). Candelabra flicker like torches and lanterns.
   */
  {
    id: 'ancient-catacombs',
    index: 4,
    name: 'Ancient Catacombs',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('crackedPillar', 'alcove', 0, 16),
      wall('skullNiche', 'alcove', 52, 60),
      wall('candelabra', 'alcove', 28, 40, CANDLE_LIGHT),
      wall('candelabra', 'alcove', 92, 40, CANDLE_LIGHT),
      wall('skullNiche', 'alcove', 108, 72),
      floor('sarcophagus', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('boneRubble', 'alcove', 60, 152),
      floor('urn', 'alcove', 92, 148),
      wall('candelabra', 'corridor', 60, 40, CANDLE_LIGHT),
      wall('candelabra', 'corridor', 252, 40, CANDLE_LIGHT),
      wall('crackedPillar', 'corridor', 150, 16),
      wall('crackedPillar', 'corridor', 330, 16),
      wall('skullNiche', 'corridor', 190, 72),
      wall('skullNiche', 'corridor', 110, 60),
      floor('boneRubble', 'corridor', 100, 152),
      floor('urn', 'corridor', 200, 148),
      floor('boneRubble', 'corridor', 300, 150),
    ],
    ambient: { kind: 'fog', perSecond: 4, dustPerSecond: 3 },
  },
  /**
   * Stage 5, "Enchanted Forest Ruins". The ruined statue is the only solid prop (alcove, foot y
   * 134, 12 x 5 footprint). Glow blooms light the stage with the stage-recolored `T`; they pulse
   * and never flicker. Fireflies are the ambient.
   */
  {
    id: 'enchanted-forest-ruins',
    index: 5,
    name: 'Enchanted Forest Ruins',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('brokenPillar', 'alcove', 0, 16),
      wall('hangingRoots', 'alcove', 52, 16),
      wall('glowBloom', 'alcove', 28, 40, BLOOM_LIGHT),
      wall('glowBloom', 'alcove', 92, 40, BLOOM_LIGHT),
      wall('hangingRoots', 'alcove', 108, 16),
      floor('ruinedStatue', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('fernPatch', 'alcove', 60, 150),
      floor('flowerBed', 'alcove', 88, 148),
      wall('glowBloom', 'corridor', 60, 40, BLOOM_LIGHT),
      wall('glowBloom', 'corridor', 252, 40, BLOOM_LIGHT),
      wall('brokenPillar', 'corridor', 150, 16),
      wall('brokenPillar', 'corridor', 330, 16),
      wall('hangingRoots', 'corridor', 190, 16),
      wall('hangingRoots', 'corridor', 110, 16),
      floor('fernPatch', 'corridor', 100, 152),
      floor('flowerBed', 'corridor', 200, 148),
      floor('fernPatch', 'corridor', 300, 150),
    ],
    ambient: { kind: 'fireflies', perSecond: 5 },
  },
  /**
   * Stage 6, "Molten Core". Lava is scenery only: wall-layer falls and a wall-base channel, never
   * a floor prop (lava rules, E3 plan section 5.1). The anvil is the only solid prop (alcove, foot
   * y 134). Lights are slow and steady; embers are the ambient.
   */
  {
    id: 'molten-core',
    index: 6,
    name: 'Molten Core',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('obsidianPillar', 'alcove', 0, 16),
      wall('lavaFall', 'alcove', 28, 16, LAVA_FALL_LIGHT),
      wall('lavaFall', 'alcove', 92, 16, LAVA_FALL_LIGHT),
      wall('lavaChannel', 'alcove', 52, 120, LAVA_CHANNEL_LIGHT),
      wall('toolRack', 'alcove', 108, 52),
      floor('anvil', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('slagHeap', 'alcove', 60, 152),
      floor('slagHeap', 'alcove', 88, 148),
      wall('lavaFall', 'corridor', 60, 16, LAVA_FALL_LIGHT),
      wall('lavaFall', 'corridor', 252, 16, LAVA_FALL_LIGHT),
      wall('obsidianPillar', 'corridor', 150, 16),
      wall('obsidianPillar', 'corridor', 330, 16),
      wall('lavaChannel', 'corridor', 190, 120, LAVA_CHANNEL_LIGHT),
      wall('toolRack', 'corridor', 110, 52),
      floor('slagHeap', 'corridor', 100, 152),
      floor('slagHeap', 'corridor', 200, 148),
      floor('slagHeap', 'corridor', 300, 150),
    ],
    ambient: { kind: 'embers', perSecond: 6 },
  },
  /**
   * Stage 7, "Frozen Citadel". Ice and snow are scenery only: wall-layer columns, icicles, banners,
   * lamps, and a wall-base sheet; the floor layer holds just the throne and snow drifts. Nothing
   * reads a prop for movement. The throne is the only solid prop (alcove, foot y 134). Snowfall is
   * the ambient (E4 plan section 5.1).
   */
  {
    id: 'frozen-citadel',
    index: 7,
    name: 'Frozen Citadel',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('icePillar', 'alcove', 0, 16),
      wall('icicleCluster', 'alcove', 52, 16),
      wall('iceLamp', 'alcove', 28, 40, ICE_LAMP_LIGHT),
      wall('iceLamp', 'alcove', 92, 40, ICE_LAMP_LIGHT),
      wall('iceSheet', 'alcove', 52, 120, ICE_SHEET_LIGHT),
      wall('frostBanner', 'alcove', 108, 52),
      floor('iceThrone', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('snowDrift', 'alcove', 60, 152),
      floor('snowDrift', 'alcove', 88, 148),
      wall('iceLamp', 'corridor', 60, 40, ICE_LAMP_LIGHT),
      wall('iceLamp', 'corridor', 252, 40, ICE_LAMP_LIGHT),
      wall('icePillar', 'corridor', 150, 16),
      wall('icePillar', 'corridor', 330, 16),
      wall('icicleCluster', 'corridor', 110, 16),
      wall('frostBanner', 'corridor', 200, 52),
      wall('iceSheet', 'corridor', 190, 120, ICE_SHEET_LIGHT),
      floor('snowDrift', 'corridor', 100, 152),
      floor('snowDrift', 'corridor', 200, 148),
      floor('snowDrift', 'corridor', 300, 150),
    ],
    ambient: { kind: 'snow', perSecond: 9 },
  },
  /**
   * Stage 8, "Shadow Realm". Dusk crystal and dark mirrors are scenery only. The altar is the only
   * solid prop (alcove, foot y 134). Wisp torches and floating shards light the stage softly;
   * murk motes are the ambient (E4 plan section 5.1).
   */
  {
    id: 'shadow-realm',
    index: 8,
    name: 'Shadow Realm',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('duskPillar', 'alcove', 0, 16),
      wall('wispTorch', 'alcove', 28, 40, WISP_TORCH_LIGHT),
      wall('wispTorch', 'alcove', 92, 40, WISP_TORCH_LIGHT),
      wall('floatingShard', 'alcove', 52, 76, SHARD_LIGHT),
      wall('mirrorFrame', 'alcove', 108, 52),
      floor('duskAltar', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('shardPatch', 'alcove', 60, 152),
      floor('shardPatch', 'alcove', 88, 148),
      wall('wispTorch', 'corridor', 60, 40, WISP_TORCH_LIGHT),
      wall('wispTorch', 'corridor', 252, 40, WISP_TORCH_LIGHT),
      wall('duskPillar', 'corridor', 150, 16),
      wall('duskPillar', 'corridor', 330, 16),
      wall('floatingShard', 'corridor', 190, 72, SHARD_LIGHT),
      wall('mirrorFrame', 'corridor', 110, 52),
      wall('mirrorFrame', 'corridor', 300, 52),
      floor('shardPatch', 'corridor', 100, 152),
      floor('shardPatch', 'corridor', 200, 148),
      floor('shardPatch', 'corridor', 300, 150),
    ],
    ambient: { kind: 'murk', perSecond: 4 },
  },
  /**
   * Stage 9, "Dragon's Lair". Scorch marks, gold, and braziers are scenery only. Floor-layer props
   * are just the hoard pile (solid, alcove, foot y 134), gold scatter. Braziers and gold seams
   * light the stage softly; heat shimmer is the ambient (E5 plan sections 5.1 and 5.3).
   */
  {
    id: 'dragons-lair',
    index: 9,
    name: "Dragon's Lair",
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('scorchedPillar', 'alcove', 0, 16),
      wall('hoardBrazier', 'alcove', 28, 40, BRAZIER_LIGHT),
      wall('hoardBrazier', 'alcove', 92, 40, BRAZIER_LIGHT),
      wall('drakeSkull', 'alcove', 52, 28),
      wall('goldVein', 'alcove', 52, 112, GOLD_VEIN_LIGHT),
      wall('scaleBanner', 'alcove', 108, 52),
      floor('hoardPile', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('goldScatter', 'alcove', 60, 152),
      floor('goldScatter', 'alcove', 88, 148),
      wall('hoardBrazier', 'corridor', 60, 40, BRAZIER_LIGHT),
      wall('hoardBrazier', 'corridor', 252, 40, BRAZIER_LIGHT),
      wall('scorchedPillar', 'corridor', 150, 16),
      wall('scorchedPillar', 'corridor', 330, 16),
      wall('drakeSkull', 'corridor', 190, 28),
      wall('scaleBanner', 'corridor', 110, 52),
      wall('goldVein', 'corridor', 300, 112, GOLD_VEIN_LIGHT),
      floor('goldScatter', 'corridor', 100, 152),
      floor('goldScatter', 'corridor', 200, 148),
      floor('goldScatter', 'corridor', 300, 150),
    ],
    ambient: { kind: 'shimmer', perSecond: 8 },
  },
  /**
   * Stage 10, "Void Spire". Rifts, stars, and rings are scenery only. Floor-layer props are just
   * the rift pedestal (solid, alcove, foot y 134) and cracked slabs. Rifts and rings light the
   * stage softly; slowly pulsing rift slits are the ambient (E5 plan sections 5.1 and 5.3).
   */
  {
    id: 'void-spire',
    index: 10,
    name: 'Void Spire',
    props: [
      wall('doorFrame', 'door', 0, 0),
      wall('spirePillar', 'alcove', 0, 16),
      wall('voidRift', 'alcove', 28, 40, RIFT_LIGHT),
      wall('voidRift', 'alcove', 92, 40, RIFT_LIGHT),
      wall('orbitRing', 'alcove', 52, 76, RING_LIGHT),
      wall('starWindow', 'alcove', 108, 52),
      floor('riftPedestal', 'alcove', 6, 134, { w: 12, h: 5 }),
      floor('crackedSlab', 'alcove', 60, 152),
      floor('crackedSlab', 'alcove', 88, 148),
      wall('voidRift', 'corridor', 60, 40, RIFT_LIGHT),
      wall('voidRift', 'corridor', 252, 40, RIFT_LIGHT),
      wall('spirePillar', 'corridor', 150, 16),
      wall('spirePillar', 'corridor', 330, 16),
      wall('orbitRing', 'corridor', 190, 72, RING_LIGHT),
      wall('starWindow', 'corridor', 110, 52),
      wall('starWindow', 'corridor', 300, 52),
      floor('crackedSlab', 'corridor', 100, 152),
      floor('crackedSlab', 'corridor', 200, 148),
      floor('crackedSlab', 'corridor', 300, 150),
    ],
    ambient: { kind: 'rifts', perSecond: 3 },
  },
];
