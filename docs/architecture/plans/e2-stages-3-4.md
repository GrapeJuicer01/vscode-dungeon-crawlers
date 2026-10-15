# E2 plan: Stage 3 Toxic Slime Caverns, Stage 4 Ancient Catacombs (ten enemies, two stages, two ambients, progression wrap after Stage 4)

Purpose: the detailed plan for batch E2: ten more enemies (four regular plus a boss per stage), two more stages with per-stage palette overrides, props, backdrops and ambients (rising bubbles; low fog with dust), the enemy table growing from 10 to 20 of 50, and the progression wrap moving from after Stage 2 to after Stage 4. E2 is data and art on the E1 machinery plus two small cosmetic engine additions (two ambient kinds, two particle kinds). Written by the architect; the pixel-artist, developer, and tester work from it. Follows the layout of the [E1 plan](e1-enemies.md), whose [section 13](e1-enemies.md#13-as-built-drift-checked-against-the-e1-working-tree) (as-built facts) is the baseline.
Related: [roadmap E2](../../engineering/roadmap.md#e2-stage-3-toxic-slime-caverns-stage-4-ancient-catacombs), [E1 plan](e1-enemies.md), [game engine](../game-engine.md), [data model](../data-model.md), [ADR 0002 no hero health](../adr/0002-no-hero-health.md), [ADR 0009 hero lifecycle isolation](../adr/0009-hero-lifecycle-isolation.md), [ADR 0011 summons](../adr/0011-summons-are-leased-cosmetic-entities.md), [ADR 0012 host-owned versioned progress](../adr/0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and the hero reaction board](../adr/0013-enemy-health-and-hero-reaction-board.md), [enemies and stages](../../design/enemies-and-stages.md), [game design](../../design/game-design.md), [art style guide](../../design/art-style-guide.md), [sprite spec](../../design/sprite-spec.md), [testing strategy](../../engineering/testing-strategy.md), [CLAUDE.md](../../../CLAUDE.md).

Status: implemented, uncommitted (branch `feat/e2-stages-3-4`, from E1 commit 02f7a0b); as-built notes in [section 14](#14-as-built-notes-checked-against-the-e2-working-tree). Facts in sections 1 to 13 were checked against the working tree at the E1 commit. Where this plan and the code disagree, the code wins and section 14 records the drift.

## 1. Goal

After E2 the party fights through four stages instead of two. Stage 3 (`toxic-slime-caverns`) and Stage 4 (`ancient-catacombs`) each bring a new environment, four regular enemies (three minions and one elite), a boss, and an ambient effect. Defeating the Stage 4 boss fades back to Stage 1 and counts one more cycle (it used to wrap after Stage 2). Enemies stay exactly as E1 built them: they walk in, stand, attack on a timer with a purely cosmetic hero flash, have health and a bar, and dissolve. No new mechanic is added (decision E2-2).

- **Data**: 10 enemy rows (20 of 50 delivered), 2 stage rows, per-stage palette overrides, the required-prop lists, two flame-prop rules.
- **Engine (cosmetic only)**: `AmbientEffect` gains `bubbles` and `fog`; `ParticleKind` gains `bubble` and `wisp`; `Ambience` and `Particles` handle them; the renderer's particle colour map gains two entries. Nothing else in `src/game/` changes behavior.
- **Art**: two environments (tiles, 6+ props each, backdrops), ten enemy templates (eight regular, two bosses), two particle ramps, stage palettes. No new drop kinds, no new master palette characters.
- **Docs and tests**: the generated enemy table lists 20; hand-written tests that pin "two stages" and "ten enemies" are updated; new coverage for the ambients and for the 4-stage wrap.

Layers touched: data tables (`enemies`, `stages`, `tuning`), engine (`Ambience`, `Particles`, `Renderer` colour map only), sprites, validator tables (`spriteValidator`), docs tooling output, tests. Not touched: the monitor, host, protocol, `PROTOCOL_VERSION`, `Progress` schema (stays v1), settings, CSP, `esbuild.mjs`, dependencies, `Combat`, `Enemy`, `Boss`, `Progression`, `StageDirector`, `Engagement`, `Hero`, `Roster`, `ClassHero`, `World`, `Lighting`, `Stage.ts`, `Game`, `Drops`, the drop tables.

## 2. Invariant check

| Invariant | How E2 respects it |
|---|---|
| 1 Heroes invulnerable | No hero field, state, gauge, or reaction is added. Enemy attacks still write only to `HitReactions` (E1 path, unchanged). New enemies reuse the same attack and boss telegraph code. No slow, poison, freeze, or hurt look: Stage 3's toxic theme is dressing (colors, bubbles, slime art), never a status on a hero. Art must not draw "poison" icons or green tints on heroes. |
| 2 Lifecycle from host events only | Stage change, boss defeat, wrap and cycle only touch `Progression`, `StageDirector`, and `Combat`. Nothing new reads or writes `Hero`, `Roster`, `AgentInfo`, or lifecycle. The wrap after Stage 4 is the E1 code path with a larger `stageCount`. |
| 3 Read-only monitor | Untouched. No protocol change. |
| 4 Crash isolation | New ambient code runs inside `Ambience.update` (already inside `Game.step` try/catch). Stage runtimes for Stages 3 and 4 are built by the same guarded `StageDirector` path. A bad stage row is caught at startup by `validateStages` (see the atomic-switch rule, section 4). |
| 5 No external assets | Everything is palette-character templates in code. |
| 6 No runtime dependencies | None. |
| 7 Transcript privacy | `Progress` is unchanged (six numeric fields). No string or agent data is added. |

Summons are never targets and the enemy side still imports no hero code (ADR 0013, [E1 plan section 2.1](e1-enemies.md#21-the-seam-enemy-side-and-hero-side)). E2 adds no file to either side list except art and data files, which default to the strict hero side; the only enemy-side file edited is `data/enemies.ts` (rows only).

## 3. E1 assumptions audited against the code (what is hard-coded to two stages)

| Area | Finding at 02f7a0b | E2 action |
|---|---|---|
| `Progression` wrap | `constructor(stageCount)` and `onBossDefeated` use `#stageCount`; `Game` passes `deps.stages.length` (Game.ts:166). Wraps to Stage 1 and `cycle + 1` when `stageIndex >= stageCount`. `load` wraps a stored index with `% stageCount`. | None. Adding two `STAGES` rows moves the wrap to Stage 4 automatically. |
| `killsPerStage` | A runtime setting (`ConfigSnapshot`), the same for every stage. Not stage-keyed. | None. |
| `StageDirector` | Generic: lazily builds and caches runtimes by id, `#defFor` wraps by `stages.length`, `onSwap` fires at the fade midpoint. | None. |
| `Combat` row selection | `setStage(def)` picks `enemiesForStage(def.index)` and `bossFor`; health uses `stage.index` in `healthOf`. Generic. | None. |
| `validateEnemies` | Already the incremental mode: exactly 5 rows and one boss per stage in `stages`, at least one minion, `rows.length === 5 * stages.length`, global unique kebab ids. Not hard-coded to 2. (Exact mode, 10 stages and 50 ids, is E5.) | None in the validator. Rows added in lock-step with stage rows or `Game` disables combat (section 4). |
| `validateStages` (`Stage.ts`) | Called in the `Game` constructor; any error **throws** `RangeError('Stage data is invalid')`. Requires art for every `STAGES` row, props that exist, in-zone, in wall/floor bands, one door frame, at most 8 lights, nav connectivity (seats, formation slots, door). | None in code. This is why the switch is atomic (section 4). |
| `REQUIRED_PROPS`, `FLAME_PROPS` | Module-private records in `spriteValidator.ts`, keyed by stage id and prop name. Unlisted stage = no required props. | Developer adds two entries and two flame rules (section 5.3). |
| `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR`, `STAGE_PALETTES` | Keyed by stage id in `palettes.ts` / `palettesE1.ts`. `buildStage` throws `Stage art is missing` for an id without clear or ambient char. | Artist adds entries for both ids (A-E2-1). |
| Per-stage palette overrides | The merged palette is master plus `STAGE_PALETTES[id]`, used for tiles, props, backdrop, enemies of that stage, and the `Lighting` ambient and light colours (`Renderer` passes `cache.stagePalette(def.id)`). In practice any single-character key may be overridden (the rules in the art guide say `1` to `8`, `g`, `T`); `validateArtSet` checks the merged palette (tile chars present, clear char luminance under 0.02, ambient char present). | Both new stages override `1` to `8`, `g`, `T` only. Zero new master characters. |
| Master palette | 37 colors, cap 48. | Unchanged (zero added). |
| `AmbientEffect` and `Ambience` | Union `drip \| dust`; `Ambience.update` switches with `assertNever`. | Two new kinds (section 5.1). The compiler forces both edits. |
| Lighting kinds | `Lighting` has no ambient kinds. It takes a palette, an ambient char, and light colour chars `T` (torch) and `F` (campfire) only. `LightDef.colorChar` must be one of those two. | None. Stage 3 and 4 lights use `T`, recolored by the stage palette. |
| `ParticleKind` | `ember spark drip splash mote`; `KIND_NAMES` indexes a `Uint8Array`; `Renderer` builds an explicit per-kind colour map (Renderer.ts:138-142); `ArtSet.particlePalette` is `Record<ParticleKind, readonly string[]>`; the validator needs ramps of 2+ known characters. | Append `bubble` and `wisp` (section 5.1); artist adds ramps; developer adds two map lines. |
| Draw ceilings | 200 bitmap draws, 520 fills (`combatBudget.test.ts`). Particle draw is one `fillRect` per live particle and the ceiling already assumes the pool full (384). Enemy pool 12, drops 16 unchanged. | None. New particles do not add draws beyond a full pool. Steady state is far below capacity (section 8, R3). |
| Enemy art lookup | `SpriteCache.#enemyPalette` finds the enemy's `STAGES` row by index; `validateEnemyArt` loops `ENEMIES` and `STAGES`. Both generic. Tier size limits 16, 24, 48; animation sets `idle 2, walk 2, attack 3` (+ `telegraph 2, intro 2` for bosses); at most 12 colors; phase palettes at most 4 single-character master overrides. | None. |
| `docs:tables` | `PLANNED_ENEMY_COUNT` 50; the header is `Delivered enemies: <n> of 50.`; rows render from `ENEMIES` and `STAGES`. Generic. | Regenerate: 20 rows. |
| Tests that pin two stages or ten enemies | `enemyData.test.ts` (rows 10, `STAGES.length` 2, "expected 10 enemies for 2 stages" messages), `combatParts.test.ts` (an assertion `STAGES.length === 2` near line 601; the `StageDirector` suites walk the two ids), `docsTables.test.ts` ("10 of 50", row counts), `enemyBundle.test.ts`, `gameCombat.test.ts` (a stored index 10 wraps to Stage 2: with four stages it maps to Stage 2 as well, so it still passes but should be restated), `combatRig.ts` (`stageCount` defaults to `STAGES.length`, already generic). | Tester updates (section 7). |
| Structural vocabulary scan | The hero-side ban list (`hp health mana dead downed retreat damage gauge hurt dying`) covers every `src/game/**` file outside the enemy side, **including `sprites/`, `stages.ts`, `tuning.ts`, `Ambience.ts`, `Particles.ts`**. New art and data files are hero side. | Authors avoid those words in identifiers and comments (a Stage 3 "pressure gauge" pipe, a "retreat" comment, "damage" in acid prose all fail). Say "undead" only; do not write "dead". |

Conclusion: nothing in the engine is hard-coded to two stages. The only coupling is data-level: the stage table, the enemy table, the art tables, and the validator's per-stage prop lists must all move together.

## 4. The atomic switch (ordering constraint)

`Game` builds with `SHIPPED_ART` and the real `STAGES`/`ENEMIES` in almost every test, and `new Game(...)` throws if any stage lacks art. The validators also reject art for rows that do not exist (`enemy template for an unknown enemy`, `phase palettes belong to bosses only`). Therefore:

1. The pixel-artist creates new files and the palette-table entries but **does not merge the new enemy templates into `ENEMY_SPRITES`, `ENEMY_PHASE_PALETTES`, or the new stages into `STAGE_SPRITES`** until the last art step (A-E2-6), which wires the barrel files (`enemyTemplates.ts`, `spriteTemplates.ts`) in one edit.
2. The developer adds the `STAGES` rows, the `ENEMIES` rows, `REQUIRED_PROPS`, and `FLAME_PROPS` immediately after A-E2-6 in one step (task 4), and runs the validators. Until then the tree stays green with the E1 content.
3. The particle ramps (A-E2-1) and the engine additions (task 1) are independent of the switch and land first.

This is the one deviation from the E1 task list, which assumed tiny test art. In the tree as built, tests run on shipped art; do not rely on a test art set for E2.

## 5. Interfaces (signatures only)

### 5.1 Engine: cosmetic ambients and particles

```ts
// src/game/data/stages.ts (changed)
export type AmbientEffect =
  | { readonly kind: 'drip'; readonly perSecond: number }
  | { readonly kind: 'dust'; readonly perSecond: number }
  | { readonly kind: 'bubbles'; readonly perSecond: number }                          // E2, Stage 3
  | { readonly kind: 'fog'; readonly perSecond: number; readonly dustPerSecond: number }; // E2, Stage 4

// src/game/Particles.ts (changed): append so existing indices are stable.
export type ParticleKind = 'ember' | 'spark' | 'drip' | 'splash' | 'mote' | 'bubble' | 'wisp';
// KIND_NAMES gains 'bubble' (index 5) and 'wisp' (index 6).
// update(): bubble: vy stays negative (rises), vx wanders +-15 px/s^2 jitter; wisp: slow horizontal drift, vy wander small.
// draw(): size per kind: bubble 2x2, wisp 6x2, drip 1x2, the rest 1x1 (still exactly one fillRect per live particle).

// src/game/Ambience.ts (changed): two new cases; each effect keeps its own fractional debt.
//   bubbles: emit 'bubble' at a random x in the corridor view (CORRIDOR_X..INTERNAL_WIDTH) and y in the floor band
//            (BUBBLE_MIN_Y..BUBBLE_MAX_Y), vy -BUBBLE_RISE_MIN..-BUBBLE_RISE_MAX px/s, life BUBBLE_LIFE_*; not scrolled.
//   fog:     emit 'wisp' at a random x in the corridor view and y in the low band (FOG_MIN_Y..FOG_MAX_Y),
//            vx -FOG_DRIFT_* px/s, life FOG_LIFE_*; and also dustPerSecond motes through the existing #dust path
//            (separate debt so the two rates do not couple).
// assertNever keeps the switch exhaustive.

// src/game/data/tuning.ts (changed, neutral names): BUBBLE_MIN_Y 118, BUBBLE_MAX_Y 156, BUBBLE_RISE_MIN 12, BUBBLE_RISE_MAX 26,
// BUBBLE_LIFE_MIN_MS 1400, BUBBLE_LIFE_MAX_MS 2600; FOG_MIN_Y 132, FOG_MAX_Y 158, FOG_DRIFT_MIN 3, FOG_DRIFT_MAX 9,
// FOG_LIFE_MIN_MS 4500, FOG_LIFE_MAX_MS 7500. All first guesses, tuned by eye.

// src/game/Renderer.ts (changed): the particle colour map gains bubble and wisp (css(art.particlePalette.bubble|wisp)).
// src/game/sprites/palettes.ts (artist): PARTICLE_PALETTE type and table gain bubble and wisp ramps (master characters).
```

Stage rows (defaults; the developer sets positions after the real sprite sizes are known, re-running `validateStages`):

```ts
// Stage 3
{ id: 'toxic-slime-caverns', index: 3, name: 'Toxic Slime Caverns', props: [...], ambient: { kind: 'bubbles', perSecond: 7 } }
// Stage 4
{ id: 'ancient-catacombs',  index: 4, name: 'Ancient Catacombs',  props: [...], ambient: { kind: 'fog', perSecond: 4, dustPerSecond: 3 } }
```

Particle budget: steady state is rate times life: bubbles 7 x 2 s = about 14 live; fog 4 x 6 s = 24 wisps plus 3 x 3.5 s = about 10 motes; the pool is 384 and the draw ceilings already assume it full. Emission into a full pool is dropped silently (never throws), and the ambient rates are far too low to fill a 384-slot pool, so ambients cannot starve combat sparks.

### 5.2 Data: enemy rows and stage props

Default rows (ids and names are mirrored by the pixel-artist; numbers are tuning, decision E2-1). Health uses the E1 formula unchanged: tier base 10 / 24 / 120, times vigor, times 1.35 per stage after the first (x1.8225 at Stage 3, x2.4604 at Stage 4), cycle 0, party 1.

| Stage | id | name | tier | gait | vigor | pace | drop | health | px/s |
|---|---|---|---|---|---|---|---|---|---|
| 3 | `green-slime` | Green Slime | minion | hop | 1.0 | 0.9 | coin | 18 | 23.4 |
| 3 | `spore-shroom` | Spore Shroom | minion | walk | 1.2 | 0.8 | coin | 22 | 20.8 |
| 3 | `toxic-toad` | Toxic Toad | minion | hop | 0.9 | 1.2 | coin | 16 | 31.2 |
| 3 | `jelly-cube` | Jelly Cube | elite | walk | 1.3 | 0.5 | gem | 57 | 10 |
| 3 | `ooze-queen` | Ooze Queen | boss | walk | 1.0 | 0.6 | chest | 219 (755 with eight fighters) | 8.4 |
| 4 | `bone-soldier` | Bone Soldier | minion | walk | 1.0 | 1.0 | coin | 25 | 26 |
| 4 | `wailing-ghost` | Wailing Ghost | minion | float | 0.8 | 1.2 | coin | 20 | 31.2 |
| 4 | `tomb-scarab` | Tomb Scarab | minion | walk | 1.1 | 0.9 | ore | 27 | 23.4 |
| 4 | `crypt-mummy` | Crypt Mummy | elite | walk | 1.2 | 0.6 | gem | 71 | 12 |
| 4 | `tomb-lich` | Tomb Lich | boss | walk | 1.0 | 0.6 | chest | 295 (1019 with eight fighters) | 8.4 |

All values are inside the validator ranges (vigor 0.5 to 2, pace 0.5 to 1.6). Drops reuse the four E1 kinds; no new drop art (decision E2-5). The "ooze" and "slime" words are fine on the hero-side scan; avoid "dead" and "damage" in related prose.

Slimes are plain enemies with the `hop` gait. They do not split (decision E2-2). A slime that "splits" would add spawns mid-wave, kill-credit rules, and pool pressure in `Combat`; the roadmap wording ("for example splitting slimes") is permissive, not required.

Stage props (the artist's ids; at least 6 distinct props plus the door frame; at most 8 lights; solids only as alcove floor props at foot y 134 like barrels and the minecart, so no seat or formation slot is blocked):

| Stage 3 `toxic-slime-caverns` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128, as every stage |
| `pipe` | wall | leaking pipe run, 16x16, no gauge or dial (vocabulary scan) |
| `slimeDrape` | wall | dripping slime curtain from the ceiling |
| `glowShroom` | wall or floor, 2-frame pulse | light source (`T` recolored acid green, no flicker) |
| `toxicBarrel` | floor, solid in the alcove | 16x16, foot y 134 |
| `slimePool` | floor | decoration; name it `slimePool`, not `puddle` (the engine turns every prop named `puddle` into a drip point) |
| `mushrooms` | floor | cluster, decoration |

| Stage 4 `ancient-catacombs` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128 |
| `skullNiche` | wall | stacked skull recesses |
| `candelabra` | wall, 4-frame flame loop | light source (`T` recolored, flicker true) |
| `crackedPillar` | wall | 16x112-ish column section |
| `sarcophagus` | floor, solid in the alcove | foot y 134, 16 px wide sprite (solid footprint 12x5) |
| `urn` | floor | decoration |
| `boneRubble` | floor | decoration (not named `bonePile`; either name is legal per stage, but a different word avoids confusion with Stage 1) |

`REQUIRED_PROPS` entries: Stage 3 `pipe slimeDrape glowShroom toxicBarrel slimePool mushrooms doorFrame`; Stage 4 `skullNiche candelabra crackedPillar sarcophagus urn boneRubble doorFrame`. `FLAME_PROPS` gains `glowShroom: 2` and `candelabra: 4`. Placement follows the Stage 2 grid: door frame at the door zone; roughly eight alcove and eight corridor placements; two lights per zone (so 4 total); corridor positions repeat every 384 px.

### 5.3 Ownership of the validator table edits

`spriteValidator.ts` (developer) gets the `REQUIRED_PROPS` and `FLAME_PROPS` edits in task 4, because they read the artist's final prop names. The artist confirms the names in A-E2-2/A-E2-3; if the artist renames a prop, they tell the developer in the handoff.

## 6. Developer task list

Branch `feat/e2-stages-3-4`. No new packages. Do not commit before reviewer Approve. Tasks 1 to 3 need only A-E2-1; task 4 needs A-E2-1 to A-E2-6.

0. **Start.** Set roadmap E2 `Status: in progress` (batch entry and summary row 9). Check: only those two lines changed.
1. **Particles and tuning.** Add `bubble` and `wisp` to `ParticleKind`, `KIND_NAMES` (appended), update and draw sizes; add the `BUBBLE_*` and `FOG_*` constants to `tuning.ts`. Requires A-E2-1 (`PARTICLE_PALETTE` ramps) so `ArtSet.particlePalette` still type-checks; add the two lines to the `Renderer` colour map. Check: typecheck; a particle test emits each new kind and draws exactly one `fillRect` per live particle; a bubble's y decreases over time; indices of the old kinds are unchanged.
2. **Ambience.** Extend `AmbientEffect` with `bubbles` and `fog` (and the doc comment on `stages.ts`), add the two cases with their own debts, keep `assertNever`. Check: with a stage stand-in whose `def.ambient` is each new kind, `Ambience.update` for 10 simulated seconds emits about `perSecond * 10` particles of the right kinds and never throws; a mid-run switch of the stage def does not carry a runaway debt (cap the debt at one second's worth, as a guard).
3. **Validator tables.** `REQUIRED_PROPS` and `FLAME_PROPS` in `spriteValidator.ts` (section 5.3). Check: typecheck and the existing art validator tests still pass (the new ids are unused until task 4).
4. **Switch on** (after A-E2-6): append the two `STAGES` rows with props positioned against the real sprite sizes, and the ten `ENEMIES` rows. Check, in this order: `validateStages(STAGES, SHIPPED_ART)` empty (bounds, nav connectivity, at most 8 lights); `validateEnemies(ENEMIES, STAGES)` empty (20 rows, 4 stages, one boss each); `validateArtSet(SHIPPED_ART)` empty; `STAGES.length === 4`; `Progression` of 4 stages wraps from Stage 4 with `cycle + 1` (no code change).
5. **`docs:tables`.** Run `npm run docs:tables`; the generated region shows `Delivered enemies: 20 of 50.` and 20 rows. Check: a second run leaves no diff; `--check` passes. No change to `scripts/generate-doc-tables.ts` is expected; if the generator needs one, flag it.
6. **Docs.** `docs/design/enemies-and-stages.md` (purpose line "four stages, twenty enemies", the stage table rows for Stages 3 and 4 with their ambients, the wrap sentence "after Stage 4", the validator sentence unchanged), `docs/design/game-design.md` (stage list and ambients), `CHANGELOG.md` ("Stages 3 and 4: Toxic Slime Caverns and Ancient Catacombs, ten new enemies and two bosses, bubble and fog ambients; the stage cycle now wraps after Stage 4"). `README.md` only if it names the stage count.
7. **Local checks (human-owned).** F5 with `--disable-extensions`, simulator on with `simulatorAgentCount` 8, `pixelAgents.killsPerStage` 5 to cycle stages quickly: watch Stage 1 to 4 and the wrap back to Stage 1 (the fade each time, heroes' poses unchanged); 60 s DevTools recording at 8 heroes, a full wave, in Stages 3 and 4 (the ambient stages) at 60 fps; read every enemy by silhouette at three panel sizes; confirm fog does not hide a hero's face for long and bubbles do not read as damage; hide/show and "Developer: Reload Webviews" restore Stage 3 or 4 from the saved progress; a hand-set `stageIndex` 3 or 4 in a build before E2 wraps to Stage 1 or 2 (documented downgrade behavior, nothing to test by hand).
8. **Docs drift.** Flag in the handoff anything in [game engine](../game-engine.md) (stage and ambient lists, particle kinds), [data model](../data-model.md) (stage table, tuning groups), `CLAUDE.md` (new sprite files), or this plan that the code changed. The architect syncs before the tester finishes.
9. **Hand off to the tester** with section 7.
10. **Commit after reviewer Approve.** Roadmap E2 `Status: done` and summary row 9; one commit, for example `feat: add Stage 3 and 4 enemies, bosses, and ambients`; merge to `main` fast-forward. No push without the human.

## 7. Test notes for the tester

The game tests run on shipped art. Update the pinned counts first (they will fail the moment task 4 lands), then add coverage.

1. **Pinned counts to update (restate, do not loosen).** `enemyData.test.ts`: 20 rows, `STAGES.length` 4, "expected 20 enemies for 4 stages", the crafted-table cases still produce their fixed texts for stages 1 to 4; `combatParts.test.ts`: the `STAGES.length === 2` assertion becomes 4, the `StageDirector` cases that walk "stage 2" stay valid and gain one that walks to Stage 4 and wraps; `gameCombat.test.ts`: restate the stored-index wrap case (index 10 maps to Stage 2 of 4; add index 5 to Stage 1, 4 stays 4); `docsTables.test.ts`: "20 of 50", row counts, crafted `9 of 50` and `3 of 50` replacements; `enemyBundle.test.ts`: assert the bundle contains the new stage ids and enemy ids. The budget test keeps 200 and 520.
2. **Enemy table.** `validateEnemies(ENEMIES, STAGES)` is empty: 20 rows, 5 per stage, exactly one boss per stage, at least one minion per stage, unique kebab-case ids across all four stages, spot health values at cycle 0 and party 1 (18, 22, 16, 57, 219 for Stage 3; 25, 20, 27, 71, 295 for Stage 4) and the boss with eight fighters (755, 1019). `healthOf` stays monotone in stage, cycle, and (bosses only) party.
3. **Progression wrap.** With the shipped four stages: killing the Stage 4 boss sets `stageIndex` 1 and `cycle` + 1; Stages 1 to 3 advance without a cycle; `load` of `stageIndex` 5 to 10 wraps by `% 4`; counters are kept.
4. **Stage data and art.** `validateStages(STAGES, SHIPPED_ART)` is empty; each new stage has the required props, lights at most 8, the flame loops (`glowShroom` 2, `candelabra` 4), solid props only as alcove floor props at foot y 134; `validateArtSet(SHIPPED_ART)` is empty, which includes `validateEnemyArt` over 20 templates (tier sizes, animation sets, at most 12 colors, no forbidden animation name, one phase palette per boss with at most four master characters; `ENEMY_PHASE_PALETTES` keys are exactly the four boss ids). A Stage 3 and a Stage 4 enemy rasterize with their stage palette (extend the E1 check of [13.6](e1-enemies.md#136-sprite-cache-art-set-and-validators)). The master palette stays at most 48 (and, as delivered, 37). No hex and no `data:` URI in any new template file (extend the scanned list). Silhouettes of the eight regular enemies per stage pair are not all identical solid shapes (a cheap bounding-box and pixel-count distinctness check across the ten new enemies is enough; manual QA judges the rest).
5. **Ambients.** `Ambience` with `bubbles` and `fog` emits only its kinds at the configured rates (statistical bounds with a seeded rng), inside the corridor view and the stated y bands, with bubbles moving up and wisps drifting left; a throwing emit path is impossible by construction but a full pool simply drops. `Particles`: the old kind indices are stable, each new kind draws one `fillRect` with the sizes in section 5.1, a full pool never throws. Budget: 8 heroes, 12 enemies, 16 drops, 24 effects, 8 summons and a full particle pool stay within 200 bitmaps and 520 fills in Stages 3 and 4 as well (run the E1 budget test per stage).
6. **Hero invariants (extend, do not weaken).** The hero-invariant and E1 combat-isolation suites run once per stage: for each of the four stages, drive a wave and the boss, apply every host event and every combat stimulus, and assert `heroSnapshot()` is identical to a run with enemies off; a full 1 to 2 to 3 to 4 to 1 stage sequence (boss defeats, holds, fades, wrap, cycle + 1) leaves every hero's `x`, `y`, `phase`, `lifecycle`, and `classId` unchanged and no hero is removed; throwing from `Ambience.update` (new cases) and from `Enemy.draw` of a new enemy leaves the scene running. Only fighting heroes (`advance`, `attack`, `ability`) are ever flashed; summons are never in the fighter buffer or the enemy list (unchanged tests run per stage).
7. **Structural.** The seams are unchanged: `ENEMY_SIDE` and `HERO_SIDE` literal arrays need no edits; `data/enemies.ts` stays the only enemy numbers; the ban list scan passes over the new sprite files, `stages.ts`, `Ambience.ts`, `Particles.ts`, `tuning.ts` (watch `gauge`, `dead`, `damage`, `hurt`, `retreat` in art comments); the `Combat`, `Enemy`, `Boss`, `Progression`, and `StageDirector` sources should show no diff against E1 (not testable; the reviewer checks the diff).
8. **Existing suites stay green**, including M2 to E1 integration; the protocol and progress tests are untouched; `PROTOCOL_VERSION` is still 2 and `PROGRESS_SCHEMA_VERSION` still 1.
9. **Performance (soft).** Reuse the E1 node benchmark in Stages 3 and 4 (average under 1 ms per frame, fail above 4 ms). Real frame time is manual (task 7).
10. **Manual QA ([testing strategy section 7.3](../../engineering/testing-strategy.md)).** Ten new enemies readable by silhouette against their own stage and against Stage 1 and 2 siblings (the Wailing Ghost must not read as the Cave Bat; the Bone Soldier must not read as the Necromancer's skeleton summon); no enemy or ambient looks like a hero status effect; fog and bubbles stay calm and non-flashing; stage fades are dark and slow; colors read in the three panel sizes; the Stage 3 and 4 lights are visible but not harsh.

Not automated: rendered pixels, silhouette quality, real-canvas frame time.

## 8. Gates for E2

| Gate | E2 meaning |
|---|---|
| G1 | `npm run build`, `lint`, `typecheck` (all three projects), `test`, and `test:integration` pass |
| G2 | `npm run docs:tables` leaves no diff and lists 20 of 50 enemies |
| G3 | invariants intact (section 2); the hero-invariant suite passes per stage; notes 2 to 7 pass |
| G4 | no new packages; no image, audio, or font files |
| G5 | `CHANGELOG.md` entry; `enemies-and-stages.md` and `game-design.md` match the data; art docs match the art; [game engine](../game-engine.md) and [data model](../data-model.md) match the code |
| G6 | `CLAUDE.md` directory map lists the new sprite files (architect syncs on the developer's drift flag) |
| G7 | reviewer Approve; one commit; roadmap E2 ticked |

**Done when** ([roadmap E2](../../engineering/roadmap.md#e2-stage-3-toxic-slime-caverns-stage-4-ancient-catacombs), made concrete): G1 to G7 hold; `validateEnemies` passes for stages 1 to 4 (20 enemies); progression wraps after Stage 4 with `cycle + 1`; the hero-invariant test covers all four stages and the new ambients; the manual benchmark holds 60 fps with 8 heroes and a full wave in Stages 3 and 4.

## 9. Risks, assumptions, defaults

- **R1: atomic switch.** Rows without art, or art without rows, break `Game` or the validators (section 4). Mitigated by the wiring order; the developer's task 4 is a single step. If the artist wires early, the tree goes red until task 4; the fix is mechanical.
- **R2: vocabulary scan hits art prose.** The hero-side ban applies to every new sprite and data file. Toxic-theme words (gauge, damage, hurt, retreat, dead, dying, hp) are the likely accidents. The pixel-artist and developer re-read their files with the scan list in hand; the tester's structural test is the net.
- **R3: ambient particle cost.** Steady-state counts are small (about 14 bubbles, 24 wisps, 10 motes) and every particle is one `fillRect`, already inside the 520-fill ceiling because the ceiling assumes a full pool (384). Wisps are 6x2, which fills more pixels per rect than other kinds but does not add calls. If the manual benchmark shows overdraw cost, shrink wisps to 4x1 or lower `perSecond` (constants).
- **R4: fog legibility.** Low fog made of 6x2 rects in dim colours may read as dashes rather than haze. The fallback, in order: dim the ramp, lengthen life and slow drift, lower the rate. A drawn fog layer would need a new pass and is out of scope for E2.
- **R5: colour contrast.** Stage palettes recolor `1` to `8` for tiles, props, and enemies of that stage. A green slime on teal-green walls, or a bone-beige skeleton on bone-beige walls, will vanish. The artist keeps enemies brighter and more saturated than the floor and outlines every enemy in `o`; manual QA at three panel sizes checks it.
- **R6: boss duration.** With the E1 formula the Stage 4 boss has 295 health (1019 with eight fighters), about 115 s solo and about 50 s with eight heroes; Stage 1's boss takes about 47 s solo. That is working as designed ("by cumulative work") but may feel long with one hero. Tuning knob: per-row `vigor` (boss rows only), not the global formula. Re-tune by eye in the benchmark; do not change `HEALTH_GROWTH` in E2 (it is calibrated for ten stages).
- **R7: cycle semantics change.** A stored `cycle` was counted in 2-stage passes; it is now a 4-stage pass. Enemy health rises 25 percent per cycle (capped at 8), so a returning player's early stages get tougher by a few percent per past cycle. Accepted (decision E2-6); no migration, schema stays v1. E5 changes the meaning again.
- **R8: downgrade.** An E2 save with `stageIndex` 3 or 4 opened by an E1 build wraps to Stage 1 or 2 (`% 2`), keeps counters, and does not fail. Nothing to do.
- **R9: bundle size.** Ten enemies at 7 to 11 frames each plus two environments add several tens of KB of template strings. The tester records the production webview size; the standing assumption is under 300 KB through E5.
- **R10: photosensitivity.** No flashing is added. Stage 3's `glowShroom` light is a slow 2-frame pulse without flicker; Stage 4's `candelabra` uses the same flicker as torches and lanterns.
- **R11: the Necromancer's skeleton.** The Bone Soldier is an enemy and must differ from the allied skeleton summon (helmet, rusted sword, warm eyes versus the summon's green glow). Summons are never targets (unchanged); a confusing look would be a reviewer-visible problem.
- **Defaults chosen:** no new mechanic (no splitting, no ranged attacks, no status effects); enemy rows as in section 5.2; E1 formulas and constants unchanged; drops reuse the four E1 kinds; ambients are particle emitters only; the fog stage also emits motes; two new particle kinds appended; one commit; schema v1 and protocol 2 unchanged; the validator stays in incremental mode until E5.

## 10. Ownership split

| File or area | Owner |
|---|---|
| `src/game/sprites/stage3Templates.ts`, `stage4Templates.ts`, `enemiesStage3.ts`, `enemiesStage4.ts`, `oozeQueenTemplate.ts`, `tombLichTemplate.ts` (new), `palettes.ts` (stage char tables, particle ramps), `palettesE1.ts` (`STAGE_PALETTES`, `BOSS_PHASE_PALETTES`), `enemyTemplates.ts` and `spriteTemplates.ts` (barrel merges), `docs/design/art-style-guide.md`, `docs/design/sprite-spec.md` | pixel-artist |
| `src/game/data/enemies.ts` (rows), `data/stages.ts` (rows, `AmbientEffect`), `data/tuning.ts`, `Ambience.ts`, `Particles.ts`, `Renderer.ts` (colour map), `sprites/spriteValidator.ts` (`REQUIRED_PROPS`, `FLAME_PROPS`), `docs/design/enemies-and-stages.md`, `docs/design/game-design.md`, `CHANGELOG.md`, the roadmap E2 status lines, all git operations | developer |
| `test/**`, `docs/engineering/testing-strategy.md` | tester |
| this plan, `game-engine.md`, `data-model.md`, `roadmap.md` (except status), `docs/index.md`, `CLAUDE.md` (except Core invariants) | architect |

## 11. Art needs (batch E2)

Characters only, no hex; `.` is transparent; enemies face **left** and are never mirrored except while withdrawing (E1 rule); at most 12 colors per sprite; each stage's tiles, props, backdrop, and enemies use the eight stage characters `1` to `8` (recolored by `STAGE_PALETTES[stageId]`) plus master accents. Validate before handing over. Do **not** merge into the barrels until A-E2-6 (section 4). Avoid the banned words in comments (section 9, R2). Delivery in six steps, so the developer is never blocked long.

### 11.1 A-E2-1: shared additions

| Item | Where | Spec |
|---|---|---|
| Stage palettes | `palettesE1.ts` | `STAGE_PALETTES['toxic-slime-caverns']` and `['ancient-catacombs']`: `1` to `8`, plus `g` (ambient tint) and `T` (light). Meaning stays stable: 1 deepest shadow, 2 dark rock, 3 mid rock, 4 lit rock, 5 secondary material, 6 light source, 7 highlight, 8 accent. Stage 3: murky teal rock, slime and toxic accents, acid-green glow (`T` and `6`), `8` a bright slime accent; the clear color `n` stays master near-black. Stage 4: bone beige and dusty purple, candle amber or cold green-white for `6`, `8` a violet accent. Light colors must be readable but not harsh (additive over a dark ambient). |
| Stage character tables | `palettes.ts` | entries for both ids in `STAGE_TILE_CHARS` (`12345678`), `STAGE_CLEAR_CHAR` (`n`), `STAGE_AMBIENT_CHAR` (`g`). |
| Particle ramps | `palettes.ts` | `PARTICLE_PALETTE.bubble` (3 characters, bright to dim; toxic lime and teal from master `L N Q`/`q` is the default suggestion) and `.wisp` (3 characters, dim; grays and violets from master `G P g`). Widen the type union to include both. No new master characters (master 37, cap 48). |

### 11.2 A-E2-2: Stage 3 environment (`toxic-slime-caverns`, file `stage3Templates.ts`, export `TOXIC_SLIME_CAVERNS`)

Tiles: `wallTop` 2, `wallMid` 5 (4 cave wall plus 1 with transparent pixels, for example a pipe opening or slime-curtain gap, so the backdrop shows), `wallBase` 2, `floorBack` 3, `floorFront` 3, `foreground` 2; join rules as every stage (columns 0 and 15 identical, rows 0 and 15 identical for the stackable sets). Props per section 5.2 (`doorFrame`, `pipe`, `slimeDrape`, `glowShroom` with a 2-frame pulse, `toxicBarrel`, `slimePool`, `mushrooms`), ids `toxic-slime-caverns/<name>`; solid props foot-anchored at the base center; no pipe gauge or dial. Backdrop 128x128, tiling horizontally with period 64: dripping cavern arches with distant glowing growths. Mood: teal and acid green glow. Floor and wall must stay darker and less saturated than the Stage 3 enemies (R5).

### 11.3 A-E2-3: Stage 4 environment (`ancient-catacombs`, file `stage4Templates.ts`, export `ANCIENT_CATACOMBS`)

Same tile counts and rules. Props: `doorFrame`, `skullNiche`, `candelabra` (4-frame flame loop), `crackedPillar`, `sarcophagus` (solid, 16 px wide), `urn`, `boneRubble`; ids `ancient-catacombs/<name>`. Backdrop 128x128, period 64: long vaults and arches. The transparent `wallMid` variant could be a skull-niche recess or a barred arch. Mood: bone beige, dusty purple, candle glow. Keep the skull niches stylized and cute-spooky (no gore).

### 11.4 A-E2-4: Stage 3 enemies (file `enemiesStage3.ts`, export `ENEMIES_STAGE3`)

Each `enemies/<id>`, left-facing, foot anchor, animations `idle 2, walk 2, attack 3`, cute-spooky. Silhouettes must differ when filled solid black (check in the preview).

| id | Tier and size | Look | Silhouette cue |
|---|---|---|---|
| `green-slime` | minion 16x16 | a squat drop-shaped blob, big eyes, a small highlight; `attack` squashes forward | dome, no limbs |
| `spore-shroom` | minion 16x16 | a walking mushroom on stubby legs, spots on the cap, spores puff in `attack` | umbrella cap on a thin stem |
| `toxic-toad` | minion 16x16 | squat toad, wide mouth, warty back; `attack` lunges the tongue | wide horizontal body with hind legs |
| `jelly-cube` | elite 24x24 | a translucent-looking cube of jelly with something suspended inside, rounded corners; `attack` slams down | square block |

### 11.5 A-E2-5: Stage 4 enemies (file `enemiesStage4.ts`, export `ENEMIES_STAGE4`)

Same contract. `bone-soldier` minion 16x16 (a skeleton in a dented helmet with a rusty short sword and small shield; clearly not the Necromancer's skeleton summon: different helmet, warm amber eyes, tilted stance), `wailing-ghost` minion 16x16 (tattered sheet ghost with a big open mouth and trailing hem; floats; must differ from the Cave Bat), `tomb-scarab` minion 16x16 (a golden beetle with a segmented shell and small wings folded, low and wide), `crypt-mummy` elite 24x24 (a bandaged mummy with one trailing wrap, shuffling pose, arms forward but no raised fists above the head).

### 11.6 A-E2-6: the two bosses, then wiring

`ooze-queen` (file `oozeQueenTemplate.ts`) and `tomb-lich` (file `tombLichTemplate.ts`), boss 48x48, left-facing, animations `idle 2, walk 2, attack 3, telegraph 2, intro 2` (11 frames), a clearly different `telegraph` from `attack` so the player can read the wind-up. Ooze Queen: a large slime body wearing a drippy crown, bubbles rising inside; telegraph: she swells up and tips forward. Tomb Lich: a robed skeletal figure with a tall spiked crown and a staff holding a floating gem; telegraph: the staff rises and the gem brightens. One phase-2 palette each in `BOSS_PHASE_PALETTES` (at most four master-character overrides; same silhouette; phase 2 hotter or brighter, for example a pink-orange glow for the queen, a white-hot gem for the lich). Red and orange are allowed on enemies.

**Then wire** (the only step that edits the barrels): `enemyTemplates.ts` merges `ENEMIES_STAGE3`, `ENEMIES_STAGE4`, `ooze-queen`, `tomb-lich` into `ENEMY_SPRITES`; `spriteTemplates.ts` adds `'toxic-slime-caverns': TOXIC_SLIME_CAVERNS` and `'ancient-catacombs': ANCIENT_CATACOMBS` to `STAGE_SPRITES`; update the header comment. Hand the developer the final prop names.

### 11.7 What the engine draws itself (no art)

Hit flashes, dissolves, bars, shadows, the stage fade, drops (reused), bubbles and fog (from the ramps above), light maps. The artist never draws a hurt, downed, or poison frame for an enemy and never any frame, icon, or tint for a hero.

### 11.8 Docs the pixel-artist updates

[Art style guide](../../design/art-style-guide.md): Stage 3 and 4 characters and prop tables (as the Stage 1 and 2 sections), the two palettes, the delivered enemy table rows with silhouette cues, the two phase palettes, the two particle ramps, the master palette count (still 37). [Sprite spec](../../design/sprite-spec.md): the new template files and exports.

## 12. Decisions for the human

Each has a default so work can proceed.

| # | Question | Default chosen | Alternative |
|---|---|---|---|
| E2-1 | Enemy names and numbers | The ten rows in section 5.2 (ids and names mirrored by the artist; the developer may rename) | Human-chosen names |
| E2-2 | New enemy behaviors (splitting slimes, ranged attacks) | None. Slimes use the `hop` gait; ghosts `float`; everything else walks. All enemies attack with the E1 cosmetic timer | A data-driven `splits` variant of `Enemy` (spawns two small slimes on defeat): touches `Combat` spawn, kill credit, and the 12-enemy pool, so it needs its own plan and tests; revisit in a polish batch |
| E2-3 | Ambient implementation | Two new `AmbientEffect` kinds and two particle kinds (`bubble`, `wisp`), pure particle emitters; Stage 4 fog also emits motes through a `dustPerSecond` field | Reuse `mote` for everything (no engine change, but bubbles would not rise and fog would be dust); or a drawn fog layer (new render pass, out of scope) |
| E2-4 | Stage ids and names | `toxic-slime-caverns` "Toxic Slime Caverns", `ancient-catacombs` "Ancient Catacombs" (as in the roadmap) | none |
| E2-5 | Drops | Reuse `coin gem ore chest`; Stage 3 uses coin, gem, chest; Stage 4 uses coin, ore, gem, chest | New drop kinds with art (bones, slime orbs): more art and validator rows, no gameplay value (drops are decoration) |
| E2-6 | Cycle meaning after the wrap moves to Stage 4 | No migration; stored `cycle` simply continues (schema v1) | A v2 migration that halves old cycles (needs a store migration and tests for no benefit) |
| E2-7 | Health scaling | E1 formulas unchanged (x1.35 per stage); tune per-row `vigor` if a boss drags | A flatter curve (changes all stages, deferred to E5) |
| E2-8 | Boss gait | Both new bosses use `walk` | `hop` or `float` (a cosmetic bob on a 48x48 sprite looks odd; revisit in QA) |
| E2-9 | Art delivery order | Six steps A-E2-1 to A-E2-6 with barrel wiring last, then the developer's atomic switch | Developer adds rows with placeholder art (rejected: `Game` throws without real stage art) |
| E2-10 | Light behavior | `glowShroom` pulses without flicker; `candelabra` flickers like torches | Both flicker |

## 13. Architect doc pass (applied with this plan)

- New: this plan.
- [Roadmap](../../engineering/roadmap.md): E2 entry rewritten (plan link, scope, files, art steps A-E2-1 to A-E2-6, done-when). Status lines untouched.
- [Docs index](../../index.md): the plan row.
- Not changed now; the architect updates at as-built time on the developer's drift flag: [game engine](../game-engine.md) (ambient kinds, particle kinds, the four delivered stages), [data model](../data-model.md) (stage and enemy tables, tuning groups, `AmbientEffect`), `CLAUDE.md` directory map (the six new sprite files and the pixel-artist ownership rows).
- For the tester: [testing strategy](../../engineering/testing-strategy.md) sections on the per-stage hero-invariant runs and pinned counts. For the pixel-artist: section 11 and the sprite spec.

## 14. As-built notes (checked against the E2 working tree)

Drift check of the uncommitted E2 tree against sections 1 to 13. The design held; nothing below changes an invariant. [Game engine](../game-engine.md) and [data model](../data-model.md) were synced from these facts.

- **Atomic art-then-data switch was done as planned.** The new art files and palette tables landed first; the barrels were wired in one edit (`enemyTemplates.ts` merges `ENEMIES_STAGE3`, `ENEMIES_STAGE4`, `OOZE_QUEEN`, `TOMB_LICH`, and `BOSS_PHASE_PALETTES_E2`; `spriteTemplates.ts` adds `TOXIC_SLIME_CAVERNS` and `ANCIENT_CATACOMBS` to `STAGE_SPRITES`), then the `STAGES` and `ENEMIES` rows and the validator tables followed.
- **Wiring order, as built.** Particle ramps and engine additions (`ParticleKind`, `Ambience`, tuning constants, the `Renderer` color map) first; `REQUIRED_PROPS` and `FLAME_PROPS` entries next; art barrels; then the stage and enemy rows. No test art set was used.
- **Boss phase palettes live in `palettesE2.ts`** (`BOSS_PHASE_PALETTES_E2`), a new file, rather than in `palettesE1.ts` as section 10 assumed. The two stage palettes are in `palettesE1.ts` (`STAGE_PALETTES`), the particle ramps in `palettes.ts`.
- **Prop placements follow the Stage 2 grid.** Each new stage has 18 placements: the door frame, 8 alcove, and 9 corridor props, with 4 lights (two alcove, two corridor). The only solid is the alcove floor prop at foot y 134 with a 12 x 5 footprint (`toxicBarrel`, `sarcophagus`).
- **Glow shroom light flicker is false** (decision E2-10): `SHROOM_LIGHT` is radius 48, intensity 0.8, color char `T`, `flicker: false`. `CANDLE_LIGHT` is radius 52, intensity 0.8, `flicker: true`.
- **Ambience details.** Separate debts for bubbles, fog, and fog dust; the new accrual helper caps each debt at `max(1, perSecond)` (the guard planned in task 2; `drip` and `dust` keep their E1 uncapped debt). Fog emits `dustPerSecond` motes through the same mote emitter as `dust`. Emission x spans `CORRIDOR_X` to `INTERNAL_WIDTH`; bubbles are not scrolled.
- **Particles as built.** `bubble` is index 5 (2x2, `vx` jitter of 30 px/s^2 times a centered random, so it wobbles while `vy` stays negative); `wisp` is index 6 (6x2, `vy` jitter of 6 px/s^2, `vx` set by the emitter). One `fillRect` per live particle; older indices unchanged.
- **Tuning values** match section 5.1 exactly (`BUBBLE_*` and `FOG_*`, listed in the [data model tuning table](../data-model.md#5-animation-timings-and-tuning-m4)).
- **Enemy rows** match section 5.2 exactly (ids, tier, gait, vigor, pace, drop). The enemy table now has 20 rows; stage props, `REQUIRED_PROPS`, and `FLAME_PROPS` (`glowShroom` 2, `candelabra` 4) match sections 5.2 and 5.3.
- **Progress.** Unchanged: schema v1, `PROTOCOL_VERSION` 2, no migration. `cycle` now counts four-stage passes (decision E2-6).
- **Boss health arithmetic is an unmeasured estimate.** Ooze Queen 219 / 755 (solo / with eight fighters), Tomb Lich 295 / 1019, Stage 4 boss about 115 s solo and about 50 s with eight; all pending the manual benchmark.
- **Open at doc time.** Reviewer verdict, the human's local checks (task 7), and the commit.
