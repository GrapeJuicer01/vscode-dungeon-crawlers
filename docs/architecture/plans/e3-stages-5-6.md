# E3 plan: Stage 5 Enchanted Forest Ruins, Stage 6 Molten Core (ten enemies, two stages, firefly and ember ambients, wrap after Stage 6)

Purpose: the detailed plan for batch E3: ten more enemies (four regular plus a boss per stage), two more stages with per-stage palette overrides, props, backdrops and ambients (fireflies; embers with a lava glow done by lights and palette only), the enemy table growing from 20 to 30 of 50, and the progression wrap moving from after Stage 4 to after Stage 6. E3 is data and art on the E1/E2 machinery plus two small cosmetic engine additions (two ambient kinds, one particle kind). Written by the architect; the pixel-artist, developer, and tester work from it. Follows the layout of the [E2 plan](e2-stages-3-4.md), whose [section 14](e2-stages-3-4.md#14-as-built-notes-checked-against-the-e2-working-tree) (as-built facts) is the baseline.
Related: [roadmap E3](../../engineering/roadmap.md#e3-stage-5-enchanted-forest-ruins-stage-6-molten-core), [E2 plan](e2-stages-3-4.md), [E1 plan](e1-enemies.md), [game engine](../game-engine.md), [data model](../data-model.md), [ADR 0002 no hero health](../adr/0002-no-hero-health.md), [ADR 0009 hero lifecycle isolation](../adr/0009-hero-lifecycle-isolation.md), [ADR 0011 summons](../adr/0011-summons-are-leased-cosmetic-entities.md), [ADR 0012 host-owned versioned progress](../adr/0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and the hero reaction board](../adr/0013-enemy-health-and-hero-reaction-board.md), [enemies and stages](../../design/enemies-and-stages.md), [game design](../../design/game-design.md), [art style guide](../../design/art-style-guide.md), [sprite spec](../../design/sprite-spec.md), [testing strategy](../../engineering/testing-strategy.md), [CLAUDE.md](../../../CLAUDE.md).

Status: implemented in the working tree of branch `feat/e3-stages-5-6` (from E2 commit 1eee893), not yet committed; the as-built facts, checked against that tree, are in [section 14](#14-as-built-notes-checked-against-the-e3-working-tree). Sections 1 to 13 below are the plan as written and were checked against the tree at 1eee893. Where this plan and the code disagree, the code wins and section 14 records the drift.

## 1. Goal

After E3 the party fights through six stages instead of four. Stage 5 (`enchanted-forest-ruins`) and Stage 6 (`molten-core`) each bring a new environment, four regular enemies (three minions and one elite), a boss, and an ambient effect. Defeating the Stage 6 boss fades back to Stage 1 and counts one more cycle (it used to wrap after Stage 4). Enemies stay exactly as E1 and E2 built them: they walk in, stand, attack on a timer with a purely cosmetic hero flash, have health and a bar, and dissolve. No new mechanic is added (decision E3-2).

- **Data**: 10 enemy rows (30 of 50 delivered), 2 stage rows, per-stage palette overrides, required-prop lists, two flame-prop rules.
- **Engine (cosmetic only)**: `AmbientEffect` gains `fireflies` and `embers`; `ParticleKind` gains `firefly` (one new kind, appended after `wisp`); `Ambience` and `Particles` handle them; the renderer's particle colour map gains one entry. The Stage 6 embers reuse the existing `ember` kind. The lava glow is not an engine feature (section 5.1). Nothing else in `src/game/` changes behavior.
- **Art**: two environments (tiles, 6+ props each, backdrops), ten enemy templates (eight regular, two bosses), one particle ramp, stage palettes, two phase palettes. No new drop kinds. Master palette: zero new characters by default (section 9, R6).
- **Docs and tests**: the generated enemy table lists 30; the hand-written tests that pin "four stages", "20 enemies", the particle kinds, and the phase palettes are restated; the look-alike test is generalized (section 7, note 4); new coverage for the ambients, lava safety, and the 6-stage wrap.

Layers touched: data tables (`enemies`, `stages`, `tuning`), engine (`Ambience`, `Particles`, `Renderer` colour map only), sprites, validator tables (`spriteValidator`), docs tooling output, tests. Not touched: the monitor, host, protocol, `PROTOCOL_VERSION` (2), `Progress` schema (stays v1), settings, CSP, `esbuild.mjs`, dependencies, `Combat`, `Enemy`, `Boss`, `Progression`, `StageDirector`, `Engagement`, `Hero`, `Roster`, `ClassHero`, `World`, `Lighting`, `Stage.ts`, `Game`, `Drops`, the drop tables.

## 2. Invariant check

| Invariant | How E3 respects it |
|---|---|
| 1 Heroes invulnerable | No hero field, state, gauge, or reaction is added. Enemy attacks still write only to `HitReactions`. Lava, embers, fireflies, and roots are decoration with no hazard semantics: nothing reads a prop name or ambient kind for gameplay (the only name-special prop today is `puddle`, a drip point), no prop or particle has a collider against heroes, and a hero never stands in lava (section 5.1, "lava rules"). No burn, slow, or hurt look: the Stage 6 palette must never make a hero look hurt (section 5.1, ambient tint rule). Art never draws a status icon, flame, or red tint on a hero. |
| 2 Lifecycle from host events only | Stage change, boss defeat, wrap and cycle only touch `Progression`, `StageDirector`, and `Combat`. Nothing new reads or writes `Hero`, `Roster`, `AgentInfo`, or lifecycle. The wrap after Stage 6 is the E1 code path with a larger `stageCount`. Ambient code reads only `world.stage.def.ambient`. |
| 3 Read-only monitor | Untouched. No protocol change. |
| 4 Crash isolation | New ambient code runs inside `Ambience.update` (already inside `Game.step` try/catch). Stage runtimes for Stages 5 and 6 are built by the same guarded `StageDirector` path. A bad stage row is caught at startup by `validateStages` (atomic switch, section 4). |
| 5 No external assets | Everything is palette-character templates in code. |
| 6 No runtime dependencies | None. |
| 7 Transcript privacy | `Progress` is unchanged (six numeric fields). No string or agent data is added. |

Summons are never targets and the enemy side still imports no hero code (ADR 0013, [E1 plan section 2.1](e1-enemies.md#21-the-seam-enemy-side-and-hero-side)). E3 adds no file to either side list except art and data files, which default to the strict hero side; the only enemy-side file edited is `data/enemies.ts` (rows only).

## 3. E2 assumptions audited against the code (what is hard-coded to four stages)

| Area | Finding at 1eee893 | E3 action |
|---|---|---|
| `Progression` wrap, `StageDirector`, `Combat` row selection, `killsPerStage` | Generic over `deps.stages.length` (E2 section 3, unchanged). | None. Two more `STAGES` rows move the wrap to Stage 6. |
| `validateEnemies` | Incremental mode: 5 rows and one boss per stage in `stages`, `rows.length === 5 * stages.length`, unique kebab ids. Message text `expected N enemies for M stages` follows the table. Exact mode (10 stages, 50 ids) is E5. | None in code. Rows added in lock-step with stage rows or `Game` disables combat. |
| `validateStages` | Throws `RangeError('Stage data is invalid')` in the `Game` constructor for any stage without art, a missing prop, an out-of-band prop, more than 8 lights, or broken nav. | None. This is why the switch is atomic (section 4). |
| `REQUIRED_PROPS`, `FLAME_PROPS` (`spriteValidator.ts:52,92`) | Module-private; keyed by stage id and prop name. | Developer adds two entries and two flame rules in the switch step (section 5.3). |
| `validateEnemyArt` boss phase palettes | Already requires a non-empty phase palette for every boss row (`boss has no phase palette`, line 598), rejects phase palettes on non-bosses, caps overrides at 4 single master characters with `#rrggbb` values. | Already enforced; E3 only has to supply two entries. **The switch step cannot be half-done**: a boss row without its `ENEMY_PHASE_PALETTES` entry fails `validateArtSet`. |
| `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR`, `STAGE_PALETTES` | Keyed by stage id (`palettes.ts`, `palettesE1.ts`); `buildStage` throws `Stage art is missing` otherwise. | Artist adds entries for both ids (A-E3-1). |
| Master palette | 37 colors (counted in `palettes.ts`), cap 48 (`validateArtSet`). | See section 9, R6: E3 adds 0 by default, at most 3. |
| `AmbientEffect` / `Ambience` | Union of four kinds; `update` switches with `assertNever`; the `#accrue` helper caps a debt at `max(1, perSecond)`. | Two new kinds; the compiler forces both edits. |
| `ParticleKind` | Seven kinds, `KIND_NAMES` indexed in a `Uint8Array`; `draw` picks size by kind name; `Renderer` builds an explicit per-kind colour map (`Renderer.ts:138-144`); `ArtSet.particlePalette` is `Record<ParticleKind, readonly string[]>`; the validator needs a ramp of 2+ known characters per kind. | Append `firefly` (index 7). Artist adds the ramp, developer adds one map line. The existing `ember` kind already wanders sideways, so embers need no new kind. |
| Lighting | Light colour characters are `T` and `F` only; `LightDef.colorChar` is one of the two; lights ride on **wall** props only (`floor()` placements carry `light: null`). | Lava lights are `T` recolored by the stage palette, on wall props. No `Lighting` change. |
| Draw ceilings | 200 bitmap draws, 520 fills (`combatBudget.test.ts`, `stageBudget.test.ts`); particle draw is one `fillRect` per live particle with the pool assumed full (384). Enemy pool 12, drops 16. | None. Steady-state ambient counts are far below capacity (section 9, R3). |
| Enemy art lookup | `SpriteCache.#enemyPalette` finds the enemy's `STAGES` row by index; tier limits 16 / 24 / 48; animation sets `idle 2, walk 2, attack 3` (+ `telegraph 2, intro 2` for bosses); at most 12 colors. | None. |
| `docs:tables` | Header `Delivered enemies: <n> of 50.`; rows from `ENEMIES` and `STAGES`. Generic. | Regenerate: 30 rows. |
| Vocabulary scan | Hero-side ban list (`hp health mana dead downed retreat damage gauge hurt dying`) covers every `src/game/**` file outside the enemy side, **including all new sprite and data files**. | Authors avoid those words (section 9, R2). |
| Look-alike test | `test/game/stagesE2Art.test.ts` holds `LIMIT = 0.85` and the ten-entry `KNOWN_OVER` ratchet for E2 minions against **older same-size minions only**, on overlap over the smaller pixel count. There is no IoU check in the tree today (only the art guide mentions it). | Generalize and move (section 7, note 4, and section 11.0). |
| Pinned counts | See section 7, note 1 (the full list). | Tester restates. |

Conclusion: nothing in the engine is hard-coded to four stages. The coupling is data-level, exactly as in E2.

## 4. The atomic switch (ordering constraint)

`Game` builds with `SHIPPED_ART` and the real `STAGES`/`ENEMIES` in almost every test, and `new Game(...)` throws if any stage lacks art. The validators reject art for rows that do not exist (`enemy template for an unknown enemy`, `phase palettes belong to bosses only`) and rows without art or without a phase palette. Therefore:

1. The pixel-artist creates new files and the palette-table entries but **does not merge the new enemy templates into `ENEMY_SPRITES`, the new boss phase palettes into `ENEMY_PHASE_PALETTES`, or the new stages into `STAGE_SPRITES`** until the last art step (A-E3-6), which wires the barrels (`enemyTemplates.ts`, `spriteTemplates.ts`) in one edit. Phase palettes live in a new `palettesE3.ts` (`BOSS_PHASE_PALETTES_E3`), merged at that wiring edit, as in E2.
2. Immediately after A-E3-6 the developer adds, in **one step (task 4)**, the two `STAGES` rows, the ten `ENEMIES` rows, `REQUIRED_PROPS` entries, and `FLAME_PROPS` rules, then runs the validators. `REQUIRED_PROPS` and `FLAME_PROPS` are deliberately not pre-landed (unlike E2): they read the artist's final prop names, and landing them with the rows removes any chance of a half-switched tree. Until then the tree stays green with the E2 content.
3. The particle ramp (A-E3-1) and the engine additions (tasks 1 and 2) are independent of the switch and land first. The ramp comes first because `ArtSet.particlePalette` is `Record<ParticleKind, ...>`.
4. Art-side rework of older templates (A-E3-0, section 11.0) replaces shipped templates in place with the same ids, sizes, and animation sets; it is not part of the switch and can land at any time the look-alike test (section 7, note 4) is updated with it.

Tests run on shipped art; do not rely on a test art set.

## 5. Interfaces (signatures only)

### 5.1 Engine: cosmetic ambients, one particle kind, and the lava rules

```ts
// src/game/data/stages.ts (changed)
export type AmbientEffect =
  | { readonly kind: 'drip'; readonly perSecond: number }
  | { readonly kind: 'dust'; readonly perSecond: number }
  | { readonly kind: 'bubbles'; readonly perSecond: number }
  | { readonly kind: 'fog'; readonly perSecond: number; readonly dustPerSecond: number }
  | { readonly kind: 'fireflies'; readonly perSecond: number }   // E3, Stage 5
  | { readonly kind: 'embers'; readonly perSecond: number };     // E3, Stage 6

// src/game/Particles.ts (changed): append so existing indices are stable.
export type ParticleKind =
  'ember' | 'spark' | 'drip' | 'splash' | 'mote' | 'bubble' | 'wisp' | 'firefly';
// KIND_NAMES gains 'firefly' (index 7).
// update(): firefly: slow wander in both axes (+-24 px/s^2 jitter on vx and vy), speed clamp not needed at these rates.
// draw(): firefly is 1x1 (still exactly one fillRect per live particle). A blink is a colour ramp, not code:
//         the ramp alternates bright and dim ('Y', 'N', 'Y' style; see A-E3-1), indexed by age over life.

// src/game/Ambience.ts (changed): two new cases, each with its own debt, both via #accrue (capped at max(1, perSecond)).
//   fireflies: emit 'firefly' at a random x in the corridor view (CORRIDOR_X..INTERNAL_WIDTH), y in
//              FIREFLY_MIN_Y..FIREFLY_MAX_Y, vx/vy tiny (+-FIREFLY_DRIFT), life FIREFLY_LIFE_*; not scrolled.
//   embers:    emit the existing 'ember' kind at a random x in the corridor view, y in the floor band
//              (STAGE_EMBER_MIN_Y..STAGE_EMBER_MAX_Y), vy -STAGE_EMBER_RISE_MIN..-STAGE_EMBER_RISE_MAX,
//              vx ~ 0, life STAGE_EMBER_LIFE_*; not scrolled. (Particles.update already wanders ember vx.)
// assertNever keeps the switch exhaustive.

// src/game/data/tuning.ts (changed, neutral names): FIREFLY_MIN_Y 60, FIREFLY_MAX_Y 140, FIREFLY_DRIFT 6,
// FIREFLY_LIFE_MIN_MS 3500, FIREFLY_LIFE_MAX_MS 6500; STAGE_EMBER_MIN_Y 112, STAGE_EMBER_MAX_Y 156,
// STAGE_EMBER_RISE_MIN 14, STAGE_EMBER_RISE_MAX 30, STAGE_EMBER_LIFE_MIN_MS 1800, STAGE_EMBER_LIFE_MAX_MS 3200.
// All first guesses, tuned by eye. (EMBER_BASE_PER_S and EMBER_PER_RESTING_PER_S already exist for the campfire; do not reuse them.)

// src/game/Renderer.ts (changed): the particle colour map gains firefly (css(art.particlePalette.firefly)).
// src/game/sprites/palettes.ts (artist): PARTICLE_PALETTE type and table gain a firefly ramp (master characters).
```

Stage rows (defaults; the developer sets positions after the real sprite sizes are known, re-running `validateStages`):

```ts
{ id: 'enchanted-forest-ruins', index: 5, name: 'Enchanted Forest Ruins', props: [...], ambient: { kind: 'fireflies', perSecond: 5 } }
{ id: 'molten-core',            index: 6, name: 'Molten Core',            props: [...], ambient: { kind: 'embers',    perSecond: 6 } }
```

Particle budget: steady state is rate times life: fireflies 5 x 5 s = about 25 live; embers 6 x 2.5 s = about 15 live; the pool is 384 and the draw ceilings already assume it full. Emission into a full pool is dropped silently (never throws).

**Decision recap (E3-3).** Fireflies need a new kind (nothing existing blinks or hangs in mid-air with a green-yellow ramp; `mote` has the Stage 2 dust ramp and is per-kind, not per-stage). Embers reuse `ember` (same rising, wandering spark with the `Y O R D` ramp; one more `ember` source next to the campfire). Lava glow is **not** an effect: it is (a) warm `T` lights on wall props (`lavaFall`, `lavaChannel`) with the stage palette recoloring `T`, (b) the stage ambient tint character `g`, (c) bright `6`/`7` pixels in the art, and (d) a 2 or 4 frame prop animation. That uses only machinery that exists, has no gauge, no state, and no per-frame logic.

**Lava rules (cosmetic only; the hazard-free guarantee).**

1. Lava appears only in the backdrop, in wall-layer props (`lavaFall`, `lavaChannel`, and the Stage 6 `wallMid` openings), and in the floor tiles' distant decoration. It never appears on the floor band where seats, the campfire, or the formation slots are. A floor-layer prop whose name contains `lava` is not allowed (the tester scans for it).
2. No prop or particle has a collider with a hero. The only solid props are alcove floor props at foot y 134 (the `stump`-style rule from E2: `ruinedStatue`, `anvil`), exactly as `toxicBarrel` and `sarcophagus`.
3. No code path reads `'lava'`, an ember, or a firefly to change a hero: the structural test greps the hero-side and combat-side sources for the identifiers.
4. **Tint rule.** The Stage 6 ambient character `g` stays dark and neutral-to-warm gray-brown, never red-dominant (red channel at most 1.3 times the larger of the green and blue channels). Strong red multiplied over a hero would read as "hurt". Lava reads through lights and art, not through a red wash. `T` may be orange (torches are orange) at intensity 0.8 or less. Manual QA at three panel sizes confirms no hero looks wounded or burning.

### 5.2 Data: enemy rows and stage props

Default rows (ids and names are mirrored by the pixel-artist; numbers are tuning, decision E3-1). Health uses the E1 formula unchanged: tier base 10 / 24 / 120, times `vigor`, times 1.35 per stage after the first (x3.3215 at Stage 5, x4.4840 at Stage 6), cycle 0, party 1; a boss adds 35 percent per fighting hero beyond the first (x3.45 with eight). Pace to px/s: minion x26, elite x20, boss x14. **Health values are hand-computed estimates (rounded to nearest, plus or minus 1); the developer reads the real values from `healthOf` and the tester pins those.**

| Stage | id | name | tier | gait | vigor | pace | drop | health (cycle 0, party 1) | px/s |
|---|---|---|---|---|---|---|---|---|---|
| 5 | `thorn-sprout` | Thorn Sprout | minion | walk | 1.0 | 0.9 | coin | 33 | 23.4 |
| 5 | `moss-wolf` | Moss Wolf | minion | walk | 0.9 | 1.3 | coin | 30 | 33.8 |
| 5 | `bramble-pixie` | Bramble Pixie | minion | float | 0.8 | 1.1 | ore | 27 | 28.6 |
| 5 | `ancient-treant` | Ancient Treant | elite | walk | 1.3 | 0.5 | gem | 104 | 10 |
| 5 | `elder-dryad` | Elder Dryad | boss | walk | 0.9 | 0.6 | chest | 359 (about 1238 with eight fighters) | 8.4 |
| 6 | `ember-imp` | Ember Imp | minion | hop | 1.0 | 1.2 | coin | 45 | 31.2 |
| 6 | `slag-snail` | Slag Snail | minion | walk | 1.3 | 0.5 | ore | 58 | 13 |
| 6 | `magma-crab` | Magma Crab | minion | walk | 1.1 | 1.0 | ore | 49 | 26 |
| 6 | `furnace-guard` | Furnace Guard | elite | walk | 1.2 | 0.5 | gem | 129 | 10 |
| 6 | `molten-colossus` | Molten Colossus | boss | walk | 0.8 | 0.6 | chest | 430 (about 1485 with eight fighters) | 8.4 |

Notes: all values are inside the validator ranges (vigor 0.5 to 2, pace 0.5 to 1.6). Drops reuse the four E1 kinds (decision E3-5). Boss `vigor` is below 1.0 on purpose (R7, decision E3-7). The vocabulary scan: `molten`, `slag`, `furnace`, `lava`, `ember`, `forge`, `anvil`, `magma` are all fine; `furnace-guard` is a name, not a gauge. No "pressure gauge", "heat gauge", "burn damage", "dead", "hurt", "retreat" anywhere, in identifiers or comments (R2).

Enemy gaits: only `walk`, `hop`, `float` exist; the imp hops, the pixie floats, the rest walk. No splitting, no ranged attacks, no burning (decision E3-2).

Stage props (the artist's ids; at least 6 distinct props plus the door frame; at most 8 lights; solids only as alcove floor props at foot y 134 with a 12x5 footprint, so no seat or formation slot is blocked):

| Stage 5 `enchanted-forest-ruins` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128, as every stage: a ruined stone arch with ivy |
| `brokenPillar` | wall | snapped column with roots, about 16x96 |
| `hangingRoots` | wall | roots and vines hanging from the ceiling, 16x40 |
| `glowBloom` | wall, 2-frame pulse | glowing blue flowers on a vine; light source (`T` recolored soft blue-teal, flicker false) |
| `ruinedStatue` | floor, solid in the alcove | moss-covered statue base and torso, 16x16, foot y 134 |
| `fernPatch` | floor | decoration |
| `flowerBed` | floor | small glowing flowers, decoration |

| Stage 6 `molten-core` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128: a blackened iron-banded arch with an orange glow in the gap |
| `obsidianPillar` | wall | glossy dark column, about 16x112 |
| `lavaFall` | wall, 4-frame flow loop | a stream of lava from the ceiling; light source (`T` recolored orange, flicker false, slow) |
| `lavaChannel` | wall (wall-base band, behind the walking floor), 2-frame shimmer | a trough of lava along the back wall; light source (flicker false) |
| `anvil` | floor, solid in the alcove | 16x16, foot y 134 |
| `slagHeap` | floor | cooled dark rubble with an orange crack, decoration (never `lava` in the name) |
| `toolRack` | wall | hung hammers and tongs, decoration |

`REQUIRED_PROPS`: Stage 5 `brokenPillar hangingRoots glowBloom ruinedStatue fernPatch flowerBed doorFrame`; Stage 6 `obsidianPillar lavaFall lavaChannel anvil slagHeap toolRack doorFrame`. `FLAME_PROPS` gains `glowBloom: 2`, `lavaFall: 4`, `lavaChannel: 2`. Placement follows the Stage 2 to 4 grid: door frame at the door zone; roughly eight alcove and eight corridor placements; lights: two per zone for the main light prop plus, in Stage 6, one `lavaChannel` light per zone (so 4 total in Stage 5, 6 total in Stage 6, under the limit of 8); corridor positions repeat every 384 px. Do not name any prop `puddle`.

### 5.3 Ownership of the validator table edits

`spriteValidator.ts` (developer) gets the `REQUIRED_PROPS` and `FLAME_PROPS` edits in task 4 with the rows, because they read the artist's final prop names. The artist confirms the names in A-E3-2/A-E3-3; a rename is reported in the handoff.

## 6. Developer task list

Branch `feat/e3-stages-5-6`. No new packages. Do not commit before reviewer Approve. Tasks 1 and 2 need only A-E3-1; task 4 needs A-E3-1 to A-E3-6.

0. **Start.** Set roadmap E3 `Status: in progress` (batch entry and summary row 10). Check: only those two lines changed.
1. **Particles and tuning.** Add `firefly` to `ParticleKind`, `KIND_NAMES` (appended), `update` (wander) and `draw` (1x1); add the `FIREFLY_*` and `STAGE_EMBER_*` constants to `tuning.ts`; add the `Renderer` colour-map line. Requires A-E3-1 (the `PARTICLE_PALETTE.firefly` ramp). Check: typecheck; a particle test emits `firefly` and draws exactly one `fillRect`; old kind indices unchanged (`['ember','spark','drip','splash','mote','bubble','wisp','firefly']`).
2. **Ambience.** Extend `AmbientEffect` with `fireflies` and `embers` (and the `stages.ts` doc comments), add the two cases with their own debts through `#accrue`, keep `assertNever`. Embers emit the existing `ember` kind. Check: with a stage stand-in whose `def.ambient` is each new kind, 10 simulated seconds emit about `perSecond * 10` particles of the right kind and never throw; a mid-run stage switch carries no runaway debt.
3. **Look-alike tooling check (read only).** Run the generalized look-alike test (written by the tester in T-E3-0, section 7) against the candidate files to read the matrix; no code change expected from the developer.
4. **Switch on** (after A-E3-6), **one step**: append the two `STAGES` rows with props positioned against the real sprite sizes; the ten `ENEMIES` rows; the two `REQUIRED_PROPS` entries; the three `FLAME_PROPS` rules. Check, in this order: `validateStages(STAGES, SHIPPED_ART)` empty (bounds, nav connectivity, at most 8 lights); `validateEnemies(ENEMIES, STAGES)` empty (30 rows, 6 stages, one boss each); `validateArtSet(SHIPPED_ART)` empty (includes the two boss phase palettes); `STAGES.length === 6`; `Progression` of 6 stages wraps from Stage 6 with `cycle + 1` (no code change). Read the real boss health values from `healthOf` and, if a boss is outside its target, adjust only that row's `vigor` (R7).
5. **`docs:tables`.** Run `npm run docs:tables`; the generated region shows `Delivered enemies: 30 of 50.` and 30 rows. A second run leaves no diff; `--check` passes. No generator change is expected; if one is needed, flag it.
6. **Docs.** `docs/design/enemies-and-stages.md` (purpose line "six stages, thirty enemies", stage table rows for Stages 5 and 6 with their ambients, the wrap sentence "after Stage 6"), `docs/design/game-design.md` (stage list and ambients), `CHANGELOG.md` ("Stages 5 and 6: Enchanted Forest Ruins and Molten Core, ten new enemies and two bosses, firefly and ember ambients; the stage cycle now wraps after Stage 6"). `README.md` only if it names the stage count.
7. **Local checks (human-owned).** F5 with `--disable-extensions`, simulator on with `simulatorAgentCount` 8, `pixelAgents.killsPerStage` 5: watch Stage 1 to 6 and the wrap (fade each time, heroes' poses unchanged); a 60 s DevTools recording at 8 heroes, a full wave (`maxEnemies` 12), in Stages 5 and 6 at 60 fps; read every enemy by silhouette at three panel sizes; confirm fireflies do not read as damage sparks and that the Stage 6 lava glow does not make any hero look hurt or burning; hide/show and "Developer: Reload Webviews" restore Stage 5 or 6; a hand-set `stageIndex` 5 or 6 in an E2 build wraps to Stage 1 or 2 (documented downgrade, nothing to test by hand).
8. **Docs drift.** Flag in the handoff anything in [game engine](../game-engine.md) (ambient and particle lists, delivered stages), [data model](../data-model.md) (stage table, tuning groups, `AmbientEffect`), `CLAUDE.md` (the sprite-files line in the directory map still lists no enemy or stage files since E1), or this plan that the code changed. The architect syncs before the tester finishes and adds a section 14.
9. **Hand off to the tester** with section 7.
10. **Commit after reviewer Approve.** Roadmap E3 `Status: done` and summary row 10; one commit, for example `feat: add Stage 5 and 6 enemies, bosses, and ambients`; merge to `main` fast-forward. No push without the human.

## 7. Test notes for the tester

The game tests run on shipped art. Update the pinned counts first (they fail the moment task 4 lands), then add coverage. Tester step **T-E3-0** (before the artist's first enemy file): generalize the look-alike test (note 4) so the artist and developer get a printed matrix while iterating.

1. **Pinned counts to update (restate, do not loosen).**
   - `enemyData.test.ts`: 30 rows, `STAGES.length` 6, "expected 30 enemies for 6 stages" in every message regex (lines 44-46, 141, 226, 231 as of 1eee893), the crafted-table cases for stages 1 to 6; spot health values for the ten new rows from `healthOf` at cycle 0, party 1, and the two bosses with eight fighters; `healthOf` monotone in stage, cycle, and (bosses only) party.
   - `combatParts.test.ts`: the `STAGES.length === 4` assertion (near line 621) becomes 6; the `StageDirector` suite gains a walk Stage 1 to 6 and wrap.
   - `gameCombat.test.ts` (line 180): the stored-index wrap case restated for six stages: 5 and 6 stay, 7 maps to Stage 1, 10 to Stage 4, 12 to Stage 6 (formula `((i - 1) % 6) + 1`); counters kept.
   - `docsTables.test.ts` (lines 337-355): "30 of 50", 30 rows; crafted `9 of 50` and `3 of 50` replacements unchanged.
   - `stagesE2Art.test.ts`: line 47 (`STAGES.length` 4), line 132 (`Object.keys(SHIPPED_ART.enemies).length` 20) and line 335 (`ENEMY_PHASE_PALETTES` keys are exactly the four boss ids) become 6, 30, and the six boss ids; the file keeps its E2-specific cases and gains none of the E3 ones (put those in a new `stagesE3Art.test.ts`). `enemyArt.test.ts:138`: "exactly the four bosses" becomes six.
   - `ambience.test.ts`: the particle-kind name list (line 296) gains `'firefly'`; the "shipped stage rows use the planned kinds and rates" case (line 233) gains the two E3 rows; the new-kinds size table (line 264) gains `['firefly', 1, 1]`.
   - `stageBudget.test.ts`: `KINDS` (line 35, "all seven particle kinds") becomes eight; the budget run covers Stages 5 and 6 (it is stage-driven; confirm it loops `STAGES`).
   - `spriteValidator.test.ts` (line 21): the `ParticleKind` union literal gains `'firefly'`.
   - `heroInvariantStages.test.ts`: "four stages" in the title and any loop count; the wrap check already uses `STAGES.length`.
   - `enemyBundle.test.ts`: assert the bundle contains the two new stage ids and ten enemy ids.
   - `performance.test.ts`: no pinned count; rerun.
   - The budget ceilings stay 200 and 520.
2. **Enemy table.** `validateEnemies(ENEMIES, STAGES)` is empty: 30 rows, 5 per stage, exactly one boss per stage, at least one minion per stage, unique kebab-case ids across all six stages.
3. **Progression wrap.** With the shipped six stages: killing the Stage 6 boss sets `stageIndex` 1 and `cycle` + 1; Stages 1 to 5 advance without a cycle; `load` of `stageIndex` 7 to 12 wraps by the formula above; counters are kept.
4. **Look-alike policy (generalize and move).** Move `overlap`, `LIMIT`, and `KNOWN_OVER` out of `stagesE2Art.test.ts` into a new `lookAlikes.test.ts` that reads **template maps directly** (`ENEMY_SPRITES` plus the new `ENEMIES_STAGE5/6` and boss exports) so it is useful before the wiring step. Metrics on idle frame 0, opaque pixels as anchor-relative keys: `overlap` = shared over the smaller count; `IoU` = shared over union (new check; the tree has none). Rules:
   - every pair of same-size enemies (all tiers; minion 16x16, elite 24x24, boss 48x48; compare the 18 minions pairwise, the 6 elites, the 6 bosses) has overlap under 0.85 **and** IoU at most 0.80, except the ten pinned pairs below, which may not get worse (value caps as in `KNOWN_OVER`, plus an IoU cap recorded when the pin is made);
   - **within one stage**, any two minions must be under 0.75 overlap (stages palettes recolor everything of a stage to one family, so same-stage minions must be separable by shape alone);
   - an exact duplicate idle frame fails (existing case, kept);
   - a stale pin (a listed pair that no longer exceeds) fails, so reworked pairs get their entry removed;
   - the named E2 cases (Wailing Ghost vs Cave Bat, Tomb Scarab vs Ore Beetle, Bone Soldier vs the skeleton summon) stay;
   - for E3, also named: Bramble Pixie vs Wailing Ghost and Cave Bat (floaters), Moss Wolf vs Cellar Rat and Toxic Toad (low horizontals), Slag Snail vs Green Slime (domes), Ember Imp vs Goblin Scout (biped), Thorn Sprout vs Spore Shroom (stem plus crown), Magma Crab vs Ore Beetle and Web Spider, Ancient Treant vs Crypt Mummy and Rock Golem, Furnace Guard vs Rock Golem, and the two new bosses against the four old ones.
   - If a measured E3 pair exceeds, the tester reports it to the pixel-artist (it is an art finding, not a pin); the tester adds new pins only for the ten below.
   - **The ten known-over pairs** (E2 `KNOWN_OVER`, overlap over the smaller count, with their pinned values): `green-slime` vs `cellar-rat` 0.964, vs `cave-bat` 0.928, vs `web-spider` 0.925, vs `goblin-scout` 0.874, vs `ore-beetle` 0.954; `spore-shroom` vs `goblin-scout` 0.882; `toxic-toad` vs `cellar-rat` 0.859, vs `cave-bat` 0.88, vs `ore-beetle` 0.869; `wailing-ghost` vs `web-spider` 0.858. Plan: rework in A-E3-0 (section 11.0, default) or defer (decision E3-8); either way the ratchet stays and the policy applies to all new pairs.
5. **Stage data and art.** `validateStages(STAGES, SHIPPED_ART)` is empty; each new stage has the required props, at most 8 lights, the flame loops (`glowBloom` 2, `lavaFall` 4, `lavaChannel` 2), solid props only as alcove floor props at foot y 134; `validateArtSet(SHIPPED_ART)` is empty, which includes `validateEnemyArt` over 30 templates and the boss phase palette for every boss (`ENEMY_PHASE_PALETTES` keys are exactly the six boss ids, one phase each, at most four master characters, `#rrggbb`). A Stage 5 and a Stage 6 enemy rasterize with their stage palette (extend the E2 check). Master palette at most 48 (and, as delivered, between 37 and 40). No hex and no `data:` URI in any new template file (extend the scanned list; the phase palette file `palettesE3.ts` legitimately holds hex like `palettesE2.ts`). Silhouettes of the new enemies are not all identical solid shapes (bounding-box and pixel-count distinctness across the ten new rows, as in the E2 case).
6. **Ambients.** `Ambience` with `fireflies` and `embers` emits only its kinds (`firefly`, `ember`) at the configured rates (statistical bounds with a seeded rng), inside the corridor view and the stated y bands; fireflies stay inside their band over time (wander is small); embers rise (y decreases). `Particles`: old kind indices stable, `firefly` draws one 1x1 `fillRect`, a full pool never throws. The firefly ramp has an alternating bright/dim pattern (length at least 4) and no ramp step is shorter than 0.5 s at the configured minimum life (no flashing; R10). Budget: 8 heroes, 12 enemies, 16 drops, 24 effects, 8 summons and a full particle pool stay within 200 bitmaps and 520 fills in Stages 5 and 6 as well.
7. **Hero invariants (extend, do not weaken).**
   - The hero-invariant and combat-isolation suites run once per stage (now six): drive a wave and the boss, apply every host event and every combat stimulus, assert `heroSnapshot()` is identical to a run with enemies off; a full 1 to 6 to 1 stage sequence (boss defeats, holds, fades, wrap, cycle + 1) leaves every hero's `x`, `y`, `phase`, `lifecycle`, and `classId` unchanged and no hero is removed.
   - **Lava and ambient safety (new).** (a) Structural: no file on the hero side or in `Combat`/`Enemy`/`Boss`/`Progression`/`StageDirector` mentions `lava`, `firefly`, `fireflies`, `embers`, or the Stage 5/6 prop names; no `StageDef.props` floor-layer placement has a prop name containing `lava`; `Ambience.ts` is the only reader of `ambient.kind`. (b) Behavioural: with the stage fixed at Stage 6 and at Stage 5, a heroes-only run and a run with ambients/lights at full density produce identical `heroSnapshot()` sequences. (c) The Stage 6 `g` ambient colour is not red-dominant (red at most 1.3 times max(green, blue)); the merged Stage 6 `T` and `6` characters may be orange.
   - Throwing from `Ambience.update` (new cases) and from `Enemy.draw` of a new enemy leaves the scene running. Summons are never in the fighter buffer or the enemy list (unchanged tests run per stage).
8. **Structural.** The seams are unchanged: `ENEMY_SIDE` and `HERO_SIDE` literal arrays need no edits; `data/enemies.ts` stays the only enemy numbers; the ban-list scan passes over the new sprite files (`stage5Templates.ts`, `stage6Templates.ts`, `enemiesStage5.ts`, `enemiesStage6.ts`, `elderDryadTemplate.ts`, `moltenColossusTemplate.ts`, `palettesE3.ts`), `stages.ts`, `Ambience.ts`, `Particles.ts`, `tuning.ts`. Watch for `gauge`, `dead`, `damage`, `hurt`, `retreat`, `hp`, `health`, `mana`, `downed`, `dying` in lava, furnace, and boss prose. `Combat`, `Enemy`, `Boss`, `Progression`, and `StageDirector` show no diff against E2 (the reviewer checks the diff).
9. **Existing suites stay green**, including M2 to E2 integration; protocol and progress tests untouched; `PROTOCOL_VERSION` still 2, `PROGRESS_SCHEMA_VERSION` still 1.
10. **Performance (soft).** Reuse the E1 node benchmark in Stages 5 and 6 (average under 1 ms per frame, fail above 4 ms). Add a case at the maximum configuration: `maxEnemies` 12, eight fighters, boss on screen, Stage 6 lights (6) and ambients on. Real frame time is manual (task 7). Record the production webview bundle size.
11. **Manual QA ([testing strategy section 7.3](../../engineering/testing-strategy.md)).** Ten new enemies readable by silhouette against their own stage and against older siblings; no enemy, firefly, or ember looks like a hero status effect; fireflies are calm and not flashing; lava and ember art read as scenery, never as a floor hazard; stage fades are dark and slow; colors read in the three panel sizes; Stage 5 and 6 lights are visible but not harsh; the Elder Dryad and Molten Colossus telegraphs read differently from their attacks.

Not automated: rendered pixels, silhouette quality, real-canvas frame time.

## 8. Gates for E3

| Gate | E3 meaning |
|---|---|
| G1 | `npm run build`, `lint`, `typecheck` (all three projects), `test`, and `test:integration` pass |
| G2 | `npm run docs:tables` leaves no diff and lists 30 of 50 enemies |
| G3 | invariants intact (section 2); the hero-invariant suite passes per stage (six); lava and ambient safety (note 7) passes; notes 2 to 8 pass |
| G4 | no new packages; no image, audio, or font files |
| G5 | `CHANGELOG.md` entry; `enemies-and-stages.md` and `game-design.md` match the data; art docs match the art; [game engine](../game-engine.md) and [data model](../data-model.md) match the code |
| G6 | `CLAUDE.md` directory map and ownership rows match the repo (architect syncs on the developer's drift flag) |
| G7 | reviewer Approve; one commit; roadmap E3 ticked |

**Done when** ([roadmap E3](../../engineering/roadmap.md#e3-stage-5-enchanted-forest-ruins-stage-6-molten-core), made concrete): G1 to G7 hold; `validateEnemies` passes for stages 1 to 6 (30 enemies); progression wraps after Stage 6 with `cycle` + 1; lava, embers, fireflies, and every other stage decoration cannot affect hero state (note 7 passes); the manual benchmark holds 60 fps with 8 heroes and a full wave of 12 enemies in Stages 5 and 6 (30 distinct enemy types exist; the on-screen pool stays 12).

## 9. Risks, assumptions, defaults

- **R1: atomic switch.** Rows without art, art without rows, or a boss row without its phase palette break `Game` or the validators (section 4). Mitigated by the wiring order; task 4 is a single step.
- **R2: vocabulary scan hits prose.** The hero-side ban applies to every new sprite and data file. Molten Core is the likely accident: "heat gauge", "pressure gauge", "burn damage", "hurt", "retreat", "dead" (also inside "deadline"), "dying embers", "health" in a boss comment, "hp" or "mana" in a name. Use "cooled", "fading", "banked", "glowing", "flow" instead. The artist and developer reread their files with the ban list in hand; the structural test is the net. `FORBIDDEN_ENEMY_ANIMATION` is a regex on animation names (`hit|death|dead|die|dying|hurt|downed`): do not name an animation anything containing those.
- **R3: ambient particle cost.** Steady-state counts are small (about 25 fireflies, about 15 embers, plus any campfire embers) and every particle is one `fillRect`, inside the 520-fill ceiling because the ceiling assumes a full pool. Embers are drawn in the particle pass above enemies; if the manual benchmark shows overdraw cost, lower `perSecond` (constants only).
- **R4: look-alike pressure (the main art risk).** Thirty enemies now share three 16x16/24x24/48x48 silhouette budgets, and stage palettes recolor each stage's enemies to one color family, so shape is the only separator within a stage. 18 minions share 16x16, so every new minion has 17 pairs to clear (12 older, 5 new). Policy in section 7, note 4: new pairs under 0.85 overlap and at most 0.80 IoU, same-stage minions under 0.75 overlap; the ten grandfathered pairs may not worsen. Silhouette cues are fixed in section 11.4 and 11.5 to avoid clones before they happen: tall plant with radial crown, a pointed upright-eared quadruped, an X-winged flyer, a shell-on-snail, a horned biped with a tail, and a wide pincer crab. The pairs most likely to bite: Moss Wolf vs Cellar Rat / Toxic Toad (all low horizontals; the wolf must stand tall with upright ears and a raised tail), Slag Snail vs Green Slime (domes; the snail has a spiral shell off-center and a neck with eyestalks), Bramble Pixie vs Cave Bat / Wailing Ghost (floaters; X wings and a visible torso).
- **R5: the ten known-over pairs.** Reworking green-slime, toxic-toad, spore-shroom, and wailing-ghost (four shipped E2 templates) clears all ten (green-slime is in five, toxic-toad in three, spore-shroom and wailing-ghost one each). Default: do it as the optional first art step A-E3-0 with identical ids, sizes, and animation sets, so no data or switch change follows (decision E3-8). Deferral keeps the ratchet as is and records the debt again; new art must not add to it either way.
- **R6: master palette budget.** 37 of 48 (counted from `MASTER_PALETTE`: hero 11, fire 4, wood and gray 4, tiles 8, world 2, lights 2, particles 2, summon 2, copper 2). **E3 may add at most 3 characters (hard cap 40 of 48), default 0.** Rationale: the remaining 11 slots must also cover E4 (frost and shadow, up to 3), E5 (gold hoard and void, up to 3), and U1 UI glyphs; this leaves 2 spare. The stage palettes override `1` to `8`, `g`, `T`, which already supplies blue flora and lava oranges per stage; fireflies use `Y L N`; embers use `Y O R D`; the boss phase palettes override master characters that already exist. Any new character is asked for in the handoff with the reason.
- **R7: boss duration.** Stage growth is 1.35 per stage, so with the E1 formula the Stage 6 boss (vigor 1.0) would have 538 health (1856 with eight fighters): measured from the Stage 1 boss (120 health, about 47 s solo, about 2.55 health per second solo) and the Stage 4 estimate (1019 with eight in about 50 s, about 20 per second), that is about 210 s solo and about 91 s with eight heroes, too long. Defaults: Elder Dryad `vigor` 0.9 (359 / about 1238, about 140 s solo, about 61 s with eight) and Molten Colossus `vigor` 0.8 (430 / about 1485, about 169 s solo, about 73 s with eight). These are estimates from arithmetic, unmeasured, pending the manual benchmark; the lever is per-row boss `vigor` only (decision E3-7). `HEALTH_GROWTH` stays calibrated for ten stages and is not touched. A flatter curve is E5 (`vigor` range floor is 0.5, which still allows halving a boss if needed). Regular enemies at Stage 6 have 45 to 129 health versus 8 to 24 at Stage 1: a solo hero needs about 17 s for a Stage 6 minion and about 50 s for the elite (same arithmetic); accepted, as "by cumulative work" intends.
- **R8: cycle semantics change.** A stored `cycle` was counted in 4-stage passes; it is now a 6-stage pass. Enemy health rises 25 percent per cycle (capped at 8), so a returning player's early stages get slightly tougher per past cycle. Accepted (decision E3-6); no migration, schema stays v1. E5 changes the meaning again (New Game+).
- **R9: downgrade.** An E3 save with `stageIndex` 5 or 6 opened by an E2 build wraps to Stage 1 or 2 (`% 4`), keeps counters, and does not fail. Nothing to do.
- **R10: photosensitivity and motion.** No flashing is added. Firefly blink is a slow ramp (at most about 1 Hz equivalent; each ramp step 0.5 s or longer), low contrast, 1x1. `glowBloom`, `lavaFall`, and `lavaChannel` lights use `flicker: false`; the lava props animate slowly (the loop speed is a data field). The later reduce-motion setting (M7) should suppress these ambients; that is a note for M7, nothing to do in E3.
- **R11: bundle size.** Ten enemies at 7 to 11 frames each plus two environments add several tens of KB of template strings. The tester records the production webview size; the standing assumption is under 300 KB through E5. If E3 leaves it above 250 KB, flag it in the handoff so E4 and E5 can plan (e.g. compact frame encoding).
- **R12: Elder Dryad vs Rat King and Ooze Queen; Colossus vs Rock Golem.** The Colossus (48x48) must differ from Rock Golem (24x24, same material feel) by proportions and glow pattern; the Treant (24x24) from Rock Golem and Crypt Mummy. Covered by the same-size look-alike check on bosses and elites.
- **Defaults chosen:** no new mechanic; rows as in section 5.2; E1 formulas and constants unchanged except the two boss vigors; drops reuse the four E1 kinds; ambients are particle emitters only; lava glow is lights plus palette plus art; embers reuse `ember`; one new particle kind (`firefly`) appended; zero new master characters by default; one commit; schema v1 and protocol 2 unchanged; the validator stays in incremental mode until E5.

## 10. Ownership split

| File or area | Owner |
|---|---|
| `src/game/sprites/stage5Templates.ts` (`ENCHANTED_FOREST_RUINS`), `stage6Templates.ts` (`MOLTEN_CORE`), `enemiesStage5.ts` (`ENEMIES_STAGE5`), `enemiesStage6.ts` (`ENEMIES_STAGE6`), `elderDryadTemplate.ts`, `moltenColossusTemplate.ts`, `palettesE3.ts` (`BOSS_PHASE_PALETTES_E3`) (new), `palettes.ts` (stage char tables, firefly ramp), `palettesE1.ts` (`STAGE_PALETTES`), in A-E3-0 the in-place reworks of `enemiesStage3.ts` and `enemiesStage4.ts`, `enemyTemplates.ts` and `spriteTemplates.ts` (barrel merges, last), `docs/design/art-style-guide.md`, `docs/design/sprite-spec.md` | pixel-artist |
| `src/game/data/enemies.ts` (rows), `data/stages.ts` (rows, `AmbientEffect`), `data/tuning.ts`, `Ambience.ts`, `Particles.ts`, `Renderer.ts` (colour map), `sprites/spriteValidator.ts` (`REQUIRED_PROPS`, `FLAME_PROPS`), `docs/design/enemies-and-stages.md`, `docs/design/game-design.md`, `CHANGELOG.md`, the roadmap E3 status lines, all git operations | developer |
| `test/**` (incl. new `lookAlikes.test.ts`, `stagesE3Art.test.ts`, the E3 ambient cases), `docs/engineering/testing-strategy.md` | tester |
| this plan, `game-engine.md`, `data-model.md`, `roadmap.md` (except status), `docs/index.md`, `CLAUDE.md` (except Core invariants) | architect |

## 11. Art needs (batch E3)

Characters only, no hex (except `palettesE3.ts` phase palettes); `.` is transparent; enemies face **left** and are never mirrored except while withdrawing (E1 rule); at most 12 colors per sprite; each stage's tiles, props, backdrop, and enemies use the eight stage characters `1` to `8` (recolored by `STAGE_PALETTES[stageId]`) plus master accents. Validate before handing over. Do **not** merge into the barrels until A-E3-6 (section 4). Avoid the banned words in comments (R2). The look-alike policy (section 7, note 4) applies to every enemy; the artist reads the matrix the tester provides in T-E3-0. Delivery in six steps (A-E3-1 to A-E3-6) so the developer is never blocked long, plus the optional A-E3-0.

### 11.0 A-E3-0 (optional, default on): rework the four worst look-alikes

Redraw in place, same ids, tier sizes, anchors, and animation sets (so no data change): `green-slime` (a pear-shaped drop with a tall pointed top, off-center eyes, a visible rim at the base; not a dome that fits inside the rat/bat/spider/beetle hulls), `toxic-toad` (taller body, wide mouth, hind legs bent into a Z, no horizontal cellar-rat silhouette), `spore-shroom` (a cap noticeably wider than the stem and legs, asymmetrical spots, distinct from the Goblin Scout), `wailing-ghost` (a taller teardrop with trailing hem, narrower than the web spider footprint). Target: each of the ten pairs under 0.85 overlap. The tester then deletes the stale `KNOWN_OVER` entries. If the human defers (E3-8), skip this step.

### 11.1 A-E3-1: shared additions

| Item | Where | Spec |
|---|---|---|
| Stage palettes | `palettesE1.ts` | `STAGE_PALETTES['enchanted-forest-ruins']` and `['molten-core']`: `1` to `8`, plus `g` (ambient tint) and `T` (light). Meaning stays stable: 1 deepest shadow, 2 dark rock, 3 mid rock, 4 lit rock, 5 secondary material, 6 light source, 7 highlight, 8 accent. Stage 5: moss green and ruin gray; `5` moss green, `6` and `8` glowing blue flora, `T` soft blue-teal; `g` a dark blue-green; clear `n` stays master. Stage 6: basalt black and charcoal, `5` rust iron, `6` lava orange, `7` yellow-white hot highlight, `8` deep red-brown; `T` orange (intensity limited to 0.8 by the stage row); **`g` dark neutral-to-warm gray-brown, never red-dominant (red at most 1.3 times the larger of green and blue)**. Enemies stay brighter and more saturated than the floor (R4). |
| Stage character tables | `palettes.ts` | entries for both ids in `STAGE_TILE_CHARS` (`12345678`), `STAGE_CLEAR_CHAR` (`n`), `STAGE_AMBIENT_CHAR` (`g`). |
| Particle ramp | `palettes.ts` | `PARTICLE_PALETTE.firefly`: an alternating bright and dim ramp of 5 master characters (for example `Y N L N Y`: yellow, dark green, lime, dark green, yellow). Widen the type union. No new master character (37, cap 48; E3 limit 40). |
| Embers | none | reuse `PARTICLE_PALETTE.ember` (`Y O R D`). |

### 11.2 A-E3-2: Stage 5 environment (`enchanted-forest-ruins`, file `stage5Templates.ts`, export `ENCHANTED_FOREST_RUINS`)

Tiles: `wallTop` 2, `wallMid` 5 (4 mossy ruin-wall variants, plus variant 4 with transparent pixels, for example a vine-wrapped window or broken arch so the backdrop shows), `wallBase` 2, `floorBack` 3, `floorFront` 3, `foreground` 2; join rules as every stage. Props per section 5.2 (`doorFrame`, `brokenPillar`, `hangingRoots`, `glowBloom` with a 2-frame pulse, `ruinedStatue`, `fernPatch`, `flowerBed`), ids `enchanted-forest-ruins/<name>`; solid props foot-anchored at the base center. Backdrop 128x128, period 64: distant ruined arches among tree trunks, hanging vines, glowing flowers. Mood: moss green, ruin gray, glowing blue flora. Floor and wall darker and less saturated than the Stage 5 enemies (R4).

### 11.3 A-E3-3: Stage 6 environment (`molten-core`, file `stage6Templates.ts`, export `MOLTEN_CORE`)

Same tile counts and rules. The transparent `wallMid` variant is a glowing lava-lit opening to the backdrop. Props: `doorFrame`, `obsidianPillar`, `lavaFall` (4-frame flow loop, light source), `lavaChannel` (2-frame shimmer, wall-base band, light source), `anvil` (solid, 16 px wide), `slagHeap`, `toolRack`; ids `molten-core/<name>`. Backdrop 128x128, period 64: a far lava river, black basalt columns, a red-orange glow on the horizon. Lava never appears in the floor tiles' walking area and never in a floor-layer prop (section 5.1, lava rules). Keep it cute-spooky, no gore. No words from the ban list in comments (R2).

### 11.4 A-E3-4: Stage 5 enemies (file `enemiesStage5.ts`, export `ENEMIES_STAGE5`)

Each `enemies/<id>`, left-facing, foot anchor, animations `idle 2, walk 2, attack 3`, cute-spooky. Silhouettes must differ when filled solid black (preview) and pass the look-alike matrix.

| id | Tier and size | Look | Silhouette cue |
|---|---|---|---|
| `thorn-sprout` | minion 16x16 | a walking bulb-seedling on root legs, a radial crown of thorny leaves, one big eye; `attack` leans forward and flares the leaves | tall narrow body with a spiked radial crown on top, not an umbrella |
| `moss-wolf` | minion 16x16 | a lean wolf with a mossy back and tufts, upright pointed ears, tail raised; `attack` lunges the head forward | standing four-legged shape with tall ears and a raised tail, a diagonal body (not the low flat rat/toad hull) |
| `bramble-pixie` | minion 16x16 | a tiny thorny pixie with a visible torso and legs and large wings, holding a bramble stick; `attack` flicks the stick | X-shaped wings around a small body (not a ghost sheet or a bat) |
| `ancient-treant` | elite 24x24 | a gnarled walking tree: root feet, a thick trunk face with glowing eyes, a branching crown, arms as low branches held at chest height forward, never overhead; `attack` pulls the branches back and thrusts forward | Y-shaped branching crown over a wide root base |

### 11.5 A-E3-5: Stage 6 enemies (file `enemiesStage6.ts`, export `ENEMIES_STAGE6`)

Same contract.

| id | Tier and size | Look | Silhouette cue |
|---|---|---|---|
| `ember-imp` | minion 16x16 | a small horned imp with a pointed tail tipped by a tiny flame, bat-less (no wings), hops; `attack` swipes a claw | two horns, a thin biped with a long curved tail (not a goblin or a rat) |
| `slag-snail` | minion 16x16 | a snail with a cooled basalt spiral shell glowing at the cracks and two eyestalks | low body plus a high spiral shell set off-center, eyestalks forward |
| `magma-crab` | minion 16x16 | a flat crab with obsidian plates, two raised claws, side legs, small eyestalks; `attack` snaps a claw | wide and flat with two claws up (not a beetle or a spider) |
| `furnace-guard` | elite 24x24 | a squat iron-plated guard with a glowing grate in the chest, a horned helmet, and a big hammer carried low or to the side, never overhead | box torso with a horned helmet and a hammer held low |

### 11.6 A-E3-6: the two bosses, then wiring

`elder-dryad` (file `elderDryadTemplate.ts`) and `molten-colossus` (file `moltenColossusTemplate.ts`), boss 48x48, left-facing, animations `idle 2, walk 2, attack 3, telegraph 2, intro 2` (11 frames), a clearly different `telegraph` from `attack`. Elder Dryad: a tall tree-spirit woman with an antler-branch crown of blossoms, a trailing vine skirt and a vine staff; telegraph: the staff rises and the blossoms open. Molten Colossus: a hulking basalt giant with glowing lava cracks, a furnace door in the chest, and heavy fists; telegraph: both fists gather and the cracks brighten. Phase 2 palettes in `palettesE3.ts` (`BOSS_PHASE_PALETTES_E3`): at most four master-character overrides each, same silhouette; Dryad: leaves and blossoms turn warm autumn orange and white-gold; Colossus: the crack and chest colors go white-hot (for example `Y` `O` `R` `D` moved toward pale yellow and white-orange). Red and orange are allowed on enemies.

**Then wire** (the only step that edits the barrels): `enemyTemplates.ts` merges `ENEMIES_STAGE5`, `ENEMIES_STAGE6`, `ELDER_DRYAD`, `MOLTEN_COLOSSUS`, and `BOSS_PHASE_PALETTES_E3`; `spriteTemplates.ts` adds `'enchanted-forest-ruins': ENCHANTED_FOREST_RUINS` and `'molten-core': MOLTEN_CORE` to `STAGE_SPRITES`; update the header comments. Hand the developer the final prop names.

### 11.7 What the engine draws itself (no art)

Hit flashes, dissolves, bars, shadows, the stage fade, drops (reused), fireflies and embers (from the ramps), light maps. The artist never draws a hurt, downed, burning, or poison frame for an enemy and never any frame, icon, or tint for a hero.

### 11.8 Docs the pixel-artist updates

[Art style guide](../../design/art-style-guide.md): Stage 5 and 6 character and prop tables (as the Stage 3 and 4 sections), the two palettes, the delivered enemy rows with silhouette cues, the two phase palettes, the firefly ramp, the master palette count, and the look-alike backlog paragraph (updated if A-E3-0 lands). [Sprite spec](../../design/sprite-spec.md): the new template files and exports.

## 12. Decisions for the human

Each has a default so work can proceed.

| # | Question | Default chosen | Alternative |
|---|---|---|---|
| E3-1 | Enemy names and numbers | The ten rows in section 5.2 (ids and names mirrored by the artist; the developer may rename) | Human-chosen names |
| E3-2 | New enemy behaviors (burning, thorn ranged attacks, splitting) | None. Gaits `walk`, `hop` (imp), `float` (pixie); all enemies attack with the E1 cosmetic timer | A separate plan for status-like attacks (they belong to E4 and stay cosmetic, never a hero state) |
| E3-3 | Ambient implementation | `fireflies` and `embers` as two new `AmbientEffect` kinds; one new `firefly` particle kind; embers reuse `ember`; lava glow is lights plus palette plus art, not an effect | Reuse `mote` for fireflies (no engine change, but fireflies would look like Stage 2 dust); or a drawn glow layer (new render pass, out of scope; it would also risk a gauge-like look) |
| E3-4 | Stage ids and names | `enchanted-forest-ruins` "Enchanted Forest Ruins", `molten-core` "Molten Core" (as in the roadmap) | none |
| E3-5 | Drops | Reuse `coin gem ore chest`; no new drop art | New drop kinds with art (leaf, cinder): more art and validator rows, no gameplay value |
| E3-6 | Cycle meaning after the wrap moves to Stage 6 | No migration; stored `cycle` continues (schema v1) | A v2 migration that rescales old cycles (a store migration for no benefit) |
| E3-7 | Boss health | E1 formula, with per-row boss `vigor` 0.9 (Dryad) and 0.8 (Colossus) to stop the late bosses dragging | Vigor 1.0 (about 210 s solo for Stage 6) or a flatter global curve (changes all stages, E5) |
| E3-8 | The ten known-over look-alike pairs | Rework the four involved E2 enemies in A-E3-0, then remove the pins | Defer (keep the ratchet unchanged, add no new pins, record the debt again in the E3 as-built section); the policy still binds all new art |
| E3-9 | Master palette growth | At most 3 new characters (cap 40 of 48), default 0 | Zero hard cap, or a larger allowance with E4 and E5 squeezed |
| E3-10 | Art delivery order | Optional A-E3-0, then six steps A-E3-1 to A-E3-6, barrel wiring last, then the developer's atomic switch | Rows with placeholder art (rejected: `Game` throws without real stage art) |
| E3-11 | Lava lights | `flicker: false`, slow animation loops, warm `T` orange; ambient tint never red-dominant | Flicker like torches (rejected for the photosensitivity risk and hero legibility) |

## 13. Architect doc pass (applied with this plan)

- New: this plan.
- [Roadmap](../../engineering/roadmap.md): E3 entry rewritten (plan link, scope, files, art steps A-E3-0 to A-E3-6, done-when). Status lines untouched.
- [Docs index](../../index.md): the plan row.
- Not changed now; the architect updates at as-built time on the developer's drift flag: [game engine](../game-engine.md) (ambient kinds, particle kinds, six delivered stages), [data model](../data-model.md) (stage and enemy tables, tuning groups, `AmbientEffect`), `CLAUDE.md` directory map (sprite files line; it currently lists none of the E1 to E3 enemy and stage files, so a short sync is due at E3 as-built).
- For the tester: section 7 (T-E3-0, the generalized look-alike test, the pinned-count list, lava and ambient safety). For the pixel-artist: section 11 and the sprite spec.
- Done at as-built time (section 14): [game engine](../game-engine.md), [data model](../data-model.md), and the `CLAUDE.md` directory map and pixel-artist ownership row were synced to the working tree.

## 14. As-built notes (checked against the E3 working tree)

Each item below was read from the code in the uncommitted tree on `feat/e3-stages-5-6`; it records where the build matches the plan and where it differs. Nothing was run by the architect (no shell), so test and lint results are the developer's and tester's to report.

**Engine (matches section 5.1, with the details fixed).**

- `Particles.ts`: `ParticleKind` and `KIND_NAMES` end `... 'wisp', 'firefly'` (`firefly` is index 7, earlier indices unchanged). The firefly update is `(rng - 0.5) * 48 * dt` on both `vx` and `vy`, which is the planned plus or minus 24 px/s^2 jitter. It draws 1x1 (one `fillRect`). The blink is only the ramp: `PARTICLE_PALETTE.firefly` is `['Y', 'N', 'L', 'N', 'Y']`, so no master character was added for it. `ember` keeps its sideways wander and is unchanged.
- `Ambience.ts`: the `fireflies` and `embers` cases each have their own debt (`#fireflyDebt`, `#emberDebt`) through the shared `#accrue`, which caps a debt at `max(1, perSecond)`; the same helper now also serves bubbles, fog, and fog dust (E2). Fireflies: x across `CORRIDOR_X..INTERNAL_WIDTH`, y in `FIREFLY_MIN_Y..FIREFLY_MAX_Y`, `vx` and `vy` each plus or minus `FIREFLY_DRIFT`. Embers: the existing `ember` kind, `vx` 0, `vy` from `-STAGE_EMBER_RISE_MIN` to `-STAGE_EMBER_RISE_MAX`, y in `STAGE_EMBER_MIN_Y..STAGE_EMBER_MAX_Y`. `assertNever` keeps the switch exhaustive. The `tuning.ts` constants carry exactly the planned values.
- `Renderer.ts`: the colour map gains `firefly: css(art.particlePalette.firefly)`. `ArtSet.particlePalette` is `Record<ParticleKind, ...>`, so the ramp is now required for the type to check, and `validateArtSet` still needs a ramp of 2 or more known characters per kind.
- No other engine file changed (`Stage.ts`, `Combat`, `Progression`, `StageDirector` and the rest untouched, as planned).

**The atomic switch is done, in the planned order.** The new files were created first; the wiring then landed in one pass: `enemyTemplates.ts` merges `ENEMIES_STAGE5`, `ENEMIES_STAGE6`, `ELDER_DRYAD`, `MOLTEN_COLOSSUS`, and `BOSS_PHASE_PALETTES_E3`; `spriteTemplates.ts` adds both stages to `STAGE_SPRITES`; and the `STAGES` rows, the ten `ENEMIES` rows, `REQUIRED_PROPS` for both stages, and `FLAME_PROPS` (`glowBloom` 2, `lavaFall` 4, `lavaChannel` 2) were added together. `STAGES.length` is 6 and the generated table reads `Delivered enemies: 30 of 50.`

**Where `validateStages` lives.** The plan's section 3 and 5.3 lumped the stage checks together with the validator tables. As built, `validateStages(stages, art)` is in `src/game/Stage.ts` (bounds, door, lights, solids, nav connectivity) and is the only one that runs at boot. `REQUIRED_PROPS` and `FLAME_PROPS` are module-private in `src/game/sprites/spriteValidator.ts` and are checked by `validateArtSet`, which tests run.

**Stage rows (`data/stages.ts`).**

- Stage 5 `enchanted-forest-ruins`, ambient `fireflies` 5/s. Alcove: `doorFrame` (door zone), `brokenPillar` (0,16), `hangingRoots` (52,16) and (108,16), `glowBloom` lights at (28,40) and (92,40), solid `ruinedStatue` (6,134) 12x5, `fernPatch` (60,150), `flowerBed` (88,148). Corridor: `glowBloom` lights at (60,40) and (252,40), `brokenPillar` at 150 and 330, `hangingRoots` at 190 and 110 (y 16), `fernPatch` at 100 and 300, `flowerBed` at 200. Four lights.
- Stage 6 `molten-core`, ambient `embers` 6/s. Alcove: `obsidianPillar` (0,16), `lavaFall` lights at (28,16) and (92,16), `lavaChannel` light at (52,120), `toolRack` (108,52), solid `anvil` (6,134) 12x5, `slagHeap` at (60,152) and (88,148). Corridor: `lavaFall` lights at (60,16) and (252,16), `obsidianPillar` at 150 and 330, `lavaChannel` light at (190,120), `toolRack` (110,52), `slagHeap` at 100, 200, and 300. Six lights (limit eight). No floor-layer prop has `lava` in its name, and every lava prop is a wall-layer prop.
- Light definitions (all `colorChar: 'T'`, **`flicker: false`**, decision E3-11 kept): `glowBloom` radius 48, intensity 0.8; `lavaFall` radius 52, intensity 0.7; `lavaChannel` radius 44, intensity 0.6. The planned "0.8 or less" intensity cap for the lava `T` holds with room.
- Light counts match the plan: Stage 5 has two `glowBloom` lights per zone (4), Stage 6 has two `lavaFall` lights and one `lavaChannel` light per zone (6). The `lavaFall` props start at y 16 (top of the wall) and the `lavaChannel` props at y 120 (the wall-base band above the floor band, which starts at y 128).

**Palettes.** The Stage 6 ambient tint `g` is `#6b6058`: red 107 over a larger of green 96 and blue 88 is a ratio of about 1.11, inside the 1.3 limit (the tint rule in section 5.1). The Stage 5 `g` is `#3f7468`, `T` is `#7fd0ff`; the Stage 6 `T` is `#ffa040`. No master character was added for E3 (the firefly ramp reuses `Y N L`).

**Bramble Pixie hover.** The pixie's `float` gait offset in `Enemy.#gaitOffset` is `-(4 + round(sin(t / 240) * 2))` px, and its template leaves `HOVER` = 3 rows of clear space under the body inside the 16x16 cell, so it hovers about 7 px above the floor at the mean (3 px from the art plus the 4 px mean of the float gait). This is draw-only motion (the gait never changes where it stands or when it is struck).

**Look-alike ratchet outcome (tester and artist).** The A-E3-0 rework landed (`enemiesStage3.ts`, `enemiesStage4.ts`, and `oozeQueenTemplate.ts` are modified in the tree). The generalized test in `test/game/lookAlikes.test.ts` with `test/support/lookAlikes.ts` (and the report command `test/support/lookAlikesReport.mjs`) checks every same-size pair of every tier. As reported to the architect, **17 pins were cleared and 11 legacy pairs remain as art debt**, pinned in `LEGACY_OVER` and reported to the pixel-artist. The arithmetic fits: 28 pins existed (ten `KNOWN_OVER` plus eighteen `LEGACY_OVER`), so clearing the ten E2 pairs and seven legacy ones leaves 11 legacy pairs. That split is an inference; the architect did not re-measure overlap or IoU and could not run the test. No pair involving an E3 enemy is pinned (a test forbids it), so the ten new enemies are held to the full policy. At the time of this sync `test/support/lookAlikes.ts` still lists all 28 entries; the tester prunes the stale ones (the suite fails on a stale pin) and this paragraph is then exact. This also deviates from the plan's note 4, which expected only the ten `KNOWN_OVER` pins: the generalization surfaced eighteen more among the 20 E1 and E2 enemies, which were pinned as a ratchet rather than fixed in E3.

**Not changed (confirmed).** `PROTOCOL_VERSION` stays 2 and the progress schema stays v1 (no migration; a stored `cycle` now counts six-stage passes, [data model section 7](../data-model.md#7-persisted-progress-e1)); `Combat`, `Enemy`, `Boss`, `Progression`, and `StageDirector` have no E3 diff.
