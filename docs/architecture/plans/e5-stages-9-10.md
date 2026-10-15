# E5 plan: Stage 9 Dragon's Lair, Stage 10 Void Spire (ten enemies, two stages, heat shimmer and void rifts, full 50-enemy contract, New Game+ after Stage 10)

Purpose: the detailed plan for batch E5, the last content batch of milestone M6: ten more enemies (three minions, one elite, and a boss per stage; 40 to 50 of 50), the last two stages with per-stage palette overrides, props, backdrops and ambients (calm heat shimmer; slow pulsing void rifts), the enemy validator switched from incremental mode to the full contract (10 stages, 50 enemies, 50 unique ids, 5 per stage, one boss per stage), the stage-growth decision that keeps the Stage 9 and 10 bosses from dragging, and New Game+ after Stage 10. E5 is data and art on the E1 to E4 machinery plus two small cosmetic engine additions (two ambient kinds, two particle kinds), one small `healthOf` change, and the validator rewrite. Written by the architect; the pixel-artist, developer, and tester work from it. Follows the layout of the [E4 plan](e4-stages-7-8.md), whose [section 14](e4-stages-7-8.md#14-as-built-notes-checked-against-the-e4-working-tree) (as-built facts) is the baseline, and the [E3 plan](e3-stages-5-6.md).
Related: [roadmap E5](../../engineering/roadmap.md#e5-stage-9-dragons-lair-stage-10-void-spire), [E4 plan](e4-stages-7-8.md), [E3 plan](e3-stages-5-6.md), [E1 plan](e1-enemies.md), [game engine](../game-engine.md), [data model](../data-model.md), [host-webview protocol](../host-webview-protocol.md), [ADR 0002 no hero health](../adr/0002-no-hero-health.md), [ADR 0009 hero lifecycle isolation](../adr/0009-hero-lifecycle-isolation.md), [ADR 0011 summons](../adr/0011-summons-are-leased-cosmetic-entities.md), [ADR 0012 host-owned versioned progress](../adr/0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and the hero reaction board](../adr/0013-enemy-health-and-hero-reaction-board.md), [ADR 0014 New Game+ and the full contract](../adr/0014-new-game-plus-is-the-ten-stage-loop.md), [enemies and stages](../../design/enemies-and-stages.md), [game design](../../design/game-design.md), [art style guide](../../design/art-style-guide.md), [sprite spec](../../design/sprite-spec.md), [testing strategy](../../engineering/testing-strategy.md), [CLAUDE.md](../../../CLAUDE.md).

Status: implemented, not yet committed (written against the tree at E4 commit a378ee5, branch `feat/e5-stages-9-10`; as-built facts checked against the working tree in [section 14](#14-as-built-notes-checked-against-the-e5-working-tree)). Sections 1 to 13 are the plan as written: the architect had no shell, so every number in them is hand-computed from the code and the E4 as-built figures, not measured, and the line numbers cited (for example `Stage.ts` line 267, or test lines in sections 5.4 and 7) refer to the tree at a378ee5. Section 14 holds the corrections. The fight lengths are estimates, the lever for each is named.

## 1. Goal

After E5 the party fights through all ten stages. Stage 9 (`dragons-lair`) and Stage 10 (`void-spire`) each bring an environment, three minions, an elite, a boss, and a calm ambient. Defeating the Stage 10 boss fades back to Stage 1 and counts one more cycle: that loop is New Game+, with enemy health scaled by the existing cycle factor. Enemies stay exactly as E1 to E4 built them: they walk in, stand, attack on a timer with a purely cosmetic hero flash, have health and a bar, and dissolve. **No new mechanic and no hero-side effect of any kind.**

- **Data**: 10 enemy rows (50 of 50), 2 stage rows, per-stage palette overrides, required-prop lists, four flame-prop rules, one health-curve constant pair (section 5.5), the full-contract validator constants.
- **Engine (cosmetic only plus the validator)**: `AmbientEffect` gains `shimmer` and `rifts`; `ParticleKind` gains `shimmer` and `rift` (appended after `murk`, indices 10 and 11); `Ambience`, `Particles`, and the `Renderer` colour map handle them; `healthOf` gains a tail-growth constant (Stages 1 to 8 stay bit-identical); `validateEnemies` loses its incremental mode. Nothing else in `src/game/` changes behavior.
- **Art**: two environments, ten enemy templates (eight regular, two bosses), two particle ramps, two stage palettes, two boss phase palettes, and the optional rework of seven legacy templates (A-E5-0). Master palette: zero new characters (section 9, R6).
- **Docs and tests**: the generated enemy table lists 50 of 50; the hand-written tests that pin "eight stages", "40 enemies", ten particle fixtures, the phase palettes, the incremental validator, and the decoration word lists are restated (section 7.1); the hero-invariant suite gains New Game+ looping (section 7.7).

Layers touched: data tables (`enemies`, `stages`, `tuning`), engine (`Ambience`, `Particles`, `Renderer` colour map), sprites, validator tables (`spriteValidator`), docs tooling output, tests. Not touched: the monitor, host, protocol, `PROTOCOL_VERSION` (2), `Progress` schema (v1), settings, CSP, `esbuild.mjs`, dependencies, `Combat`, `Enemy`, `Boss`, `Progression` (logic), `StageDirector`, `Engagement`, `Hero`, `Roster`, `ClassHero`, `World`, `Lighting`, `Stage.ts`, `Game` (one comment), `Drops`, the drop tables.

**Roadmap corrections made with this plan.** (1) The roadmap's "`stages.ts` New Game+ rule" is wrong: the rule already lives in `enemies.ts` (`CYCLE_HEALTH_GROWTH`, `CYCLE_CAP`, `healthOf`) and `Progression`; `stages.ts` gets rows and two `AmbientEffect` kinds only. (2) "60fps with 8+ heroes and 30+ enemies on screen" is read as in E3 and E4: 30+ distinct enemy types exist (50) and the on-screen pool stays 12 plus the boss (decision E5-8). (3) The stage exponent: the stage factor is `1.35^(stage - 1)`, so Stage 9 is `1.35^8` (11.03) and Stage 10 is `1.35^9` (14.89); the E4 numbers below already use this.

## 2. Invariant check

| Invariant | How E5 respects it |
|---|---|
| 1 Heroes invulnerable | No hero field, state, gauge, overlay, tint, icon, or reaction is added. Enemy attacks still write only to `HitReactions`. Dragon scales, fire colours, heat shimmer, void rifts, stars, and rings are decoration with no hazard semantics: nothing reads a prop name or ambient kind for gameplay, no prop or particle has a collider against heroes, no floor surface burns, drains, pulls, or slows anything (scenery rules, section 5.1). Art never draws scorch, glow, or a void look on a hero. New Game+ scaling touches enemy health only. |
| 2 Lifecycle from host events only | Stage change, boss defeat, the Stage 10 wrap, and `cycle + 1` touch only `Progression`, `StageDirector`, and `Combat`. Nothing reads or writes `Hero`, `Roster`, `AgentInfo`, or lifecycle. Ambient code reads only `world.stage.def.ambient`. The hero-invariant suite proves it across the full loop and across the cycle cap (section 7.7). |
| 3 Read-only monitor | Untouched. No protocol change. |
| 4 Crash isolation | New ambient code runs inside `Ambience.update` (inside the `Game.step` try/catch). A table that breaks the new full contract disables combat only (boot report, as today); stages and heroes keep running. Bad stage rows are still caught by `validateStages`. |
| 5 No external assets | Everything is palette-character templates in code. |
| 6 No runtime dependencies | None. |
| 7 Transcript privacy | `Progress` unchanged (six numeric fields). No string or agent data added. |

The enemy side still imports no hero code (ADR 0013). New health constants go in `data/enemies.ts` (enemy side), never in `tuning.ts` or `stages.ts` (hero side, ban-list scanned).

## 3. E4 assumptions audited against the code (what is hard-coded to eight stages or to incremental mode)

| Area | Finding at a378ee5 | E5 action |
|---|---|---|
| `Progression` wrap, `StageDirector`, `Combat` row selection, `killsPerStage` | Generic over `deps.stages.length` (`new Progression(deps.stages.length)`). `onBossDefeated` at `stageIndex >= stageCount` sets 1 and `cycle + 1` (saturating at `MAX_PROGRESS_COUNT`). | None. Ten rows move the wrap to Stage 10. |
| Stored `stageIndex` | `isProgress` accepts 1 to `MAX_STAGE_INDEX` (10). `Progression.load` maps `((max(1, i) - 1) % count) + 1`. With ten stages `count == MAX_STAGE_INDEX`, so every valid stored index is kept: 10 stays 10, there is no wrap to remap, and the loop point and the schema bound now coincide. | None in code. Add a guard test `STAGES.length === MAX_STAGE_INDEX` so an eleventh stage cannot slip past the schema (section 7.3). |
| Stored `cycle` | 0 to 1,000,000,000, never capped in storage; `healthOf` uses `min(max(0, cycle), CYCLE_CAP)` with `CYCLE_CAP` 8. | None. No cycle cap in storage (section 5.6). |
| `validateEnemies` | Incremental: expectations derived from `stages.length` (`5 * stages.length`, per-stage 5 and 1 boss). | Rewritten to the full contract (section 5.4). Part of the atomic switch. |
| `Game` constructor | `validateStages` throws on bad stage data; `validateEnemies(...).length === 0` else `onError(new RangeError('Enemy data is invalid'), 'boot')` and combat disabled. | None. This is the "startup behavior if invalid" and it already satisfies Core invariant 4. |
| Tests that build a `Game` from a shortened stage table | `test/game/heroInvariant.test.ts` (`gameRigWithStages([crowded])` passes one stage and `ENEMIES.filter(stage === 1)`, comment "the validator is exact") would report a boot error under the full contract and combat disabled. | Tester change (section 7.2). No production change. |
| `REQUIRED_PROPS`, `FLAME_PROPS` | Module-private in `spriteValidator.ts`, keyed by stage id and prop name. | Developer adds two entries and four flame rules in the switch step. |
| Prop frame timing | `Stage.ts` line 267: only the exact names `torch` and `lantern` get `TORCH_FRAME_MS` (130 ms); every other animated prop gets `PROP_FRAME_MS` (500 ms). A prop named `puddle` becomes a drip point. | Do not name any E5 prop `torch`, `lantern`, or `puddle`. All four new animated props then loop at 500 ms per frame (calm by construction). |
| Boss phase palettes | `validateEnemyArt` requires a non-empty phase palette for every boss row, rejects them on non-bosses, at most 4 single master characters with `#rrggbb`. | Two entries in a new `palettesE5.ts`; the switch cannot be half-done. |
| Stage character tables | `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR`, `STAGE_PALETTES` keyed by stage id. | Artist adds entries for both ids (A-E5-1). |
| Master palette | 37 colors, cap 48 in `validateArtSet`, batch cap 40. | Section 9, R6: E5 adds 0. |
| `AmbientEffect` / `Ambience` | Eight kinds; `assertNever` keeps the switch exhaustive; `#accrue` caps a debt at `max(1, perSecond)`, one debt field per kind. | Two new kinds and two debts; the compiler forces the edits. |
| `ParticleKind` | Ten kinds in `KIND_NAMES` (a `Uint8Array` index), `update` branches by `KIND_*` constants, `draw` picks size by kind name (one `fillRect` per live particle), `ArtSet.particlePalette` is `Record<ParticleKind, ...>`. | Append `shimmer` (10) and `rift` (11); artist adds both ramps first. |
| Draw ceilings | 200 bitmap draws and 520 fills (`combatBudget.test.ts`, `stageBudget.test.ts`), assuming a full particle pool (384). | None. Steady-state ambient counts are far below capacity (R3). |
| Look-alike test | `OVERLAP_LIMIT` 0.85, `IOU_LIMIT` 0.80, `SAME_STAGE_LIMIT` 0.75, `KNOWN_OVER` empty, `LEGACY_OVER` 11 pins, `BASELINE_IDS` 20 ids. A test forbids pinning a post-baseline enemy. | Applies unchanged to all ten new enemies. 24 minions, 8 elites, 8 bosses become 30, 10, 10 (section 9, R4). |
| Vocabulary scan | `HERO_SIDE_BANNED = /\b(hp\|health\|mana\|dead\|downed\|retreat\|damage\|gauge\|hurt\|dying)\b/i` over every `src/game/**` file outside the enemy side, including new sprite files, `stages.ts`, `tuning.ts`, `Ambience.ts`, `Particles.ts`; animation names also against `FORBIDDEN_ENEMY_ANIMATION` (`hit\|death\|dead\|die\|dying\|hurt\|downed`). | Section 9, R2 (dragon and void themes are the traps). |
| `docs:tables` | Generic; the test pins the header line `Delivered enemies: N of 50.` | Regenerate: 50 rows, `Delivered enemies: 50 of 50.` |
| Pinned counts | Section 7.1. | Tester restates. |
| `ENEMY_CAPACITY` | 12, equal to `MAX_MAX_ENEMIES` (protocol and `package.json`). | Unchanged (decision E5-8). |

Conclusion: nothing in the engine is hard-coded to eight stages. The coupling is data-level plus the validator rewrite, as in E2 to E4.

## 4. The atomic switch (ordering constraint)

`Game` builds with `SHIPPED_ART` and the real `STAGES`/`ENEMIES` in almost every test, and `new Game(...)` throws if any stage lacks art. Validators reject art for rows that do not exist, and rows without art or without a boss phase palette. The new validator is stricter still: **flipped before the rows exist, it would disable combat in the shipped game** (40 rows and 8 stages break the full contract). Therefore:

1. **Reworks of legacy templates (A-E5-0) are not part of the switch.** They replace shipped templates in place with the same ids, sizes, anchors, and animation sets; the tree stays green after each batch once the tester prunes the cleared `LEGACY_OVER` pins in the same change (stale pins fail).
2. The pixel-artist creates new files and the **palette-table entries** (stage tile/clear/ambient characters, `STAGE_PALETTES`, the two particle ramps) but **does not merge the new enemy templates into `ENEMY_SPRITES`, the new boss phase palettes into `ENEMY_PHASE_PALETTES`, or the new stages into `STAGE_SPRITES`** until the last art step (A-E5-6), which wires the barrels (`enemyTemplates.ts`, `spriteTemplates.ts`) in one edit. Phase palettes live in a new `palettesE5.ts` (`BOSS_PHASE_PALETTES_E5`).
3. The particle ramps (A-E5-1) and the engine additions (tasks 2 to 4) are independent of the switch and land first (`ArtSet.particlePalette` is `Record<ParticleKind, ...>`, so the ramps must exist before the type widens). The `healthOf` tail-growth edit (task 1) is also independent: it leaves Stages 1 to 8 bit-identical.
4. After A-E5-6 the developer does, in **one step (task 6)**: the two `STAGES` rows, the ten `ENEMIES` rows, the two `REQUIRED_PROPS` entries, the four `FLAME_PROPS` rules, **and the validator rewrite**; then runs the validators. These are deliberately not pre-landed: they read the artist's final prop names. Until then the tree stays green with E4 content and the incremental validator.
5. The tester's test edits that depend on the switch (counts, crafted tables, the full-table `crowded` rig) are prepared against the plan and land with the switch; they fail the moment task 6 lands in either direction, as in E4.

Tests run on shipped art; do not rely on a test art set.

## 5. Interfaces (signatures only)

### 5.1 Engine: two cosmetic ambients, two particle kinds, and the scenery rules

Decision E5-5 (reuse versus new kinds). Heat shimmer cannot reuse an existing kind: `ember` (Stage 6) is a bright warm 1x1 dot with a hot ramp, `mote` is the tan Stage 2 dust, and the ramp is per kind, not per stage. A real shimmer would warp the picture (per-row offsets in the renderer), which is a new mechanic with a performance and photosensitivity cost: rejected. The cheap faithful stand-in is a faint, tall, slow-rising particle: `shimmer`. Pulsing void rifts are mostly **props** (the `voidRift` 4-frame wall prop pulses at 500 ms per frame, a 2 s loop, 0.5 Hz, with the ordinary light entry); the ambient adds tiny stationary slits that pulse slowly through their colour ramp, which needs its own kind (`firefly` has the pulse shape but yellow-green colours; `murk` is Stage 8's and does not pulse): `rift`. Cheaper alternative (decision E5-5): Stage 9 `embers` at a low rate and Stage 10 `murk`, no engine work, but both stages would look like Stages 6 and 8 in the particle layer.

```ts
// src/game/data/stages.ts (changed)
export type AmbientEffect =
  | ... eight existing kinds unchanged ...
  /** Faint tall heat-haze streaks rising slowly from the floor band (E5, Stage 9). */
  | { readonly kind: 'shimmer'; readonly perSecond: number }
  /** Tiny stationary slits that pulse slowly in the mid band (E5, Stage 10). */
  | { readonly kind: 'rifts'; readonly perSecond: number };

// src/game/Particles.ts (changed): append so existing indices stay stable.
export type ParticleKind =
  'ember' | 'spark' | 'drip' | 'splash' | 'mote' | 'bubble' | 'wisp' | 'firefly' | 'snow' | 'murk'
  | 'shimmer' | 'rift';
// KIND_NAMES gains 'shimmer' (10) and 'rift' (11); KIND_SHIMMER, KIND_RIFT constants.
// update(): shimmer: vx jitter (rng - 0.5) * 10 * dt, vy unchanged (emitted upward, slow);
//           rift:    vx and vy jitter (rng - 0.5) * 4 * dt (almost stationary).
// draw(): shimmer is 1x3 (w 1, h 3), rift is 3x1 (w 3, h 1); still exactly one fillRect per live particle.
// Not sorted, not scrolled, no collision; a full pool drops emissions silently.

// src/game/Ambience.ts (changed): two new cases, each with its own debt (#shimmerDebt, #riftDebt) via #accrue.
//   shimmer: emit 'shimmer' at x in CORRIDOR_X..INTERNAL_WIDTH, y in SHIMMER_MIN_Y..SHIMMER_MAX_Y,
//            vx +-SHIMMER_DRIFT, vy -(SHIMMER_RISE_MIN..SHIMMER_RISE_MAX), life SHIMMER_LIFE_*; not scrolled.
//   rifts:   emit 'rift' at x in the corridor view, y in RIFT_MIN_Y..RIFT_MAX_Y, vx and vy +-RIFT_DRIFT,
//            life RIFT_LIFE_*; not scrolled.
// assertNever keeps the switch exhaustive.

// src/game/data/tuning.ts (changed, neutral names, first guesses tuned by eye):
//   SHIMMER_MIN_Y 100, SHIMMER_MAX_Y 156, SHIMMER_DRIFT 3, SHIMMER_RISE_MIN 5, SHIMMER_RISE_MAX 11,
//   SHIMMER_LIFE_MIN_MS 3000, SHIMMER_LIFE_MAX_MS 5000;
//   RIFT_MIN_Y 30, RIFT_MAX_Y 140, RIFT_DRIFT 2, RIFT_LIFE_MIN_MS 4000, RIFT_LIFE_MAX_MS 7000.

// src/game/Renderer.ts (changed): the particle colour map gains shimmer and rift (css(art.particlePalette.<kind>)).
// src/game/sprites/palettes.ts (artist): PARTICLE_PALETTE type union and table gain the two ramps (master characters only).
```

Stage rows (defaults; the developer sets positions after the real sprite sizes are known, re-running `validateStages`):

```ts
{ id: 'dragons-lair', index: 9,  name: "Dragon's Lair", props: [...], ambient: { kind: 'shimmer', perSecond: 8 } }
{ id: 'void-spire',   index: 10, name: 'Void Spire',    props: [...], ambient: { kind: 'rifts',   perSecond: 3 } }
```

Particle budget: steady state is rate times life: shimmer 8 x 4 s = about 32 live; rift 3 x 5.5 s = about 16 live; the pool is 384 and the draw ceilings already assume it full.

**Photosensitivity and calm rules (hard).** (1) No flashing: no ramp step shorter than 500 ms at the minimum configured life (shimmer `3000 / steps` with at least 3 steps gives at least 1000 ms; rift `4000 / 5` gives 800 ms). (2) The `shimmer` ramp is monotone dimming (bright to dim, no pulse), 3 or more steps, master characters only, none of `Y O R D w`; it is faint (low contrast against the Stage 9 floor, never brighter than the brightest enemy fill). (3) The `rift` ramp pulses once per life (for example dim, mid, pale, mid, dim: 5 steps), master characters only, none of `Y O R D w`, and adjacent steps differ in relative luminance by a modest ratio (the tester prints it; first guess at most 2.5, a tuning aid, not a pin); each slit is 3x1 px so the area is negligible, and slits are emitted at random times so there is no global beat. (4) Pulse cadence is far below 3 Hz: a rift pulse is one bright-and-dim cycle per life, 4 to 7 s (about 0.2 Hz); the `voidRift` and `orbitRing` props loop at 500 ms per frame (a 4-frame loop is 0.5 Hz, a 2-frame loop 1 Hz). (5) All new lights are `flicker: false`. (6) The Stage 9 brazier flame is a 4-frame loop at 500 ms per frame (2 s), calmer than the 130 ms `torch` (it must not be named `torch`).

**Scenery rules (cosmetic only; the hazard-free guarantee).** Fire, gold, shimmer, rifts, stars, and rings mirror the E3 lava and E4 ice rules.

1. Dragon, brazier, gold, rift, star, and ring art appear in the backdrop, in wall-layer props, and in floor tiles as pure decoration. There is **no** burning, draining, pulling, or slowing surface: no code reads a floor tile, prop, or particle for movement. Floor-layer props are limited to the four named `hoardPile`, `goldScatter`, `riftPedestal`, `crackedSlab` (the tester checks the floor-layer name set for the E5 stages against this list). No floor-layer prop name contains `lava`.
2. No prop or particle has a collider with a hero. The only solid props are the alcove floor props `hoardPile` and `riftPedestal` at foot y 134 with the 12x5 footprint (as `ruinedStatue`, `anvil`, `iceThrone`, `duskAltar`), so no seat or formation slot is blocked.
3. No code path reads `shimmer`, `rift`, a prop name, or a stage id to change a hero; the structural test extends the decoration word list (section 7.7).
4. **Tint rule.** The ambient tint `g` of each E5 stage is neither red-dominant (red at most 1.3 times the larger of green and blue) nor near-black (relative luminance at least 0.02). Stage 9 `g` is a warm sand-bronze that stays under the red limit; Stage 10 `g` is a dark slate-blue (not indigo, so it stays apart from Stage 8). Nothing multiplies a wash over a hero (the light map covers the environment only).
5. **Vocabulary.** Dragon fire, scorching, and the void must never be described as acting on a hero (section 9, R2).

### 5.2 Data: enemy rows

Default rows (ids and names are mirrored by the pixel-artist; numbers are tuning, decision E5-1). Health uses `healthOf`: tier base 10 / 24 / 120, times `vigor`, times the stage factor, cycle 0, party 1; a boss adds 35 percent per fighting hero beyond the first (x3.45 with eight). **With the recommended curve (section 5.5, option b) the Stage 9 and 10 stage factors are `1.35^7 * 1.05` = 8.5808 and `1.35^7 * 1.05^2` = 9.0098.** Pace to px/s: minion x26, elite x20, boss x14. All health values are hand-computed and rounded to nearest (plus or minus 1); **the developer reads the real values from `healthOf` and the tester pins those.**

| Stage | id | name | tier | gait | vigor | pace | drop | health (cycle 0, party 1) | px/s |
|---|---|---|---|---|---|---|---|---|---|
| 9 | `drake-whelp` | Drake Whelp | minion | walk | 0.6 | 0.9 | coin | 51 | 23.4 |
| 9 | `kobold-sapper` | Kobold Sapper | minion | walk | 0.65 | 1.0 | ore | 56 | 26 |
| 9 | `gilded-crown` | Gilded Crown | minion | float | 0.5 | 1.2 | coin | 43 | 31.2 |
| 9 | `ash-wyvern` | Ash Wyvern | elite | float | 0.75 | 0.8 | gem | 154 | 16 |
| 9 | `hoard-dragon` | Hoard Dragon | boss | walk | 0.5 | 0.5 | chest | 515 (about 1776 with eight fighters) | 7 |
| 10 | `crescent-drifter` | Crescent Drifter | minion | float | 0.5 | 1.0 | coin | 45 | 26 |
| 10 | `comet-tadpole` | Comet Tadpole | minion | hop | 0.55 | 1.4 | ore | 50 | 36.4 |
| 10 | `eye-strider` | Eye Strider | minion | walk | 0.6 | 0.8 | coin | 54 | 20.8 |
| 10 | `obelisk-sentinel` | Obelisk Sentinel | elite | float | 0.7 | 0.6 | gem | 151 | 12 |
| 10 | `void-sovereign` | Void Sovereign | boss | float | 0.5 | 0.6 | chest | 541 (about 1865 with eight fighters) | 8.4 |

Notes: all values are inside the current validator ranges (vigor 0.5 to 2, pace 0.5 to 1.6; the two bosses and `gilded-crown` and `crescent-drifter` sit exactly at the vigor floor, an accepted boundary case). Minions land at 43 to 56 (E4: 41 to 57) and elites at 154 and 151 (E4: 145 and 157). Drops reuse the four E1 kinds (decision E5-1). The Void Sovereign hovers (`float`, a cosmetic draw offset only, confirmed for bosses in E4).

Silhouette sources (so the artist and tester know the intent; the report command decides): **Drake Whelp**, an upright hatchling with a big head, stubby wing nubs, and an S-curled tail (asymmetric, not a low flat hull). **Kobold Sapper**, a small lizard-folk figure carrying a round powder keg overhead (a large circle above a thin body; the attack is a lunge, no blast is drawn). **Gilded Crown**, a floating spiked crown with two eyes under the rim (a wide band with comb-like spikes, very low overlap with solid hulls). **Ash Wyvern** (elite 24x24), a winged biped with wings spread wide and a long tail (a Y or bat-wing fan, unlike every older elite box, hunch, or tree). **Hoard Dragon** (boss 48x48), a dragon seated on a gold heap with wings raised in an M and the head lifted (wide at the top, unlike the six upright older bosses and the horizontal Mammoth). **Crescent Drifter**, a floating crescent body with a pale eye in the hollow (a C shape: low overlap by construction). **Comet Tadpole**, a round head with a long wavy tail trailing diagonally up and back (a diagonal streak, hops). **Eye Strider**, a big round eye on two long thin legs (a circle on stilts with an open gap below). **Obelisk Sentinel** (elite 24x24), a narrow pointed monolith with two small fragments orbiting at its sides (a tall slim rectangle with detached pieces, unlike the boxy golem). **Void Sovereign** (boss 48x48), a hovering cloaked figure, broad at the top with a crown of shards and tapering to a point below, a star-filled cleft in the chest, two detached hands (the only inverted-triangle boss; unlike the Tomb Lich, which is robed and widens toward the floor).

Vocabulary scan: none of these ids or names (`drake`, `kobold`, `sapper`, `crown`, `wyvern`, `dragon`, `crescent`, `comet`, `strider`, `obelisk`, `sentinel`, `sovereign`, `void`, `hoard`) hits the ban list. Names must not become identifiers that describe a hero state. Enemy gaits are only `walk`, `hop`, `float`. No splitting, no ranged attacks, no fire breath, no void pull, no effect on a hero (decision E5-1).

### 5.3 Stage props

At least 6 distinct props plus the door frame; at most 8 lights per stage; solids only as alcove floor props at foot y 134 with a 12x5 footprint. Do not name any prop `torch`, `lantern`, or `puddle` (section 3).

| Stage 9 `dragons-lair` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128, as every stage: a scorched stone arch with claw gouges |
| `scorchedPillar` | wall | a sooted column with claw scrapes, about 16x112 |
| `drakeSkull` | wall | a huge horned skull relief, decoration, about 16x40 |
| `hoardBrazier` | wall, 4-frame slow loop | a standing bronze brazier; light source (`T` warm gold, `flicker: false`), 500 ms per frame |
| `goldVein` | wall (wall-base band), 2-frame glint | a gold seam in the rock; a **slow** glint; weak light source (`flicker: false`) |
| `scaleBanner` | wall | a tattered banner with a scale pattern, decoration, about 16x48 |
| `hoardPile` | floor, solid in the alcove | a gold-and-gem heap, 16x16, foot y 134 |
| `goldScatter` | floor | a few loose coins and gems, decoration |

| Stage 10 `void-spire` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128: a black spire arch with a thin pale rift glow in the gap |
| `spirePillar` | wall | a dark column with a star inlay, about 16x112 |
| `voidRift` | wall, 4-frame slow pulse | a tall thin tear with a pale core that swells and fades over the loop; light source (`flicker: false`), 500 ms per frame (0.5 Hz) |
| `starWindow` | wall | a tall window onto stars, **static** (no twinkle), decoration |
| `orbitRing` | wall, 2-frame slow turn | a floating ring with two small beads orbiting; dim light source (`flicker: false`), 500 ms per frame |
| `riftPedestal` | floor, solid in the alcove | a squat black pedestal with a glowing seam, 16x16, foot y 134 |
| `crackedSlab` | floor | a cracked floor slab with faint glowing seams, decoration |

`REQUIRED_PROPS`: Stage 9 `scorchedPillar drakeSkull hoardBrazier goldVein scaleBanner hoardPile goldScatter doorFrame`; Stage 10 `spirePillar voidRift starWindow orbitRing riftPedestal crackedSlab doorFrame`. `FLAME_PROPS` gains `hoardBrazier: 4`, `goldVein: 2`, `voidRift: 4`, `orbitRing: 2`. Placement follows the Stage 6 to 8 grid (door frame at the door zone; alcove columns at x 0, lamp slots at (28,40) and (92,40), floor props at (6,134) solid 12x5, (60,152), (88,148); corridor lamp slots (60,40) and (252,40), pillars at 150 and 330, floor props at 100, 200, 300; corridor positions repeat every 384 px). Lights: Stage 9 two `hoardBrazier` plus one `goldVein` per zone (6 total), Stage 10 two `voidRift` plus one `orbitRing` per zone (6 total), both under the limit of 8. Light defaults: `hoardBrazier` radius 52 intensity 0.8; `goldVein` radius 40 intensity 0.5; `voidRift` radius 48 intensity 0.7; `orbitRing` radius 40 intensity 0.5; all `colorChar: 'T'`, `flicker: false`.

### 5.4 The validator: the full contract (what "incremental mode no longer exists" means)

```ts
// src/game/data/enemies.ts (changed, enemy side)
export const STAGE_COUNT = 10;          // equals MAX_STAGE_INDEX; a test asserts it
export const ENEMIES_PER_STAGE = 5;
export const ENEMY_COUNT = 50;          // STAGE_COUNT * ENEMIES_PER_STAGE
export function validateEnemies(rows: readonly EnemyRow[], stages: readonly StageDef[]): readonly string[];
```

The signature is unchanged. The expected counts are constants, no longer derived from `stages.length`. Checks, with fixed texts (the old texts stay where the rule is the same; new texts are exact so crafted tests can match them):

| Rule | Error text |
|---|---|
| `stages.length` is 10 | `expected exactly 10 stages, found N` |
| stage indexes are exactly 1 to 10 | `stage indexes must be 1 to 10` |
| `rows.length` is 50 | `expected 50 enemies for 10 stages` (same shape as the old text, now constant) |
| 50 distinct valid ids | per-row `enemy N: id is not kebab-case` / `duplicate id` (unchanged), plus `expected 50 unique ids, found N` |
| every row's stage exists | `enemy N: stage does not exist` (unchanged) |
| each stage has 5 rows, exactly 1 boss, at least 1 minion | `stage N: expected exactly 5 enemies, found M` / `expected exactly 1 boss, found M` / `needs at least 1 minion` (unchanged) |
| per-row ranges, tiers, gaits, drops | unchanged (`VIGOR_MIN` 0.5 stays under the default curve) |

It still never throws on junk input and never returns its input. The "three minions and one elite per stage" shape is a data convention checked by a tester table-shape test, not a validator rule (decision E5-10).

**Meaning for tests.** (1) The incremental cases disappear: `validateEnemies(rows.slice(0, 5), STAGES.slice(0, 1))` returning `[]` (enemyData.test.ts lines 260 to 261) becomes a failing case (`expected exactly 10 stages, found 1`). (2) The crafted-table suite is restated against the full 50-row table (mutate a row of `ENEMIES`, as today) and adds: nine or eleven stages; a stage-index gap; 49 and 51 rows; a duplicate id (also the new unique-count text); two bosses in one stage; zero bosses; the "thirty-nine or forty-one rows" case becomes forty-nine or fifty-one. (3) Any test that builds a `Game` from a shortened `stages` plus filtered `enemies` must use the full ten stages: for the `crowded` light-limit rig, `STAGES.map((s, i) => (i === 0 ? crowded : s))` with the real `ENEMIES`. (4) `gameLoop.test.ts` cases with bad or empty `stages` throw before `validateEnemies` runs and are unaffected. (5) `gameCombat.test.ts` "an invalid enemy table" (`ENEMIES.slice(0, 9)`) still holds and now also covers the shortened-by-one case `ENEMIES.slice(0, 49)`.

**Startup behavior when the table is invalid:** unchanged from E1. `Game` reports `RangeError('Enemy data is invalid')` once with scope `boot`, runs with combat disabled (no enemies, the timed rhythm), keeps stages and heroes running, and a later `applyConfig(enemies on)` cannot revive it. The shipped table is valid by test, so this is a guard only.

### 5.5 Health curve and the boss-length decision (the main tuning decision, E5-3)

Facts. `healthOf = max(1, round(tierBase * vigor * stageFactor * cycleFactor * partyFactor))`; `stageFactor = 1.35^(stage - 1)`; `cycleFactor = 1 + 0.25 * min(cycle, 8)`; `partyFactor` (bosses only) `1 + 0.35 * (min(party, 8) - 1)`; boss base 120. Stage 8 boss: vigor 0.5, the validator floor (`VIGOR_MIN`), already spent. Fight-length arithmetic uses the E3/E4 rates: each fighting hero lands one strike per 390 ms attack cycle (140 + 90 + 160), so about 2.55 health per second per hero, about 20.4 per second with eight (abilities ignored; intro, telegraph, and phase pauses add a few seconds). **These are estimates from arithmetic, unmeasured; the manual benchmark replaces them.**

Reference (existing, unchanged): Stage 4 boss 295 / 1019 (about 50 s with eight), Stage 6 boss 430 / 1485 (73 s), Stage 7 436 / 1504 (74 s), Stage 8 490 / 1692 (83 s; solo 192 s). Target for Stages 9 and 10: roughly 85 to 95 s with eight (a little above Stage 8), solo at most about 215 s.

| Option | Change | Stage 9 boss (solo / eight; time solo, eight) | Stage 10 boss (solo / eight; time solo, eight) | Worst case, Stage 10 at cycle cap (x3.0), eight | Existing health pins changed |
|---|---|---|---|---|---|
| none (vigor 0.5 at the floor) | nothing | 662 / 2284; 260 s, 112 s | 894 / 3083; 350 s, 151 s | 9249; 453 s | none, but the fights drag |
| **(a)** lower `VIGOR_MIN` to 0.25 (validator range) | rows use vigor 0.38 and 0.28 | 503 / 1736; 197 s, 85 s | 500 / 1726; 196 s, 85 s | 5179; 254 s | none for health; the range tests (`VIGOR_MIN` 0.5 boundary cases, "vigor out of range") move; Stage 9 and 10 regulars could also drop below 0.5 |
| **(b)** tail growth: 1.35 per stage through Stage 8, then 1.05 per stage | `HEALTH_GROWTH_LATE` 1.05 from Stage 9; vigor 0.5 and 0.5 | 515 / 1776; 202 s, 87 s | 541 / 1865; 212 s, 91 s | 5595; 274 s | **none** (Stages 1 to 8 are bit-identical); only new rows and docs |
| (b2) flatten earlier (growth 1.10 from Stage 7, vigors raised back) | same code, wider range | depends on vigors | depends on vigors | similar | Stage 7 and 8 rows (all ten health values, the E4 spot-value test, the data-model table, the 1504 and 1692 sentences) and Stage 9 and 10 |
| **(c)** boss health ceiling | `BOSS_BASE_CEILING` 540 applied to `tier * vigor * stage * cycle` before the party factor | 540 / 1863; 212 s, 91 s | 540 / 1863; 212 s, 91 s | 1863; 91 s at every cycle | boss pins with cycle >= 1 where the raw value exceeds 540: Stage 3 at cycles 7 to 8, Stage 4 at 4 to 8, Stage 5 at 3 to 8, Stage 6 at 2 to 8, Stage 7 and 8 at 1 to 8 (cycle 0 pins are unchanged) |

**Recommendation (default): (b), tail growth of 1.05 from Stage 9, bosses at vigor 0.5.** Tradeoffs:

- It changes no Stage 1 to 8 value, so no existing pin, doc table, or save-game feel moves; only new rows are added. The code change is one expression in `healthOf` plus two constants on the enemy side.
- It keeps vigor in the 0.5 to 1.0 band for regulars (option (a) would force regulars to 0.3 to 0.4 for the same effect, so "vigor" would stop meaning "a little tougher or softer than the tier base").
- Because heroes are invulnerable, stage growth buys no tension, only longer fights; flattening the tail costs nothing in feel.
- Cost: the Stage 9 and 10 bosses sit at the vigor floor again, so the lever can lengthen but not shorten a fight; the fallback if the benchmark says they are still too long is option (a) (lower `VIGOR_MIN`), a validator-range edit that touches no health pin. A second cost: the loop's difficulty curve is flatter at the end (Stage 10 regular health is 0.6 times what the 1.35 curve gave).
- It does not bound New Game+ bosses: at the cycle cap the Stage 10 boss takes about 274 s with eight heroes (cycle 1: 114 s, 2: 137 s, 4: 183 s). That is the intended "scaling", capped at 3.0 times by the existing `CYCLE_CAP`. If the human wants a time ceiling too, layering (c) on top of (b) (ceiling 540 before the party factor) caps every boss at about 91 s with eight at any cycle; its only side effect is that late bosses stop scaling in New Game+ (decision E5-3 alternative; default off).

Code shape (enemy side, in `data/enemies.ts`):

```ts
/** Per-stage health growth from Stage LATE_GROWTH_FROM_STAGE on (E5: the finale is flatter, decision E5-3). */
export const HEALTH_GROWTH_LATE = 1.05;
export const LATE_GROWTH_FROM_STAGE = 9;
// healthOf's stage factor: HEALTH_GROWTH ** (min(s, FROM - 1) - 1) * HEALTH_GROWTH_LATE ** max(0, s - (FROM - 1)), s = max(1, stageIndex).
// Stages 1..8 multiply by 1.05 ** 0 = 1, so their results are bit-identical to E4.
```

`HEALTH_GROWTH` (1.35) stays exported and pinned. The E4 remark "HEALTH_GROWTH stays calibrated for ten stages" is superseded by this section.

### 5.6 New Game+ and persistence

- **The rule.** After the Stage 10 boss: `stageIndex` 1, `killsInStage` 0, `cycle + 1`, a dark fade (the E1 path, `StageDirector` and `Progression` already generic). Enemy health uses `cycleFactor = 1 + 0.25 * min(cycle, 8)` (decision E5-4: keep as is; a ceiling of 3.0 times from cycle 8 on). No other scaling: speed, attack timing, drops, kills per stage, and ambient do not change in New Game+. No banner, label, or visual marker in E5 (M7's UI may show the cycle from `Progress.cycle`).
- **Stage-index handling verified.** `MAX_STAGE_INDEX` 10 equals the stage count. `Progression.load` keeps a stored 10 as 10 (`((10 - 1) % 10) + 1`); `isProgress` rejects 11 and above on the wire; a stored 9 or 10 from an E5 save opened by an E4 build wraps to 1 or 2 (`% 8`) and keeps its counters (harmless downgrade, ADR 0012 read-only rule is not even triggered because the schema version is unchanged). An E4 save opened by E5 is unchanged.
- **Cycle cap in storage: none needed.** `cycle` saturates at `MAX_PROGRESS_COUNT` (1e9) in `onBossDefeated`; its effect on health is capped at 8 inside `healthOf`. Cycles 9, 10, 11, ... are the same difficulty as 8 and are still counted. The health ceiling already exists (3.0 times); E5 adds no second ceiling by default.
- **Migration: none.** Schema v1, six integers, `PROTOCOL_VERSION` 2 are unchanged. Justification: the loop reuses the existing wrap and field; the only semantic drift is that a stored `cycle` earlier counted four-, six-, or eight-stage passes and now counts ten-stage passes, with the same formula, so earlier players meet the factor sooner (accepted, as in E4 R8). A rescaling migration would be a store change for no benefit and would put a first real step through the migration runner for a tuning detail (M7 owns v2). ADR 0014 records this.
- **Fight state is not persisted** (unchanged): leaving mid-boss restarts the stage's wave; the boss spawns again after `killsPerStage` kills.

## 6. Developer task list

Branch `feat/e5-stages-9-10`. No new packages. Do not commit before reviewer Approve. Tasks 2 to 4 need only A-E5-1; task 6 needs A-E5-1 to A-E5-6 (A-E5-0 is independent but recommended first).

0. **Start.** Set roadmap E5 `Status: in progress` (batch entry and summary row 12). Check: only those two lines changed.
1. **Health tail.** In `data/enemies.ts` add `HEALTH_GROWTH_LATE`, `LATE_GROWTH_FROM_STAGE` and the stage-factor expression (section 5.5); update the header comment and the `HEALTH_GROWTH` comment. Check: typecheck; `healthOf` for every existing row at cycles 0 to 2 and parties 1 and 8 equals the E4 values exactly (a script or the existing spot-value tests); a probe row at stages 9 and 10 gives the section 5.2 values after step 6.
2. **Particles and tuning.** Add `shimmer` and `rift` to `ParticleKind`, `KIND_NAMES` (appended), `update`, and `draw` (1x3 and 3x1); add the `SHIMMER_*` and `RIFT_*` constants to `tuning.ts`; add the two `Renderer` colour-map lines. Requires A-E5-1. Check: typecheck; a particle test emits each new kind and draws exactly one `fillRect`; old kind indices unchanged (`[... 'snow', 'murk', 'shimmer', 'rift']`).
3. **Ambience.** Extend `AmbientEffect` with `shimmer` and `rifts` (and the `stages.ts` doc comments), add the two cases with their own debts through `#accrue`, keep `assertNever`. Check: with a stage stand-in for each new kind, 10 simulated seconds emit about `perSecond * 10` particles of the right kind and never throw; a mid-run stage switch carries no runaway debt.
4. **Look-alike tooling check (read only).** Run `node test/support/lookAlikesReport.mjs` against candidate files as in the E4 plan "Report command"; no code change expected.
5. **Progress comments only.** Update the comments that say "E5 turns that into New Game+" (`Progression.ts` header, `shared/progress.ts` `cycle` and `MAX_STAGE_INDEX` comments, `Game.ts`, `enemies.ts` header) to the as-built wording. No logic change, no schema change. Check: diff is comment-only in `src/shared/` and `Progression.ts`.
6. **Switch on** (after A-E5-6), **one step**: append the two `STAGES` rows with props positioned against the real sprite sizes; the ten `ENEMIES` rows; the two `REQUIRED_PROPS` entries; the four `FLAME_PROPS` rules; **rewrite `validateEnemies` to the full contract** (section 5.4; add `STAGE_COUNT`, `ENEMIES_PER_STAGE`, `ENEMY_COUNT`; update the doc comment; remove the incremental wording). Check, in this order: `validateStages(STAGES, SHIPPED_ART)` empty (bounds, nav connectivity, at most 8 lights); `validateEnemies(ENEMIES, STAGES)` empty (50 rows, 10 stages, one boss each); `validateArtSet(SHIPPED_ART)` empty (includes the two boss phase palettes); `STAGES.length === 10 === MAX_STAGE_INDEX`; `Progression` of 10 stages wraps from Stage 10 with `cycle + 1` (no code change). Read the real health values from `healthOf` and, if a row is outside its target (section 9, R7), adjust only that row's `vigor` (bosses can only go up from 0.5 under the default).
7. **`docs:tables`.** Run `npm run docs:tables`; the generated region shows `Delivered enemies: 50 of 50.` and 50 rows. A second run leaves no diff; `--check` passes. The generator's "delivered so far" phrasing, if any, becomes final wording; flag any needed generator change.
8. **Docs.** `docs/design/enemies-and-stages.md` (purpose line "ten stages, fifty enemies", rows for stages 9 and 10 with their ambients, the wrap and New Game+ sentence "after Stage 10 the game wraps to Stage 1, counts one more cycle, and enemies start with up to 25 percent more health per cycle, capped at 3.0 times", the boss `vigor` and health sentence with the real eight-fighter values, a scenery-only sentence for fire, gold, shimmer, and rifts), `docs/design/game-design.md` (stage list, ambients, New Game+), `CHANGELOG.md` ("Stages 9 and 10: Dragon's Lair and Void Spire, ten new enemies and two bosses, heat shimmer and void rift ambients, a flatter late health curve; the enemy table is now validated against the full 50-enemy contract; after Stage 10 the game continues as New Game+ with scaled enemy health"). `README.md` only if it names the stage count.
9. **Local checks (human-owned).** F5 with `--disable-extensions`, simulator on with `simulatorAgentCount` 8, `pixelAgents.killsPerStage` 5: watch Stage 1 to 10 and the wrap into New Game+ (fade each time, heroes' poses unchanged), then a second pass to see cycle 1 enemies take longer; a 60 s DevTools recording at 8 heroes, a full wave (`maxEnemies` 12), in Stages 9 and 10 at 60 fps; read every enemy by silhouette at three panel sizes; confirm the shimmer reads as calm haze (not embers), the rift pulses are slow, and Stage 10 is dark but every hero class (Necromancer hood, Rogue slate, dark hair) stays readable; hide/show and "Developer: Reload Webviews" restore Stage 9 or 10 and the cycle.
10. **Docs drift.** Flag in the handoff anything in [game engine](../game-engine.md) (ambient and particle lists, delivered stages, the `healthOf` curve), [data model](../data-model.md) (stage table, tuning groups, `AmbientEffect`, boss health table rows 9 and 10, section 7 cycle meaning, section 8 validator text), `CLAUDE.md` (sprite files in the directory map), or this plan that the code changed. The architect syncs before the tester finishes and adds a section 14.
11. **Hand off to the tester** with section 7.
12. **Commit after reviewer Approve.** Roadmap E5 `Status: done` and summary row 12; one commit (A-E5-0 may be its own earlier commit, section 11.0), for example `feat: add Stage 9 and 10 enemies, full enemy contract, and New Game+ scaling`; merge to `main` fast-forward. No push without the human.

## 7. Test notes for the tester

The game tests run on shipped art. Update the pinned counts first (they fail the moment task 6 lands), then add coverage. Tester step **T-E5-0** (before the artist's first enemy file): extend `ambientSafety.test.ts`'s word list and file set to the E5 names (7.7), confirm `lookAlikesReport.mjs` accepts the new `file:Export:stage` arguments, and print the luminance table of section 7.8 for Stages 1 to 8 so the artist gets the self-calibrated limits (including the Necromancer-limited ceiling for Stage 9).

1. **Pinned counts to update (restate, do not loosen).**
   - `enemyData.test.ts`: 50 rows, `STAGES.length` 10, "expected 50 enemies for 10 stages" in every message regex (currently "expected 40 enemies for 8 stages"), the crafted-table cases per section 5.4, the row-list assertion for the ten new rows (id, name, tier, gait, vigor, pace, drop), `enemiesForStage(9|10)`, `bossFor(9|10)` ids, the boss-vigor assertions extended to the Stage 9 and 10 bosses; spot health values for the ten rows from the real `healthOf` at cycle 0, party 1, plus the two bosses with eight fighters (the section 5.2 numbers are hand estimates); the E1 to E4 spot-value tests stay and must pass unchanged (that is the proof that option (b) moved no pin); new: `HEALTH_GROWTH_LATE` 1.05 and `LATE_GROWTH_FROM_STAGE` 9 are pinned, the ratios of consecutive stage factors are 1.35 (up to Stage 8), then 1.05 and 1.05; `healthOf` monotone in stage over 1 to 10, in cycle, and (bosses only) in party; `CYCLE_*` pins unchanged.
   - `combatParts.test.ts`: the `STAGES.length === 8` assertion becomes 10 and "Stage 8 boss wraps" becomes Stage 10; the stored-index case restated for ten stages (`((i - 1) % 10) + 1`: 1 to 10 stay, 11 maps to 1, 12 to 2; the `Progression` loader is tested directly, the wire validator caps at 10); `bossesDefeated` expectation 10. Add the guard `STAGES.length === MAX_STAGE_INDEX`.
   - `gameCombat.test.ts` (line 180 area): the stored-index wrap case restated for ten stages; the invalid-table case also covers `ENEMIES.slice(0, 49)`.
   - `heroInvariant.test.ts` (`gameRigWithStages`): the crowded-lights rig builds a full ten-stage table (`STAGES.map((s, i) => (i === 0 ? crowded : s))`) with the real `ENEMIES`; remove the "one-stage test table" comment and the `ENEMIES.filter` argument; the assertions (`rig.errors` empty) hold again.
   - `docsTables.test.ts`: "50 of 50", 50 rows (`Delivered enemies: 50 of 50.`); the tamper cases that use `ENEMIES.length` keep working.
   - `heroInvariantStages.test.ts`: `BOSS_BY_STAGE` gains `hoard-dragon` and `void-sovereign`; `LAST_STAGE` 10 (the line 246 assertion); `order.slice(0, 9)` equals `[1..8, 1]` becomes `slice(0, 11)` equals `[1..10, 1]`; the fault arrays `stages: [3, 4, 5, 6, 7, 8]` (two places) gain 9 and 10 and the fault names list shimmer and rifts; titles say ten stages.
   - `heroInvariantAmbients.test.ts` and `stageBudget.test.ts`: `KINDS` ("all ten particle kinds", currently listing through murk) becomes twelve; the budget run covers Stages 9 and 10; hard-coded stage lists are reviewed and extended.
   - `ambience.test.ts`: the particle-kind name list gains `'shimmer'`, `'rift'`; the "shipped stage rows use the planned kinds and rates" case gains the two E5 rows; the size table gains `['shimmer', 1, 3]` and `['rift', 3, 1]`.
   - `particles.test.ts` and `spriteValidator.test.ts` (the `ParticleKind` union literal): gain the two kinds.
   - `stagesE2Art.test.ts` / `stagesE3Art.test.ts` / `stagesE4Art.test.ts` / `enemyArt.test.ts`: counts tied to "eight stages", "40 templates", or "exactly the eight bosses" (`ENEMY_PHASE_PALETTES` keys) become 10, 50, and the ten boss ids; the `STAGES.slice(0, 6)` "older props" comparison (stagesE4Art line 645) is extended to the first eight; E5-specific cases go in a new `stagesE5Art.test.ts`.
   - `enemyBundle.test.ts`: assert the bundle contains the two new stage ids and ten enemy ids; record the production webview size (section 9, R11).
   - `lookAlikes.test.ts` / `support/lookAlikes.ts`: `BASELINE_IDS` stays the 20 E1/E2 ids; no entry is added (a test forbids it); the matrix runs over 30 minions, 10 elites, 10 bosses (525 pairs). If A-E5-0 lands, `LEGACY_OVER` is pruned entry by entry (stale pins fail) down to empty.
   - `performance.test.ts`: no pinned count; rerun. The budget ceilings stay 200 and 520.
2. **Enemy table and validator (the "incremental mode no longer exists" tests).** `validateEnemies(ENEMIES, STAGES)` is empty: 50 rows, 10 stages, 5 per stage, exactly one boss per stage, at least one minion per stage, 50 unique kebab-case ids. Crafted tables, each with its exact fixed text (section 5.4): 9 and 11 stages (sliced / extended stage list); a stage-index gap; 49 and 51 rows; a duplicate id (per-row text plus the unique-count text); two bosses in one stage; no boss in a stage; a stage with 6 rows; a row for stage 11. The old "valid because it is a prefix of the full game" case (`rows.slice(0, 5)` with one stage) is deleted, replaced by "a prefix is now invalid". Junk input still returns errors and never throws. Table-shape test (not a validator rule): every stage has 3 minions, 1 elite, 1 boss. `Game` with the shipped table reports no boot error; `Game` with `ENEMIES.slice(0, 49)` reports exactly one boot error and runs with combat disabled.
3. **Progression and New Game+ looping.** With the shipped ten stages: killing the Stage 10 boss sets `stageIndex` 1 and `cycle` + 1; Stages 1 to 9 advance without a cycle; `load` of `stageIndex` 10 stays 10 (and 9 stays 9); counters are kept; the Stage 9 boss sets `stageIndex` 10 with no cycle; `cycle` saturates at `MAX_PROGRESS_COUNT` without throwing; `healthOf` at cycle 9, 50, and 1e9 equals cycle 8 for every row; `STAGES.length === MAX_STAGE_INDEX`. `isProgress` still rejects `stageIndex` 11 and accepts 10 (no schema change: `PROGRESS_SCHEMA_VERSION` 1, `PROTOCOL_VERSION` 2, six keys); a stored `{stageIndex: 10, cycle: 5}` round-trips through `ProgressStore` and `migrateProgress` (`stored`, no migration step runs).
4. **Look-alike policy.** `test/game/lookAlikes.test.ts` already reads wired art; the ten new enemies must pass: every same-size pair under 0.85 overlap and at most 0.80 IoU; same-stage minions under 0.75 overlap; no E5 enemy appears in `LEGACY_OVER` or `KNOWN_OVER`. A measured E5 failure is an art finding for the pixel-artist, never a pin. Named E5 pairs the tester prints first: Drake Whelp vs Rime Penguin, Ember Imp, Wailing Ghost, Spore Shroom; Kobold Sapper vs Goblin Miner, Snow Sentry, Bone Soldier; Gilded Crown vs Shard Cluster, Lantern Wraith, Bramble Pixie; Crescent Drifter vs Mirror Mimic and Shard Cluster; Comet Tadpole vs Frost Hare, Cave Bat, Toxic Toad; Eye Strider vs Mirror Mimic, Tomb Scarab, Web Spider (legs); Ash Wyvern vs the older elites (Gloom Stag, Snow Yeti, Furnace Guard, Rock Golem, Crypt Mummy, Ancient Treant); Obelisk Sentinel vs Rock Golem and Crypt Mummy; Hoard Dragon vs Elder Dryad, Molten Colossus, Rat King; Void Sovereign vs Tomb Lich, Eclipse Warden, Ooze Queen.
5. **Stage data and art.** `validateStages(STAGES, SHIPPED_ART)` is empty; each new stage has the required props, at most 8 lights (6 each as designed), the flame loops (`hoardBrazier` 4, `goldVein` 2, `voidRift` 4, `orbitRing` 2), solid props only as alcove floor props at foot y 134, floor-layer prop names limited to the four allowed (5.1 rule 1, none containing `lava`), no prop named `torch`, `lantern`, or `puddle`; `validateArtSet(SHIPPED_ART)` is empty, which includes `validateEnemyArt` over 50 templates and the boss phase palette for every boss (`ENEMY_PHASE_PALETTES` keys are exactly the ten boss ids, one phase each, at most four master characters, `#rrggbb`). A Stage 9 and a Stage 10 enemy rasterize with their stage palette. Master palette: 37 as delivered (at most 40, hard limit 48). No hex and no `data:` URI in any new template file (`palettesE5.ts` legitimately holds hex like `palettesE4.ts`). Silhouettes of the new enemies are not identical solid shapes (bounding-box and pixel-count distinctness across the ten rows).
6. **Ambients.** `Ambience` with `shimmer` and `rifts` emits only its kinds at the configured rates (statistical bounds with a seeded rng), inside the corridor view and the stated y bands; shimmer rises (y decreases while alive) and sways only slightly; rifts barely move (displacement over a life at most `RIFT_DRIFT * life` plus jitter bound). `Particles`: old kind indices stable, `shimmer` draws one 1x3 `fillRect`, `rift` one 3x1, a full pool never throws. **No flashing:** each ramp has at least 3 steps (rift 5) and no step is shorter than 500 ms at the minimum configured life; neither ramp contains `Y`, `O`, `R`, `D`, or `w`; the shimmer ramp is monotone in relative luminance; the rift ramp rises then falls once; the largest adjacent-step luminance ratio is printed (guide 2.5). Budget: 8 heroes, 12 enemies, 16 drops, 24 effects, 8 summons, and a full particle pool stay within 200 bitmaps and 520 fills in Stages 9 and 10 as well.
7. **Hero invariants, New Game+ looping, and scenery safety (extend, do not weaken).**
   - The hero-invariant and combat-isolation suites run once per stage (now ten) via `STAGE_INDEXES`: drive a wave and the boss, apply every host event and every combat stimulus, assert `heroSnapshot()` is identical to a run with enemies off.
   - **Full loop (replaces the 1 to 8 to 1 sequence):** a 1 to 10 to 1 sequence (boss defeats, holds, fades, wrap, cycle + 1) leaves every hero's `x`, `y`, `phase`, `lifecycle`, and `classId` unchanged, no hero is removed or recreated, and the hero rows of the live run equal the rows of a twin with `HitReactions.flash` muted (the E4 trace helper). Estimated sim time about 15 minutes at 8 heroes with `killsPerStage` 5; watch the suite's wall time (the loop limit of 3,600 s of simulated seconds is enough) and report it.
   - **New Game+ (new):** (a) a run that starts from stored progress `{stageIndex: 10, cycle: 1}` plays the Stage 10 boss at cycle 1, wraps to Stage 1 at cycle 2, and continues through Stage 2 with hero rows identical to an enemies-off twin; (b) a run from `{stageIndex: 10, cycle: 8}` crosses the cycle cap: `onProgress` reports cycle 9, the next Stage 1 enemies have `healthOf(row, 1, 8, 8)` health, and the hero rows are identical to an enemies-off twin throughout; (c) twin runs at cycle 0 and cycle 5 (same seed, same host script) produce identical hero rows (scaling changes fight length only); (d) a host event (`working`, `idle`, `despawned`, `spawned`) applied during the Stage 10 to Stage 1 fade, during the first New Game+ stage, and during a boss intro takes effect on the next update, identically to a run in Stage 1; (e) mid-loop reload: stored `{stageIndex: 10, cycle: n}` restores Stage 10 with the scene rebuilt from the host agent list and no hero state taken from progress.
   - **Scenery safety.** (a) Structural: in `ambientSafety.test.ts`, extend `DECORATION` with the new files (`stage9Templates.ts`, `stage10Templates.ts`, `enemiesStage9.ts`, `enemiesStage10.ts`, `hoardDragonTemplate.ts`, `voidSovereignTemplate.ts`, `palettesE5.ts`) and `DECORATION_WORDS` with `\bshimmer\b|SHIMMER_|\brifts?\b|RIFT_|dragons-lair|void-spire|scorchedPillar|drakeSkull|hoardBrazier|goldVein|scaleBanner|hoardPile|goldScatter|spirePillar|voidRift|starWindow|orbitRing|riftPedestal|crackedSlab`. **Do not add the bare words `void`** (the TypeScript operator `void` appears all over the tests and sources), **`star`, `ring`, `spire`, `gold`, `dragon`, `hoard`, `drift`** (`SNOW_DRIFT`, `FIREFLY_DRIFT`, hero drift), or the E4 traps `frozen`, `shadow`, `mirror`, `shard` (`Entity.frozen`, the flat shadow, the host-state mirror). `\brifts?\b` does not match `drift` (no word boundary inside it); keep it. The enemy-table check (the Ember Imp strip) gets a sibling that removes the ten new ids and names (`hoard-dragon` contains `hoard`, `void-sovereign` contains `void`) before asserting `enemies.ts` mentions no `shimmer|rift|spire|brazier` scenery words. (b) Behavioural: with the stage fixed at Stage 9 and at Stage 10, a heroes-only run and a run with ambients and lights at full density produce identical `heroSnapshot()` sequences. (c) Tint: the Stage 9 and 10 `g` values are not red-dominant (red at most 1.3 times max(green, blue)) and not near-black (relative luminance at least 0.02). (d) Nothing outside `Ambience.ts` reads the ambient kind (existing test).
   - Throwing from `Ambience.update` (new cases) and from `Enemy.draw` of a new enemy leaves the scene running. Summons are never in the fighter buffer or the enemy list (unchanged tests run per stage).
8. **Legibility (automated half; Stage 9 hot, Stage 10 dark).** Entities are drawn after the light map, so the risk is the environment's contrast, not a darkened hero. For each of the ten stages compute the mean relative luminance of the `floorBack` and `floorFront` tile frame 0 after multiplying by the stage ambient (`tile * g / 255` per channel) and print the table. Self-calibrating rules (the tester sets absolute numbers from the printed table, not from this plan): (1) **Hero-cloth contrast:** the WCAG contrast ratio between each floor mean and the `c` cloth colour of **all 12 classes** is at least 2.0 for Stages 9 and 10 (both floors). The Necromancer is the tightest. From the E4 measurements its cloth luminance is about 0.12 (about 2.46 against the Stage 8 floor and about 2.11 against Stage 7, both after the E4 tint fix, `g` `#7488b4` to `#64759b`; see [E4 plan](e4-stages-7-8.md) section 14), so the rule caps a lighter-than-cloth floor near 0.034: **Stage 9's floor mean must stay at or below about 0.034 even though the stage should read hot and bright; the brightness comes from the backdrop glow, gold accents, lights, and enemies, not from a bright floor.** (2) Stage 9 floor luminance is at most 130 percent of the brightest of Stages 1 to 8 (a looser bound than rule 1; rule 1 binds). (3) Stage 10 floor luminance is at least 70 percent of the darkest of Stages 1 to 9 (Molten Core, 0.0096, is the precedent). (4) **Distinct stages:** the mean floor colour (RGB after tint) of Stage 9 differs from every other stage, and of Stage 10 from every other stage, by at least the smallest pairwise distance already present among Stages 1 to 8 (Stage 9 vs Molten Core and Stage 10 vs Shadow Realm are the pairs to watch). (5) The ratio of a stage's mean enemy fill luminance (non-outline pixels of its five enemy idle frames) to its floor luminance is at least 2.0. A failing rule is an art finding, not a pin. **No outstanding finding on older stages:** after the E4 tint fix the Necromancer measures about 2.11 on Stage 7 and about 2.46 on Stage 8, so Stages 1 to 8 already meet the 2.0 rule (the tester's printed table confirms it; a lower number would be a new art finding, not a pin). The lower bound for Stage 9 and 10 cloth contrast is **at least 2.0 for all twelve classes against both floors**; the Necromancer is the binding class.
9. **Animation motion.** For the new props and enemies, the pixel difference between consecutive idle frames is no larger than the maximum already shipped (`ooze-queen` 466 changed pixels is the E4 record; the tester re-measures and records it). `hoardBrazier`, `voidRift`, `goldVein`, and `orbitRing` use `PROP_FRAME_MS` (500 ms): assert the stage code gives them 500 ms and that none is named `torch` or `lantern`. Boss `telegraph` and `attack` animations differ for both new bosses; the phase-2 palette is applied once.
10. **Structural.** The seams are unchanged: `ENEMY_SIDE` and `HERO_SIDE` literal arrays need no edits; `data/enemies.ts` stays the only enemy numbers (the late-growth constants live there, not in `tuning.ts`); the ban-list scan passes over the new sprite files, `stages.ts`, `Ambience.ts`, `Particles.ts`, `tuning.ts` (words to watch in section 9, R2). `Combat`, `Enemy`, `Boss`, `Progression` (logic), `StageDirector` show no diff against E4 (the reviewer checks the diff; comments excepted).
11. **Existing suites stay green**, including M2 to E4 integration; protocol and progress tests untouched; `PROTOCOL_VERSION` still 2, `PROGRESS_SCHEMA_VERSION` still 1.
12. **Performance (soft).** Reuse the E1 node benchmark in Stages 9 and 10 (average under 1 ms per frame, fail above 4 ms). Add a case at the maximum configuration: `maxEnemies` 12, eight fighters, boss on screen, Stage 9 and 10 lights (6) and ambients on. Record boot time with ten stage runtimes built. Real frame time is manual (task 9). Record the production webview bundle size (R11).
13. **Manual QA ([testing strategy section 7.3](../../engineering/testing-strategy.md)).** Ten new enemies readable by silhouette against their own stage and older siblings; no shimmer streak, rift slit, or enemy looks like a hero status effect, a hit spark, or an ember; the heat shimmer is calm and the rift pulses are slow; Stage 9 reads hot and bright but every class stays legible against the floor (Necromancer, Rogue, Mage); Stage 10 is dark but not unreadable; stage fades are slow; lights are visible but not harsh; the Hoard Dragon and Void Sovereign telegraphs read differently from their attacks; New Game+ gives visibly longer fights without any hero change.

Not automated: rendered pixels, silhouette quality, real-canvas frame time.

## 8. Gates for E5

| Gate | E5 meaning |
|---|---|
| G1 | `npm run build`, `lint`, `typecheck` (all three projects), `test`, and `test:integration` pass |
| G2 | `npm run docs:tables` leaves no diff and lists 50 of 50 enemies |
| G3 | invariants intact (section 2); the hero-invariant suite passes per stage (ten) and for New Game+ looping (note 7); scenery safety passes; notes 2 to 10 pass |
| G4 | no new packages; no image, audio, or font files |
| G5 | `CHANGELOG.md` entry; `enemies-and-stages.md` and `game-design.md` match the data; art docs match the art; [game engine](../game-engine.md) and [data model](../data-model.md) match the code |
| G6 | `CLAUDE.md` directory map and ownership rows match the repo (architect syncs on the developer's drift flag) |
| G7 | reviewer Approve; commit(s) per section 6 task 12; roadmap E5 ticked |

**Done when** ([roadmap E5](../../engineering/roadmap.md#e5-stage-9-dragons-lair-stage-10-void-spire), made concrete): G1 to G7 hold; the startup validator enforces exactly 10 stages, 50 enemies, 50 unique ids, 5 per stage, exactly one boss per stage, and the incremental mode no longer exists (crafted-table tests); progression wraps after Stage 10 with `cycle` + 1 and New Game+ looping is covered by the hero-invariant test (note 7); shimmer, rifts, fire, gold, and every other stage decoration cannot affect hero state; look-alike policy holds for all ten new enemies; the legibility rules (note 8) hold; the manual benchmark holds 60 fps with 8 heroes and a full wave of 12 enemies plus a boss in Stages 9 and 10 (50 distinct enemy types exist; the on-screen pool stays 12, decision E5-8); the generated enemy table lists all 50.

## 9. Risks, assumptions, defaults

- **R1: atomic switch.** Rows without art, art without rows, a boss row without its phase palette, or the validator flipped early break `Game` or the validators (section 4). Mitigated by the wiring order; task 6 is a single step.
- **R2: vocabulary scan (what it actually matches).** The hero-side ban is a word-boundary regex over `hp health mana dead downed retreat damage gauge hurt dying` and it covers every new sprite file, `stages.ts`, `tuning.ts`, `Ambience.ts`, `Particles.ts`. Dragon and void themes are the traps: "dragon fire damage", "scorching damage", "burn hurt", "void drain", "drains health", "dying star", "dead stars", "a dying light", "deadly", "retreating rifts", "mana rift", "hp" in a name, "gauge" in "heat gauge". Use "scorched", "sooted", "glinting", "dimming", "fading", "pulsing", "swelling", "banked" instead. Enemy-only words (`health`, `damage`) stay in `enemies.ts`, `Combat.ts`, `Enemy.ts`, `Boss.ts`. The new late-growth constants and comments live in `enemies.ts`. **Hero vocabulary rule:** no E5 file may describe a hero as burned, scorched, drained, pulled, or lit by anything; fire and the void are scenery and enemy art only. Do not name any animation anything containing `hit`, `death`, `dead`, `die`, `dying`, `hurt`, `downed`. The structural test is the net, not the plan.
- **R3: ambient particle cost.** About 32 shimmer and 16 rift particles at steady state, one `fillRect` each, inside the 520-fill ceiling. If the manual benchmark shows overdraw cost, lower `perSecond` (constants only).
- **R4: look-alike pressure and the silhouette budget (the main art risk).** After E5 there are 30 minions at 16x16, 10 elites at 24x24, and 10 bosses at 48x48 (525 same-size pairs; the batch adds 193: 159 minion pairs, 17 elite pairs, 17 boss pairs). Stage palettes recolor each stage to one colour family, so shape is the only separator within a stage. The cues in section 5.2 are chosen to be unlike anything shipped: a *spiked band* (Gilded Crown), a *C shape* (Crescent Drifter), a *circle on stilts* (Eye Strider), a *diagonal tadpole streak* (Comet Tadpole), a *keg over a thin body* (Kobold Sapper), a *wing fan* (Ash Wyvern), a *slim monolith with detached pieces* (Obelisk Sentinel), and two bosses that are wide-at-the-top (Hoard Dragon) and inverted-triangle (Void Sovereign). The pairs most likely to bite: Drake Whelp vs Rime Penguin and Ember Imp (small rounded upright masses), Kobold Sapper vs Goblin Miner (a small walking figure), Comet Tadpole vs Frost Hare, Hoard Dragon vs Elder Dryad (a wide crown of raised wings vs branches), Void Sovereign vs Tomb Lich (a crowned robed figure). **The artist runs the report before drawing and after each file** (section 11, "Report command"). The fallback ladder if a pair cannot clear after two attempts: change the pose, then the part layout, then escalate to the architect (a 64x48 boss is last, E5-7).
- **R5: the 11 legacy pairs (art debt) and the rework batch A-E5-0 (recommended, decision E5-6).** All are among E1/E2 enemies, pinned in `LEGACY_OVER` with their measurements (overlap / IoU): `cellar-rat` vs `cave-bat` 0.856 / 0.686; `cellar-rat` vs `web-spider` 0.830 / 0.564; `cellar-rat` vs `ore-beetle` 0.862 / 0.718; `cave-bat` vs `web-spider` 0.802 / 0.582; `cave-bat` vs `ore-beetle` 0.856 / 0.723; `web-spider` vs `ore-beetle` 0.896 / 0.674; `crate-mimic` vs `rock-golem` 0.922 / 0.728; `crate-mimic` vs `crypt-mummy` 0.897 / 0.623; `rat-king` vs `tomb-lich` 0.873 / 0.605; `goblin-miner` vs `goblin-scout` 0.874 / 0.671; `rock-golem` vs `crypt-mummy` 0.869 / 0.692. The smallest in-place rework that clears all 11 (same ids, sizes, anchors, animation sets, so no data or switch change) is seven templates in two batches: A-E5-0a `cellar-rat`, `cave-bat`, `ore-beetle`, `goblin-scout`; A-E5-0b `crate-mimic`, `crypt-mummy`, and `tomb-lich` (or `rat-king`; the lich is preferred because the Void Sovereign must also stay apart from it and it is not a Stage 1 sprite). **Recommended now, before the table is frozen at 50:** this is the last enemy batch (U1 art is UI only), so the debt would otherwise ship permanently; it must run before the E5 enemies are drawn so they are checked against the final silhouettes; three of the seven are Stage 1 enemies, so the first stage a player sees visibly changes (pair with the pre-release polish, or accept the reskin). Alternative: defer to a pre-release polish pass, with the debt permanent in the 50-enemy table. After each batch the tester prunes the cleared pins in the same change; the reworked templates must also clear every E3 to E5 enemy.
- **R6: master palette budget.** 37 of 48. **E5 adds 0 characters by default, hard cap 40 of 48.** The remaining slots must still cover U1 UI glyphs. E5 needs none: `STAGE_PALETTES` overrides `1` to `8`, `g`, `T` per stage; the shimmer ramp uses existing warm master characters (for example `a`, `C`, `Z`, or `V`, `W`; none of `Y O R D w`); the rift ramp uses `P g m b` style indigo and gray characters (no `w`); boss phase palettes override characters that already exist. Any new character is asked for in the handoff with the reason.
- **R7: boss and minion durations (the main tuning risk).** Section 5.5 holds the arithmetic and the recommendation. Default row values give Stage 9 and 10 bosses about 87 s and 91 s with eight heroes and about 202 s and 212 s solo, regulars 43 to 56 health and elites 151 and 154. **All are unmeasured estimates from arithmetic; the lever is each row's `vigor` (bosses can only go up from 0.5), then `HEALTH_GROWTH_LATE`, then option (a) `VIGOR_MIN`.** Phase transitions, intro, and telegraphs add some seconds per boss. Abilities (power 2, up to three targets) make real fights somewhat shorter than the strike-only estimate.
- **R8: cycle semantics.** A stored `cycle` counted passes of four, six, or eight stages; it now counts ten-stage passes with the same health formula. Early cycles stay cheap (cycle 1 is x1.25) and the effect saturates at x3.0 at cycle 8. Accepted (decision E5-4); no migration, schema stays v1 ([ADR 0014](../adr/0014-new-game-plus-is-the-ten-stage-loop.md)).
- **R9: downgrade.** An E5 save with `stageIndex` 9 or 10 opened by an E4 build wraps to Stage 1 or 2 (`% 8`), keeps counters and `cycle`, and does not fail. Nothing to do.
- **R10: photosensitivity, motion, and legibility.** No flashing is added (section 5.1 hard rules). Stage 10 is dark and Stage 9 is warm, so the self-calibrating luminance and class-cloth rules (note 8) apply; the Necromancer rule (contrast at least 2.0 for all twelve classes) caps the Stage 9 floor near mean luminance 0.034, so Stage 9 is hot only through backdrop, lights, and gold accents (the artist is told up front, section 11.1). Phase-2 palettes switch **once** at the half-health transition, never repeatedly, and neither may produce a large bright area (Stage 10 is dark). The later reduce-motion setting (M7) should suppress shimmer and rifts; a note for M7.
- **R11: bundle size.** E4 measured 231.5 KB (204.5 KB at E3, so +27 KB per batch). E5 adds ten enemies at 7 to 11 frames plus two environments, so expect about 255 to 260 KB, over the 250 KB flag line and under the 300 KB assumption and the 400 KB hard limit. The tester records it; if above 250 KB the handoff flags it for M7 to M9 (a compact frame encoding is the lever, owned by a later plan). A-E5-0 reworks are size-neutral.
- **R12: validator rewrite blast radius.** Any test or tool that builds a `Game` from a shortened stage table now gets a boot error and disabled combat. Known: `heroInvariant.test.ts` (`gameRigWithStages`). The tester greps for `stages,`/`stages:` rigs and `deps.enemies` overrides before the switch lands.
- **R13: look of the finale.** Stage 9's warm palette must stay apart from Stage 6 (Molten Core) and Stage 10's dark palette apart from Stage 8 (Shadow Realm): rule 4 of note 8 is the automated half; manual QA checks that a player can tell the stages apart at a glance. Stage 9 uses sand-bronze, gold, and dark red-brown stone with teal accents; Stage 10 uses dark slate-blue with pale magenta-white and cyan rift glows (not indigo and violet).
- **Defaults chosen:** no new mechanic and no hero overlay; rows as in section 5.2; tail growth 1.05 from Stage 9 and all existing health values unchanged; New Game+ is the existing wrap with the existing cycle factor (cap 8, ceiling 3.0 times), no migration, no marker; two new ambient kinds and two new particle kinds (indices 10 and 11); full-contract validator with constant counts; legacy look-alike rework done first (A-E5-0); no 64x48 boss; zero new master characters; the pool stays 12; one feature commit (plus the optional A-E5-0 commit); schema v1 and protocol 2 unchanged.

## 10. Ownership split

| File or area | Owner |
|---|---|
| `src/game/sprites/stage9Templates.ts` (`DRAGONS_LAIR`), `stage10Templates.ts` (`VOID_SPIRE`), `enemiesStage9.ts` (`ENEMIES_STAGE9`), `enemiesStage10.ts` (`ENEMIES_STAGE10`), `hoardDragonTemplate.ts` (`HOARD_DRAGON`), `voidSovereignTemplate.ts` (`VOID_SOVEREIGN`), `palettesE5.ts` (`BOSS_PHASE_PALETTES_E5`) (new), `palettes.ts` (stage char tables, shimmer and rift ramps), `palettesE1.ts` (`STAGE_PALETTES`), `enemyTemplates.ts` and `spriteTemplates.ts` (barrel merges, last), in-place edits to the seven legacy templates (A-E5-0), `docs/design/art-style-guide.md`, `docs/design/sprite-spec.md` | pixel-artist |
| `src/game/data/enemies.ts` (rows, late-growth constants, `healthOf`, `validateEnemies`, header comments), `data/stages.ts` (rows, `AmbientEffect`), `data/tuning.ts`, `Ambience.ts`, `Particles.ts`, `Renderer.ts` (colour map), `sprites/spriteValidator.ts` (`REQUIRED_PROPS`, `FLAME_PROPS`), comment updates in `Progression.ts`, `shared/progress.ts`, `Game.ts`, `docs/design/enemies-and-stages.md`, `docs/design/game-design.md`, `CHANGELOG.md`, the roadmap E5 status lines, all git operations | developer |
| `test/**` (incl. new `stagesE5Art.test.ts`, the E5 ambient, legibility, validator, and New Game+ cases, `ambientSafety.test.ts` edits, the `heroInvariant.test.ts` rig fix, `LEGACY_OVER` pruning), `docs/engineering/testing-strategy.md` | tester |
| this plan, ADR 0014, `game-engine.md`, `data-model.md`, `roadmap.md` (except status), `docs/index.md`, `CLAUDE.md` (except Core invariants) | architect |

## 11. Art needs (batch E5)

Characters only, no hex (except `palettesE5.ts` phase palettes and the stage palette values in `palettesE1.ts`); `.` is transparent; enemies face **left** and are never mirrored except while withdrawing (E1 rule); at most 12 colors per sprite; each stage's tiles, props, backdrop, and enemies use the eight stage characters `1` to `8` (recolored by `STAGE_PALETTES[stageId]`) plus master accents. Validate before handing over. Do **not** merge the new templates into the barrels until A-E5-6 (section 4); A-E5-0 edits are in place and may land earlier. Avoid the banned words in comments (R2). The look-alike policy applies to every enemy.

**Report command (give the artist this up front; run it before drawing to see the silhouettes to avoid, and after every enemy file).** From the repo root:

```text
node test/support/lookAlikesReport.mjs
node test/support/lookAlikesReport.mjs src/game/sprites/enemiesStage9.ts:ENEMIES_STAGE9:9
node test/support/lookAlikesReport.mjs src/game/sprites/enemiesStage9.ts:ENEMIES_STAGE9:9 src/game/sprites/enemiesStage10.ts:ENEMIES_STAGE10:10
```

With no arguments it prints the matrix for the wired 40 enemies (use it first to see which 16x16, 24x24, and 48x48 hulls are crowded). With `file:Export:stage` arguments it adds the new template maps (or replaces by id), prints only pairs involving them with the policy verdict (overlap, IoU, `same-stage` flag), and exits 1 on a violation. The numbers to beat: overlap under 0.85, IoU at most 0.80, same-stage minions under 0.75. Single-template boss files go through a scratch wrapper map, as in E4.

### 11.0 A-E5-0: legacy look-alike rework (recommended, two batches)

Redraw in place with the same ids, tier sizes, anchors, and animation sets (so no data change), one batch at a time, each batch followed by the tester pruning the cleared pins: **A-E5-0a** `cellar-rat`, `cave-bat`, `ore-beetle`, `goblin-scout` (four 16x16 minions; make the rat low and long with a tail, the bat a wide wing fan with ears, the beetle a domed shell with legs and pincers, the scout a lean upright figure with a hood, so each differs from the others and from every E3 to E4 minion); **A-E5-0b** `crate-mimic`, `crypt-mummy`, and `tomb-lich` or `rat-king` (a boxy crate with teeth and a tongue, a lanky wrapped mummy with trailing bandages, a lich with a taller crown and hanging sleeves; keep the boss phase palette). The artist returns the measured matrix and confirms 11 of 11 cleared. If the human defers (E5-6), skip this section and state in the handoff that the pins remain.

### 11.1 A-E5-1: shared additions

| Item | Where | Spec |
|---|---|---|
| Stage palettes | `palettesE1.ts` | `STAGE_PALETTES['dragons-lair']` and `['void-spire']`: `1` to `8`, plus `g` and `T`. Meanings stay stable: 1 deepest shadow, 2 dark rock, 3 mid rock, 4 lit rock, 5 secondary material, 6 light source, 7 highlight, 8 accent. Stage 9: dark red-brown cavern stone, `5` bronze, `6` warm gold light, `7` pale gold highlight (sparse), `8` a teal accent not close to the Mage's cloth blue; `g` a warm sand-bronze (about `#8a7a68`, red at most 1.3 times the larger of green and blue, not near-black); `T` warm gold (about `#ffd070`). **Keep the floor tiles mid-dark: the floor mean luminance (tile times `g`) must stay at or below about 0.033** (note 8, rule 1, from the Necromancer cloth); the hot, bright mood comes from the backdrop glow, gold accents, and lights. Stage 10: very dark slate-blue stone (not the indigo of Stage 8), `5` deep teal-slate, `6` pale magenta-white rift light, `7` cold highlight, `8` cyan accent; `g` a dark slate-blue (about `#4e5f86`, not near-black, floor mean luminance at least 0.0067); `T` pale magenta-white (about `#f0c8ff`). Enemies stay brighter and more saturated than the floor. |
| Stage character tables | `palettes.ts` | entries for both ids in `STAGE_TILE_CHARS` (`12345678`), `STAGE_CLEAR_CHAR` (`n`), `STAGE_AMBIENT_CHAR` (`g`). |
| Particle ramps | `palettes.ts` | `PARTICLE_PALETTE.shimmer`: a monotone dimming ramp of 3 or more faint warm master characters (for example `['a', 'C', 'Z']` or `['V', 'W', 'Z']`), never `Y O R D w`, never brighter than the brightest enemy fill; `PARTICLE_PALETTE.rift`: a 5-step pulse (for example `['P', 'g', 'm', 'g', 'P']`), never `Y O R D w`, adjacent steps a modest luminance ratio. Widen the type union. Master characters only; no new master character (37, cap 48, E5 limit 40). |

### 11.2 A-E5-2: Stage 9 environment (`dragons-lair`, file `stage9Templates.ts`, export `DRAGONS_LAIR`)

Tiles: `wallTop` 2, `wallMid` 5 (4 scorched-stone variants plus variant 4 with transparent pixels, for example a high cave opening so the backdrop shows), `wallBase` 2, `floorBack` 3, `floorFront` 3, `foreground` 2; join rules as every stage. Props per section 5.3 (`doorFrame`, `scorchedPillar`, `drakeSkull`, `hoardBrazier` 4-frame slow loop, `goldVein` 2-frame slow glint, `scaleBanner`, `hoardPile`, `goldScatter`), ids `dragons-lair/<name>`; solid props foot-anchored at the base center. Backdrop 128x128, period 64: a vast cavern with distant gold heaps, a dragon silhouette far off, a warm glow on the horizon. Mood: "scorched stone, gold, ember glow" ([art style guide](../../design/art-style-guide.md)); hot and bright by backdrop and lights, floor mid-dark. Floor and walls darker than the enemies. State the animated props' frame counts in the handoff (note 9).

### 11.3 A-E5-3: Stage 10 environment (`void-spire`, file `stage10Templates.ts`, export `VOID_SPIRE`)

Same tile counts and rules. The transparent `wallMid` variant is a window onto stars. Props: `doorFrame`, `spirePillar`, `voidRift` (4-frame slow pulse, a tear that swells and fades, never a full-frame flash), `starWindow` (static), `orbitRing` (2-frame slow turn), `riftPedestal` (solid, 16 px wide), `crackedSlab`; ids `void-spire/<name>`. Backdrop 128x128, period 64: a black sky with stars and a distant tower, a pale horizon rift. Keep it cute-spooky, no gore. Floor tiles stay legible: dark slate-blue, not black; no pure-black tile larger than the outline pixels. No words from the ban list in comments (R2).

### 11.4 A-E5-4: Stage 9 enemies (file `enemiesStage9.ts`, export `ENEMIES_STAGE9`)

Each `enemies/<id>`, left-facing, foot anchor (minion `(8, 15)`, elite `(12, 23)`), animations `idle 2, walk 2, attack 3`, cute-spooky. Silhouettes must differ when filled solid black and pass the matrix.

| id | Tier and size | Look | Silhouette cue |
|---|---|---|---|
| `drake-whelp` | minion 16x16 | a round-headed hatchling with stubby wing nubs, an S-curled tail, big eyes, a tiny ember-colored belly; `attack` snaps the head forward | upright and asymmetric with a curled tail; not a ghost, penguin, or imp |
| `kobold-sapper` | minion 16x16 | a small lizard-folk figure with a hard hat, hauling a round powder keg overhead; `attack` lunges with the keg lowered (no blast drawn) | a big circle over a thin body; not a goblin silhouette |
| `gilded-crown` | minion 16x16 | a floating spiked golden crown with two eyes under the rim and a faint sparkle; hovers; `attack` swoops the rim forward | a wide band with comb-like spikes; not a shard ring, lantern, or pixie |
| `ash-wyvern` | elite 24x24 | a winged biped, ash-gray with ember-orange wing edges, wings spread wide, long tail, horned head; hovers; `attack` sweeps one wing forward at chest height | a wide wing fan (Y shape); not a boxy golem, hunch, or tree |

### 11.5 A-E5-5: Stage 10 enemies (file `enemiesStage10.ts`, export `ENEMIES_STAGE10`)

Same contract.

| id | Tier and size | Look | Silhouette cue |
|---|---|---|---|
| `crescent-drifter` | minion 16x16 | a floating crescent-moon body with a pale eye in the hollow and a faint trail; hovers; `attack` tips the horns forward | a C shape; not a ring, bat, or shard cluster |
| `comet-tadpole` | minion 16x16 | a round bright head with big eyes and a long wavy tail trailing up and back; hops; `attack` flicks the tail forward | a diagonal streak; not a rat, hare, or toad |
| `eye-strider` | minion 16x16 | one big round eye on two long thin legs; `attack` leans the eye forward | a circle on stilts with an open gap below; not a spider or mimic |
| `obelisk-sentinel` | elite 24x24 | a narrow pointed stone monolith with a glowing rune and two small fragments orbiting at its sides; hovers; `attack` tips forward | a slim tall rectangle with detached pieces; not the boxy golem or wrapped mummy |

### 11.6 A-E5-6: the two bosses, then wiring

`hoard-dragon` (file `hoardDragonTemplate.ts`) and `void-sovereign` (file `voidSovereignTemplate.ts`), boss 48x48 (decision E5-7: not 64x48), left-facing, foot anchor `(24, 47)`, animations `idle 2, walk 2, attack 3, telegraph 2, intro 2` (11 frames), a clearly different `telegraph` from `attack`. Hoard Dragon: a dragon seated on a gold heap, wings raised in an M, horned head lifted, a warm belly; telegraph: the head rears back and the throat glows slowly for two frames; attack: a tail sweep and a head snap (no flame is drawn leaving the boss and nothing is drawn at a hero). Void Sovereign: a hovering cloaked figure, broad at the top with a crown of shards, tapering to a point, a star-filled cleft in the chest, two detached hands; telegraph: the hands rise and the cleft widens slowly for two frames; attack: both hands thrust forward. Phase 2 palettes in `palettesE5.ts` (`BOSS_PHASE_PALETTES_E5`): at most four master-character or stage-character overrides each, same silhouette; Hoard Dragon: scales and belly shift to a brighter gold and pale amber; Void Sovereign: the cleft moves from cyan to pale magenta-white while the cloak stays dark. Phase colours change once at the transition; neither may produce a large bright area (R10). Phase 2 is a palette change, never a "wounded" look.

**Then wire** (the only step that edits the barrels): `enemyTemplates.ts` merges `ENEMIES_STAGE9`, `ENEMIES_STAGE10`, `HOARD_DRAGON`, `VOID_SOVEREIGN`, and `BOSS_PHASE_PALETTES_E5`; `spriteTemplates.ts` adds `'dragons-lair': DRAGONS_LAIR` and `'void-spire': VOID_SPIRE` to `STAGE_SPRITES`; update the header comments. Hand the developer the final prop names and frame counts.

### 11.7 What the engine draws itself (no art)

Hit flashes, dissolves, bars, shadows, the stage fade, drops (reused), shimmer and rift particles (from the ramps), light maps. The artist never draws a hurt, downed, burned, scorched, drained, or void-cloaked frame for an enemy and never any frame, icon, or tint for a hero.

### 11.8 Docs the pixel-artist updates

[Art style guide](../../design/art-style-guide.md): Stage 9 and 10 character and prop tables (as the Stage 7 and 8 sections), the two palettes, the delivered enemy rows with silhouette cues, the two phase palettes, the shimmer and rift ramps, the master palette count, and the look-alike backlog paragraph (cleared, or still the 11 pairs if A-E5-0 is deferred). [Sprite spec](../../design/sprite-spec.md): the new template files and exports.

## 12. Decisions for the human

Each has a default so work can proceed. The recommended default is the one stated.

| # | Question | Default chosen (recommended) | Alternative |
|---|---|---|---|
| E5-1 | Enemy names and numbers | The ten rows in section 5.2 (ids and names mirrored by the artist; the developer may rename; drops reuse `coin gem ore chest`) | Human-chosen names; new drop kinds (art and validator rows, no gameplay value) |
| E5-2 | Stage ids and names | `dragons-lair` "Dragon's Lair", `void-spire` "Void Spire" (as in the roadmap; the apostrophe is dropped from the id) | `dragon-lair` / `void-tower` |
| E5-3 | Stage 9 and 10 boss length | Option (b): `HEALTH_GROWTH_LATE` 1.05 from Stage 9, bosses vigor 0.5 (about 87 s and 91 s with eight; no Stage 1 to 8 pin changes) | (a) lower `VIGOR_MIN` to 0.25 and use vigor 0.38 and 0.28 (85 s each; range tests move); (c) boss ceiling 540 before the party factor (91 s at every cycle; late bosses stop scaling in New Game+); (b) plus (c) together; none (112 s and 151 s) |
| E5-4 | New Game+ rule | Keep the existing cycle factor `1 + 0.25 * min(cycle, 8)` (ceiling 3.0 times), health only, no marker, no migration, schema v1 | A softer factor (for example 0.15 per cycle; changes the `CYCLE_*` pins and cycle >= 1 pins); a visible "NG+" label now (a UI feature, M7 owns it) |
| E5-5 | Ambient implementation | `shimmer` and `rifts` as two new `AmbientEffect` kinds and two new particle kinds (indices 10 and 11), master-character ramps | Reuse: Stage 9 `embers` at a low rate and Stage 10 `murk` (no engine work, but both stages look like Stages 6 and 8 in the particle layer) |
| E5-6 | The 11 legacy look-alike pairs | Rework now as A-E5-0a and A-E5-0b (seven templates, own commit) before the E5 enemies are drawn; prune `LEGACY_OVER` to empty | Defer to a pre-release polish pass (the debt becomes permanent in the 50-enemy table) |
| E5-7 | 64x48 boss size | Not used. Both bosses are 48x48. A new size tier would touch the validator size rule (`ENEMY_MAX_SIZE` boss 48 and its w/h check), the sprite spec, the anchor convention, `Enemy`/`Boss` drawing and the sort/shadow width (`TIER_SHADOW_PX` boss 30), the boss bar frame (`enemyBar.bossFrame`), the stand positions (`BOSS_STAND_MAX_X` 288 plus a 32 px half-width reaches the canvas edge), the look-alike tooling (same-size comparison would give 64x48 its own class), and the bundle (+33 percent pixels per boss frame); the shape cues already separate the bosses | Use 64x48 for the Hoard Dragon only if the artist cannot clear the matrix at 48x48 after two attempts; then a short architect addendum plus the developer/tester changes above |
| E5-8 | "30+ enemies on screen" | Read as 30+ distinct enemy types (50 exist); the on-screen pool stays 12 plus the boss, as in E3 and E4 | Raise `ENEMY_CAPACITY` and the `maxEnemies` range (protocol constant, `package.json`, draw ceilings 200 and 520, its own plan and benchmark) |
| E5-9 | Master palette growth | Zero new characters, hard cap 40 of 48 | A larger allowance, squeezing U1 |
| E5-10 | Validator strictness | Full contract with constant counts (10 stages, 50 rows, 50 unique ids, 5 per stage, 1 boss, at least 1 minion); the 3/1/1 tier shape is a tester table-shape test, not a validator rule | Also require exactly one elite and three minions per stage in the validator |
| E5-11 | Class-cloth rule on old stages | Apply the 2.0 rule (cloth contrast at least 2.0 for all twelve classes) to Stages 9 and 10; Stages 1 to 8 already meet it (Necromancer about 2.11 on Stage 7 and 2.46 on Stage 8 after the E4 tint fix), so no finding is recorded | Re-measure and retro-fix older floors (not needed) |
| E5-12 | ADR for New Game+ and the full contract | [ADR 0014](../adr/0014-new-game-plus-is-the-ten-stage-loop.md), Accepted (the human confirmed E5-3, E5-4, E5-10) | No ADR (rejected: the meaning of the persisted `cycle` is costly to reverse) |
| E5-13 | Art delivery order | A-E5-0 (a, b), then six steps A-E5-1 to A-E5-6, barrel wiring last, then the developer's atomic switch | Rows with placeholder art (rejected: `Game` throws without real stage art) |
| E5-14 | Light behavior | All E5 lights `flicker: false`; animated props at the 500 ms default; `starWindow` static; no prop named `torch`, `lantern`, or `puddle` | Flicker like torches (rejected for the photosensitivity risk) |

## 13. Architect doc pass (applied with this plan)

- New: this plan and [ADR 0014](../adr/0014-new-game-plus-is-the-ten-stage-loop.md) (Accepted).
- [Roadmap](../../engineering/roadmap.md): E5 entry rewritten (plan link, scope, files corrected to `enemies.ts`, art steps A-E5-0 to A-E5-6, done-when including the "30+ enemies" reading). Status lines untouched.
- [Docs index](../../index.md): the plan row and the ADR 0014 row.
- Not changed now; the architect updates at as-built time on the developer's drift flag: [game engine](../game-engine.md) (ambient kinds, particle kinds, ten delivered stages, the `healthOf` curve), [data model](../data-model.md) (stage table rows 9 and 10, tuning groups, `AmbientEffect`, boss health table, section 7 `cycle` meaning, section 8 validator text and the removal of the incremental wording), `CLAUDE.md` directory map (the sprite-files line, when E5 files exist). The A3 assumption in the roadmap summary stays true as history; the E5 close removes the "incremental" wording from the data-model and game-engine docs.
- For the tester: section 7 (T-E5-0, pinned counts, the validator crafted-table suite, New Game+ looping, scenery safety and the word-list warnings, legibility rules). For the pixel-artist: section 11 and the sprite spec.

## 14. As-built notes (checked against the E5 working tree)

Checked by the architect against the uncommitted tree on `feat/e5-stages-9-10` (files read: `data/enemies.ts`, `data/stages.ts`, `data/tuning.ts`, `Ambience.ts`, `Particles.ts`, `sprites/spriteValidator.ts`, `sprites/palettes.ts`, `palettesE1.ts`, `palettesE5.ts`, `enemyTemplates.ts`, `spriteTemplates.ts`, `Progression.ts`, `Stage.ts`, `shared/progress.ts`, and the test support files). The architect still had no shell: nothing here was run, and the legibility and look-alike numbers below are the figures reported by the developer and tester runs, not re-measured here. Where this section disagrees with sections 1 to 13, this section wins. The data-model and game-engine docs were synced in the same pass ([data model](../data-model.md), [game engine section 14.3](../game-engine.md#143-e5-as-built-the-finished-ten-stage-game)).

### 14.1 The atomic switch and wiring order

Done in the planned order. (1) New files and the palette-table entries came first (`stage9Templates.ts`, `stage10Templates.ts`, `enemiesStage9.ts`, `enemiesStage10.ts`, `hoardDragonTemplate.ts`, `voidSovereignTemplate.ts`, `palettesE5.ts`, and in `palettes.ts` the stage tile, clear, and ambient characters for both ids plus the `shimmer` and `rift` ramps; the two stage palettes in `palettesE1.ts`). (2) The engine additions (`Particles`, `Ambience`, `tuning.ts`, `Renderer` colour map, `healthOf` late growth) are independent of the switch. (3) The barrels were wired last: `enemyTemplates.ts` merges the ten enemy templates and `BOSS_PHASE_PALETTES_E5` into `ENEMY_PHASE_PALETTES`, and `spriteTemplates.ts` adds `'dragons-lair'` and `'void-spire'` to `STAGE_SPRITES`. (4) The developer's single step landed together: the two `STAGES` rows, the ten `ENEMIES` rows, the `REQUIRED_PROPS` entries for both ids, the four `FLAME_PROPS` rules (`hoardBrazier` 4, `goldVein` 2, `voidRift` 4, `orbitRing` 2), and the `validateEnemies` rewrite (`STAGE_COUNT`, `ENEMIES_PER_STAGE`, `ENEMY_COUNT`; the incremental mode is gone). A guard test (`enemyDataFullContract.test.ts`) asserts `STAGES.length === MAX_STAGE_INDEX === 10`.

### 14.2 Corrections to the plan

| Plan said | As built |
|---|---|
| Stage 9 `goldVein` in the wall-base band (section 5.3 left the position to the developer) | Placed at **y 112** (alcove x 52, corridor x 300). A 16-tall wall prop at y 120 failed `validateStages` ("outside the wall rows": wall props must fit in y 0 to 127). The prop is 16 tall, so 112 is the lowest row that fits |
| `drakeSkull` about 16x40 at an unspecified y | **y 28** (alcove x 52, corridor x 190) |
| `scaleBanner` about 16x48 at an unspecified y | **y 52** (alcove x 108, corridor x 110) |
| Stage 10 prop positions | `orbitRing` at y 76 (alcove x 52) and y 72 (corridor x 190); `starWindow` at y 52 (alcove x 108, corridor x 110 and 300); `voidRift` lamp slots at (28,40), (92,40), (60,40), (252,40); pillars at y 16 |
| Lights as designed | Four constants in `stages.ts`: `BRAZIER_LIGHT` (radius 52, intensity 0.8), `GOLD_VEIN_LIGHT` (40, 0.5), `RIFT_LIGHT` (48, 0.7), `RING_LIGHT` (40, 0.5); every one `colorChar: 'T'` and **`flicker: false`**. Six lights per stage (limit eight) |
| Animated props loop at 500 ms | Confirmed. `Stage.ts` (line 267 at a378ee5 and still) gives `TORCH_FRAME_MS` 130 only to props named exactly `torch` or `lantern`; the four new animated props get `PROP_FRAME_MS` 500 |
| `healthOf` option (b) | Built as written. `HEALTH_GROWTH_LATE` 1.05 and `LATE_GROWTH_FROM_STAGE` 9 are exported from `data/enemies.ts`; the stage factor is `1.35^(min(s, 8) - 1) * 1.05^max(0, s - 8)`; Stages 1 to 8 multiply by `1.05^0` and are bit-identical |
| Ambient accrual | `Ambience` uses its existing `#accrue` helper for both new debts (`#shimmerDebt`, `#riftDebt`): each debt is capped at `max(1, perSecond)`, a guard against a burst after a stage switch |
| Section 5.1 particle behavior | As specified: `shimmer` (index 10) 1x3, jitter on `vx` only (plus or minus 5 px/s^2), emitted `vy` upward; `rift` (index 11) 3x1, jitter on both axes (plus or minus 2 px/s^2). Ramps: `shimmer` `C V W`, `rift` `g G Q G g`. Constants `SHIMMER_*` and `RIFT_*` match section 5.1 exactly. `ArtSet.particlePalette` requires both kinds |
| Phase palettes | `palettesE5.ts` `BOSS_PHASE_PALETTES_E5`: Hoard Dragon `R D a Y` (bright gold, deep amber, pale amber, hot white-gold), Void Sovereign `8 6 7 5` (cleft and shard glow move from cyan to pale magenta-white; the cloak is untouched). Four overrides each, applied once |

Stage tints as built: Stage 9 `g` is `#8a7a68` (red 1.13 times its blue-green maximum, limit 1.3); Stage 10 `g` is `#4e5f86`. Master palette: still 37 characters (zero added by E5, decision E5-9); the ramps use existing characters and the stage and phase colours are partial overrides.

### 14.3 Health values (read from `healthOf`, cycle 0)

The section 5.2 hand estimates held to the unit. Party 1 and party 8 for bosses (party 8 is the unrounded party-1 value times 3.45):

| Stage | Minions (row order) | Elite | Boss (party 1 / party 8) | Boss at the cycle cap (x3.0), party 8 |
|---|---|---|---|---|
| 9 | `drake-whelp` 51, `kobold-sapper` 56, `gilded-crown` 43 | `ash-wyvern` 154 | `hoard-dragon` 515 / 1776 | 5329 |
| 10 | `crescent-drifter` 45, `comet-tadpole` 50, `eye-strider` 54 | `obelisk-sentinel` 151 | `void-sovereign` 541 / 1865 | 5595 |

Minions across both stages span 43 to 56 and the elites 151 to 154. The boss vigor 0.5 sits on the `VIGOR_MIN` floor, as planned; the fallback lever remains `VIGOR_MIN` (option (a)).

### 14.4 The validator as built

`validateEnemies` (signature unchanged) uses the constants and fixed texts of section 5.4 exactly: `expected exactly 10 stages, found N`, `stage indexes must be 1 to 10`, `expected 50 enemies for 10 stages`, `expected 50 unique ids, found N`, and the per-stage and per-row texts unchanged. A thrown error becomes `enemy table is malformed`. The "three minions, one elite, one boss" shape is a tester test, not a validator rule (decision E5-10).

### 14.5 Art, look-alike, and legibility results

- **A-E5-0 done.** Seven legacy templates were reworked in place (reported by the developer and tester; R5 names the seven, and the modified `enemiesStage1.ts`, `enemiesStage2.ts`, `enemiesStage4.ts`, and `tombLichTemplate.ts` in the working tree are consistent with it), and the look-alike ratchet is now empty: `KNOWN_OVER` and `LEGACY_OVER` are both `{}`, `BASELINE_IDS` stays the 20 E1/E2 ids. The 50 enemies give **525 same-size pairs** (30 minions, 10 elites, 10 bosses); the policy (overlap under 0.85, IoU at most 0.80, same-stage minions under 0.75) holds for all of them with **zero pins**.
- **Tightest pairs (still inside the limits):** `eye-strider` vs `toxic-toad` at 0.835 overlap, and `hoard-dragon` vs `molten-colossus` at 0.827. Both are within 0.025 of the 0.85 limit, so a future edit to either template of either pair must rerun the report first (`node test/support/lookAlikesReport.mjs`).
- **Legibility (self-calibrating rules of section 7, note 8):** floor mean luminance after the ambient multiply is **0.0182 on Stage 9** and **0.0109 on Stage 10**; the Necromancer cloth contrast, the tightest of the twelve classes, is **2.42 against Stage 9 and 2.71 against Stage 10**, both above the 2.0 rule. Stage 9 is hot through the backdrop, lights, and gold accents, not a bright floor, as planned (the 0.034 ceiling was never approached).
- **Tooling added by the tester:** `test/support/legibility.ts`, `legibilityReport.ts`, `legibilityReport.mjs` (the luminance table), `lookAlikes.ts` and `lookAlikesReport.*` (the matrix and pins), and `test/fixtures/legibility/` (a synthetic candidate for the report CLI).
- **Props as built.** Stage 9: `doorFrame`, `scorchedPillar`, `drakeSkull`, `hoardBrazier` (4 frames), `goldVein` (2 frames), `scaleBanner`, `hoardPile` (solid, alcove, foot y 134, 12x5), `goldScatter`. Stage 10: `doorFrame`, `spirePillar`, `voidRift` (4 frames), `starWindow` (static), `orbitRing` (2 frames), `riftPedestal` (solid, alcove, foot y 134, 12x5), `crackedSlab`. Floor-layer names are exactly `hoardPile goldScatter` and `riftPedestal crackedSlab`; no prop is named `torch`, `lantern`, or `puddle`.

### 14.6 Open items found while syncing (not architect-owned; flagged in the handoff)

1. `src/game/Progression.ts` line 4 and `src/shared/progress.ts` line 24 still carry the planned wording "E5 turns that into New Game+" (task 5 was comment-only and is not done). `Game.ts` and the `enemies.ts` header carry no stale wording.
2. `test/game/enemyData.test.ts` still has the pre-switch incremental assertions (for example `expected 40 enemies for 8 stages` at about line 253 and `validateEnemies(rows.slice(0, 5), STAGES.slice(0, 1))` returning `[]` at line 261), which the full contract now rejects. The new `enemyDataFullContract.test.ts` covers the full contract; the old file needs the restatement of section 7.1.
3. `test/game/lookAlikes.test.ts` still names the matrix size as "24 minions, 8 elites, and 8 bosses" (the E4 figures); the E5 figures are 30, 10, and 10.
4. The bundle size (R11) and the manual 60 fps benchmark (task 9) are human-owned and not recorded here.
