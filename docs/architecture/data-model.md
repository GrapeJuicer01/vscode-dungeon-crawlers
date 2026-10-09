# Data model

Purpose: the typed data tables of the game (stages now; classes, enemies, drops, achievements later), the art data the engine consumes, the startup validators, and the rules for persisted progress. Defines what is data versus code, who owns each table, and what is checked at startup.
Related: [game engine](game-engine.md), [M4 plan](plans/m4-engine.md), [H1 plan](plans/h1-classes.md), [E1 plan](plans/e1-enemies.md), [ADR 0012 versioned progress](adr/0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and reaction board](adr/0013-enemy-health-and-hero-reaction-board.md), [architecture overview](overview.md), [host-webview protocol](host-webview-protocol.md), [security and safety](security-and-safety.md), [ADR 0003 procedural sprites](adr/0003-procedural-sprites.md), [ADR 0010 split room layout](adr/0010-split-room-stage-layout.md), [coding standards](../engineering/coding-standards.md#9-data-tables-and-configuration), [sprite spec](../design/sprite-spec.md), [art style guide](../design/art-style-guide.md), [roadmap](../engineering/roadmap.md), [glossary](../glossary.md).

Status: M4 sections are synced to the as-built code (commit b320b00; drift in [M4 plan section 13](plans/m4-engine.md#13-as-built-drift-checked-against-commits-081732d-to-b320b00)). H1 sections are synced to HEAD ec76b05 on `feat/h1-classes` (drift in [H1 plan section 13](plans/h1-classes.md#13-as-built-drift-checked-against-head-ec76b05-on-feat-h1-classes)). E1 sections (4, 5, 7, 8) are synced to the as-built tree on `feat/e1-enemies` (drift in [E1 plan section 13](plans/e1-enemies.md#13-as-built-drift-checked-against-the-e1-working-tree)). Sections marked "planned" are constraints already decided, to be detailed in their own milestone plan.

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
| Classes, class map, effect ids | `src/game/data/classes.ts`, `classMap.ts`, `effects.ts` | developer | H1-H3 |
| Class palettes, class layers, effect sprites | `palettes.ts` (`CLASS_PALETTES`), `classTemplates.ts` (`CLASS_LAYERS`), `effectTemplates.ts` (`EFFECT_SPRITES`) | pixel-artist | H1 (A1-1 to A1-3), H2, H3 |
| Enemies, drops | `src/game/data/enemies.ts`, `drops.ts` | developer | E1-E5 |
| Enemy, boss, drop, bar, and Stage 2 art; stage palettes and boss phase palettes | `palettesE1.ts`, `enemyBuilder.ts` (builder helpers), `enemyTemplates.ts` (aggregator and bar frames), `enemiesStage1.ts`, `enemiesStage2.ts`, `ratKingTemplate.ts`, `goblinForemanTemplate.ts`, `dropTemplates.ts`, `stage2Templates.ts` (all in `src/game/sprites/`) | pixel-artist | E1 (A-E1-1 to A-E1-6) |
| Stage 3 and 4 art, enemies, bosses, and boss phase palettes (the two stage palettes sit in `palettesE1.ts` `STAGE_PALETTES`, the particle ramps in `palettes.ts`) | `palettesE2.ts` (`BOSS_PHASE_PALETTES_E2`), `stage3Templates.ts`, `stage4Templates.ts`, `enemiesStage3.ts`, `enemiesStage4.ts`, `oozeQueenTemplate.ts`, `tombLichTemplate.ts` (all in `src/game/sprites/`) | pixel-artist | E2 (A-E2-1 to A-E2-6) |
| Progress schema, migrations, store, game settings reader | `src/shared/progress.ts`, `src/host/progressMigrations.ts`, `progressStore.ts`, `gameConfig.ts` | developer | E1 |
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

H1 adds (planned, [H1 plan section 3.5](plans/h1-classes.md#35-sprites-and-art-set)): `CLASS_PALETTES` in `palettes.ts`; `CLASS_LAYERS` (class id to `HeroLayerSet`) and `EFFECT_SPRITES` (effect id to `SpriteTemplate`, animation `idle`, center anchor) in the template files; `ArtSet` gains `classLayers`, `classPalettes`, and `effects`; `HeroLook` gains `classId`; the base hero gains a 3-frame `ability` and `ability` joins the required hero animations (eleven, 26 frames per layer). Palette order for a hero bitmap is master, class, skin, hair, accent.

Conventions the validator enforces: every non-hero sprite uses the animation name `idle` (one frame for a static tile or prop); hero layers use the hero animation names; `.` is transparent; a stage's templates use only the characters in `STAGE_TILE_CHARS[stageId]`; hero and campfire templates use at most 12 colors.

## 4. Stages (M4)

`src/game/data/stages.ts` holds `STAGES: readonly StageDef[]`. M4 shipped exactly one row, Stage 1; E1 adds Stage 2 (`goblin-mine-shafts`, index 2, ambient `dust` at 6 per second); E2 adds Stage 3 (`toxic-slime-caverns`, index 3, ambient `bubbles` at 7 per second) and Stage 4 (`ancient-catacombs`, index 4, ambient `fog` at 4 per second plus 3 dust motes per second). Each new stage has 18 placements (door frame, 8 alcove, 9 corridor) and 4 lights (`glowShroom` with `flicker: false`, `candelabra` with `flicker: true`); the only solid prop is the alcove floor prop at foot y 134 (`toxicBarrel`, `sarcophagus`, 12 x 5).

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
export type AmbientEffect =
  | { readonly kind: 'drip'; readonly perSecond: number }     // Stage 1
  | { readonly kind: 'dust'; readonly perSecond: number }     // E1, Stage 2 (mote particles)
  | { readonly kind: 'bubbles'; readonly perSecond: number }  // E2, Stage 3 (bubble particles)
  | { readonly kind: 'fog'; readonly perSecond: number; readonly dustPerSecond: number }; // E2, Stage 4 (wisp particles plus motes); union grows per batch
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

From E1, `enemies.ts` adds its own validator (5 per stage, one boss per stage, unique ids, incremental mode per roadmap A3; the 50-id contract is pinned in E5) and cross-checks that every enemy's stage exists in `STAGES` ([section 8](#8-enemies-drops-and-the-enemy-validator-e1)). E1 also adds Stage 2 and the `dust` ambient effect to the stage table. E2 grows the enemy table to 20 of 50 (four stages, five rows each) with no validator change; the incremental mode simply checks 20 rows for four stages.

## 5. Animation timings and tuning (M4)

`animations.ts` maps animation names to frame durations in milliseconds (looping unless noted). Defaults: `idle` 500, `walk` 130, `attack` 140/90/160 (plays once per cycle), each rest pose 600, `victory` 300, campfire flame 110, torch 130.

`tuning.ts` holds named constants with units in the name and an `Assumption:` comment. These are cosmetic and engine-safety values, not user thresholds, so they are not `pixelAgents.*` settings (coding standards section 9: safety bounds are constants). User-facing options (reduce-motion, particle density) arrive with M7 and the `ConfigSnapshot`.

| Group | Constants (defaults) |
|---|---|
| Loop | `STEP_MS` 1000/60, `MAX_FRAME_MS` 100, `MAX_STEPS_PER_FRAME` 5, `EVENT_QUEUE_CAP` 256, `FAULT_LIMIT` 3, `EXIT_FAILSAFE_MS` 5000, `ENGINE_SEED` 0x50415845 |
| Hero | `WALK_PX_PER_S` 40, `WARP_IN_MS` 600, `WARP_OUT_MS` 600, `VICTORY_MS` 1200, `REST_POSE_MIN_MS` 9000, `REST_POSE_MAX_MS` 16000, `SLEEP_AFTER_REST_MS` 30000, `SKIN_TONE_COUNT` 4, `HAIR_COLOR_COUNT` 6, `HERO_SHADOW_WIDTH_PX` 10, `PATH_RETRY_MS` 1000, `WARP_SPARKS_PER_S` 40 (`VISIBLE_SLOTS` 32 lives in `layout.ts`) |
| Engagement | `ADVANCE_MS` 5000, `ENGAGE_MS` 2400, `SCROLL_PX_PER_S` 24, `SCROLL_EASE_MS` 300, `ATTACK_STAGGER_MAX_MS` 400 |
| Campfire | `FLAME_LARGE_AT_RESTING` 3, `EMBER_BASE_PER_S` 4 plus `EMBER_PER_RESTING_PER_S` 3 per resting hero, light radius `FIRE_LIGHT_BASE_PX` 40 plus `FIRE_LIGHT_PER_RESTING_PX` 6 per resting hero (cap `FIRE_LIGHT_MAX_PX` 72), `FIRE_LIGHT_INTENSITY` 0.9, `FIRE_FLICKER_MS` 120, `FIRE_SHADOW_WIDTH_PX` 30 |
| Classes (H1) | `EFFECT_FAULT_LIMIT` 3, `EFFECT_CAPACITY` 24, `ABILITY_INTERVAL_MIN_MS` 4000, `ABILITY_INTERVAL_MAX_MS` 8000, `ATTACK_STRIKE_FRAME` 1, `ABILITY_RELEASE_FRAME` 1, `EFFECT_FRAME_MS` 90, `EFFECT_CULL_MARGIN_PX` 32, `HERO_FRAME_MS.ability` 120/140/200 |
| Effects | `PARTICLE_CAPACITY` 384, `MAX_LIGHTS` 16, light map `LIGHT_MAP_WIDTH` 80 by `LIGHT_MAP_HEIGHT` 45 at `LIGHT_MAP_SCALE` 4, `LIGHT_RADIUS_STEP_PX` 8, `LIGHT_RADIUS_MAX_PX` 96, `LIGHT_BANDS` 4, `TORCH_FLICKER_MS` 140, `BACKDROP_PARALLAX` 0.25, `BACKDROP_WIDTH_PX` 128, `DRIP_GRAVITY_PX_PER_S2` 360, `DRIP_FALL_HEIGHT_PX` 44 |
| Enemies and combat (E1) | `ENEMY_CAPACITY` 12, `ENEMY_SPAWN_X` 340, `ENEMY_LANE_COUNT` 4 / `ENEMY_LANE_FOOT_Y` 156 / `ENEMY_LANE_STEP_PX` 5, `ENEMY_GAP_PX` 14, `ENEMY_STAND_MAX_X` 300, `BOSS_STAND_MAX_X` 288, `BOSS_GAP_PX` 28, `ENEMY_RELEASE_X` 340, `WAVE_GAP_MS` 1200, `WITHDRAW_AFTER_MS` 2000, `MINION_WEIGHT` 3, `ELITE_WEIGHT` 1, `ENEMY_FLASH_MS` 100, `ENEMY_BAR_SHOW_MS` 2500, `ENEMY_DISSOLVE_FRAME_MS` 100, `ENEMY_DISSOLVE_FRAMES` 4, `ENEMY_TELEGRAPH_MS` 500, `ENEMY_INTRO_MS` 1200, `ENEMY_ATTACK_STRIKE_FRAME` 1, `BOSS_PHASE2_FRACTION` 0.5, `BOSS_PHASE2_INTERVAL_FACTOR` 0.7, `BOSS_SLAM_TARGETS` 3, `MAX_SERIAL_DELTA` 2, `COMBAT_FAULT_LIMIT` 3, `PASS_FAULT_LIMIT` 3, `HIT_SPARKS` 2 |
| Stage flow (E1) | `STAGE_CLEAR_HOLD_MS` 1200, `STAGE_FADE_MS` 400, `PROGRESS_WAIT_MS` 1500, `MOTE_MIN_Y` 40, `MOTE_MAX_Y` 150, `MOTE_LIFE_MIN_MS` 2500, `MOTE_LIFE_MAX_MS` 4500 |
| Ambients (E2) | `BUBBLE_MIN_Y` 118, `BUBBLE_MAX_Y` 156, `BUBBLE_RISE_MIN` 12, `BUBBLE_RISE_MAX` 26 (px/s), `BUBBLE_LIFE_MIN_MS` 1400, `BUBBLE_LIFE_MAX_MS` 2600, `FOG_MIN_Y` 132, `FOG_MAX_Y` 158, `FOG_DRIFT_MIN` 3, `FOG_DRIFT_MAX` 9 (px/s), `FOG_LIFE_MIN_MS` 4500, `FOG_LIFE_MAX_MS` 7500 |
| Hero reactions (E1, cosmetic) | `HERO_FLASH_MS` 100, `HERO_FLASH_GAP_MS` 500, `HERO_KNOCK_PX` 1, `HERO_KNOCK_STRONG_PX` 2, `HERO_KNOCK_MS` 160 |

Enemy numbers (health, speed, attack timing, strike power) are not in `tuning.ts`; they are in `enemies.ts`, and the drop constants (`DROP_CAPACITY` 16, `DROP_REST_MS` 900, `DROP_FADE_MS` 300, `DROP_ARC_MS` 360, `DROP_ARC_HEIGHT_PX` 14, `BOSS_COIN_BURST` 5) are in `drops.ts` ([section 8](#8-enemies-drops-and-the-enemy-validator-e1)). The `pixelAgents.killsPerStage` and `maxEnemies` settings override the corresponding defaults at run time (`Combat.configure`).

`animations.ts` also exports `FLAME_FRAME_MS` 110, `TORCH_FRAME_MS` 130, and `PROP_FRAME_MS` 500 (other looping props), plus the allocation-free `heroFrameIndex` and `loopFrameIndex`. Fixed room geometry (campfire position, nav cell size, slot formulas) lives in `layout.ts`, not in `tuning.ts`.

## 6. Hero identity and classes (M4, H1, H2)

There is no per-hero table. A hero's look is computed: `skinIndex = hashId(id) % SKIN_TONE_COUNT`, `hairIndex = (hashId(id) >>> 8) % HAIR_COLOR_COUNT`, `accent: null` (implemented by the exported `lookFor(id)` in `Roster.ts`).

**Classes (built to the [H1 plan](plans/h1-classes.md)).** `classes.ts` holds `CLASSES: readonly ClassDef[]`, one compact row per class: `id`, `name`, `role`, `colors`, `silhouette` (the last two are documentation text for the generated table), `strike` (a list of cosmetic `EffectShot`), and `ability` (id, name, effect shots). A row has no health, mana, power, or cooldown field and none may be added without a Core invariant review; the structural test pins the key set. `effects.ts` lists the `EffectId` union. `classMap.ts` exports `DELIVERED_CLASSES` and the pure `classFor(id)`: `DELIVERED_CLASSES[(hashId(id) >>> CLASS_SHIFT) % length]` (`CLASS_SHIFT` was 16 in H1 and is 20 from H2, see below). The class is therefore sticky by construction, stable across webview reloads, held nowhere, and never persisted (persisting it would store session ids, Core invariant 7). H1 delivers four classes; H2 and H3 extend `CLASS_IDS` to 12, and the validator then requires exactly 12 unique ids with complete template sets.

| Check (`validateClasses`, `validateClassArt`; tests only) | Rule |
|---|---|
| ids | unique, equal to `CLASS_IDS`; names equal the art style guide |
| shots | effect ids exist in `EFFECT_IDS` and in `ArtSet.effects`; lifetimes 100-1500 ms; at most 4 shots per list |
| art | every class has layers (eleven animations, 26 frames per layer, equal counts) and a partial palette overriding only `a c d b k m` |
| composited look | at most 12 colors per class look under every skin and hair swap |

`npm run docs:tables` regenerates the class table in `docs/design/classes.md` from `classes.ts` between generated-region markers; it never reads art. The table opens with `Delivered classes: N of 12.` (12 is hardcoded as `PLANNED_CLASS_COUNT` in the script).

**H1 as built (HEAD ec76b05; full list in [H1 plan section 13](plans/h1-classes.md#13-as-built-drift-checked-against-head-ec76b05-on-feat-h1-classes)).**

- `validateClasses(defs)` takes no art parameter. The art cross-check is `validateClassArt(art, classIds, effectIds)` in `spriteValidator.ts`.
- Simulator ids `sim-0-0` to `sim-7-0` mapped to rogue, warrior, warrior, mage, rogue, mage, archer, mage under H1's `>>> 16` slice (superseded by the H2 shift below).
- Effect sprite ids are the local union `EffectSpriteId` in `sprites/spriteTypes.ts` until `EFFECT_SPRITES` is keyed by `EffectId` from `data/effects.ts`.
- Effects are drawn with master colours; class palettes apply to hero looks only.
- `HERO_POSES`, `HERO_HEAD`, and `HeroPose` (in `heroTemplates.ts`) are exported for art files only; the engine must not import them.
- Static effects play once at 90 ms per frame and hold the last frame; moving effects loop. A class without class layers falls back to the base hero recoloured by its class palette.

**H2 as built (to the [H2 plan](plans/h2-classes.md)).**

- `CLASS_IDS` appends `cleric paladin necromancer bard` (H1 order unchanged); `DELIVERED_CLASSES` is all eight (twelve after H3); `classFor` keeps its form but **the shift is now `CLASS_SHIFT = 20`** (as-built decision H2-9): with eight classes `>>> 16` gave only four distinct classes for `sim-0-0` to `sim-7-0`, and `>>> 20` gives seven (including Cleric, Paladin, Necromancer) while staying independent of skin (`h % 4`) and hair (`(h >>> 8) % 6`). Every id is reshuffled once relative to H1 (never released, so unseen); stable within a running extension.
- Beyond the plan, `animations.ts` also exports `SUMMON_RISE_FRAMES` (4), `SUMMON_SINK_FRAMES` (3), `SUMMON_RISE_TOTAL_MS`, `SUMMON_SINK_TOTAL_MS`, and `summonFrameIndex`; `SpriteCache.summon` takes a string id. `Summon` has extra pool-only members (`step`, `release`, `inUse`, `finished`, `slot`, `pose`); see [game engine 13.2](game-engine.md).
- `ClassDef` gains one required key, `summon: SummonDef | null` with `SummonDef = { kind: SummonId, dx, dy }`. The key set becomes `id name role colors silhouette strike ability summon`. After H3 three rows have a non-null summon: Necromancer (`skeleton`), Druid (`beast`), Artificer (`turret`). No health, mana, power, or cooldown field is added, and none may be.
- `data/summons.ts` holds `SUMMON_IDS` (`skeleton` in H2; `beast`, `turret` in H3) and `SummonId`. `EFFECT_IDS` appends `buffSparkle note blessGlow holyBurst soulWisp`.
- Art contract additions: `ArtSet.summons` (id to a single `SpriteTemplate`, ids `summons/<name>`), `SpriteTemplate` unchanged; required summon animations `idle 2, walk 4, attack 3, rise 4, sink 3`, at most 24x24 and 8 colors, master palette, no forbidden animation name; `CLASS_PALETTES` and class layers extend to eight.
- Tuning (`tuning.ts`, units in names): `SUMMON_CAPACITY` 8, `SUMMON_LEASE_MS` 250, `SUMMON_SHADOW_PX` (per kind: skeleton 8, beast 12, turret 10; replaced `SUMMON_SHADOW_WIDTH_PX` in H3). `animations.ts`: `SUMMON_FRAME_MS` (`idle` 400, `walk` 130, `attack` 140/90/160, `rise` 110 per frame, `sink` 100 per frame) and `onceFrameIndex`.
- Checks (tests only): `validateClasses` also checks `summon` shape and range; `validateSummonArt` checks the summon templates; the structural word ban grows by `heal regen restore revive resurrect`. The Necromancer ability is named "Bone Call" because the ban already covers `dead`.
- `docs:tables` renders the Necromancer ability cell with "summons a skeleton"; the header reads `Delivered classes: 8 of 12.` after H2 and `Delivered classes: 12 of 12.` after H3 (the Druid and Artificer cells read "summons a beast" and "summons a turret").

**H3 as built.** `CLASS_IDS` appends `druid monk artificer berserker` (exactly 12); `DELIVERED_CLASSES` equals it; `CLASS_SHIFT` stays 20 (measured: per-class counts 72 to 100 over 1,000 seeded ids; `sim-0-0` to `sim-7-0` give 8 distinct classes). The mapping is reshuffled once more (about two thirds of ids change; this is final). `SUMMON_IDS` is `skeleton beast turret`; `EFFECT_IDS` has 16 ids (`leaf chiOrb chiBurst warCry wrench` added). `SummonPool.raise`/`renew` are kind-aware (`renew(slot, kind, x, y, faceRight, pose)`). Art: 12 class layer sets and palettes, 16 effect sprites, 3 summon sprites.

## 7. Persisted progress (E1)

Designed in the [E1 plan](plans/e1-enemies.md) and [ADR 0012](adr/0012-host-owned-versioned-progress.md); built in E1 as described here (drift in [E1 plan section 13.5](plans/e1-enemies.md#13-as-built-drift-checked-against-the-e1-working-tree)). Constraints decided earlier still hold.

- The first persisted data is stage progress (roadmap A10). Storage is the host's `globalState`, key `pixelAgents.progress`, written only by `src/host/progressStore.ts`; the webview never persists anything and has no `getState`/`setState`. The key is not registered for Settings Sync.
- **Schema version 1** (`src/shared/progress.ts`), all integers, no strings:

| Field | Range | Meaning |
|---|---|---|
| `schemaVersion` | exactly `1` | selects the migration path |
| `stageIndex` | 1 to 10 | the stage being played; values above the delivered stage count wrap (`((i - 1) % delivered) + 1`) |
| `killsInStage` | 0 to 1,000,000,000 | regular kills toward this stage's boss |
| `totalKills` | 0 to 1,000,000,000 | all regular kills; the host's monotonic key |
| `bossesDefeated` | 0 to 1,000,000,000 | bosses defeated, ever |
| `cycle` | 0 to 1,000,000,000 | completed passes through the delivered stages (E5 turns it into New Game+); since E2 a pass is four stages (Stage 4's boss wraps to Stage 1 with `cycle + 1`); no migration, schema stays v1 and `PROTOCOL_VERSION` stays 2 |

- **Migration runner.** `migrateProgress(raw)` in `src/host/progressMigrations.ts`: `MIGRATIONS[i]` upgrades version `i+1` to `i+2` (an empty list in E1); never throws; outcomes `fresh` (absent), `stored`, `migrated`, `invalid` (default, one fixed log line), and `future` (a newer `schemaVersion`: default in memory, the stored value is **never overwritten**, saves are ignored). M7 (achievements) adds schema version 2 as the first real step.
- **Writes.** `ProgressStore.save` validates with the same exact-key validator, drops a save whose `totalKills` is lower than the stored one (or than a higher value already pending), coalesces to one `globalState.update` per 2 s with the latest value, flushes on dispose, and swallows and logs (fixed string) any failure. A fresh install writes nothing until the first save.
- **Load and save are protocol messages** ([protocol sections 3, 6.7, and 6.8](host-webview-protocol.md#3-message-catalog)): `progress` (host to webview, after `agentList`) and `saveProgress` (webview to host). They carry progress only, never agent data, and cannot control a session. The webview saves only after it has applied a `progress` message (`ProgressSaver.markLoaded`, fail closed), and every outgoing save is built by `createSaveProgressMessage`, which copies the six allow-listed keys. A `progress` message that arrives after the engine's 1.5 s boot gate is still applied once (the stored stage is restored; counters earned on defaults meanwhile are discarded and never saved).
- **Where it lives.** `src/shared/progress.ts` (`Progress`, `PROGRESS_KEYS`, `DEFAULT_PROGRESS`, `isProgress`, `toProgress`, `PROGRESS_SCHEMA_VERSION`, `MAX_STAGE_INDEX` 10, `MAX_PROGRESS_COUNT` 1,000,000,000), `src/host/progressMigrations.ts` (`MIGRATIONS`, `migrateProgress`, `LoadSource`, `LoadOutcome`), `src/host/progressStore.ts` (`ProgressStore`, `ProgressStoreDeps`, `KeyValueStore`, `StoreTimers`, `PROGRESS_KEY`, `PROGRESS_WRITE_COALESCE_MS` 2000), `src/host/gameConfig.ts` (`readGameSettings`, `DEFAULT_*`), `src/webview/progressSaver.ts` (`PROGRESS_SAVE_INTERVAL_MS` 15000). The three settings' ranges (`MIN_KILLS_PER_STAGE` 5, `MAX_KILLS_PER_STAGE` 500, `MIN_MAX_ENEMIES` 1, `MAX_MAX_ENEMIES` 12) are exported from `src/shared/protocol.ts`.
- Progress must never contain transcript content, agent names, session ids, classes, or tool names (Core invariant 7). Hero state is never persisted (Core invariant 2): heroes are always rebuilt from the host's agent list. The state of an in-progress fight (live enemies, boss health) is not persisted either.
- M7 (achievements) adds schema version 2 with a migration from 1.

## 8. Enemies, drops, and the enemy validator (E1)

Designed in the [E1 plan section 3.3](plans/e1-enemies.md#33-data-tables); built in E1 (ten rows, stages 1 and 2); E2 adds ten rows (stages 3 and 4: Green Slime, Spore Shroom, Toxic Toad, Jelly Cube, Ooze Queen; Bone Soldier, Wailing Ghost, Tomb Scarab, Crypt Mummy, Tomb Lich), 20 of 50 delivered. Stage 3 health at cycle 0, party 1: 18, 22, 16, 57, boss 219; Stage 4: 25, 20, 27, 71, boss 295.

- `src/game/data/enemies.ts` holds `ENEMIES: readonly EnemyRow[]` (a compact row: `id name stage tier gait vigor pace drop`) and every enemy number: tier health bases, the per-stage growth (`healthOf`), tier speeds and attack intervals, strike and ability power. Enemy numbers live only here (enemy side of the vocabulary scan, [ADR 0013](adr/0013-enemy-health-and-hero-reaction-board.md)); `tuning.ts` holds neutral engine constants (capacities, fade times, reaction times, the boot gate).
- `src/game/data/drops.ts` holds `DROP_KINDS` (`coin gem ore chest`) and drop chances. Drops are decoration with no value.
- `validateEnemies(rows, stages)` runs once at `Game` construction and in tests (incremental mode per [roadmap A3](../engineering/roadmap.md#7-assumptions-and-defaults)): for every stage in `STAGES`, exactly 5 rows and exactly 1 boss; ids kebab-case and globally unique; every row's stage exists; total equals `5 * stages.length`; ranges for `vigor` and `pace`; a known `drop`. A failure disables combat only (reported once); stages and heroes keep running. E5 pins the full contract (10 stages, 50 enemies).
- Art: `ArtSet` gains `enemies` (id to a single `enemies/<id>` template), `enemyPhasePalettes`, `drops` (keyed by `DropSpriteId`), `enemyBar`, and `stagePalettes` (per-stage partial overrides of the stage characters `1` to `8`, so a stage adds no master characters). Checked in tests by `validateEnemyArt(art)` and `validateDropArt(art)` (both take only the `ArtSet` and read `ENEMIES` and `DROP_KINDS` themselves) and by the stage checks inside `validateArtSet`, which merges `stagePalettes[stageId]` over the master palette per stage. There is no separate `validateStageArt`. Per-stage required props live in the module-private `REQUIRED_PROPS` record in `spriteValidator.ts` (the cellar's eight, Stage 2's `support pickaxe oreVein lantern minecart rubble doorFrame`, Stage 3's `pipe slimeDrape glowShroom toxicBarrel slimePool mushrooms doorFrame`, Stage 4's `skullNiche candelabra crackedPillar sarcophagus urn boneRubble doorFrame`), with `FLAME_PROPS` requiring a flame loop on `torch` (2 frames), `lantern` (4), `glowShroom` (2), and `candelabra` (4). Enemy size limits are 16, 24, and 48 px per tier; at most 12 colors per enemy, 8 per drop; a boss phase palette overrides at most 4 master characters.
- Where the numbers live: `data/enemies.ts` has `TIER_HEALTH`, `HEALTH_GROWTH`, `CYCLE_HEALTH_GROWTH`, `CYCLE_CAP`, `PARTY_BOSS_GROWTH`, `PARTY_CAP`, `healthOf`, `TIER_SPEED_PX_PER_S`, `TIER_ATTACK_MS`, `ATTACK_JITTER`, `STRIKE_POWER`, `ABILITY_POWER`, `ABILITY_TARGETS`, `TIER_SHADOW_PX`, and the `VIGOR_*` and `PACE_*` bounds; `data/drops.ts` has `DROP_KINDS`, `DROP_CHANCE`, `BOSS_COIN_BURST`, `DROP_CAPACITY`, `DROP_REST_MS`, `DROP_FADE_MS`, `DROP_ARC_MS`, and `DROP_ARC_HEIGHT_PX`; `tuning.ts` has `ENEMY_DISSOLVE_FRAMES` and the neutral engine constants ([section 5](#5-animation-timings-and-tuning-m4)). The drop constants sit on the enemy side so that drop words stay out of the hero-side vocabulary scan.
- Enemy palettes: enemies (and their flash and dissolve) are rasterized over `stagePalette(stage of the ENEMIES row)`, with a boss phase palette laid over that, and `validateEnemyArt` checks each template against the same merged palette. Fixed after the sync found Stage 2 enemies drawing over the bare master palette ([E1 plan section 13.6](plans/e1-enemies.md#13-as-built-drift-checked-against-the-e1-working-tree)).
- `docs:tables` (E1) renders the enemy table into `docs/design/enemies-and-stages.md` (`Delivered enemies: 20 of 50.` since E2).
