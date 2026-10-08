// Stage rows (docs/architecture/data-model.md section 4). A stage references art by id and prop
// key; it never embeds pixels. M4 ships Stage 1 only; E1-E5 append rows.

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

export type AmbientEffect = { readonly kind: 'drip'; readonly perSecond: number };

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
];
