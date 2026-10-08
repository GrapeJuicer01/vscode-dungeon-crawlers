# Data model

Purpose: the typed data tables of the game (stages now; classes, enemies, drops, achievements later), the art data the engine consumes, the startup validators, and the rules for persisted progress. Defines what is data versus code, who owns each table, and what is checked at startup.
Related: [game engine](game-engine.md), [M4 plan](plans/m4-engine.md), [architecture overview](overview.md), [host-webview protocol](host-webview-protocol.md), [security and safety](security-and-safety.md), [ADR 0003 procedural sprites](adr/0003-procedural-sprites.md), [ADR 0010 split room layout](adr/0010-split-room-stage-layout.md), [coding standards](../engineering/coding-standards.md#9-data-tables-and-configuration), [sprite spec](../design/sprite-spec.md), [art style guide](../design/art-style-guide.md), [roadmap](../engineering/roadmap.md), [glossary](../glossary.md).

Status: M4 sections are synced to the as-built code (commit b320b00; drift in [M4 plan section 13](plans/m4-engine.md#13-as-built-drift-checked-against-commits-081732d-to-b320b00)). Sections marked "planned" are constraints already decided, to be detailed in their own milestone plan.

## 1. Principles

- Game content lives in typed, `readonly` tables, written `as const satisfies <RowType>` (coding standards section 2). The 50 enemies will come from a compact row table plus scaling formulas, never 50 hand-written objects.
- Art data (palettes, sprite templates) and gameplay data (stages, classes, enemies) are separate files with separate owners. A stage row references art by id; it never embeds pixels.
- Every table is validated at startup by a pure function. A validator failure is reported once and disables only the affected feature; it never changes hero state or touches agents. Tests run the same validators over the shipped tables.
- Tables hold no per-session or transcript-derived data. Hero state comes only from host events ([game engine section 5](game-engine.md#5-events-in-heroes-out)).

## 2. Ownership and files

| Table | File | Owner | Arrives |
|---|---|---|---|
| Master palette, skin and hair swaps, stage tile characters, particle ramps | `src/game/sprites/palettes.ts` | pixel-artist | A0 |
| Sprite templates (hero layers, campfire, stage tiles, props, backdrop) | `src/game/sprites/spriteTemplates.ts` (more template files per batch) | pixel-artist | A0, H1-H3, E1-E5 |
| Stages | `src/game/data/stages.ts` | developer | M4 (Stage 1), E1-E5 |
| `ArtSet` glue (`SHIPPED_ART`) | `src/game/sprites/artSet.ts` | developer | M4 |
| Animation timings | `src/game/data/animations.ts` | developer | M4 |
| Engine tuning constants | `src/game/data/tuning.ts` | developer | M4 |
| Classes, class map | `src/game/data/classes.ts`, `classMap.ts` | developer | H1-H3 |
| Enemies, drops | `src/game/data/enemies.ts`, `drops.ts` | developer | E1-E5 |
| Achievements | `src/game/data/achievements.ts` | developer | M7 |

`npm run docs:tables` (from H1) regenerates the class and enemy tables in `docs/design/` from these files; stages and animations are small enough to document by hand.

## 3. Art data contract (batch A0)

The pixel-artist exports these names; the engine imports them. Types are declared in the artist's files, matching the [sprite spec](../design/sprite-spec.md). The authoritative per-asset list (sizes, frame counts, names) is [M4 plan section 10](plans/m4-engine.md#10-art-needs-batch-a0).

```ts
// src/game/sprites/palettes.ts
export type Palette = Record<string, string>;              // one character -> '#rrggbb'
export const MASTER_PALETTE: Palette;                      // about 32 colors; '.' is never a key
export const SKIN_TONES: readonly Palette[];               // 4 partial overrides (at least the 's' character)
export const HAIR_COLORS: readonly Palette[];              // 6 partial overrides (at least the 'h' character)
export const STAGE_TILE_CHARS: Readonly<Record<string, string>>; // stage id -> at most 8 characters
export const STAGE_CLEAR_CHAR: Readonly<Record<string, string>>; // stage id -> character for background fill
export const STAGE_AMBIENT_CHAR: Readonly<Record<string, string>>; // stage id -> darkness tint multiplied over the environment
export const LIGHT_CHARS: { readonly torch: string; readonly campfire: string }; // light colors
export const PARTICLE_PALETTE: Readonly<Record<'ember' | 'spark' | 'drip' | 'splash', readonly string[]>>; // bright to dim

// src/game/sprites/spriteTemplates.ts
export interface SpriteTemplate {
  id: string;
  w: number;
  h: number;
  anchor: { x: number; y: number };
  animations: Record<string, string[][]>;
}
export interface HeroLayerSet {
  body: SpriteTemplate; head: SpriteTemplate; gear: SpriteTemplate | null; weapon: SpriteTemplate;
}
export interface CampfireSprites { logs: SpriteTemplate; flameSmall: SpriteTemplate; flameLarge: SpriteTemplate; }
export interface StageSprites {
  tiles: {
    wallTop: SpriteTemplate[]; wallMid: SpriteTemplate[]; wallBase: SpriteTemplate[];
    floorBack: SpriteTemplate[]; floorFront: SpriteTemplate[]; foreground: SpriteTemplate[];
  };
  props: Record<string, SpriteTemplate>;
  backdrop: SpriteTemplate;
}
export const BASE_HERO: HeroLayerSet;
export const CAMPFIRE: CampfireSprites;
export const STAGE_SPRITES: Readonly<Record<string, StageSprites>>; // key = stage id
```

The engine does not import these files directly. `src/game/sprites/artSet.ts` (developer-owned glue) gathers them into `SHIPPED_ART: ArtSet`, whose fields are `palette`, `skinTones`, `hairColors`, `baseHero`, `campfire`, `stageSprites`, `particlePalette`, `lightChars`, `stageAmbientChar`, `stageClearChar`, and `stageTileChars` (the last is `STAGE_TILE_CHARS`; the validator checks each stage's templates against it). `HeroLook` is `{ skin, hair, accent }`, where `accent` is a CSS `#rrggbb` overriding the `a` character or `null`. The `ArtSet` is validated by `validateArtSet` in tests, not at boot.

Conventions the validator enforces: every non-hero sprite uses the animation name `idle` (one frame for a static tile or prop); hero layers use the hero animation names; `.` is transparent; a stage's templates use only the characters in `STAGE_TILE_CHARS[stageId]`; hero and campfire templates use at most 12 colors.

## 4. Stages (M4)

`src/game/data/stages.ts` holds `STAGES: readonly StageDef[]`. M4 ships exactly one row, Stage 1.

```ts
export interface LightDef { readonly radius: number; readonly intensity: number; readonly colorChar: string; readonly flicker: boolean; }
export interface SolidDef { readonly w: number; readonly h: number; }          // foot footprint in px, blocks pathfinding; alcove floor props only
export type StageZone = 'alcove' | 'door' | 'corridor';   // door = the 16 px column at x 128-143
export interface PropPlacement {
  readonly prop: string;                         // key in StageSprites.props
  readonly zone: StageZone;                      // corridor positions repeat every 384 px
  readonly layer: 'wall' | 'floor';
  readonly x: number;                            // left edge in px within the zone
  readonly y: number;                            // wall: top edge; floor: foot y in screen px
  readonly solid: SolidDef | null;
  readonly light: LightDef | null;
}
export type AmbientEffect = { readonly kind: 'drip'; readonly perSecond: number };   // union grows per batch
export interface StageDef {
  readonly id: string;                           // kebab-case, matches StageSprites key
  readonly index: number;                        // 1-based, contiguous
  readonly name: string;                         // from the art style guide
  readonly props: readonly PropPlacement[];
  readonly ambient: AmbientEffect;
}
```

`validateStages(stages, art)` (in `Stage.ts`; takes the `ArtSet`) returns a list of fixed-text errors (empty means valid). `Game` runs it at construction and throws on any error; it is the only validator that runs at boot.

| Check | Rule |
|---|---|
| ids and indexes | ids unique kebab-case; indexes 1..n contiguous and ascending |
| art present | each stage has a `StageSprites` entry; every `prop` key exists; every tile list is non-empty |
| door | exactly one door-zone prop per stage; it must be a non-solid wall prop at `x 0`, at most 16 px wide |
| placement bounds | alcove `x + w <= 128`; corridor `x + w <= 384`; `x >= 0`; floor-prop foot y inside the floor band (`128 <= y < 160`); wall props inside y 0-127 |
| lights | at most 8 per stage; `radius` 8-96; `intensity` 0-1; `colorChar` is the torch or campfire light character |
| solids | alcove floor props only (a solid corridor, door, or wall prop is an error); footprint inside the floor band and the alcove |
| connectivity | the entrance cell is open; every seat and formation cell (32 each) is open (so none overlaps a solid or the campfire pit) and reachable by A* from the entrance on the built nav grid |

The nav grid is built from alcove solids plus the campfire pit box (x 56, y 144, 16x8). A `puddle` prop in any zone becomes a drip point for the `drip` ambient effect.

From E1, `enemies.ts` adds its own validator (50 unique ids, 5 per stage, one boss per stage, incremental mode per roadmap A3) and cross-checks that every enemy's stage exists in `STAGES`.

## 5. Animation timings and tuning (M4)

`animations.ts` maps animation names to frame durations in milliseconds (looping unless noted). Defaults: `idle` 500, `walk` 130, `attack` 140/90/160 (plays once per cycle), each rest pose 600, `victory` 300, campfire flame 110, torch 130.

`tuning.ts` holds named constants with units in the name and an `Assumption:` comment. These are cosmetic and engine-safety values, not user thresholds, so they are not `pixelAgents.*` settings (coding standards section 9: safety bounds are constants). User-facing options (reduce-motion, particle density) arrive with M7 and the `ConfigSnapshot`.

| Group | Constants (defaults) |
|---|---|
| Loop | `STEP_MS` 1000/60, `MAX_FRAME_MS` 100, `MAX_STEPS_PER_FRAME` 5, `EVENT_QUEUE_CAP` 256, `FAULT_LIMIT` 3, `EXIT_FAILSAFE_MS` 5000, `ENGINE_SEED` 0x50415845 |
| Hero | `WALK_PX_PER_S` 40, `WARP_IN_MS` 600, `WARP_OUT_MS` 600, `VICTORY_MS` 1200, `REST_POSE_MIN_MS` 9000, `REST_POSE_MAX_MS` 16000, `SLEEP_AFTER_REST_MS` 30000, `SKIN_TONE_COUNT` 4, `HAIR_COLOR_COUNT` 6, `HERO_SHADOW_WIDTH_PX` 10, `PATH_RETRY_MS` 1000, `WARP_SPARKS_PER_S` 40 (`VISIBLE_SLOTS` 32 lives in `layout.ts`) |
| Engagement | `ADVANCE_MS` 5000, `ENGAGE_MS` 2400, `SCROLL_PX_PER_S` 24, `SCROLL_EASE_MS` 300, `ATTACK_STAGGER_MAX_MS` 400 |
| Campfire | `FLAME_LARGE_AT_RESTING` 3, `EMBER_BASE_PER_S` 4 plus `EMBER_PER_RESTING_PER_S` 3 per resting hero, light radius `FIRE_LIGHT_BASE_PX` 40 plus `FIRE_LIGHT_PER_RESTING_PX` 6 per resting hero (cap `FIRE_LIGHT_MAX_PX` 72), `FIRE_LIGHT_INTENSITY` 0.9, `FIRE_FLICKER_MS` 120, `FIRE_SHADOW_WIDTH_PX` 30 |
| Effects | `PARTICLE_CAPACITY` 384, `MAX_LIGHTS` 16, light map `LIGHT_MAP_WIDTH` 80 by `LIGHT_MAP_HEIGHT` 45 at `LIGHT_MAP_SCALE` 4, `LIGHT_RADIUS_STEP_PX` 8, `LIGHT_RADIUS_MAX_PX` 96, `LIGHT_BANDS` 4, `TORCH_FLICKER_MS` 140, `BACKDROP_PARALLAX` 0.25, `BACKDROP_WIDTH_PX` 128, `DRIP_GRAVITY_PX_PER_S2` 360, `DRIP_FALL_HEIGHT_PX` 44 |

`animations.ts` also exports `FLAME_FRAME_MS` 110, `TORCH_FRAME_MS` 130, and `PROP_FRAME_MS` 500 (other looping props), plus the allocation-free `heroFrameIndex` and `loopFrameIndex`. Fixed room geometry (campfire position, nav cell size, slot formulas) lives in `layout.ts`, not in `tuning.ts`.

## 6. Hero identity data (M4)

There is no per-hero table. A hero's look is computed: `skinIndex = hashId(id) % SKIN_TONE_COUNT`, `hairIndex = (hashId(id) >>> 8) % HAIR_COLOR_COUNT`, `accent: null` (implemented by the exported `lookFor(id)` in `Roster.ts`). Class assignment (H1) adds `classes.ts` and `classMap.ts`; the class chosen for a session is sticky and held in the webview only (no persistence).

## 7. Persisted progress (planned, E1)

Constraints already decided; E1's plan adds the schema and an ADR.

- The first persisted data is stage progress (roadmap A10). Storage is the host's `globalState`; the webview never persists anything and has no `getState`/`setState`.
- The stored value carries `schemaVersion` (integer) and a migration runner upgrades every older version step by step; an unknown future version or invalid shape falls back to a fresh default, never throws.
- Load and save are new protocol messages ([protocol section 3](host-webview-protocol.md#3-message-catalog)); they carry progress only, never agent data, and may not control a session.
- Progress must never contain transcript content, agent names, or session ids (Core invariant 7). Hero state is never persisted (Core invariant 2): heroes are always rebuilt from the host's agent list.
- M7 (achievements) adds schema version 2 with a migration from 1.
