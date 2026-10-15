# H3 plan: Druid (beast), Monk, Artificer (turret), Berserker

Purpose: the detailed, task-by-task plan for batch H3 (the third and last hero batch): four more cosmetic hero classes that complete the table at 12, two new summon kinds (the Druid beast and the Artificer turret) on the existing summon machinery, a cosmetic "battle roar" for the Berserker that cannot read as a rage meter, and the change of `classFor` from eight to twelve classes. Written by the architect; the pixel-artist, developer, and tester work from it. Follows the layout of the [H2 plan](h2-classes.md) and the [H1 plan](h1-classes.md).
Related: [roadmap H3](../../engineering/roadmap.md#h3-druid-monk-artificer-berserker), [H2 plan](h2-classes.md), [H1 plan](h1-classes.md), [game engine](../game-engine.md), [data model](../data-model.md), [ADR 0002 no hero health](../adr/0002-no-hero-health.md), [ADR 0003 procedural sprites](../adr/0003-procedural-sprites.md), [ADR 0009 hero lifecycle isolation](../adr/0009-hero-lifecycle-isolation.md), [ADR 0011 summons are leased cosmetic entities](../adr/0011-summons-are-leased-cosmetic-entities.md), [security and safety](../security-and-safety.md), [art style guide](../../design/art-style-guide.md), [sprite spec](../../design/sprite-spec.md), [coding standards](../../engineering/coding-standards.md), [testing strategy](../../engineering/testing-strategy.md), [glossary](../../glossary.md), [CLAUDE.md](../../../CLAUDE.md).

## 1. Goal

After H3 every hero is one of twelve classes, still chosen from its session id and stable for as long as the webview document lives. H3 adds **no engine feature**: the four classes are rows in `classes.ts`, the two summons are entries in `SUMMON_IDS` plus art, and the effects are entries in `EFFECT_IDS` plus art. There is one small pool hardening (kind-aware raise and renew, section 3.2) and one tiny presentation change (per-kind summon shadow width). No `Druid.ts`, `Artificer.ts`, or other subclass file is written (H1-2 and H2-8 hold: a subclass only where code is needed, and none is).

- **Druid** (earth brown + leaf green, antler or leaf crown, gnarled wooden staff): the strike is a leaf spinning forward into the empty corridor. The ability, Wild Call, releases two drifting leaves and raises a **beast** (a small friendly wolf) beside the hero. The beast walks in place while the hero advances, snaps at nothing while the hero attacks, and sinks into the floor shortly after the hero stops fighting. It has no health, no target, and no effect on any hero.
- **Monk** (orange + cream, headband, bare forearms, glowing fists, no weapon): the strike is a small glow at the fist on the strike frame. The ability, Chi Burst, is a short warm burst in front of the hero plus the same fist glow. The glowing fists are weapon-layer art (as the Paladin sword glow in H2), not an engine feature.
- **Artificer** (copper + teal, goggles on the forehead, gear backpack, wrench): the strike is a wrench spinning forward. The ability, Deploy Turret, is a small dust puff, a wrench lobbed up, and a **turret** (a small clockwork walker) that folds up out of the floor beside the hero. It aims and "fires" at nothing, with no projectile, and folds back into the floor after the hero stops fighting. It has no health, no target, and no effect on any hero.
- **Berserker** (fur brown + war-paint red, wild spiky hair, bare chest, oversized axe): no strike effect (the axe swing is in the weapon layer). The ability, Battle Roar, is a one-shot expanding ring at the feet and two dust puffs. It is a **timer-driven flourish**, identical on its first and its hundredth cast, with no buildup, no persistent aura, and no link to anything that happens to the hero (section 2.1).

Layers touched: data tables (classes, effects, summons, tuning), game engine (`Summons` kind checks, `Summon` shadow width), sprites (art set, class, effect, and summon templates, palettes, validator constants), repo tooling (`docs:tables` summon cell wording and header). Not touched: the host, the monitor, `src/shared/protocol.ts`, CSP, `esbuild.mjs`, any setting, any dependency, persistence, `Hero`, `Roster`, `ClassHero`, `Entity`, `Renderer`, `Game`, `animations.ts`. The protocol does not change. **H3 needs no enemies and no `Combat`** (as in H1 and H2): shots and summons play into the empty corridor.

### 1.1 H2 as built, the facts H3 relies on (checked against HEAD 7311bae on `feat/h2-classes`)

- `ClassDef` has the keys `id name role colors silhouette strike ability summon` (`ROW_KEYS` in `classes.ts`). `summonErrors` already validates `kind in SUMMON_IDS`, `|dx| <= 40`, `|dy| <= 24`, so a new kind needs no validator edit.
- `SUMMON_IDS` is `['skeleton']` in `data/summons.ts`; its comment already says "H3 appends the Druid beast and the Artificer turret". `SUMMON_FRAME_MS`, `SUMMON_RISE_TOTAL_MS` (440), `SUMMON_SINK_TOTAL_MS` (300) are keyed by **animation name**, not by kind, and `REQUIRED_SUMMON_ANIMATIONS` is `idle 2, walk 4, attack 3, rise 4, sink 3` for every summon. All kinds share these timings and counts.
- `ClassHero` is generic: `onAbilityRelease` spawns the shots and raises `def.summon` at `floor(x) + dx * sign`, `floor(y) + dy`; `#tendSummon` renews from `phase` (`advance` gives `walk`, `attack` and `ability` give `attack`) and never reads `lifecycle`. It already works for any `SummonDef`. `createHero` calls `classFor(id)`.
- `SummonPool` (`Summons.ts`): capacity from `SUMMON_CAPACITY` (8), `#find(slot)` is a linear scan of the live list, `raise` ignores the requested `kind` when a non-`sink` summon already exists for the slot, and `renew(slot, x, y, faceRight, pose)` takes no kind. **This was harmless with one kind; with three it is the one gap H3 closes** (section 3.2).
- `Summon.shadowWidth` is a `readonly` field set to `SUMMON_SHADOW_WIDTH_PX` (8); the renderer's shadow pass reads `entity.shadowWidth` (`Renderer.ts` line 368), so a getter is a drop-in.
- Roster slots: `Roster.#create` takes the lowest free slot; `#remove` frees it. `#updateOrReplace` removes an exiting hero and creates a fresh one for the **same id** immediately, so the replacement has the same class and the same summon kind. `MAX_AGENTS` is 64 (`protocol.ts`) and `VISIBLE_SLOTS` is 32 (`layout.ts`), so up to 64 heroes can exist; the 8-hero line sits in one row, 18 px apart (`formationPosition`).
- `classMap.ts`: `DELIVERED_CLASSES = CLASS_IDS`, `CLASS_SHIFT = 20`, `classFor = DELIVERED_CLASSES[(hashId(id) >>> 20) % length]`. `hashId` is 32-bit FNV-1a.
- `MASTER_PALETTE` has 35 colors (`palettes.ts`; some art docs still say 33, an artist doc fix). The cap is 48. `ClassPaletteId` / `EffectSpriteId` unions are merged in `spriteTypes.ts` with the `H1`/`H2` split kept (`ClassPaletteIdH2`, `EffectSpriteIdH2`); `SummonSpriteId` is `'skeleton'`.
- `EFFECT_CAPACITY` is 24; the structural scan bans `hp health mana dead downed retreat damage gauge heal regen restore revive resurrect` in the files named in the [H2 plan, section 7](h2-classes.md#7-test-notes-for-the-tester) (`entities/**`, `Roster.ts`, `Effects.ts`, `Summons.ts`, `data/classes.ts`, `classMap.ts`, `effects.ts`, `summons.ts`).

## 2. Invariant check

| Invariant | How H3 respects it |
|---|---|
| 1 Heroes invulnerable | No `ClassDef` field is added, so no number that could be a resource exists on a class row. Auras (Battle Roar, Chi Burst, Wild Call, Deploy Turret) are one-shot bursts from the existing `EffectPool`, never a persistent icon, bar, or filling ring. Summons keep ADR 0011's rules: no hp, no gauge, never a target, no hit flash. The Berserker needs the extra rules in section 2.1. No new banned word is needed; the ids and names used (`wildCall`, `chiBurst`, `deployTurret`, `battleRoar`, `warCry`, `leaf`, `wrench`) were checked against the ban list. The word "rage" appears in no identifier. |
| 2 Lifecycle from host events only | `Hero`, `Roster`, `applyAgentState`, and `ClassHero` are untouched. The pool still takes plain numbers and returns nothing; the new `kind` parameter on `renew` is a `SummonId` string literal, not an agent id. A summon's life still follows the owner's cosmetic phase, derived from host events, never the reverse. |
| 3 Read-only monitor, reveal-only `focusAgent` | No host, monitor, or protocol change. |
| 4 Crash isolation | Unchanged. Each summon runs under `guarded`; the pool and the effect pool keep their own try/catch in `Game.step`. Missing beast or turret art is skipped, never thrown (`SpriteCache.summon` returns `null`). Pool exhaustion drops silently. |
| 5 No external assets | Class, effect, and summon sprites are palette-character templates. No new file types. |
| 6 No runtime dependencies | None. |
| 7 Transcript privacy | Nothing new is read, stored, or sent. The class stays a pure function of the session id; the pool is keyed by the hero's `slot` integer. |

### 2.1 The Berserker must not read as "hurt" or as a rage meter

The class name and the roadmap's "rage" invite exactly the reading invariant 1 forbids: a hero who gets angrier as it takes hits, a red glow that fills, veins, a pulsing tint. The rules, which the structural test and the reviewer's eyeball check enforce:

1. **Timer only.** Battle Roar comes from the same hidden seeded timer as every class (`ABILITY_INTERVAL_MIN_MS` 4000 to `MAX_MS` 8000, advanced only while attacking). It reads no enemy, no hit, no flash, no count, and no other hero. There is no class-specific interval, no faster cast "when angry", and no state carried between casts. The cast with index 1 and the cast with index 100 spawn the same shots with the same lifetimes (a test asserts it).
2. **One-shot, nothing persists.** The roar is a ring at the feet, at most 480 ms, plus two dust puffs of at most 360 ms. Nothing remains on the hero afterwards: no aura, no tint, no icon, no ring that grows or shrinks with a quantity.
3. **No red in any effect.** `warCry` is warm tan and orange on dust, with a transparent center. Red appears only as **static war paint**: two or three fixed stripe pixels on the face and the chest, drawn identically in every frame of every animation (a constant, like the Warrior's plume), as geometric bars and never as drips, streaks, or a gradient. It never brightens, spreads, or pulses with the phase, and the `ability` frame does not add red.
4. **No hurt cues.** No strained or pained face, no veins, no screaming mouth that persists outside `ability` (in `ability` the mouth is open mid-roar, like the Bard mid-song), no cracked or torn look, no staggering posture. The silhouette cue is shape (spiky hair, bare chest, oversized axe), with red as the accent only.
5. **Not a gauge anywhere.** The roar does not charge visibly: no wind-up glow that builds over seconds before the cast. The `ability` animation is the same 3 frames as every class.
6. **The E1 seam is closed in advance.** When E1 adds the cosmetic enemy-attack reaction (white flash, knockback), `ClassHero` must not read it and the roar must not be keyed to it. Roadmap H3 "done when" already says so; E1's structural assertion is that `ClassHero.ts` and the class tables import neither `Combat` nor `Enemy` (section 7 note 10).

If the reviewer judges that the red stripes read as wounds, the fallback is rust-orange paint (decision H3-3), a palette-only change.

## 3. Interfaces (signatures only)

All of `src/game/**` imports only `src/shared/**` and sibling game files.

### 3.1 Data tables

```ts
// data/effects.ts: EFFECT_IDS appends five (the eleven H1/H2 ids and their order do not change)
//   'leaf' | 'chiOrb' | 'chiBurst' | 'warCry' | 'wrench'
// data/summons.ts
export const SUMMON_IDS = ['skeleton', 'beast', 'turret'] as const;   // skeleton keeps index 0
// data/classes.ts
export const CLASS_IDS = ['warrior','mage','archer','rogue','cleric','paladin','necromancer','bard',
                          'druid','monk','artificer','berserker'] as const;   // H1 and H2 order kept; exactly 12
// ClassDef, EffectShot, SummonDef, ROW_KEYS, SHOT_KEYS: unchanged.
// classMap.ts: DELIVERED_CLASSES equals CLASS_IDS (all twelve). classFor unchanged in form.
// tuning.ts
export const SUMMON_SHADOW_PX: Readonly<Record<SummonId, number>>;    // skeleton 8, beast 12, turret 10; replaces SUMMON_SHADOW_WIDTH_PX
```

Default rows (the developer enters these; `dx`/`dy` are from the foot pixel, negative `dy` is up, the hero is 20 px tall; a moving effect is one with nonzero `vx` or `vy`).

| Class | role | colors | strike | ability | summon |
|---|---|---|---|---|---|
| druid | caster | earth brown + leaf green | `leaf` dx 10, dy -12, vx 110, vy -6, life 600 | `wildCall`, "Wild Call": `leaf` dx 12, dy -8, vx 20, vy -22, life 640; `leaf` dx 16, dy -6, vx 34, vy -14, life 640 | `{ kind: 'beast', dx: 16, dy: 1 }` |
| monk | melee | orange + cream | `chiOrb` dx 11, dy -9, no velocity, life 200 (static: plays once at the fist on the strike frame) | `chiBurst`, "Chi Burst": `chiBurst` dx 18, dy -10, no velocity, life 440; `chiOrb` dx 10, dy -9, no velocity, life 300 | null |
| artificer | ranged | copper + teal | `wrench` dx 10, dy -12, vx 140, vy -4, life 520 | `deployTurret`, "Deploy Turret": `smokePuff` dx 14, dy -3, no velocity, life 360; `wrench` dx 8, dy -14, vy -18, life 500 | `{ kind: 'turret', dx: 14, dy: 1 }` |
| berserker | melee | fur brown + war-paint red | none (the axe swing is in the weapon layer) | `battleRoar`, "Battle Roar": `warCry` dx 0, dy -3, no velocity, life 480; `smokePuff` dx -6, dy -1, no velocity, life 360; `smokePuff` dx 8, dy -1, no velocity, life 360 | null |

Silhouette text for the generated table (equals the art style guide; no banned words): Druid "antler or leaf crown, gnarled wooden staff, beast beside it"; Monk "headband, bare forearms, glowing fists, no weapon"; Artificer "goggles on forehead, gear backpack, wrench, turret beside it"; Berserker "wild spiky hair, bare chest, oversized axe". Names equal the art style guide: Druid, Monk, Artificer, Berserker.

Offsets: the skeleton sits at dx 18; the beast at 16 and the turret at 14 because they are wider or sit lower and the 18 px formation pitch would otherwise bury the next hero (section 9, R5). The values are data and the reviewer may tune them after F5. All shots obey the existing limits (at most 4 per list, life 100 to 1500 ms, `|dx| <= 40`, `|dy| <= 24`, speed at most 240 px/s); every row key set is unchanged, so `validateClasses` needs no edit.

Why no new field (for example `ClassDef.auraKind`) for the roar and the burst: a data field that names a "buff" invites a persistent version. One-shot effect ids already express everything (H2-4).

### 3.2 `SummonPool` hardening and per-kind shadow

The one-summon-per-slot rule is kept: `ClassDef.summon` is a single `SummonDef | null`, a hero has exactly one class, and the pool holds at most one summon per slot, so a slot can never hold two kinds at once. What changes is that the pool, which used to see one kind, becomes **kind-aware** so that a slot that is reused by a hero of another class can never keep or renew the wrong summon:

```ts
// Summons.ts
raise(slot: number, kind: SummonId, x: number, y: number, faceRight: boolean): void;
//   existing for the slot: phase 'sink', or a different kind -> restart it with the new kind (begin); same kind in rise/active -> leave alone
renew(slot: number, kind: SummonId, x: number, y: number, faceRight: boolean, pose: SummonPose): void;
//   NEW kind parameter; a missing summon, a sinking summon, or a summon of a different kind -> no-op (it sinks when its lease runs out)
// entities/Summon.ts
get shadowWidth(): number;   // SUMMON_SHADOW_PX[kind], or SUMMON_SHADOW_PX.skeleton while idle/unset; was a readonly field
```

Why this is needed even though a same-id replacement always has the same class: the slot is freed on `Roster.#remove`, which a different agent can then take. A summon is gone about 0.55 s after its owner's last renewal and a removal follows a victory plus warp-out, so in practice the window is shut. But H2 had one kind, so adoption of a stale summon was invisible; with three kinds an adopted skeleton under a Druid would be visible, and the pool should not depend on timing arguments to be right. The change is four lines in `raise`, one in `renew`, and `ClassHero` passes `summon.kind` it already has. It changes no invariant, no phase rule, and no cleanup row of [H2 plan section 3.2](h2-classes.md#32-the-summon-entity-and-the-pool); ADR 0011's decision is unchanged.

Everything else in the pool is unchanged: lease 250 ms, rise 440 ms, sink 300 ms, capacity from `SUMMON_CAPACITY`, never a target, never touches a hero.

### 3.2.1 `SUMMON_CAPACITY` with three summoner classes (decision H3-2)

Three of twelve classes summon, so about 25 percent of heroes (was 12.5 percent). One summon per slot means the live count is at most the number of fighting summoner heroes that have cast, plus the few still sinking (about 0.55 s each).

| Heroes in the party | Summoners (expected, 25%) | Pool of 8 binds? |
|---|---|---|
| up to 8 (the benchmark and the target) | at most 8, usually 2 | Never at steady state (8 heroes cannot own more than 8 summons). At most one or two sinking extras in the same half second could overflow in the worst case; the dropped raise is retried at the hero's next ability (4 to 8 s later). |
| 16 | 4 | Practically never (needs more than 8 of 16 summoners and all of them fighting after a cast) |
| 32 (all visible slots) | 8 | Sometimes: roughly half the time the summoner count exceeds 8, but only fighting heroes that have already cast hold one |
| 64 (`MAX_AGENTS`) | 16 | Yes, by design |

A dropped raise is silent and cosmetic: the hero keeps fighting, its effects still play, and `raise` is attempted again at every ability while the hero has no summon, so the pool self-heals as other summons sink. **Decision: keep `SUMMON_CAPACITY` at 8.** It matches the 8-hero target, keeps the draw-call ceiling at **152 bitmaps**, and a larger party loses only decoration. The alternative, 12 (ceiling 156, +4 bitmaps), is one constant and recorded in H3-2 in case the manual 32-hero look shows too many missing allies. `EFFECT_CAPACITY` stays 24 for the same reason: seven of twelve classes now have a strike effect, and 8 strikers hold about 10 to 15 live effects plus in-flight abilities, so the expected peak remains under 24 (section 9).

### 3.3 Sprites: classes, effects, and the two new summons

`SpriteTemplate`, the layer model, and all validator constants are unchanged. The H2 summon convention ([H2 plan section 3.5](h2-classes.md#35-sprites-classes-effects-and-the-summon-convention)) applies to the beast and the turret without change: one template, id `summons/<name>`, faces right, anchor on the foot pixel, at most 24x24, at most 8 colors including the outline, master palette only, animations exactly `idle 2, walk 4, attack 3, rise 4, sink 3`, no animation name matching `hurt|downed|death|dead|die|dying`, shadow drawn by the engine.

Because the animation set is uniform, the turret has a `walk`: it is a small **clockwork walker** (short legs or little treads that roll and clank in step with the hero advancing), not a fixed emplacement. This keeps the validator, `animations.ts`, `Summon`, and the pool free of per-kind special cases (decision H3-5; the alternative is a per-kind animation table).

| Kind | Look | Size and colors | Notes |
|---|---|---|---|
| `beast` | a small friendly wolf (cub proportions), brown fur, cream muzzle and belly, leaf-green eye glint or collar leaf. `rise`: sprouts up out of the floor in a small green leaf puff. `sink`: sinks upright into the floor and thins into leaves. `attack`: a short snap or paw swipe in step with the 390 ms cycle. Cute, never feral | at most 20x16, foot-anchored; at most 8 colors | colors are master characters; append new master characters only where needed (fur and cream may reuse `k h s w`) |
| `turret` | a small copper-and-teal clockwork walker with a short barrel: gear on its back, a teal lens. `rise`: unfolds up out of the floor with a hop of cog sparks. `sink`: folds down into the floor. `attack`: the barrel swivels and a single pale muzzle pixel appears for one frame (no projectile, no beam). Never smokes, sparks, or breaks | at most 16x16, foot-anchored; at most 8 colors | the muzzle pixel is a light master color, never red |

Both end calmly: upright, no collapse, no flash, no red, no gore (art style guide, hit-reaction language).

`SUMMON_SPRITES` gains `beast` and `turret` (type `SummonSpriteId = 'skeleton' | 'beast' | 'turret'`); `ClassPaletteId` gains `ClassPaletteIdH3` (`druid monk artificer berserker`); `EffectSpriteId` gains `EffectSpriteIdH3` (`leaf chiOrb chiBurst warCry wrench`). The developer merges the unions in the same change that wires the art (as in H2, section 6 there).

### 3.4 `classFor` with twelve classes (decision H3-1)

`classFor` keeps its form: `DELIVERED_CLASSES[(hashId(id) >>> CLASS_SHIFT) % DELIVERED_CLASSES.length]`. After H3, `DELIVERED_CLASSES` equals the final `CLASS_IDS` (12) and stays a constant alias; no later batch is planned, so this is the last reshuffle.

**Is `CLASS_SHIFT = 20` still a good spread over 12? Yes, keep 20, and verify by measurement.**

- **Uniformity (analysis).** `hashId(id) >>> 20` is a 12-bit value in `0..4095`. `4096 = 12 x 341 + 4`, so classes 0 to 3 occur 342 times and classes 4 to 11 occur 341 times out of 4096: shares of 8.35 percent and 8.33 percent against the ideal 8.33. The modulo bias is 0.02 percent and is negligible. (For comparison, a shift above 20 would leave fewer than 12 bits, for example `>>> 24` gives 8 bits and a larger bias, and a shift above 21 would leave too few bits; 20 is the highest shift that keeps a comfortable 12 bits.)
- **Statistics over 1,000 ids.** Expected 83.3 ids per class, standard deviation about 8.7. The smallest of twelve classes will typically be near 69 (6.9 percent). The existing H2 check "none under 8 percent" (80 of 1,000) was set for 8 classes (12.5 percent each) and **must not be carried over**: for 12 classes it would fail on honest randomness. New thresholds: all twelve classes appear, **each at least 5 percent (50 of 1,000) and at most 13 percent (130 of 1,000)**, about four standard deviations from the mean on each side. The sample is seeded, so the result is deterministic; the tester measures it once, and a pass means a pass forever. The thresholds are not tuned to the sample.
- **Independence from skin and hair (analysis).** Skin is `h % 4` (bits 0 and 1) and hair is `(h >>> 8) % 6`; the class slice uses bits 20 to 31 and is a different function of the hash, so the three behave as independent for a well-mixed hash (the same argument that justified 20 in H2-9). Test: all 48 skin-and-class pairs occur over 1,000 ids (about 21 each) and all 72 hair-and-class pairs occur over 2,000 ids (about 28 each); an empty pair would be an event of probability well below one in a million.
- **The simulator.** Ids `sim-0-0` to `sim-7-0` cannot change (monitor-owned). With 8 uniform draws over 12 classes the expected number of distinct classes is about 6.0, a draw of at least five distinct classes is likely, at least one H3 class appears with probability about 96 percent, and at least one summoner (Necromancer, Druid, Artificer) with probability about 90 percent. These are probabilities, and the outcome is a fixed fact of the hash that the architect could not run; the developer measures it (task 2). Acceptance for the simulator party: **at least five distinct classes, at least one H3 class, and at least one summoner class** (so the F5 check of the pool needs no forced test hero). **Fallback** if the measurement fails: change only the bit selection (shift 16 to 20, or a fixed mix constant applied to the hash before the shift), record the reason and the measured numbers in the `classFor` comment, and re-check the independence and uniformity tests. This is the same fallback H2-9 used; because H3 reshuffles most ids anyway, choosing a different shift now costs nothing extra.
- **One-time reshuffle (accepted, roadmap A5).** At a fixed shift, the class under 8 and under 12 is equal exactly when `x % 24 < 8`, where `x = hashId(id) >>> 20` (for `r = x % 24`, `r % 8 == r % 12` only for `r` in `0..7`). So **one third of all ids keep their H2 class** and two thirds change, and the H1 four keep their class only when `r < 4` (one sixth of all ids). It happens once, when the extension updates (which restarts the webview anyway). H3 is the last such change. The README/CHANGELOG entry says that hero classes may change once with this update. Within one running extension the class never changes.
- **Measured result (developer, task 2).** Over the seeded 1,000 ids the per-class counts range from 72 to 100 (7.2 to 10.0 percent), inside the 5 to 13 percent band. `sim-0-0` to `sim-7-0` give necromancer, rogue, monk, mage, warrior, druid, cleric, artificer: 8 distinct classes, 3 of them H3 (monk, druid, artificer) and 3 summoners (necromancer, druid, artificer), so the simulator acceptance holds. All 48 skin-and-class pairs and all 72 hair-and-class pairs occur. 314 of 1,000 ids keep their H2 class (about one third, as predicted). `CLASS_SHIFT` 20 is kept and the fallback is not needed.
- **Pinned answers.** The pinned `classFor` outputs in `classMap.test.ts` (`'' 'a' 'alpha' sim-0-0 ...`) and the reference function (`% CLASS_IDS.length`) are re-pinned by the tester after the developer measures them; a change to the pins after that is a deliberate reshuffle decision.

### 3.5 Seam for E1 (recorded, not built)

- `Combat` target queries read enemies only. A summon is never a target; the beast "snaps" and the turret "aims" at nothing. If E1 wants them to look at an enemy, the pool may read `world.enemies` to choose a facing and the **enemy** takes the cosmetic hit; no summon field and no hero field changes.
- Class effects, summon offsets, and the Berserker roar stay data and timer driven. Enemy hits never cause an ability, a raise, a sink, or a roar (section 2.1, rule 6).

## 4. Data flow (H3)

The flow is the [H2 flow](h2-classes.md#4-data-flow-h2) unchanged: host event, `Roster`, `ClassHero` phase, `onAbilityRelease` spawns the shots and calls `summons.raise(slot, kind, ...)`, `#tendSummon` calls `summons.renew(slot, kind, ...)` while `advance`, `attack`, or `ability`, the pool's lease expires after the owner stops, `sink`, then freed. The only inputs to the summon system are numbers and a `SummonId` pushed by the owner and the step length; nothing flows back to `Roster`, `Engagement`, or the host. The Druid and Artificer take the same path as the Necromancer with a different `kind`; the Monk and Berserker only spawn effects. No new state machine and no new sequence diagram is needed.

## 5. Developer task list

Do the tasks in order; each is independently verifiable. No new packages. Work on a short-lived branch created after H2 is reviewed and committed (H2 is committed as 7311bae on `feat/h2-classes`; start H3 from `main` once it has been merged, or stack on the branch only if the human says so). Tasks 1 to 5 need no H3 art (use the tester's tiny test art set); task 6 needs the artist's steps A3-1 to A3-3.

0. **Start.** Set roadmap H3 `Status: in progress` (batch line and summary row 7). Check: only those two lines changed.
1. **Ids and rows.** `data/effects.ts`: append the five ids. `data/summons.ts`: append `beast`, `turret` and update the comment. `data/classes.ts`: append the four ids and the four rows of section 3.1 (every row has `summon`; `null` for Monk and Berserker). No change to `validateClasses`. Check: typecheck; `validateClasses(CLASSES)` is empty; there are exactly 12 unique ids.
2. **`classFor` measurement.** No code change expected. Write a throwaway script or test (not committed) that prints, for `uuids(1000)` (the seeded generator in `classMap.test.ts`) the count per class, and the classes of `sim-0-0` to `sim-7-0`, the skin-and-class and hair-and-class pair coverage, and the `x % 24 < 8` retention. Apply the acceptance of section 3.4. If it fails, apply the fallback and record the numbers in the `classFor` comment; otherwise update only the comment (twelve classes, final, measured counts). Give the measured numbers to the tester in the handoff.
3. **Kind-aware pool and shadow.** `Summons.ts`: `raise` restarts a summon whose kind differs (section 3.2), `renew` takes `kind` and ignores a mismatch. `ClassHero.ts`: pass `summon.kind` in `#tendSummon` (the only edit; `onAbilityRelease` already passes it to `raise`). `tuning.ts`: `SUMMON_SHADOW_PX` replaces `SUMMON_SHADOW_WIDTH_PX` (with a unit and an `Assumption:` comment). `entities/Summon.ts`: `shadowWidth` becomes a getter. Check: raise for a slot with a skeleton in `active`, then `raise` with `beast`, restarts it as a beast; `renew` with the wrong kind does not extend the lease and the wrong-kind summon sinks within `SUMMON_LEASE_MS` plus the sink total; same-kind behavior is as before; the shadow `fillRect` width follows the kind.
4. **Sprites and validator.** Merge the `H3` unions in `spriteTypes.ts`; extend `SUMMON_SPRITES`, `CLASS_LAYERS`, `EFFECT_SPRITES`, and `CLASS_PALETTES` imports in `artSet.ts` (the artist's barrel should already merge them; if not, spread them here). No validator change is expected (animation counts, sizes, and color limits are unchanged); if the artist needs a master character, only `palettes.ts` changes. Check: `validateArtSet(SHIPPED_ART)` and `validateClassArt(SHIPPED_ART, CLASS_IDS, EFFECT_IDS)` are clean, and `validateSummonArt` covers all three summon ids.
5. **Existing tests that pin H2 behavior** (the tester does these; listed so the developer does not chase them): class counts 8 to 12, the `DELIVERED_CLASSES` length, the 12-color and 26-frame loops over `CLASS_IDS`, `renew` calls in fakes (new `kind` argument), the distribution thresholds (section 3.4), the simulator expectation, the pinned `classFor` answers, the `summon` column expectations (3 non-null rows), the shadow expectation (width follows the kind), and `docsTables` expectations (`12 of 12`).
6. **Art glue** (needs A3-1 to A3-3). Check: F5 shows twelve classes.
7. **`docs:tables`.** `renderClassTable` writes the summon cell as "; summons a " followed by the kind, for any kind (it already does for the skeleton; make sure "a beast" and "a turret" read correctly), and the header reads `Delivered classes: 12 of 12.` (computed; when it equals the total the generator may drop the "of 12" suffix only if the tester agrees). Regenerate `docs/design/classes.md`. Check: running twice leaves no diff; `--check` passes.
8. **Docs.** `docs/design/classes.md` (four prose sections; the Druid and Artificer paragraphs say the beast and turret are decoration with no health and no effect; the Berserker paragraph says Battle Roar is a timer-driven flourish, not a meter), `docs/design/game-design.md` (a sentence for the complete 12-class set), `CHANGELOG.md` ("Four more hero classes (Druid with a cosmetic beast, Monk, Artificer with a cosmetic turret, Berserker); the class set is complete at twelve; hero classes may change once with this update; cosmetic only"), README one sentence (twelve classes).
9. **Local checks (human-owned).** F5 with `--disable-extensions`, `pixelAgents.simulator: on`, `simulatorAgentCount` 8: 60 s DevTools recording at the reference panel size ([M4 decision H4-3](m4-engine.md#11-decisions-for-the-human)), 60 fps; classes and summons unchanged after hide/show and "Developer: Reload Webviews"; additionally with `simulatorAgentCount` 32 (the summons-at-scale look, H3-2). Temporarily make `SummonPool.update` and `Summon.draw` throw (not committed) and confirm one console error line each, heroes keep their poses and lifecycle, and other heroes keep fighting.
10. **Docs drift.** Flag in the handoff anything in [game engine](../game-engine.md), [data model](../data-model.md), [ADR 0011](../adr/0011-summons-are-leased-cosmetic-entities.md), or this plan that the code changed.
11. **Hand off to the tester** with section 7.
12. **Commit after reviewer Approve.** Set roadmap H3 `Status: done` and summary row 7; stage all agents' H3 work including art and docs; one commit, for example `feat: add Druid, Monk, Artificer, and Berserker hero classes`; merge to `main` fast-forward. No push without the human.

## 6. Ownership split

| File or area | Owner |
|---|---|
| `src/game/sprites/classTemplatesH3.ts`, `effectTemplatesH3.ts`, `palettesH3.ts` (or `CLASS_PALETTES` entries in the existing palette files), the beast and turret templates in `summonTemplates.ts` (or a new `summonTemplatesH3.ts`), `palettes.ts` (only new master characters), `spriteTemplates.ts` (barrel exports), `docs/design/art-style-guide.md`, `docs/design/sprite-spec.md` | pixel-artist |
| `src/game/**` otherwise: `data/classes.ts`, `classMap.ts`, `effects.ts`, `summons.ts`, `tuning.ts`, `Summons.ts`, `entities/Summon.ts`, `entities/ClassHero.ts`, `sprites/artSet.ts`, `spriteTypes.ts` union merges (same change as the art wiring, with the artist's agreement), `scripts/generate-doc-tables.ts`, `docs/design/classes.md`, `docs/design/game-design.md`, `CHANGELOG.md`, `README.md` | developer |
| `test/**`, `testing-strategy.md` | tester |
| this plan, `game-engine.md`, `data-model.md`, `roadmap.md` (except status), `docs/index.md`, `docs/glossary.md`, `CLAUDE.md` (except Core invariants) | architect |
| git operations, roadmap H3 status lines | developer |

## 7. Test notes for the tester

Unit suites use the H1 and H2 fakes plus a test `ArtSet` that already carries a tiny skeleton template; extend it with two more tiny summon templates (five animations each) and the five new effect ids, so engine tests do not depend on H3 art. Suggested files: extensions to `classMap.test.ts`, `classData.test.ts`, `heroInvariantClasses.test.ts`, `heroInvariantSummons.test.ts`, `summons.test.ts`, `summonHero.test.ts`, `classArt.test.ts`, `spriteValidator.test.ts`, `renderer` tests, `test/repo/engineStructure.test.ts`, `classStructure.test.ts`, `summonStructure.test.ts`, `docsTables.test.ts`, `test/build/classBundle.test.ts`.

1. **Class mapping (exactly 12).** `CLASS_IDS` has exactly 12 unique ids in the order of section 3.1 (H1 four, H2 four, then `druid monk artificer berserker`); `DELIVERED_CLASSES` equals it; `CLASSES` has one row per id in the same order. `classFor` is pure and total for `''`, a UUID, `sim-0-0`, a 10 KB string, and non-ASCII ids; the same id gives the same class on every call and in a fresh process; **fallback covers all 12**: for 20,000 random strings the result is always one of the twelve and never the `'warrior'` fallback by error (the `?? 'warrior'` branch is unreachable: assert `DELIVERED_CLASSES[i]` is defined for every `i` in `0..length-1`). Distribution: 1,000 UUID-like ids use all twelve classes, **each between 50 and 130** (5 to 13 percent; the H2 threshold of 80 is replaced). All 48 skin-and-class pairs occur over 1,000 ids; all 72 hair-and-class pairs over 2,000 ids. `sim-0-0` to `sim-7-0` give at least five classes, at least one H3 class, and at least one summoner class (section 3.4). Through `Game`: a hero's `classId` is unchanged across 10 simulated minutes of working/idle cycles, replacement, snapshot rebuild, and a fresh `Game` fed the same list (reload). Documented reshuffle property for known ids: an id whose `(hash >>> 20) % 24 < 8` has the same class under 8 and 12 (documents the accepted behavior, not a requirement). Re-pin the answers after the developer's measurement.
2. **Class data.** Twelve rows, unique ids, names equal the art style guide, key set equals exactly `id name role colors silhouette strike ability summon`; `summon` is `null` for nine rows and `{ kind, dx, dy }` for `necromancer` (skeleton), `druid` (beast), `artificer` (turret); every summon kind is in `SUMMON_IDS` and each of the three kinds is used by exactly one class; every shot effect id is in `EFFECT_IDS`; lifetimes 100 to 1500 ms; `|dx| <= 40`, `|dy| <= 24`; speeds at most 240 px/s; at most 4 shots per list; `validateClasses` fails crafted rows (unknown summon kind, `dx` 60, extra key, missing row).
3. **Art.** Shipped art passes `validateArtSet` and `validateClassArt` for twelve classes (eleven animations, 26 frames per layer, at most 12 colors per composited look under 4 skins by 6 hair colors, class palettes override only `a c d b k m`). Effects: the five new ids exist, `idle` only, at most 32x32, at most 8 colors. Summons: `summons/beast` and `summons/turret` have exactly `idle 2, walk 4, attack 3, rise 4, sink 3`, at most 24x24, at most 8 colors, anchor inside, master characters only, no forbidden animation name; the validator reports a missing template for any `SUMMON_IDS` entry. Master palette at most 48 colors. No hex and no `data:` URI in any new template file. **Berserker static red:** the war-paint red pixels (the characters the artist names in the sprite spec) occupy the same positions relative to the head and body in every frame of every animation of that class, and no effect template contains a red or dark-red master character (a check over `EFFECT_SPRITES`' characters against the red set `R` and any new red character the artist declares).
4. **Pool kind-awareness (new in H3).** One summon per slot still holds with mixed kinds; `raise` with a different kind for a live slot restarts it as the new kind; `renew` with a mismatched kind does nothing, so the old summon sinks within `SUMMON_LEASE_MS` plus the sink total; same-kind `raise` in `rise`/`active` is still a no-op; sink plus `raise` restarts; the full-pool drop stays silent; NaN and unknown kinds are ignored. A reused slot with a different class (force it with a custom factory) never shows or renews the previous kind.
5. **Capacity with three summoners.** With 8 heroes, 3 of each summoner class forced plus mixed others, the live summon count never exceeds 8 and the draw never exceeds the ceiling; with 32 and 64 heroes, mostly summoners, the live count stays at most `SUMMON_CAPACITY`, no throw, the dropped raises leave `heroSnapshot()` unchanged, and a hero without a summon gets one at its next ability once a slot frees.
6. **Owner binding for all three kinds.** For each of Necromancer, Druid, Artificer: no summon before the first ability (at least 4 s of attack time); after it, one summon of the right kind at the expected position (mirrored when facing left); `advance` gives pose `walk` and `attack`/`ability` give `attack`; `working` to `idle` removes it within 0.7 s; `despawned` removes it before the hero's `warpOut`; replacing an exiting hero for the same id leaves at most one summon; a quarantined owner's summon is gone within 0.7 s. The hero's `phase`, `lifecycle`, and `classId` are identical with the summon system disabled (two runs, same seed, summons on and off). Monk and Berserker never touch the pool.
7. **Berserker is not a meter (new in H3).** Cast number 1 and cast number 100 spawn the same shots (same effect ids, offsets, and lifetimes); the cast schedule is the shared hidden timer (the interval lies in 4 to 8 s regardless of the number of casts or of other heroes); nothing in `ClassHero` or the class table reads the effect pool, the roster, or `Engagement`; after the ability ends, the live effect list contains no Berserker effect longer than 480 ms (a one-shot, nothing persists); the `Berserker` row has no `strike` (the axe swing is art). Feeding the four host events and every stimulus of the hero-invariant test while a Berserker is casting leaves its lifecycle exactly as the events dictate.
8. **Effects and auras.** Each H3 ability and strike spawns exactly its shots at the right positions (floored hero position plus offsets, mirrored when facing left); Monk's strike is a static effect that plays once and holds (no spark particles on end, because it is not moving); Druid and Artificer strikes are moving effects that end in two sparks; pool exhaustion drops silently. Effect-pool occupancy: 8 Druids, 8 Artificers, 8 Monks, and a mixed party each attacking for 60 simulated seconds never exceed 24 live and never throw.
9. **Renderer.** Summons of all three kinds draw in y order with heroes and props; the shadow `fillRect` width follows the kind (8, 12, 10); effects still after the last entity and before the foreground; composite `source-over` and alpha 1 after every frame. Draw-call budget with 8 heroes (all summoners, 8 summons by forcing), 24 live effects, and 384 particles: at most **152** bitmap draws and **450** fills (unchanged from H2; capacity stays 8).
10. **Hero-invariant and structural.** Extend the hero-invariant test: the four host events applied while a summon of each kind is rising, active, and sinking, and while a Berserker is casting, and a Monk or Druid effect is in flight, leave the hero's lifecycle following the event exactly as before; throwing `Summon.update`, `Summon.draw`, and `SummonPool.update` for each kind leaves `heroSnapshot()` equal to the pre-stimulus snapshot. Structural: the scanned set is unchanged (no new source files are expected in `src/game/entities/`); the ban list is unchanged and still passes over the H3 rows and comments; `ClassHero.ts` imports no `Combat`, `Enemy`, `Roster`, or `Summons` (add the `Combat`/`Enemy` import assertion now, so E1 cannot regress it); `Summons.ts` and `Summon.ts` still import no hero; `applyAgentState(` still defined only in `Hero.ts` and called only in `Roster.ts`; `lifecycle` still assigned only in `Hero.ts`; no identifier or id contains `rage` or `meter` in `src/game/entities/**`, `data/classes.ts`, `data/effects.ts`.
11. **Generated docs** (`docsTables.test.ts`, G2). `classes.md` region equals `renderClassTable(CLASSES)`; twelve rows; the header reads `Delivered classes: 12 of 12.`; the Druid and Artificer ability cells mention the beast and the turret; `--check` fails on a crafted change; no diff after a second run.
12. **Bundles and no assets.** `dist/webview.js` contains the new class table and `SummonPool`, and no class table text is in `dist/extension.js`; no eval or `new Function`; no new file types; `dependencies` empty; record the production webview bundle size in the handoff (assumption: under 300 KB).
13. **Performance** (node, soft): 12 mixed heroes with summons plus 10 simulated minutes of `frame(16.67)` averages under 1 ms per frame (report; fail above 4 ms). Real frame time is the manual benchmark (task 9).
14. **Existing suites stay green**, including the M2 to M4 integration suites; the webview log has no error line.
15. **Manual QA** ([testing strategy section 7.3](../../engineering/testing-strategy.md)): the four new classes read by silhouette at three panel sizes and two zoom levels; the Berserker reads as a fighter in war paint and **not as wounded** (no red outside the fixed stripes, nothing pulsing or growing, a calm ring, a calm face); effects are small and calm; nothing looks like damage, a bar, or a status icon; the beast and turret end by folding or sinking, never by collapsing; no text, bar, or gauge appears on or near any hero or summon; classes unchanged after hide/show and Reload Webviews; with 8 heroes in the single line the beast and turret do not hide the next hero's face for long (R5).

Not automated: rendered pixels, silhouettes, real-canvas compositing, DevTools frame time.

## 8. Gates for H3

| Gate | H3 meaning |
|---|---|
| G1 | `npm run build`, `lint`, `typecheck` (all three projects), `test`, and `test:integration` pass |
| G2 | `npm run docs:tables` leaves no diff; the CI stale-docs step passes |
| G3 | invariants intact (section 2); the hero-invariant test is extended and passes; notes 4 to 7 and 10 pass |
| G4 | no new packages; no image, audio, or font files |
| G5 | `CHANGELOG.md` entry; README updated; `classes.md`, `game-design.md`, `game-engine.md`, `data-model.md`, ADR 0011 match the code; art docs (including the beast and turret in the sprite spec and the style guide) match the art |
| G6 | `CLAUDE.md` directory map lists the new files |
| G7 | reviewer Approve; one commit; roadmap H3 ticked |

**Done when** ([roadmap H3](../../engineering/roadmap.md#h3-druid-monk-artificer-berserker), made concrete): G1 to G7 hold; note 1 proves exactly 12 unique class ids, deterministic and sticky assignment, a fallback that covers all 12, and the measured distribution; notes 3 and 4 prove every class and all three summons have complete templates and the pool is kind-correct; notes 5, 6, and 10 prove summons never change or despawn a hero and are removed only because the owner stopped fighting; note 7 proves no class behavior reads enemy attacks, hits, or any count as a trigger (the roar is timer driven and identical every cast); the reviewer confirms by eye that the Berserker does not read as hurt and that the beast and turret read cleanly; the manual benchmark holds 60 fps with 8 simulated heroes.

## 9. Risks, assumptions, defaults

- **R1: Berserker reads as hurt or as a meter.** Mitigated by section 2.1 (timer only, one-shot, no red in effects, static paint, no hurt cues) and note 7. Fallback: rust-orange paint (H3-3).
- **R2: Reshuffle.** Two thirds of all ids change class once (one third keep it), and the H1 four keep it for one sixth. Accepted (roadmap A5, H1-1, H2-6); it is the last one. The CHANGELOG says so.
- **R3: Spread.** Analysis says 8.35 and 8.33 percent per class; the statistical thresholds are 5 to 13 percent on 1,000 ids; the simulator party is a measured fact with a stated fallback (section 3.4). The architect could not run code, so the numbers in section 3.4 are derived, not observed; task 2 observes them.
- **R4: Performance (60 fps, 8+ heroes now, 30+ enemies later).** No new per-frame cost: the ceiling stays 152 bitmaps (120 hero-related + 24 effects + 8 summons) and 450 fills. Sprite memory: 12 classes by 4 skins by 6 hair colors is at most 288 hero looks of 26 small bitmaps each, built lazily on first draw and never evicted; worst case about 9 MB, reached only if 288 distinct looks appear in one document (typical use builds 8 sets); H2's 6 MB estimate scales by 12/8. The beast and turret sheets add 32 bitmaps each, built once. Effect pool: 7 of 12 classes now strike. Eight strikers hold about 1.3 to 1.8 live effects each (one per 390 ms, 500 to 700 ms life), so 10 to 15, plus a few in-flight abilities (2 to 3 shots, staggered 4 to 8 s per hero), about 21 at the extreme; beyond 24 spawns drop silently. The Monk's strike is 200 ms and static, lighter than the others.
- **R5: Summon overlap in the 8-hero line.** Eight heroes stand in a single row 18 px apart (`formationPosition`, `i < 8` is row 0), and a summon at dx 14 to 18 with `dy` 1 sits over the next hero and sorts in front of it. The skeleton already does this; with three kinds it is three times as common. Kept as is (data only). If F5 shows the next hero's face hidden for long, the options are, in order: reduce `dx` and the summon width, place the summon behind (`dy` -2, so the neighbor hides part of it), or give summons a lower alpha. This is a data or art tweak, not an engine change.
- **R6: Turret `walk`.** The uniform animation contract means the turret needs a walk. Chosen: a clockwork walker (decision H3-5). A fixed-emplacement turret would need a per-kind animation table and a validator change.
- **R7: Photosensitivity.** Effects are at most 24x24, three frames, no full-screen flash, no strobing; abilities at least 4 s apart per hero; the roar ring and chi burst are warm, not white, and slow. The summons rise and sink are slow (440 and 300 ms) and small. Reduce-motion (M7) gates `EffectPool` spawns and `SummonPool.raise` with the same switch.
- **R8: Summon versus quarantine.** Heroes are never removed for a fault ([ADR 0009](../adr/0009-hero-lifecycle-isolation.md)). Summons are the opposite on purpose (free on a fault). Do not copy that rule to heroes.
- **R9: Art/engine contract drift.** The validator is the single source of truth. The artist runs it (or the tester's suite does) before the developer lands task 6. The animation counts in section 3.3 are fixed; a change goes through the sprite spec and this plan.
- **R10: CSP, bundles, persistence.** No change. Nothing is persisted: class and summon are derived or transient. `src/game/**` stays DOM-free and imports only `src/shared/**` and itself.
- **Defaults chosen:** no subclass files; rows plus `SUMMON_IDS` entries; `CLASS_SHIFT` stays 20, verified by measurement; thresholds 5 to 13 percent; `SUMMON_CAPACITY` 8 and `EFFECT_CAPACITY` 24; one beast, one turret per owner; kind-aware pool; per-kind shadow width; the turret is a walker; five new effects (`leaf chiOrb chiBurst warCry wrench`) and reuse of `smokePuff`; red war paint static and small; ability names Wild Call, Chi Burst, Deploy Turret, Battle Roar (none contains a banned word, and "rage" is not used in code).

## 10. Art needs (batch H3)

Everything is characters only, no hex; `.` is transparent; heroes and summons face right; at most 12 colors per composited hero look (outline included), 8 per effect, 8 per summon. Validate with `validateArtSet` before handing over. Delivery in three steps (decision H3-6), so the developer is never blocked long, and each summon arrives with its owner.

### 10.1 Step A3-1: shared additions (before development task 6; tasks 1 to 5 use test art)

| Item | Where | Spec |
|---|---|---|
| `CLASS_PALETTES` entries for `druid monk artificer berserker` | `palettes.ts` or a new `palettesH3.ts` | partial palettes over `a c d b k m` only (never `o s h e w`). Druid earth brown + leaf green; Monk orange + cream; Artificer copper + teal; Berserker fur brown with the **war-paint red only as the accent `a` or a master character used for the stripes** (the stripes must be the same pixels in every frame). Red stays off bodies and off every effect. Pair color with a shape cue. New master characters only where a swap cannot express a color (master is 35, cap 48; budget for H3: at most 8 new characters, so at most 43). |
| Five effects, ids `effects/<name>`, `idle` only, anchor at the center | `effectTemplatesH3.ts`, re-exported from `spriteTemplates.ts` | `leaf` about 6x6, 2 frames (a spinning leaf), greens; Druid strike and ability. `chiOrb` about 7x7, 2 frames (a small warm glow with a light core), orange and cream; Monk strike and ability. `chiBurst` about 24x24, 3 frames (small star, ring, fading ring), orange and cream, transparent center, Monk ability. `warCry` about 28x12, 3 frames (a ring of dust and short radial ticks that expands and fades, warm tan and orange, transparent center so the hero stays visible, **no red**), Berserker ability. `wrench` about 7x7, 2 frames (the wrench in two rotations), copper and light metal, Artificer. Sizes are defaults; stay within the validator (at most 32x32, 8 colors). |
| Barrel exports | `spriteTemplates.ts` | export `CLASS_LAYERS`, `EFFECT_SPRITES`, `SUMMON_SPRITES`, `CLASS_PALETTES` as the merged H1 + H2 + H3 maps so `artSet.ts` changes by at most one line per map. |

No effect may look like damage taken or a gauge: no red anywhere in an effect, no white full-body flash, no cracks, no stars over a head, no filling bar, no persistent icon. Effects are small, calm, and read as things the hero does.

### 10.2 Step A3-2: Druid with beast, and Monk

Each class: `CLASS_LAYERS[id]` with all eleven animations on every layer and equal frame counts (26 per layer), layer ids `druid/head`, `druid/gear`, `druid/weapon` and so on, reusing the base `body` template unless a pose needs its own. Head 16x20, gear 16x20, weapon up to 24 wide, all on the foot anchor.

| Class | Design note | Silhouette cue | Frames of note |
|---|---|---|---|
| Druid | earth brown + leaf green; antler or leaf crown (head), a leafy shoulder wrap (gear), gnarled wooden staff in the weapon layer with a small leaf at the top | antlers or a leaf crown, crooked staff | `attack`: staff thrust, strike on frame 1. `ability`: staff raised, a leaf glint on the staff top (the leaves and the beast are engine effects). |
| Monk | orange + cream; headband with a short tail (head), bare forearms and a cream sash (gear); **no weapon**: the weapon layer holds the glowing fists (a light halo on both fists in `idle`, `walk`, `attack`, `ability`, and `victory`, a 2-frame shimmer in `idle`, strongest in `ability`; art only) | headband, bare arms, glowing fists | `attack`: a straight palm or punch, strike on frame 1. `ability`: both hands pulled in then pushed forward (the `chiBurst` is the engine effect). |
| Beast summon | `summons/beast`, section 3.3: small friendly wolf, at most 20x16, at most 8 colors | wolf | `idle` 2, `walk` 4 (trot in place), `attack` 3 (snap), `rise` 4 (sprouts from the floor in a green leaf puff), `sink` 3 (sinks upright and thins into leaves). Never feral, never collapses. |

### 10.3 Step A3-3: Artificer with turret, and Berserker

| Class | Design note | Silhouette cue | Frames of note |
|---|---|---|---|
| Artificer | copper + teal; goggles pushed up on the forehead (head), a gear-and-pipes backpack (gear, visible from the side as a bump), wrench in the weapon layer | goggles, a big backpack, wrench | `attack`: wrench swing, strike on frame 1. `ability`: wrench raised, a lens glint on the goggles (the puff, the thrown wrench, and the turret are engine effects). |
| Turret summon | `summons/turret`, section 3.3: small copper-and-teal clockwork walker, at most 16x16, at most 8 colors | walker with a barrel | `idle` 2 (a lens blink), `walk` 4 (little steps or rolling treads), `attack` 3 (barrel swivel, one pale muzzle pixel for one frame, no projectile), `rise` 4 (unfolds out of the floor with a hop of cog sparks), `sink` 3 (folds down into the floor). Never smokes, sparks, breaks, or shows red. |
| Berserker | fur brown + war-paint red; wild spiky hair (head), bare chest with a fur strap and **two or three fixed red stripe pixels** (gear and head; identical in every frame, geometric bars, no drips), an oversized axe (weapon, up to 24 wide) | spiky hair, bare chest, huge axe | `attack`: overhead axe swing, strike on frame 1. `ability`: axe raised, mouth open mid-roar, the same war paint (the ring and the dust are engine effects). No wounded or strained face in any frame, and no extra red in `ability`. |

All four classes: `sit`, `eat`, `sleep`, `read`, `warmHands` keep the class head and gear so the class reads at the campfire; the weapon layer is empty except in `polish` and visible in `idle`, `walk`, `attack`, `ability`, and `victory`. `sleep` stays a closed-eye line and a small "z". The Berserker's paint is still there when it sleeps (it is paint).

### 10.4 What the engine draws itself (no art)

Shadows (including the summons', per-kind width 8, 12, 10), warp beams, end-of-flight sparks. The artist does not draw a cooldown indicator, an aura that persists, a charge-up glow, or any icon above a hero or summon.

### 10.5 Docs the pixel-artist updates

[Art style guide](../../design/art-style-guide.md): the class table status (twelve delivered, final palette characters, correct master palette size: 35 today), the five effects, the beast and the turret (look, animation list), the rule that auras are one-shot bursts, and the Berserker rule (red is static paint only; effects carry no red); replace "planned class list" wording with delivered. [Sprite spec](../../design/sprite-spec.md): `SUMMON_SPRITES` now holds three templates, the new exports, and the fixed animation set for all summons.

## 11. Decisions for the human

Each has a default so work can proceed.

| # | Question | Default chosen | Alternative |
|---|---|---|---|
| H3-1 | `classFor` over twelve | Keep `CLASS_SHIFT` 20 and the form; verified by measurement (task 2); one third of ids keep their H2 class, the rest reshuffle once and it is the last time; thresholds 5 to 13 percent on 1,000 ids | A different shift or a fixed mix constant (only if the measurement fails); a fixed 12-slot table is not needed because all art lands in this batch |
| H3-2 | `SUMMON_CAPACITY` with three summoner classes | Keep 8 (matches the 8-hero target; dropped raises are cosmetic and retried; ceiling stays 152) | 12 (ceiling 156) if the 32-hero F5 look shows too many missing allies |
| H3-3 | Berserker war paint color | Small static red stripes (consistent with the Warrior's red plume), never in effects, with the rules of section 2.1 | Rust-orange paint (no red anywhere on the class) if the reviewer reads red as a wound |
| H3-4 | Rage representation | A timer-driven one-shot "Battle Roar" ring and dust; no buildup, no persistent aura (the roadmap's "cosmetic aura" is interpreted as a one-shot burst, as in H2-4) | A short-lived tint on the hero (rejected: reads as a status or a hurt tint) |
| H3-5 | Turret animations | A clockwork walker with the common five animations (`idle 2, walk 4, attack 3, rise 4, sink 3`) | A fixed emplacement with a per-kind animation table and a validator change |
| H3-6 | Art delivery | Three steps: A3-1 shared (palettes, five effects, barrel), A3-2 Druid + beast and Monk, A3-3 Artificer + turret and Berserker | One delivery (longer wait, one validation) |
| H3-7 | Kind-aware pool | `raise` restarts on a different kind and `renew` takes a kind (section 3.2); no ADR change | Leave the H2 pool (relies on timing to avoid cross-kind adoption; rejected as fragile now that three kinds exist) |
| H3-8 | Per-kind shadow width | `SUMMON_SHADOW_PX` table (8, 12, 10) and a getter on `Summon` | Keep one width of 8 (a wide wolf over a narrow shadow looks off) |
| H3-9 | Monk strike | A static fist glow (`chiOrb`, 200 ms) on the strike frame | No strike effect (art only, like the Warrior) |
| H3-10 | Subclass files | None; the four classes are rows (the roadmap's "four class files" is amended) | A file per class (no behavior needs code) |

## 12. Architect doc pass (applied with this plan)

- New: this plan.
- [Roadmap](../../engineering/roadmap.md): H3 entry rewritten (plan link, scope with the kind-aware pool and no class files, files, art batches A3-1 to A3-3, done-when wording).
- [Docs index](../../index.md): the plan row.
- Not changed now, but the developer or architect updates them at as-built time: [game engine](../game-engine.md) (section 13 H3 row and the `SummonPool` kind rule, shadow per kind, ceilings unchanged), [data model](../data-model.md) (section 6: twelve classes, three summon kinds, five effect ids, `SUMMON_SHADOW_PX`), [glossary](../../glossary.md) (no change expected; "class" already says 12), [CLAUDE.md](../../../CLAUDE.md) directory map (new H3 sprite files and the classes/summons lines).
- For the tester: [testing strategy](../../engineering/testing-strategy.md) section 5 stimuli and the structural row (the new import assertions, the `rage`/`meter` identifier ban) and the changed thresholds in section 7 note 1 and task 5. For the pixel-artist: section 10 and the sprite spec.
