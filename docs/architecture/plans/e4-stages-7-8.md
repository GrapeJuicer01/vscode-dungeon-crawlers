# E4 plan: Stage 7 Frozen Citadel, Stage 8 Shadow Realm (ten enemies, two stages, snow and murk ambients, wrap after Stage 8)

Purpose: the detailed plan for batch E4: ten more enemies (three minions, one elite, and a boss per stage), two more stages with per-stage palette overrides, props, backdrops and ambients (slow snowfall; dim drifting murk), the enemy table growing from 30 to 40 of 50, and the progression wrap moving from after Stage 6 to after Stage 8. E4 is data and art on the E1 to E3 machinery plus two small cosmetic engine additions (two ambient kinds, two particle kinds), exactly the E3 pattern. Written by the architect; the pixel-artist, developer, and tester work from it. Follows the layout of the [E3 plan](e3-stages-5-6.md), whose [section 14](e3-stages-5-6.md#14-as-built-notes-checked-against-the-e3-working-tree) (as-built facts) is the baseline.
Related: [roadmap E4](../../engineering/roadmap.md#e4-stage-7-frozen-citadel-stage-8-shadow-realm), [E3 plan](e3-stages-5-6.md), [E2 plan](e2-stages-3-4.md), [E1 plan](e1-enemies.md), [game engine](../game-engine.md), [data model](../data-model.md), [ADR 0002 no hero health](../adr/0002-no-hero-health.md), [ADR 0009 hero lifecycle isolation](../adr/0009-hero-lifecycle-isolation.md), [ADR 0011 summons](../adr/0011-summons-are-leased-cosmetic-entities.md), [ADR 0012 host-owned versioned progress](../adr/0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and the hero reaction board](../adr/0013-enemy-health-and-hero-reaction-board.md), [enemies and stages](../../design/enemies-and-stages.md), [game design](../../design/game-design.md), [art style guide](../../design/art-style-guide.md), [sprite spec](../../design/sprite-spec.md), [testing strategy](../../engineering/testing-strategy.md), [CLAUDE.md](../../../CLAUDE.md).

Status: implemented (uncommitted on `feat/e4-stages-7-8` when section 14 was written). Sections 1 to 13 are the plan as written against the tree at E3 commit c1c5f1b; [section 14](#14-as-built-notes-checked-against-the-e4-working-tree) records what was built and where it differs. The architect had no shell: no test, lint, or look-alike report was run by the architect.

## 1. Goal

After E4 the party fights through eight stages. Stage 7 (`frozen-citadel`) and Stage 8 (`shadow-realm`) each bring a new environment, three minions, an elite, a boss, and an ambient effect. Defeating the Stage 8 boss fades back to Stage 1 and counts one more cycle. Enemies stay exactly as E1 to E3 built them: they walk in, stand, attack on a timer with a purely cosmetic hero flash, have health and a bar, and dissolve. **No new mechanic and no hero-side effect of any kind** (decision E4-2).

- **Data**: 10 enemy rows (40 of 50), 2 stage rows, per-stage palette overrides, required-prop lists, four flame-prop rules, two boss `vigor` values below 1.0.
- **Engine (cosmetic only)**: `AmbientEffect` gains `snow` and `murk`; `ParticleKind` gains `snow` and `murk` (appended after `firefly`, indices 8 and 9); `Ambience` and `Particles` handle them; the renderer colour map gains two lines. Nothing else in `src/game/` changes behavior.
- **Art**: two environments, ten enemy templates (eight regular, two bosses), two particle ramps, two stage palettes, two boss phase palettes. No new drop kinds. Master palette: zero new characters (section 9, R6).
- **Docs and tests**: the generated enemy table lists 40; the hand-written tests that pin "six stages", "30 enemies", ten particle fixtures, the phase palettes, and the decoration word lists are restated (section 7.1).

Layers touched: data tables (`enemies`, `stages`, `tuning`), engine (`Ambience`, `Particles`, `Renderer` colour map only), sprites, validator tables (`spriteValidator`), docs tooling output, tests. Not touched: the monitor, host, protocol, `PROTOCOL_VERSION` (2), `Progress` schema (v1; `MAX_STAGE_INDEX` is 10 so stored indexes 7 and 8 already validate), settings, CSP, `esbuild.mjs`, dependencies, `Combat`, `Enemy`, `Boss`, `Progression`, `StageDirector`, `Engagement`, `Hero`, `Roster`, `ClassHero`, `World`, `Lighting`, `Stage.ts`, `Game`, `Drops`, the drop tables.

**The roadmap's hero overlays are dropped.** The roadmap E4 entry (before this plan) asked for "cosmetic frost and shadow overlay effects" and "status-like enemy effects on heroes (tints and icons)". That contradicts the shipped rule that nothing is drawn on a hero except its shadow and sprite ([enemies and stages](../../design/enemies-and-stages.md)) and risks the invariant 1 look (an icon or tint on a hero reads as a status, i.e. as hurt). Decision E4-2 removes them; the roadmap entry is rewritten with this plan. Ice and shadow are scenery and enemy art only.

## 2. Invariant check

| Invariant | How E4 respects it |
|---|---|
| 1 Heroes invulnerable | No hero field, state, gauge, overlay, tint, icon, or reaction is added. Enemy attacks still write only to `HitReactions`. Snow, murk, ice, mirrors, and shards are decoration with no hazard semantics: nothing reads a prop name or ambient kind for gameplay (the only name-special prop is `puddle`, a drip point), no prop or particle has a collider against heroes, no floor surface slips, slows, or chills anything (section 5.1 rules). Art never draws frost, a frozen look, or a shadow cloak on a hero. |
| 2 Lifecycle from host events only | Stage change, boss defeat, wrap, and cycle only touch `Progression`, `StageDirector`, and `Combat`. Nothing new reads or writes `Hero`, `Roster`, `AgentInfo`, or lifecycle. The wrap after Stage 8 is the E1 code path with a larger `stageCount`. Ambient code reads only `world.stage.def.ambient`. |
| 3 Read-only monitor | Untouched. No protocol change. |
| 4 Crash isolation | New ambient code runs inside `Ambience.update` (inside the `Game.step` try/catch). Stage runtimes for Stages 7 and 8 are built by the same guarded `StageDirector` path. A bad stage row is caught at startup by `validateStages` (atomic switch, section 4). |
| 5 No external assets | Everything is palette-character templates in code. |
| 6 No runtime dependencies | None. |
| 7 Transcript privacy | `Progress` unchanged (six numeric fields). No string or agent data added. |

The enemy side still imports no hero code (ADR 0013). E4 adds no file to either side list except art and data files, which default to the strict hero side; the only enemy-side file edited is `data/enemies.ts` (rows only).

## 3. E3 assumptions audited against the code (what is hard-coded to six stages)

| Area | Finding at c1c5f1b | E4 action |
|---|---|---|
| `Progression` wrap, `StageDirector`, `Combat` row selection, `killsPerStage` | Generic over `deps.stages.length`. | None. Two more `STAGES` rows move the wrap to Stage 8. |
| Stored `stageIndex` | `MAX_STAGE_INDEX` is 10 (`src/shared/progress.ts`); a stored index above the stage count wraps by `((i - 1) % count) + 1`. | None. With eight stages 7 and 8 stay; 9 maps to 1, 10 to 2. |
| `validateEnemies` | Incremental: 5 rows and one boss per stage, `rows.length === 5 * stages.length`, minion count at least 1, unique kebab ids, `vigor` 0.5 to 2, `pace` 0.5 to 1.6. Exact mode is E5. | None in code. Rows added in lock-step with stage rows. |
| `validateStages` (in `Stage.ts`) | Runs in the `Game` constructor; throws `RangeError('Stage data is invalid')` for a stage without art, a missing prop, out-of-band prop, more than 8 lights, or broken nav. | None. This is why the switch is atomic (section 4). |
| `REQUIRED_PROPS`, `FLAME_PROPS` (`spriteValidator.ts:52,110`) | Module-private, keyed by stage id and prop name; checked by `validateArtSet`. | Developer adds two entries and four flame rules in the switch step. |
| Boss phase palettes | `validateEnemyArt` requires a non-empty phase palette for every boss row, rejects them on non-bosses, at most 4 single master characters with `#rrggbb`. | Two entries needed in `palettesE4.ts`; the switch cannot be half-done. |
| `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR`, `STAGE_PALETTES` | Keyed by stage id (`palettes.ts`, `palettesE1.ts`); `validateArtSet` requires the clear colour luminance under 0.02 and a defined ambient character. | Artist adds entries for both ids (A-E4-1). |
| Master palette | 37 colors (`MASTER_PALETTE`), cap 48 in `validateArtSet`. | Section 9, R6: E4 adds 0, hard cap 40. |
| `AmbientEffect` / `Ambience` | Union of six kinds; `update` switches with `assertNever`; `#accrue` caps a debt at `max(1, perSecond)`; each kind has its own debt field. | Two new kinds and two debts; the compiler forces the edits. |
| `ParticleKind` | Eight kinds, `KIND_NAMES` indexed in a `Uint8Array`; `update` branches by `KIND_*` constants; `draw` picks size by kind name (one `fillRect` per live particle); `Renderer` builds an explicit per-kind colour map; `ArtSet.particlePalette` is `Record<ParticleKind, ...>`; the validator needs a ramp of 2+ known characters per kind. | Append `snow` (8) and `murk` (9). Artist adds both ramps, developer adds two map lines. |
| Lighting | Light colour characters are `T` and `F`; lights ride on wall props only. The light map is cleared to the stage ambient character and multiplied over the **environment only**; entities (heroes, enemies) are drawn after `compose()` and are never darkened by it (`Lighting.ts`). | No change. This matters for Stage 8 legibility (section 9, R10). |
| Draw ceilings | 200 bitmap draws and 520 fills (`combatBudget.test.ts`, `stageBudget.test.ts`); the budget assumes a full particle pool (384). | None. Steady-state ambient counts are far below capacity (R3). |
| Look-alike test | `test/game/lookAlikes.test.ts` with `test/support/lookAlikes.ts` (`OVERLAP_LIMIT` 0.85, `IOU_LIMIT` 0.80, `SAME_STAGE_LIMIT` 0.75, `KNOWN_OVER` now empty, `LEGACY_OVER` 11 pins). A test forbids pinning any pair involving a post-baseline enemy. | Applies to all ten new enemies unchanged (section 7, note 4). |
| Vocabulary scan | `HERO_SIDE_BANNED = /\b(hp\|health\|mana\|dead\|downed\|retreat\|damage\|gauge\|hurt\|dying)\b/i` (`test/support/sides.ts`) covers every `src/game/**` file outside the enemy side, including all new sprite and data files; animation names are also checked against `FORBIDDEN_ENEMY_ANIMATION` (`hit\|death\|dead\|die\|dying\|hurt\|downed`). | Section 9, R2. |
| `docs:tables` | Generic over `ENEMIES` and `STAGES`. | Regenerate: 40 rows. |
| Pinned counts | Section 7, note 1. | Tester restates. |

Conclusion: nothing in the engine is hard-coded to six stages. The coupling is data-level, as in E2 and E3.

## 4. The atomic switch (ordering constraint)

`Game` builds with `SHIPPED_ART` and the real `STAGES`/`ENEMIES` in almost every test, and `new Game(...)` throws if any stage lacks art. Validators reject art for rows that do not exist, and rows without art or without a boss phase palette. Therefore (lesson 1 of E1 to E3, kept):

1. The pixel-artist creates new files and the **palette-table entries** (stage tile/clear/ambient characters, `STAGE_PALETTES`, the two particle ramps) but **does not merge the new enemy templates into `ENEMY_SPRITES`, the new boss phase palettes into `ENEMY_PHASE_PALETTES`, or the new stages into `STAGE_SPRITES`** until the last art step (A-E4-6), which wires the barrels (`enemyTemplates.ts`, `spriteTemplates.ts`) in one edit. Phase palettes live in a new `palettesE4.ts` (`BOSS_PHASE_PALETTES_E4`).
2. Immediately after A-E4-6 the developer adds, in **one step (task 4)**: the two `STAGES` rows, the ten `ENEMIES` rows, the two `REQUIRED_PROPS` entries, the four `FLAME_PROPS` rules; then runs the validators. These are deliberately not pre-landed: they read the artist's final prop names. Until then the tree stays green with E3 content.
3. The particle ramps (A-E4-1) and the engine additions (tasks 1 and 2) are independent of the switch and land first (`ArtSet.particlePalette` is `Record<ParticleKind, ...>`, so the ramps must exist before the type widens).
4. Reworks of older templates (the optional legacy-debt step, section 11.0) replace shipped templates in place with the same ids, sizes, and animation sets; they are not part of the switch.

Tests run on shipped art; do not rely on a test art set.

## 5. Interfaces (signatures only)

### 5.1 Engine: two cosmetic ambients, two particle kinds, and the scenery rules

```ts
// src/game/data/stages.ts (changed)
export type AmbientEffect =
  | ... six existing kinds unchanged ...
  /** Slow falling snow in the corridor view (E4, Stage 7). */
  | { readonly kind: 'snow'; readonly perSecond: number }
  /** Dim indigo murk motes drifting upward and sideways (E4, Stage 8). */
  | { readonly kind: 'murk'; readonly perSecond: number };

// src/game/Particles.ts (changed): append so existing indices stay stable.
export type ParticleKind =
  'ember' | 'spark' | 'drip' | 'splash' | 'mote' | 'bubble' | 'wisp' | 'firefly' | 'snow' | 'murk';
// KIND_NAMES gains 'snow' (8) and 'murk' (9); KIND_SNOW, KIND_MURK constants.
// update(): snow: vx jitter (+-12 px/s^2, i.e. (rng - 0.5) * 24 * dt), vy unchanged (emitted downward, slow);
//           murk: vx and vy jitter (+-8 px/s^2, i.e. (rng - 0.5) * 16 * dt), vy emitted upward.
// draw(): snow is 1x1; murk is 2x2 (a dim mote, still exactly one fillRect per live particle).
// Flakes and motes are not sorted, not scrolled, and have no collision; a full pool drops emissions silently.

// src/game/Ambience.ts (changed): two new cases, each with its own debt (#snowDebt, #murkDebt) via #accrue.
//   snow: emit 'snow' at x in CORRIDOR_X..INTERNAL_WIDTH, y in SNOW_MIN_Y..SNOW_MAX_Y,
//         vx +-SNOW_DRIFT, vy SNOW_FALL_MIN..SNOW_FALL_MAX (positive = down), life SNOW_LIFE_*; not scrolled.
//   murk: emit 'murk' at x in the corridor view, y in MURK_MIN_Y..MURK_MAX_Y,
//         vx +-MURK_DRIFT, vy -(MURK_RISE_MIN..MURK_RISE_MAX), life MURK_LIFE_*; not scrolled.
// assertNever keeps the switch exhaustive.

// src/game/data/tuning.ts (changed, neutral names, first guesses tuned by eye):
//   SNOW_MIN_Y 4, SNOW_MAX_Y 60, SNOW_DRIFT 5, SNOW_FALL_MIN 8, SNOW_FALL_MAX 16,
//   SNOW_LIFE_MIN_MS 3500, SNOW_LIFE_MAX_MS 6000;
//   MURK_MIN_Y 90, MURK_MAX_Y 156, MURK_DRIFT 4, MURK_RISE_MIN 3, MURK_RISE_MAX 8,
//   MURK_LIFE_MIN_MS 4000, MURK_LIFE_MAX_MS 7000.

// src/game/Renderer.ts (changed): the particle colour map gains snow and murk (css(art.particlePalette.<kind>)).
// src/game/sprites/palettes.ts (artist): PARTICLE_PALETTE type and table gain the two ramps (master characters only).
```

Stage rows (defaults; the developer sets positions after the real sprite sizes are known, re-running `validateStages`):

```ts
{ id: 'frozen-citadel', index: 7, name: 'Frozen Citadel', props: [...], ambient: { kind: 'snow', perSecond: 9 } }
{ id: 'shadow-realm',   index: 8, name: 'Shadow Realm',   props: [...], ambient: { kind: 'murk', perSecond: 4 } }
```

Particle budget: steady state is rate times life: snow 9 x 4.75 s = about 43 live; murk 4 x 5.5 s = about 22 live; the pool is 384 and the draw ceilings already assume it full.

**Decision recap (E4-3).** Snow needs a new kind: nothing existing falls slowly without ending in a splash (`drip`/`splash` use gravity; `bubble` rises; `mote` is the warm Stage 2 dust ramp; per-kind, not per-stage ramps). Murk reuses nothing cleanly: `wisp` (Stage 4 fog) is a 6x2 gray streak and `mote` is tan, wrong for an indigo realm. Both kinds use only existing master characters, so no palette growth. Cheaper alternative if the human prefers zero new kinds for Stage 8: reuse the `fog` ambient (wisps plus motes) with Stage 8 rates; it works with no engine change but reads as the Stage 4 catacombs fog in the wrong colors (decision E4-3 lists it).

**Scenery rules (cosmetic only; the hazard-free guarantee).** Ice and shadow mirror the E3 lava rules.

1. Ice, snow, mirrors, and shards appear in the backdrop, in wall-layer props, and in floor tiles as pure decoration. There is **no** slippery, slowing, or chilling surface: no code reads a floor tile, prop, or particle for movement. Floor-layer props are limited to the four named `iceThrone`, `snowDrift`, `duskAltar`, `shardPatch` (the tester checks the floor-layer name set for E4 stages against this list).
2. No prop or particle has a collider with a hero. The only solid props are the alcove floor props `iceThrone` and `duskAltar` at foot y 134 with the 12x5 footprint (as `ruinedStatue`, `anvil`), so no seat or formation slot is blocked.
3. No code path reads `snow`, `murk`, a prop name, or a stage id to change a hero; the structural test extends the decoration word list (section 7, note 7).
4. **Tint rule.** The ambient tint `g` of each E4 stage is neither red-dominant (red at most 1.3 times the larger of green and blue) nor black. Stage 7 `g` is a cool blue-gray; Stage 8 `g` is dark indigo-violet. Nothing multiplies a pale-blue or violet wash over a hero (the light map covers the environment only), and the art never draws frost on, or a dark cloak around, a hero.
5. **Vocabulary.** A Frozen/Shadow theme must not describe a hero as frozen, chilled, hurt, or shadowed. "Frozen" is the name of a *stage* and of scenery only (section 9, R2).

### 5.2 Data: enemy rows and stage props

Default rows (ids and names are mirrored by the pixel-artist; numbers are tuning, decision E4-1). Health uses the E1 formula unchanged: tier base 10 / 24 / 120, times `vigor`, times 1.35 per stage after the first (x6.0534 at Stage 7, x8.1722 at Stage 8, i.e. `1.35^6` and `1.35^7`), cycle 0, party 1; a boss adds 35 percent per fighting hero beyond the first (x3.45 with eight). Pace to px/s: minion x26, elite x20, boss x14. **All health values are hand-computed from `healthOf` and rounded to nearest (plus or minus 1); the developer reads the real values from `healthOf` and the tester pins those.**

| Stage | id | name | tier | gait | vigor | pace | drop | health (cycle 0, party 1) | px/s |
|---|---|---|---|---|---|---|---|---|---|
| 7 | `rime-penguin` | Rime Penguin | minion | walk | 0.8 | 0.8 | coin | 48 | 20.8 |
| 7 | `frost-hare` | Frost Hare | minion | hop | 0.7 | 1.4 | coin | 42 | 36.4 |
| 7 | `snow-sentry` | Snow Sentry | minion | walk | 0.9 | 0.7 | ore | 54 | 18.2 |
| 7 | `snow-yeti` | Snow Yeti | elite | walk | 1.0 | 0.6 | gem | 145 | 12 |
| 7 | `glacier-mammoth` | Glacier Mammoth | boss | walk | 0.6 | 0.5 | chest | 436 (about 1504 with eight fighters) | 7 |
| 8 | `lantern-wraith` | Lantern Wraith | minion | float | 0.6 | 1.0 | coin | 49 | 26 |
| 8 | `shard-cluster` | Shard Cluster | minion | float | 0.5 | 1.3 | ore | 41 | 33.8 |
| 8 | `mirror-mimic` | Mirror Mimic | minion | walk | 0.7 | 0.8 | coin | 57 | 20.8 |
| 8 | `gloom-stag` | Gloom Stag | elite | walk | 0.8 | 0.8 | gem | 157 | 16 |
| 8 | `eclipse-warden` | Eclipse Warden | boss | float | 0.5 | 0.6 | chest | 490 (about 1692 with eight fighters) | 8.4 |

Notes: all values are inside the validator ranges (vigor 0.5 to 2, pace 0.5 to 1.6; two rows sit exactly at the floor, `shard-cluster` and `eclipse-warden`, an accepted boundary case already tested). Drops reuse the four E1 kinds (decision E4-5). The Eclipse Warden hovers (`float`, cosmetic draw offset only); if the human prefers a grounded boss use `walk` (no other change).

Silhouette sources (so the artist and tester know the intent): Rime Penguin, upright oval with flippers and a beak; Frost Hare, a sitting hare with very long ears and a large haunch (hops); Snow Sentry, three stacked balls with stick arms and a carrot nose (waddles); Snow Yeti, hunched wide shoulders and arms hanging to the knees; Glacier Mammoth, a wide low four-legged boss with tusks and a trunk (the first horizontal boss; every other boss is upright). Lantern Wraith, a floating hooked lantern with a pale flame inside (a handle ring on top, not a sheet); Shard Cluster, a floating ring of three or four detached crystal shards (fragmented, low overlap by construction); Mirror Mimic, an upright oval mirror frame on short legs with a hollow reflective center (a ring: low overlap with solid shapes); Gloom Stag, a low antlered quadruped with a wide antler fan (not an upright tree crown); Eclipse Warden, a hovering dark disc with a bright corona ring and four tendril arms. The vocabulary scan: none of these names, nor `wraith`, `stag`, `mirror`, or `glacier`, hits the ban list. Names must not become identifiers that describe a hero state.

Enemy gaits: only `walk`, `hop`, `float` exist. No splitting, no ranged attacks, no freezing, no shadow effect on a hero (decision E4-2).

Stage props (the artist's ids; at least 6 distinct props plus the door frame; at most 8 lights per stage; solids only as alcove floor props at foot y 134 with a 12x5 footprint):

| Stage 7 `frozen-citadel` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128, as every stage: an iron-banded gate arch rimed with frost |
| `icePillar` | wall | a fluted blue-white column, about 16x112 |
| `icicleCluster` | wall | icicles hanging from the ceiling, 16x40 |
| `frostBanner` | wall | a stiff, tattered banner with a crest, decoration, about 16x48 |
| `iceLamp` | wall, 2-frame slow pulse | a crystal lantern; light source (`T` recolored pale blue, `flicker: false`) |
| `iceSheet` | wall (wall-base band, behind the walking floor), 2-frame shimmer | a frozen window or sheet of ice along the back wall; a **slow** glint; weak light source (`flicker: false`) |
| `iceThrone` | floor, solid in the alcove | a carved ice seat, 16x16, foot y 134 |
| `snowDrift` | floor | a small snow mound, decoration |

| Stage 8 `shadow-realm` | Layer | Notes |
|---|---|---|
| `doorFrame` | door | 16x128: a black arch with a violet rim and a faint star glint in the gap |
| `duskPillar` | wall | a dark crystal column, about 16x112 |
| `floatingShard` | wall, 2-frame slow bob | a hovering crystal shard; dim light source (`flicker: false`) |
| `mirrorFrame` | wall | a tall dark mirror in an ornate frame, faint stars in the glass, decoration |
| `wispTorch` | wall, 4-frame loop | a sconce with a pale violet-white wisp flame; light source (`flicker: false`, slow loop) |
| `duskAltar` | floor, solid in the alcove | a squat black altar, 16x16, foot y 134 |
| `shardPatch` | floor | scattered crystal fragments, decoration |

`REQUIRED_PROPS`: Stage 7 `icePillar icicleCluster frostBanner iceLamp iceSheet iceThrone snowDrift doorFrame`; Stage 8 `duskPillar floatingShard mirrorFrame wispTorch duskAltar shardPatch doorFrame`. `FLAME_PROPS` gains `iceLamp: 2`, `iceSheet: 2`, `floatingShard: 2`, `wispTorch: 4`. Placement follows the Stage 2 to 6 grid: door frame at the door zone; roughly eight alcove and eight corridor placements; lights: Stage 7 two `iceLamp` plus one `iceSheet` per zone (6 total), Stage 8 two `wispTorch` plus one `floatingShard` per zone (6 total), both under the limit of 8; corridor positions repeat every 384 px. Light defaults: `iceLamp` radius 48 intensity 0.8; `iceSheet` radius 44 intensity 0.5; `wispTorch` radius 48 intensity 0.7; `floatingShard` radius 40 intensity 0.5; all `colorChar: 'T'`, `flicker: false`. Do not name any prop `puddle`.

### 5.3 Ownership of the validator table edits

`spriteValidator.ts` (developer) gets the `REQUIRED_PROPS` and `FLAME_PROPS` edits in task 4 with the rows, because they read the artist's final prop names. The artist confirms the names in A-E4-2/A-E4-3; a rename is reported in the handoff.

## 6. Developer task list

Branch `feat/e4-stages-7-8`. No new packages. Do not commit before reviewer Approve. Tasks 1 and 2 need only A-E4-1; task 4 needs A-E4-1 to A-E4-6.

0. **Start.** Set roadmap E4 `Status: in progress` (batch entry and summary row 11). Check: only those two lines changed.
1. **Particles and tuning.** Add `snow` and `murk` to `ParticleKind`, `KIND_NAMES` (appended), `update`, and `draw`; add the `SNOW_*` and `MURK_*` constants to `tuning.ts`; add the two `Renderer` colour-map lines. Requires A-E4-1. Check: typecheck; a particle test emits each new kind and draws exactly one `fillRect`; old kind indices unchanged (`['ember','spark','drip','splash','mote','bubble','wisp','firefly','snow','murk']`).
2. **Ambience.** Extend `AmbientEffect` with `snow` and `murk` (and the `stages.ts` doc comments), add the two cases with their own debts through `#accrue`, keep `assertNever`. Check: with a stage stand-in whose `def.ambient` is each new kind, 10 simulated seconds emit about `perSecond * 10` particles of the right kind and never throw; a mid-run stage switch carries no runaway debt.
3. **Look-alike tooling check (read only).** Run `node test/support/lookAlikesReport.mjs src/game/sprites/enemiesStage7.ts:ENEMIES_STAGE7:7 ...` against candidate files to read the matrix (section 11, "Report command"); no code change expected.
4. **Switch on** (after A-E4-6), **one step**: append the two `STAGES` rows with props positioned against the real sprite sizes; the ten `ENEMIES` rows; the two `REQUIRED_PROPS` entries; the four `FLAME_PROPS` rules. Check, in this order: `validateStages(STAGES, SHIPPED_ART)` empty (bounds, nav connectivity, at most 8 lights); `validateEnemies(ENEMIES, STAGES)` empty (40 rows, 8 stages, one boss each); `validateArtSet(SHIPPED_ART)` empty (includes the two boss phase palettes); `STAGES.length === 8`; `Progression` of 8 stages wraps from Stage 8 with `cycle + 1` (no code change). Read the real boss and minion health values from `healthOf` and, if a row is outside its target (section 9, R7), adjust only that row's `vigor`.
5. **`docs:tables`.** Run `npm run docs:tables`; the generated region shows `Delivered enemies: 40 of 50.` and 40 rows. A second run leaves no diff; `--check` passes. No generator change expected; flag it if one is needed.
6. **Docs.** `docs/design/enemies-and-stages.md` (purpose line "eight stages, forty enemies", stage rows 7 and 8 with their ambients, the wrap sentence "after Stage 8", the boss `vigor` sentence with the real eight-fighter values, a scenery-only sentence for ice and shadow), `docs/design/game-design.md` (stage list and ambients), `CHANGELOG.md` ("Stages 7 and 8: Frozen Citadel and Shadow Realm, ten new enemies and two bosses, snow and murk ambients; the stage cycle now wraps after Stage 8"). `README.md` only if it names the stage count.
7. **Local checks (human-owned).** F5 with `--disable-extensions`, simulator on with `simulatorAgentCount` 8, `pixelAgents.killsPerStage` 5: watch Stage 1 to 8 and the wrap (fade each time, heroes' poses unchanged); a 60 s DevTools recording at 8 heroes, a full wave (`maxEnemies` 12), in Stages 7 and 8 at 60 fps; read every enemy by silhouette at three panel sizes; confirm snow does not read as hit sparks (`spark` is white-yellow-orange), that the Stage 7 ice glint is slow, that Stage 8 is dark but every hero class (the Necromancer's violet hood, the Rogue's slate cloth, dark-haired skins) stays readable against the floor; hide/show and "Developer: Reload Webviews" restore Stage 7 or 8.
8. **Docs drift.** Flag in the handoff anything in [game engine](../game-engine.md) (ambient and particle lists, delivered stages), [data model](../data-model.md) (stage table, tuning groups, `AmbientEffect`, boss health table), `CLAUDE.md` (sprite files in the directory map), or this plan that the code changed. The architect syncs before the tester finishes and adds a section 14.
9. **Hand off to the tester** with section 7.
10. **Commit after reviewer Approve.** Roadmap E4 `Status: done` and summary row 11; one commit, for example `feat: add Stage 7 and 8 enemies, bosses, and ambients`; merge to `main` fast-forward. No push without the human.

## 7. Test notes for the tester

The game tests run on shipped art. Update the pinned counts first (they fail the moment task 4 lands), then add coverage. Tester step **T-E4-0** (before the artist's first enemy file): extend `ambientSafety.test.ts`'s word list and file set to the E4 names and confirm `lookAlikesReport.mjs` accepts the new `file:Export:stage` arguments, so the artist gets a printed matrix while iterating.

1. **Pinned counts to update (restate, do not loosen).**
   - `enemyData.test.ts`: 40 rows, `STAGES.length` 8, "expected 40 enemies for 8 stages" in every message regex (currently "expected 30 enemies for 6 stages", lines 151, 236, 241), the crafted-table cases for stages 1 to 8, the row-list assertion for the ten new rows (id, name, tier, gait, vigor, pace, drop), `enemiesForStage(7|8)`, `bossFor(7|8)` ids, the E3 "boss vigor below 1.0" assertion extended to the Stage 7 and 8 bosses; spot health values for the ten rows from the real `healthOf` at cycle 0, party 1, plus the two bosses with eight fighters; `healthOf` monotone in stage, cycle, and (bosses only) party.
   - `combatParts.test.ts`: the `STAGES.length === 6` assertion (near line 416) becomes 8 and the title "Stage 6 boss wraps" becomes Stage 8; the six-stage stored-index case (line 429-430) restated for eight (`((i - 1) % 8) + 1`: 7 and 8 stay, 9 maps to 1, 10 to 2); `bossesDefeated` expectation 8.
   - `gameCombat.test.ts` (line 180): the stored-index wrap case restated for eight stages as above.
   - `docsTables.test.ts` (lines 337-352): "40 of 50", 40 rows.
   - `heroInvariantStages.test.ts`: `BOSS_BY_STAGE` (line 31 area) gains `glacier-mammoth` and `eclipse-warden`; `LAST_STAGE` 8 (line 244 assertion); `order.slice(0, 7)` equals `[1, 2, 3, 4, 5, 6, 1]` becomes `slice(0, 9)` equals `[1..8, 1]`; the `stages: [3, 4, 5, 6]` arrays (lines 292, 300) and `for (const stage of [3, 5, 6])` (line 341) gain 7 and 8; titles say eight stages.
   - `stageBudget.test.ts`: `KINDS` ("all eight particle kinds", line 35 area) becomes ten and the budget run covers Stages 7 and 8; the hard-coded stage list near line 214 (`[1, 2, 3, 4, 6]`) is reviewed and extended.
   - `ambience.test.ts`: the particle-kind name list gains `'snow'`, `'murk'`; the "shipped stage rows use the planned kinds and rates" case gains the two E4 rows; the new-kinds size table gains `['snow', 1, 1]` and `['murk', 2, 2]`.
   - `particles.test.ts` and `spriteValidator.test.ts` (the `ParticleKind` union literal): gain the two kinds.
   - `ambientSafety.test.ts`: see note 7.
   - `stagesE2Art.test.ts` / `stagesE3Art.test.ts` / `enemyArt.test.ts`: any count tied to "six stages", "30 templates", or "exactly the six bosses" (`ENEMY_PHASE_PALETTES` keys) becomes 8, 40, and the eight boss ids; E4-specific cases go in a new `stagesE4Art.test.ts`.
   - `enemyBundle.test.ts` (lines 50, 62, 78): assert the bundle contains the two new stage ids and ten enemy ids.
   - `lookAlikes.test.ts` / `support/lookAlikes.ts`: `BASELINE_IDS` stays the 20 E1/E2 ids; no entry is added (a test forbids it); the matrix runs over 24 minions, 8 elites, 8 bosses.
   - `performance.test.ts`: no pinned count; rerun. The budget ceilings stay 200 and 520.
2. **Enemy table.** `validateEnemies(ENEMIES, STAGES)` is empty: 40 rows, 5 per stage, exactly one boss per stage, at least one minion per stage, unique kebab-case ids across eight stages.
3. **Progression wrap.** With the shipped eight stages: killing the Stage 8 boss sets `stageIndex` 1 and `cycle` + 1; Stages 1 to 7 advance without a cycle; `load` of `stageIndex` 9 and 10 wraps to 1 and 2 (the progress validator caps the stored index at `MAX_STAGE_INDEX` 10); counters are kept; the Stage 7 boss sets `stageIndex` 8 with no cycle.
4. **Look-alike policy.** `test/game/lookAlikes.test.ts` already generalizes the policy and reads wired art; this step needs no new test logic, only that the ten new enemies pass: every same-size pair under 0.85 overlap and at most 0.80 IoU; same-stage minions under 0.75 overlap; no E4 enemy appears in `LEGACY_OVER` or `KNOWN_OVER` (a test forbids it). A measured E4 failure is an art finding for the pixel-artist, never a pin. The 11 legacy pins stay as they are unless the optional rework (section 11.0) lands, in which case the tester prunes the stale entries (stale pins fail). Named E4 pairs the tester prints first: Rime Penguin vs Wailing Ghost, Goblin Scout, Bone Soldier, Spore Shroom; Frost Hare vs Moss Wolf, Toxic Toad, Cellar Rat, Cave Bat; Snow Sentry vs Green Slime, Spore Shroom, Thorn Sprout; Lantern Wraith vs Wailing Ghost, Bramble Pixie, Cave Bat; Shard Cluster vs Bramble Pixie, Cave Bat; Mirror Mimic vs the older minions (a ring should clear all of them); Snow Yeti vs Rock Golem, Crypt Mummy, Furnace Guard, Crate Mimic, Ancient Treant; Gloom Stag vs Ancient Treant (antler fan vs branching crown), Jelly Cube, Crypt Mummy; the two new bosses against the six older ones.
5. **Stage data and art.** `validateStages(STAGES, SHIPPED_ART)` is empty; each new stage has the required props, at most 8 lights (6 each as designed), the flame loops (`iceLamp` 2, `iceSheet` 2, `floatingShard` 2, `wispTorch` 4), solid props only as alcove floor props at foot y 134, floor-layer prop names limited to the four allowed (5.1 rule 1); `validateArtSet(SHIPPED_ART)` is empty, which includes `validateEnemyArt` over 40 templates and the boss phase palette for every boss (`ENEMY_PHASE_PALETTES` keys are exactly the eight boss ids, one phase each, at most four master characters, `#rrggbb`). A Stage 7 and a Stage 8 enemy rasterize with their stage palette. Master palette: 37 as delivered (at most 40, hard limit 48). No hex and no `data:` URI in any new template file (extend the scanned list; `palettesE4.ts` legitimately holds hex like `palettesE3.ts`). Silhouettes of the new enemies are not identical solid shapes (bounding-box and pixel-count distinctness across the ten rows, as in the E2 and E3 cases).
6. **Ambients.** `Ambience` with `snow` and `murk` emits only its kinds at the configured rates (statistical bounds with a seeded rng), inside the corridor view and the stated y bands; snow falls (y increases while alive) and sways only slightly; murk rises (y decreases on average) and stays inside its band plus drift. `Particles`: old kind indices stable, `snow` draws one 1x1 `fillRect`, `murk` one 2x2, a full pool never throws. **No flashing:** each ramp has at least 3 steps and no ramp step is shorter than 0.5 s at the minimum configured life (snow `3500 / 3`, murk `4000 / 3`, both over 1 s); neither ramp contains `Y`, `O`, `R`, or `D` (the hit and ember colors) so snow and murk cannot be mistaken for a spark or ember. Budget: 8 heroes, 12 enemies, 16 drops, 24 effects, 8 summons, and a full particle pool stay within 200 bitmaps and 520 fills in Stages 7 and 8 as well.
7. **Hero invariants and scenery safety (extend, do not weaken).**
   - The hero-invariant and combat-isolation suites run once per stage (now eight): drive a wave and the boss, apply every host event and every combat stimulus, assert `heroSnapshot()` is identical to a run with enemies off; a full 1 to 8 to 1 sequence (boss defeats, holds, fades, wrap, cycle + 1) leaves every hero's `x`, `y`, `phase`, `lifecycle`, and `classId` unchanged and no hero is removed. **This replaces the roadmap's "freeze effect does not delay working/idle" test**: an event applied while a stage fade, an ambient, or a boss intro is running takes effect on the next update, identically to a run in Stage 1.
   - **Scenery safety (new).** (a) Structural: in `ambientSafety.test.ts`, extend `DECORATION` with the new files (`stage7Templates.ts`, `stage8Templates.ts`, `enemiesStage7.ts`, `enemiesStage8.ts`, `glacierMammothTemplate.ts`, `eclipseWardenTemplate.ts`, `palettesE4.ts`) and `DECORATION_WORDS` with `\bsnow\b|snowfall|\bmurk\b|SNOW_|MURK_|frozen-citadel|shadow-realm|icePillar|icicleCluster|frostBanner|iceLamp|iceSheet|iceThrone|snowDrift|duskPillar|floatingShard|mirrorFrame|wispTorch|duskAltar|shardPatch`. **Do not add the bare words `frozen`, `shadow`, `mirror`, or `shard`**: `frozen` is the existing entity quarantine flag (`Entity.frozen`, used by the crash-isolation guard and its tests), `shadow` is the drawn flat shadow, `mirror` is the host-state mirror in `Game.ts` and `SceneFeed`; they would fail legitimate files. The enemy-table check (the Ember Imp strip) gets a sibling that removes the ten new ids and names before asserting `enemies.ts` mentions no `snow|murk|frost|ice|glacier` scenery words. (b) Behavioural: with the stage fixed at Stage 7 and at Stage 8, a heroes-only run and a run with ambients and lights at full density produce identical `heroSnapshot()` sequences. (c) Tint: the Stage 7 and 8 `g` values are not red-dominant (red at most 1.3 times max(green, blue)) and not near-black (relative luminance at least 0.02). (d) Nothing outside `Ambience.ts` reads the ambient kind (existing test).
   - Throwing from `Ambience.update` (new cases) and from `Enemy.draw` of a new enemy leaves the scene running. Summons are never in the fighter buffer or the enemy list (unchanged tests run per stage).
8. **Stage 8 legibility and Stage 7 brightness (new, automated half).** Because entities are drawn after the light map, the risk is the environment, not a darkened hero. For each of the eight stages compute the mean relative luminance of the `floorBack` and `floorFront` tile frame 0 after multiplying by the stage ambient (`tile * g / 255` per channel) and print the table. Rules (self-calibrating, so the tester sets the absolute numbers from the printed table, not from this plan): Stage 8 floor luminance is at least 70 percent of the darkest of Stages 1 to 7 (Stage 4's dusty purple is the precedent); Stage 7 floor luminance is at most 130 percent of the brightest of Stages 1 to 6; and for both, the WCAG contrast ratio between the floor mean and the hero cloth `c` (`#4fa3e8`) is at least 2.0. If a rule fails, it is an art finding, not a pin. The ratio between a stage's mean enemy fill luminance (non-outline pixels of its five enemy idle frames) and its floor luminance is printed and must be at least 2.0 (E4 enemies are brighter than the floor).
9. **Animation motion (new).** For the new props and enemies, the pixel difference between consecutive idle frames is no larger than the maximum already shipped in E1 to E3 (the tester measures that maximum and records it; this stops a large bright/dark swap). Props `iceSheet` and `floatingShard` have a per-frame time of at least 500 ms and `iceLamp`/`wispTorch` at least 300 ms in their template speed field (the artist states the field name in A-E4-2/3; the tester asserts it). Boss `telegraph` and `attack` animations differ for both new bosses.
10. **Structural.** The seams are unchanged: `ENEMY_SIDE` and `HERO_SIDE` literal arrays need no edits; `data/enemies.ts` stays the only enemy numbers; the ban-list scan passes over the new sprite files, `stages.ts`, `Ambience.ts`, `Particles.ts`, `tuning.ts` (words to watch in section 9, R2). `Combat`, `Enemy`, `Boss`, `Progression`, and `StageDirector` show no diff against E3 (the reviewer checks the diff).
11. **Existing suites stay green**, including M2 to E3 integration; protocol and progress tests untouched; `PROTOCOL_VERSION` still 2, `PROGRESS_SCHEMA_VERSION` still 1.
12. **Performance (soft).** Reuse the E1 node benchmark in Stages 7 and 8 (average under 1 ms per frame, fail above 4 ms). Add a case at the maximum configuration: `maxEnemies` 12, eight fighters, boss on screen, Stage 7 and 8 lights (6) and ambients on. Also record boot time with eight stage runtimes built. Real frame time is manual (task 7). Record the production webview bundle size (R11).
13. **Manual QA ([testing strategy section 7.3](../../engineering/testing-strategy.md)).** Ten new enemies readable by silhouette against their own stage and older siblings; no snow flake, murk mote, or enemy looks like a hero status effect or a hit spark; the Stage 7 ice glint is calm; Stage 8 is dark but not unreadable; every class stays legible at three panel sizes in both stages (check Necromancer, Rogue, and the darkest hair tones in Stage 8; Mage and Warrior in Stage 7); stage fades are slow; Stage 7 and 8 lights are visible but not harsh; the Glacier Mammoth and Eclipse Warden telegraphs read differently from their attacks.

Not automated: rendered pixels, silhouette quality, real-canvas frame time.

## 8. Gates for E4

| Gate | E4 meaning |
|---|---|
| G1 | `npm run build`, `lint`, `typecheck` (all three projects), `test`, and `test:integration` pass |
| G2 | `npm run docs:tables` leaves no diff and lists 40 of 50 enemies |
| G3 | invariants intact (section 2); the hero-invariant suite passes per stage (eight); scenery safety (note 7) passes; notes 2 to 10 pass |
| G4 | no new packages; no image, audio, or font files |
| G5 | `CHANGELOG.md` entry; `enemies-and-stages.md` and `game-design.md` match the data; art docs match the art; [game engine](../game-engine.md) and [data model](../data-model.md) match the code |
| G6 | `CLAUDE.md` directory map and ownership rows match the repo (architect syncs on the developer's drift flag) |
| G7 | reviewer Approve; one commit; roadmap E4 ticked |

**Done when** ([roadmap E4](../../engineering/roadmap.md#e4-stage-7-frozen-citadel-stage-8-shadow-realm), made concrete): G1 to G7 hold; `validateEnemies` passes for stages 1 to 8 (40 enemies); progression wraps after Stage 8 with `cycle` + 1; snow, murk, ice, mirrors, and every other stage decoration cannot affect hero state (note 7 passes) and an event applied during a stage transition or ambient takes effect on the next update; look-alike policy holds for all ten new enemies; Stage 8 legibility rules (note 8) hold; the manual benchmark holds 60 fps with 8 heroes and a full wave of 12 enemies in Stages 7 and 8 (40 distinct enemy types exist; the on-screen pool stays 12).

## 9. Risks, assumptions, defaults

- **R1: atomic switch.** Rows without art, art without rows, or a boss row without its phase palette break `Game` or the validators (section 4). Mitigated by the wiring order; task 4 is a single step.
- **R2: vocabulary scan (what it actually matches).** The hero-side ban is a **word-boundary** regex over `hp health mana dead downed retreat damage gauge hurt dying`. It does **not** match `frozen`, `freeze`, `frost`, `frostbite`, `chill`, `shadow`, `wraith`, `death` (only the animation-name regex catches `death`, `hit`, `die`), or `dead` inside a longer word (`deadline` passes; the E3 plan's remark that it fails was too cautious). So `frozen-citadel` and `shadow-realm` as ids and names are safe. The real risks are prose: "frost damage", "shadow damage", "chill hurt", "freezing health", "death-like stillness", "dying light", "deadly cold", "dead eyes", "retreating shadows", "mana wisp", "hp" in a name, "gauge" in "cold gauge". Use "fading", "dimming", "glinting", "rimed", "dusk", "frosted" instead. **Hero vocabulary rule:** no E4 file may describe a hero as frozen, chilled, slowed, hurt, or shadowed; "frozen" and "shadow" appear only for the stage names and the scenery. Do not name any animation anything containing `hit`, `death`, `dead`, `die`, `dying`, `hurt`, `downed`. Artists and developers reread their files with the list in hand; the structural test is the net.
- **R3: ambient particle cost.** About 43 snow and 22 murk particles at steady state, one `fillRect` each, inside the 520-fill ceiling (it assumes a full pool). If the manual benchmark shows overdraw cost, lower `perSecond` (constants only).
- **R4: look-alike pressure (the main art risk).** After E4 there are 24 minions at 16x16, 8 elites at 24x24, and 8 bosses at 48x48. Each new minion has 23 pairs to clear (18 older minions plus the 5 other new ones) and the batch adds 149 new pairs: 123 minion pairs (6 x 18 older plus 15 among the new six), 13 elite pairs, 13 boss pairs. Stage palettes recolor each stage's enemies to one color family, so shape is the only separator within a stage. The silhouette cues in section 5.2 are chosen to be maximally unlike the older sets: a *ring* (Mirror Mimic), a *fragment cloud* (Shard Cluster), a *handle-and-box* (Lantern Wraith) and a *stack of three balls* (Snow Sentry) have unusually low overlap with solid hulls; the hare is vertical with long ears (the wolf is horizontal); the Mammoth is the first horizontal boss. The pairs most likely to bite: Rime Penguin vs Wailing Ghost and Spore Shroom (upright rounded masses), Snow Sentry vs Green Slime (round masses), Frost Hare vs Moss Wolf (ears), Snow Yeti vs Rock Golem and Furnace Guard (wide-shouldered elites), Gloom Stag vs Ancient Treant (antlers vs a crown).
  **The artist runs the report command before drawing and after each file** (section 11, "Report command").
- **R5: the 11 legacy pairs (art debt, listed so nothing is lost).** All are among E1/E2 enemies, pinned in `LEGACY_OVER` with their measurements (overlap / IoU): `cellar-rat` vs `cave-bat` 0.856 / 0.686; `cellar-rat` vs `web-spider` 0.830 / 0.564; `cellar-rat` vs `ore-beetle` 0.862 / 0.718; `cave-bat` vs `web-spider` 0.802 / 0.582; `cave-bat` vs `ore-beetle` 0.856 / 0.723; `web-spider` vs `ore-beetle` 0.896 / 0.674; `crate-mimic` vs `rock-golem` 0.922 / 0.728; `crate-mimic` vs `crypt-mummy` 0.897 / 0.623; `rat-king` vs `tomb-lich` 0.873 / 0.605; `goblin-miner` vs `goblin-scout` 0.874 / 0.671; `rock-golem` vs `crypt-mummy` 0.869 / 0.692. Two of the pins fail only the same-stage minion rule (0.75), not the global 0.85: `cellar-rat` vs `web-spider` and `cave-bat` vs `web-spider` (all three Stage 1 minions are one stage); `cellar-rat` vs `cave-bat` and `goblin-miner` vs `goblin-scout` fail both. The smallest set of in-place reworks that clears all 11 (same ids, sizes, anchors, animation sets, so no data or switch change): `cellar-rat`, `cave-bat`, `ore-beetle` (the Stage 1/2 minion cluster), `goblin-scout`, `crate-mimic`, `crypt-mummy` (elite cluster), and one of `rat-king` or `tomb-lich` (a 48x48 boss, with its phase palette kept). That is seven templates, three of them in the first stage a player sees. Estimate for the pixel-artist to confirm in A-E4-0: about one batch for the minions and goblin-scout (four templates), a second for the three elites/bosses; larger than the four-template A-E3-0. **Default: defer** (decision E4-8): E4 already carries two environments and ten new enemies, the debt does not worsen under the ratchet, and a Stage 1 reskin is a visible change better paired with the polish before release; schedule it as a standalone art-debt pass before E5 closes or before M9. The alternative (do it as A-E4-0 and prune the pins) is fully specified if the human prefers it.
- **R6: master palette budget.** 37 of 48. **E4 adds 0 characters by default, hard cap 40 of 48** (at most 3, same allowance as E3). The remaining 11 slots must still cover E5 (up to 3) and U1 UI glyphs. E4 needs none: `STAGE_PALETTES` overrides `1` to `8`, `g`, `T` per stage (ice blue and indigo come from there); the snow ramp uses `w q Q`; the murk ramp uses `g b P`; the boss phase palettes override characters that already exist. Any new character is asked for in the handoff with the reason.
- **R7: boss and minion durations (the main tuning risk).** Stage growth is 1.35 per stage, so with the E1 formula and `vigor` 1.0 the Stage 7 boss would have 726 health (2506 with eight fighters) and the Stage 8 boss 981 (3383 with eight), versus the Stage 4 boss at 295 (1019): the Stage 7 boss would be about 2.46 times and the Stage 8 boss about 3.3 times the Stage 4 boss. Using the same unmeasured rates as E3 (solo about 2.55 health per second from the Stage 1 boss at 120 health in about 47 s; about 20 per second with eight heroes from the Stage 4 estimate of 1019 in about 50 s), vigor 1.0 would be about 285 s solo / 123 s with eight at Stage 7 and 385 s solo / 166 s with eight at Stage 8: too long. Defaults: Glacier Mammoth `vigor` 0.6 (436 / about 1504: about 171 s solo, about 74 s with eight) and Eclipse Warden `vigor` 0.5, the validator floor (490 / about 1692: about 192 s solo, about 83 s with eight), aiming at roughly the Stage 6 boss duration (73 s with eight) plus a little per stage. Regular enemies: the vigors in section 5.2 hold minions to 41 to 57 health (E3: 27 to 58) and elites to 145 and 157 (E3: 104 and 129), about 16 to 22 s solo per minion and 57 to 62 s solo per elite. **These are estimates from arithmetic, unmeasured, pending the manual benchmark; the lever is each row's `vigor` only (decision E4-7).** `HEALTH_GROWTH` stays calibrated for ten stages and is not touched. **Flag for E5:** the Stage 8 boss is already at the vigor floor, so Stage 9 and 10 bosses at 0.5 would be about 662 / 2284 and 894 / 3083 (about 112 s and 151 s with eight), longer than Stage 8's. E5 must either lower `VIGOR_MIN` (a validator range change) or flatten `HEALTH_GROWTH` for late stages; decide it in the E5 plan, not here.
- **R8: cycle semantics change.** A stored `cycle` was counted in 6-stage passes; it is now an 8-stage pass. Enemy health rises 25 percent per cycle (capped at 8), so a returning player's early stages get slightly tougher per past cycle. Accepted (decision E4-6); no migration, schema stays v1. E5 changes the meaning again (New Game+).
- **R9: downgrade.** An E4 save with `stageIndex` 7 or 8 opened by an E3 build wraps to Stage 1 or 2 (`% 6`), keeps counters, and does not fail. Nothing to do.
- **R10: photosensitivity, motion, and Stage 8 legibility.** No flashing is added. Snow and murk ramps step over more than 1 s each; props use `flicker: false`; the Stage 7 ice glint (`iceSheet`) is a 2-frame loop at 500 ms or slower with a small pixel difference; the Eclipse Warden's corona and any mirror glint are never a large-area bright/dark alternation (note 9 caps frame-to-frame difference at the shipped maximum). Phase-2 palettes switch **once** at the half-health transition, never repeatedly. Legibility: entities are drawn after the light map (Lighting section above), so heroes are never darkened by Stage 8's ambient; the risk is dark heroes (violet hood, slate cloth, dark hair) on a dark floor and dark enemies on the same floor. Mitigations: the self-calibrating luminance rule (note 8); a violet-leaning but desaturated indigo floor rather than the Necromancer's hood violet; enemies in Stage 8 carry bright accents (eyes, flames, corona) from `6`/`7` and read lighter than the floor; the stage ambient `g` is not near-black. The later reduce-motion setting (M7) should suppress snow and murk; a note for M7, nothing to do in E4.
- **R11: bundle size.** Ten enemies at 7 to 11 frames plus two environments add tens of KB of template strings. The tester records the production webview size; the standing assumption is under 300 KB through E5. If E4 leaves it above 250 KB, flag it in the handoff so E5 can plan (e.g. compact frame encoding). Also the build and boot cost of eight stage runtimes (tester records boot time).
- **R12: bosses against each other.** The Glacier Mammoth (horizontal, tusked) and Eclipse Warden (round disc with a corona) are deliberately unlike the six upright older bosses; the elites Snow Yeti (hunched, long arms) and Gloom Stag (low quadruped with a wide antler fan) are unlike Rock Golem, Crypt Mummy, Furnace Guard, and Ancient Treant. Covered by the same-size look-alike check.
- **R13: duplicate theming of light.** Stage 7's `T` (pale blue) is close to Stage 5's soft blue bloom light; Stage 8's violet is close to Stage 4's dusty violet. The palettes differ in lightness and saturation (Stage 7 colder and paler, Stage 8 darker and bluer). Manual QA checks that a player can tell the stages apart at a glance; the lever is palette values only.
- **Defaults chosen:** no new mechanic and no hero overlay; rows as in section 5.2; E1 formulas and constants unchanged except the two boss vigors (and low regular vigors); drops reuse the four E1 kinds; ambients are particle emitters only; two new particle kinds (`snow`, `murk`) appended; zero new master characters; legacy look-alike debt deferred; one commit; schema v1 and protocol 2 unchanged; the validator stays in incremental mode until E5.

## 10. Ownership split

| File or area | Owner |
|---|---|
| `src/game/sprites/stage7Templates.ts` (`FROZEN_CITADEL`), `stage8Templates.ts` (`SHADOW_REALM`), `enemiesStage7.ts` (`ENEMIES_STAGE7`), `enemiesStage8.ts` (`ENEMIES_STAGE8`), `glacierMammothTemplate.ts`, `eclipseWardenTemplate.ts`, `palettesE4.ts` (`BOSS_PHASE_PALETTES_E4`) (new), `palettes.ts` (stage char tables, snow and murk ramps), `palettesE1.ts` (`STAGE_PALETTES`), `enemyTemplates.ts` and `spriteTemplates.ts` (barrel merges, last), `docs/design/art-style-guide.md`, `docs/design/sprite-spec.md`; if the rework is chosen, in-place edits to the seven legacy templates | pixel-artist |
| `src/game/data/enemies.ts` (rows), `data/stages.ts` (rows, `AmbientEffect`), `data/tuning.ts`, `Ambience.ts`, `Particles.ts`, `Renderer.ts` (colour map), `sprites/spriteValidator.ts` (`REQUIRED_PROPS`, `FLAME_PROPS`), `docs/design/enemies-and-stages.md`, `docs/design/game-design.md`, `CHANGELOG.md`, the roadmap E4 status lines, all git operations | developer |
| `test/**` (incl. new `stagesE4Art.test.ts`, the E4 ambient and legibility cases, `ambientSafety.test.ts` edits), `docs/engineering/testing-strategy.md` | tester |
| this plan, `game-engine.md`, `data-model.md`, `roadmap.md` (except status), `docs/index.md`, `CLAUDE.md` (except Core invariants) | architect |

## 11. Art needs (batch E4)

Characters only, no hex (except `palettesE4.ts` phase palettes and the stage palette values in `palettesE1.ts`); `.` is transparent; enemies face **left** and are never mirrored except while withdrawing (E1 rule); at most 12 colors per sprite; each stage's tiles, props, backdrop, and enemies use the eight stage characters `1` to `8` (recolored by `STAGE_PALETTES[stageId]`) plus master accents. Validate before handing over. Do **not** merge into the barrels until A-E4-6 (section 4). Avoid the banned words in comments (R2). The look-alike policy applies to every enemy.

**Report command (give the artist this up front; run it before drawing to see the silhouettes to avoid, and after every enemy file).** From the repo root:

```text
node test/support/lookAlikesReport.mjs
node test/support/lookAlikesReport.mjs src/game/sprites/enemiesStage7.ts:ENEMIES_STAGE7:7
node test/support/lookAlikesReport.mjs src/game/sprites/enemiesStage7.ts:ENEMIES_STAGE7:7 src/game/sprites/enemiesStage8.ts:ENEMIES_STAGE8:8
```

With no arguments it prints the matrix for the wired 30 enemies (use it first to see which 16x16, 24x24, and 48x48 hulls are already crowded). With `file:Export:stage` arguments it adds the new template maps (or replaces by id), prints only pairs involving them with the policy verdict (overlap, IoU, `same-stage` flag), and exits 1 on a violation. Boss and elite files that export a single template are passed through a small wrapper map or merged by the artist in a scratch export; if the report cannot take a single-template export, the artist reports it and the tester extends the script (T-E4-0). The numbers to beat: overlap under 0.85, IoU at most 0.80, same-stage minions under 0.75.

### 11.0 A-E4-0: legacy debt estimate (report only, default) or rework (if chosen)

Default: the artist runs the no-argument report and returns, in the handoff, an estimate for the seven-template rework (R5) and a one-line proposal per template. No file changes. If the human chooses the rework (E4-8), redraw in place with the same ids, tier sizes, anchors, and animation sets (so no data change); the tester prunes the cleared pins in the same change.

### 11.1 A-E4-1: shared additions

| Item | Where | Spec |
|---|---|---|
| Stage palettes | `palettesE1.ts` | `STAGE_PALETTES['frozen-citadel']` and `['shadow-realm']`: `1` to `8`, plus `g` and `T`. Meanings stay stable: 1 deepest shadow, 2 dark rock, 3 mid rock, 4 lit rock, 5 secondary material, 6 light source, 7 highlight, 8 accent. Stage 7: cold blue-gray stone, `5` ice blue, `6` pale cyan light, `7` frost white (sparse), `8` a teal-blue accent not close to the Mage's cloth blue; `g` a cool blue-gray (about `#64759b`); `T` pale blue (about `#bfe8ff`); keep floor tiles mid-dark, ice and white only as highlights. Stage 8: dark desaturated indigo stone (not the Necromancer's hood violet), `5` violet crystal, `6` lilac-white wisp light, `7` pale highlight, `8` cold cyan accent; `g` dark indigo-violet (about `#6a62a0`, red well under 1.3 times the larger of green and blue, not near-black); `T` soft violet (about `#c8a0ff`). Enemies stay brighter and more saturated than the floor (R4, R10). |
| Stage character tables | `palettes.ts` | entries for both ids in `STAGE_TILE_CHARS` (`12345678`), `STAGE_CLEAR_CHAR` (`n`), `STAGE_AMBIENT_CHAR` (`g`). |
| Particle ramps | `palettes.ts` | `PARTICLE_PALETTE.snow`: for example `['w', 'q', 'Q']`; `PARTICLE_PALETTE.murk`: for example `['g', 'b', 'P']`. Widen the type union. Master characters only; no `Y O R D` in either (R10, note 6); at least 3 steps. No new master character (37, cap 48, E4 limit 40). |

### 11.2 A-E4-2: Stage 7 environment (`frozen-citadel`, file `stage7Templates.ts`, export `FROZEN_CITADEL`)

Tiles: `wallTop` 2, `wallMid` 5 (4 frosted citadel-wall variants, plus variant 4 with transparent pixels, for example an arrow slit or a frost-rimed window so the backdrop shows), `wallBase` 2, `floorBack` 3, `floorFront` 3, `foreground` 2; join rules as every stage. Props per section 5.2 (`doorFrame`, `icePillar`, `icicleCluster`, `frostBanner`, `iceLamp` 2-frame slow pulse, `iceSheet` 2-frame slow glint at 500 ms or slower, `iceThrone`, `snowDrift`), ids `frozen-citadel/<name>`; solid props foot-anchored at the base center. Backdrop 128x128, period 64: distant frozen towers and battlements under a pale sky, hanging icicles. Mood: cold blue-gray and pale cyan, "ice blue, frost white" ([art style guide](../../design/art-style-guide.md)). Floor and walls darker and less bright than the enemies. State the template speed field used for the slow loops in the handoff (note 9).

### 11.3 A-E4-3: Stage 8 environment (`shadow-realm`, file `stage8Templates.ts`, export `SHADOW_REALM`)

Same tile counts and rules. The transparent `wallMid` variant is a dark archway to the backdrop. Props: `doorFrame`, `duskPillar`, `floatingShard` (2-frame slow bob, dim light), `mirrorFrame`, `wispTorch` (4-frame loop, slow, `flicker: false`), `duskAltar` (solid, 16 px wide), `shardPatch`; ids `shadow-realm/<name>`. Backdrop 128x128, period 64: a night void with floating shards and a pale horizon glow. Keep it cute-spooky, no gore. Floor tiles stay legible (R10): mid-dark indigo, not black; no pure-black tile larger than the outline pixels. No words from the ban list in comments (R2).

### 11.4 A-E4-4: Stage 7 enemies (file `enemiesStage7.ts`, export `ENEMIES_STAGE7`)

Each `enemies/<id>`, left-facing, foot anchor (minion `(8, 15)`, elite `(12, 23)`), animations `idle 2, walk 2, attack 3`, cute-spooky. Silhouettes must differ when filled solid black and pass the matrix.

| id | Tier and size | Look | Silhouette cue |
|---|---|---|---|
| `rime-penguin` | minion 16x16 | a round penguin dusted with rime, small flippers, an orange beak, glinting eyes; `attack` lunges the beak forward | upright oval with flippers out, a beak point; not a sheet, not a mushroom |
| `frost-hare` | minion 16x16 | a hare with very long ears and a big haunch, a tuft of frost on its back; `attack` kicks forward | tall: ears reach the top rows, a vertical body, hind leg out; not the low flat rat/toad hull or the wolf |
| `snow-sentry` | minion 16x16 | a little snowman guard: three stacked balls, stick arms, coal eyes, a carrot nose, a tiny helmet; `attack` swings a stick arm | three stacked circles narrowing to the top, not a dome |
| `snow-yeti` | elite 24x24 | a hunched yeti with white fur, long arms hanging to the knees, a small head sunk between wide shoulders, blue-pale face; `attack` swings an arm forward at chest height, never overhead | wide-shouldered hunch with dangling arms, not a boxy golem or wrapped mummy |

### 11.5 A-E4-5: Stage 8 enemies (file `enemiesStage8.ts`, export `ENEMIES_STAGE8`)

Same contract.

| id | Tier and size | Look | Silhouette cue |
|---|---|---|---|
| `lantern-wraith` | minion 16x16 | a floating hooked lantern with a ring handle on top and a pale flame inside, two glowing eyes in the glass, wisps trailing under; hovers; `attack` swings forward | handle ring over a box with a flame, a thin trailing tail; not a ghost sheet or a bat |
| `shard-cluster` | minion 16x16 | three or four floating detached crystal shards around a small glowing core; hovers; `attack` thrusts the shards forward | fragmented: separate pieces with gaps, no single hull |
| `mirror-mimic` | minion 16x16 | an oval hand mirror or standing mirror in an ornate frame on two short legs, a pale face reflected in the glass; `attack` leans the frame forward | an upright ring with a hollow center on small legs |
| `gloom-stag` | elite 24x24 | a low antlered stag, dark body, a wide fan of antlers with glowing tips, a pale muzzle; `attack` lowers the antlers and thrusts forward | horizontal quadruped with a wide antler fan; not an upright tree crown |

### 11.6 A-E4-6: the two bosses, then wiring

`glacier-mammoth` (file `glacierMammothTemplate.ts`) and `eclipse-warden` (file `eclipseWardenTemplate.ts`), boss 48x48, left-facing, foot anchor `(24, 47)`, animations `idle 2, walk 2, attack 3, telegraph 2, intro 2` (11 frames), a clearly different `telegraph` from `attack`. Glacier Mammoth: a wide, low, icy mammoth with curved tusks, a frost-rimed shaggy coat, and a banner-scarred side; telegraph: the head lowers and the tusks glint; attack: a tusk sweep. Eclipse Warden: a hovering dark disc with a bright corona ring and four tendril arms ending in small claws; telegraph: the corona thickens and brightens for two frames (a slow change, not a flash); attack: two tendrils slam forward. Phase 2 palettes in `palettesE4.ts` (`BOSS_PHASE_PALETTES_E4`): at most four master-character or stage-character overrides each, same silhouette; Mammoth: coat and tusks shift to bright aurora teal and white; Warden: the corona moves to pale magenta-white while the disc stays dark. Phase colors change once at the transition; neither palette may produce a large bright area in a dark stage (R10).

**Then wire** (the only step that edits the barrels): `enemyTemplates.ts` merges `ENEMIES_STAGE7`, `ENEMIES_STAGE8`, `GLACIER_MAMMOTH`, `ECLIPSE_WARDEN`, and `BOSS_PHASE_PALETTES_E4`; `spriteTemplates.ts` adds `'frozen-citadel': FROZEN_CITADEL` and `'shadow-realm': SHADOW_REALM` to `STAGE_SPRITES`; update the header comments. Hand the developer the final prop names and the template speed field names.

### 11.7 What the engine draws itself (no art)

Hit flashes, dissolves, bars, shadows, the stage fade, drops (reused), snow and murk (from the ramps), light maps. The artist never draws a hurt, downed, frozen, chilled, or shadow-cloaked frame for an enemy and never any frame, icon, or tint for a hero.

### 11.8 Docs the pixel-artist updates

[Art style guide](../../design/art-style-guide.md): Stage 7 and 8 character and prop tables (as the Stage 5 and 6 sections), the two palettes, the delivered enemy rows with silhouette cues, the two phase palettes, the snow and murk ramps, the master palette count, and the look-alike backlog paragraph (the 11 legacy pairs, updated if A-E4-0 reworks land). [Sprite spec](../../design/sprite-spec.md): the new template files and exports.

## 12. Decisions for the human

Each has a default so work can proceed.

| # | Question | Default chosen | Alternative |
|---|---|---|---|
| E4-1 | Enemy names and numbers | The ten rows in section 5.2 (ids and names mirrored by the artist; the developer may rename) | Human-chosen names |
| E4-2 | Hero-side freeze or shadow effects (tints, icons, overlays) from the roadmap | None. No overlay, tint, or icon on any hero; ice and shadow are scenery and enemy art only (roadmap entry rewritten) | A separate plan for hero overlays; it would need the human to relax the "nothing is drawn on a hero" rule and a design proving they never read as hurt |
| E4-3 | Ambient implementation | `snow` and `murk` as two new `AmbientEffect` kinds and two new particle kinds (indices 8 and 9), master-character ramps | Snow only (one new kind) with Stage 8 reusing the `fog` ambient: no engine work for Stage 8 but wrong colors and a Stage 4 look |
| E4-4 | Stage ids and names | `frozen-citadel` "Frozen Citadel", `shadow-realm` "Shadow Realm" (as in the roadmap; the ban list does not match them) | `ice-citadel` / `dusk-realm` |
| E4-5 | Drops | Reuse `coin gem ore chest`; no new drop art | New drop kinds (shard, rime) with art and validator rows, no gameplay value |
| E4-6 | Cycle meaning after the wrap moves to Stage 8 | No migration; stored `cycle` continues (schema v1) | A v2 migration that rescales old cycles (a store migration for no benefit) |
| E4-7 | Boss and regular health | E1 formula, boss `vigor` 0.6 (Mammoth) and 0.5 (Warden, the floor), regular vigors 0.5 to 1.0 as in section 5.2; the E5 plan resolves the floor and growth curve | Vigor 1.0 (about 285 s and 385 s solo) or a flatter global curve now (changes all stages; E5) |
| E4-8 | The 11 legacy look-alike pairs | Defer; A-E4-0 is an estimate-only report; schedule the seven-template rework before E5 closes or before M9 | Rework in A-E4-0 (seven templates), prune the pins in the same change |
| E4-9 | Master palette growth | Zero new characters, hard cap 40 of 48 | A hard zero cap, or a larger allowance with E5 and U1 squeezed |
| E4-10 | Art delivery order | A-E4-0 (estimate), then six steps A-E4-1 to A-E4-6, barrel wiring last, then the developer's atomic switch | Rows with placeholder art (rejected: `Game` throws without real stage art) |
| E4-11 | Light behavior | All E4 lights `flicker: false`, slow loops (ice glint and floating shard at 500 ms or slower), ambient `g` not red-dominant or near-black | Flicker like torches (rejected for the photosensitivity risk and Stage 8 legibility) |
| E4-12 | Eclipse Warden gait | `float` (a hovering disc, draw-only offset); the developer confirms `Boss` and the validator accept `float` on a boss row and falls back to `walk` if not (no other change) | `walk` (grounded) |

## 13. Architect doc pass (applied with this plan)

- New: this plan.
- [Roadmap](../../engineering/roadmap.md): E4 entry rewritten (plan link, scope without hero overlays, files, art steps A-E4-0 to A-E4-6, done-when). Status lines untouched.
- [Docs index](../../index.md): the plan row.
- Not changed now; the architect updates at as-built time on the developer's drift flag: [game engine](../game-engine.md) (ambient kinds, particle kinds, eight delivered stages), [data model](../data-model.md) (stage and enemy tables, tuning groups, `AmbientEffect`, boss health table), `CLAUDE.md` directory map (the sprite-files line lists no E1 to E4 enemy and stage files; sync due at E4 as-built).
- For the tester: section 7 (T-E4-0, pinned counts, scenery safety and the word-list warnings, legibility rules). For the pixel-artist: section 11 and the sprite spec.
- Done at as-built time (section 14): [game engine](../game-engine.md), [data model](../data-model.md), and the `CLAUDE.md` directory map were synced to the working tree.

## 14. As-built notes (checked against the E4 working tree)

Each item was read from the code in the uncommitted tree on `feat/e4-stages-7-8`. The architect had no shell, so no test, lint, build, or look-alike report was run by the architect; the pixel-artist's measured numbers below are quoted from the [art style guide](../../design/art-style-guide.md) and [sprite spec](../../design/sprite-spec.md), and the health values were recomputed by hand from `healthOf` and match the generated table.

**Engine (matches section 5.1).**

- `Particles.ts`: `ParticleKind` and `KIND_NAMES` end `... 'firefly', 'snow', 'murk'` (`snow` index 8, `murk` index 9; earlier indices unchanged). Snow jitters `vx` by `(rng - 0.5) * 24 * dt` and leaves `vy` as emitted; murk jitters both axes by `(rng - 0.5) * 16 * dt`. Snow draws 1x1 and murk 2x2, one `fillRect` each.
- `Ambience.ts`: `snow` and `murk` cases with their own debts (`#snowDebt`, `#murkDebt`) through the shared `#accrue`, which caps each debt at `max(1, perSecond)` (the cap is per debt, not shared). `assertNever` keeps the switch exhaustive. `tuning.ts` carries exactly the planned `SNOW_*` and `MURK_*` values.
- `Renderer.ts`: the colour map gains `snow` and `murk`; `ArtSet.particlePalette` (`Record<ParticleKind, ...>`) therefore requires both ramps (`snow` `w q Q`, `murk` `g b P`, master characters only, so no palette growth; the master palette stays at 37 colors against a hard cap of 40).
- No hero-side code changed. **E4-2 was dropped as planned:** no overlay, tint, or icon on any hero, and nothing icy or dark is drawn on a hero.
- **E4-12 confirmed.** `Enemy.#gaitOffset` applies the `float` offset to any tier and `spriteValidator.ts` has no gait or tier restriction, so the Eclipse Warden boss uses `float` with no fallback. The offset is draw-only.

**The atomic switch is done, in the planned order.** New files first (`palettesE4.ts`, `stage7Templates.ts`, `stage8Templates.ts`, `enemiesStage7.ts`, `enemiesStage8.ts`, `glacierMammothTemplate.ts`, `eclipseWardenTemplate.ts`); the artist's stage palette entries (`STAGE_TILE_CHARS`, clear and ambient characters, `STAGE_PALETTES`) sit in `palettes.ts` and `palettesE1.ts` as in E3. The wiring then landed in one pass: `enemyTemplates.ts` merges `ENEMIES_STAGE7`, `ENEMIES_STAGE8`, `GLACIER_MAMMOTH`, `ECLIPSE_WARDEN`, and `BOSS_PHASE_PALETTES_E4`; `spriteTemplates.ts` adds `frozen-citadel` and `shadow-realm` to `STAGE_SPRITES`; and the two `STAGES` rows, ten `ENEMIES` rows, two `REQUIRED_PROPS` entries, and four `FLAME_PROPS` rules (`iceLamp` 2, `iceSheet` 2, `floatingShard` 2, `wispTorch` 4) were added together. `STAGES.length` is 8 and `Progression` needed no change (it takes the stage count; Stage 8's boss wraps to Stage 1 with `cycle + 1`, a stored index 9 becomes 1 and 10 becomes 2). Schema stays v1, `PROTOCOL_VERSION` 2, `MAX_STAGE_INDEX` 10.

**Stage rows (`data/stages.ts`), on the Stage 6 grid.** Both stages reuse the Stage 6 placement grid: door frame; alcove columns at x 0, lamps at (28,40) and (92,40), floor props at (6,134) solid 12x5, (60,152), (88,148); corridor lamps at (60,40) and (252,40), pillars at 150 and 330, floor props at 100, 200, 300.

- Stage 7 `frozen-citadel`, ambient `snow` 9/s. Alcove: `icePillar` (0,16), `icicleCluster` (52,16), `iceLamp` x2, `iceSheet` (52,120), `frostBanner` (108,52), solid `iceThrone` (6,134), `snowDrift` (60,152) and (88,148). Corridor: `iceLamp` x2, `icePillar` at 150 and 330, `icicleCluster` (110,16), `frostBanner` (200,52), `iceSheet` (190,120), `snowDrift` at 100, 200, 300 (y 152, 148, 150).
- Stage 8 `shadow-realm`, ambient `murk` 4/s. Alcove: `duskPillar` (0,16), `wispTorch` x2, `floatingShard` (52,76), `mirrorFrame` (108,52), solid `duskAltar` (6,134), `shardPatch` (60,152) and (88,148). Corridor: `wispTorch` x2, `duskPillar` at 150 and 330, `floatingShard` (190,72), `mirrorFrame` at 110 and 300 (y 52), `shardPatch` at 100, 200, 300.
- Lights (all `colorChar: 'T'`, **`flicker: false`**, E4-11 kept): `iceLamp` radius 48 intensity 0.8, `iceSheet` 44 and 0.5, `wispTorch` 48 and 0.7, `floatingShard` 40 and 0.5. Each stage has six lights (limit eight). Ambient tints `g`: `#64759b` (Stage 7), `#6a62a0` (Stage 8), both blue-dominant and not near-black; `T`: `#bfe8ff` and `#c8a0ff`.

**Prop timing note (verified, no deviation).** The template format has no per-frame speed. `Stage.ts` (line 267) gives `torch` and `lantern` `TORCH_FRAME_MS` (130 ms) and every other animated prop `PROP_FRAME_MS` (500 ms). `iceLamp`, `iceSheet`, `floatingShard`, and `wispTorch` are not in that exception, so all four loop at 500 ms per frame, which meets the plan's 500 ms floor (E4-11) with no deviation; `wispTorch` has four frames, a 2 s loop. Frame-to-frame pixel change is small (`iceLamp` 6, `iceSheet` 8, `wispTorch` 10 to 13, `floatingShard` 50 of 384), so nothing flickers.

**Stage 8 legibility (measured by the pixel-artist, floor tiles times the ambient tint).** Mean floor luminance: Stage 7 0.038, which is 1.17 times the brightest older floor (0.032; limit 1.30); Stage 8 0.017, which is 1.8 times the darkest older floor (Molten Core 0.0096; minimum 0.70). WCAG contrast of the hero cloth `c #4fa3e8` against the floor: 4.4 (Stage 7) and 5.8 (Stage 8). Class cloth against the Stage 8 floor: Necromancer 2.5, Rogue 3.0, Mage 3.4, the rest 3.3 or better; the Necromancer is 1.9 on the Stage 7 floor (reported by the artist). Idle-diff cap: the largest shipped enemy idle pair is `ooze-queen` at 466 changed pixels; `glacier-mammoth` is 362 and `eclipse-warden` 240, both under it.

**Enemy health (hand-computed, matches the generated table).** Minions 41 to 57 (Rime Penguin 48, Frost Hare 42, Snow Sentry 54; Lantern Wraith 49, Shard Cluster 41, Mirror Mimic 57), elites 145 (Snow Yeti) and 157 (Gloom Stag), bosses 436 (Glacier Mammoth, `vigor` 0.6) and 490 (Eclipse Warden, `vigor` 0.5) at party 1, and 1504 and 1692 with eight fighters.

**Look-alike outcome and backlog (E4-8 deferred as planned).** All ten new silhouettes pass the policy (`policy holds`) against every other enemy of their size. Tightest pairs by overlap (limit 0.85): ember-imp vs rime-penguin 0.847, rime-penguin vs lantern-wraith 0.840, crate-mimic vs gloom-stag 0.836, bone-soldier vs rime-penguin 0.832, wailing-ghost vs snow-sentry 0.830; bosses glacier-mammoth vs rat-king 0.804 and eclipse-warden vs molten-colossus 0.817; same-stage minion pairs 0.74 at most (limit 0.75). These margins are thin: any later tweak to those templates' idle frame 0 outline must re-run the report. The 11 legacy pairs among E1 and E2 enemies remain pinned in `LEGACY_OVER` (crate-mimic vs rock-golem 0.922 is the worst). The pixel-artist's estimate for the rework is seven templates in two art batches (batch one: `cellar-rat`, `cave-bat`, `ore-beetle`, `goblin-scout`; batch two: `crate-mimic`, `crypt-mummy`, and one of `rat-king` or `tomb-lich`), same size as A-E3-0 plus one; the tester prunes the cleared pins afterward. Three of the seven are Stage 1 enemies, so pair the rework with the pre-release polish pass.

**E5 flag (balance).** The Eclipse Warden is already at `VIGOR_MIN` (0.5), so E5 cannot lower Stage 9 and 10 boss `vigor` any further. With `HEALTH_GROWTH` 1.35 per stage and eight heroes, the Stage 9 and 10 bosses would run about 112 s and 151 s unless E5 lowers `VIGOR_MIN` (and the validator range) or flattens `HEALTH_GROWTH`. This is an E5 decision for the human; see [data model section 8](../data-model.md#8-enemies-drops-and-the-enemy-validator-e1).

**Mood text check.** The developer-written Stage 7 and 8 mood text in [enemies and stages](../../design/enemies-and-stages.md) ("pale ice blue, frosted stone, cold crystal glow"; "dark indigo dusk, violet crystal, pale wisp glow") agrees with the art style guide's table and palettes (ice blue and frost white; deep indigo and violet, violet crystal, lilac-white wisp light). No change needed.
