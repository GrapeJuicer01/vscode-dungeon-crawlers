# ADR 0013: Only enemies have health; combat reaches heroes only through a cosmetic reaction board

Purpose: records how E1 adds enemies, bosses, and combat without giving combat any path to a hero: an enemy-side and a hero-side of the engine that meet only at two numeric buffers, and a purely visual reaction board the hero reads while drawing.
Related: [E1 plan](../plans/e1-enemies.md), [game engine](../game-engine.md), [ADR 0002 no hero health](0002-no-hero-health.md), [ADR 0009 hero lifecycle isolation](0009-hero-lifecycle-isolation.md), [ADR 0011 summons](0011-summons-are-leased-cosmetic-entities.md), [art style guide section 5](../../design/art-style-guide.md#5-cosmetic-hit-reaction-visual-language), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

Until E1, "heroes are invulnerable" was easy: nothing could hurt them. E1 adds the first thing that attacks: enemies whose attacks must look like attacks (flash, stagger, knockback, spark) while changing nothing about a hero, and bosses whose phases and defeat must not move a hero's state. The H1 plan sketched "targets read from `Combat` through the same two hooks"; the H3 plan added that `ClassHero` must never read enemy hits (the Berserker's roar must not become a rage meter) and that summons are never targets ([ADR 0011](0011-summons-are-leased-cosmetic-entities.md)). Enemies need health, hit points, and damage vocabulary that the hero-side structural scan bans outright. The natural designs (combat holds hero objects and calls a `hit()` on them; hero hooks receive the combat system through `World`) put hero state one method call away from combat code.

## Decision

- **Two sides, two buffers.** The engine splits into a hero side (`Hero`, `ClassHero`, `Roster`, `Summon*`, `Effects`, the class and summon tables) and an enemy side (`Combat`, `Enemy`, `Boss`, `Drops`, `data/enemies.ts`, `data/drops.ts`, `Progression`). The enemy side never imports or receives a hero, the roster, a summon, or any lifecycle value. Heroes never import the enemy side. They meet in exactly two places, both plain numbers:
  - **In:** `Roster.collectFighters` copies, for every hero in `advance`, `attack`, or `ability`, its slot, position, and two monotonic cosmetic counters (`strikeSerial`, `abilitySerial`) into a preallocated `FighterBuffer`. `Combat` reads it. Heroes that are resting, travelling, or exiting are not in it, so they are never attacked.
  - **Out:** `Combat` writes cosmetic hit reactions (a flash and a 1 to 2 px knockback) into a `HitReactions` board indexed by slot. `Hero.draw` reads two getters (`flashing`, `offsetPx`) from the `DrawContext` and changes only where and how it draws. It cannot change `x`, `y`, `phase`, or `lifecycle`.
- **`World` does not change.** The object every hero hook receives gains no combat, enemy, or reaction field, so class code cannot see enemy hits even by accident. `HitReactions` travels in `DrawContext`, which only `draw` receives, and `ClassHero` has no `draw`.
- **Only enemies have health.** Enemy health, the only mutator `Enemy.strike`, health bars, and the damage vocabulary exist only in the enemy-side file list. The hero-side vocabulary ban (`hp health mana dead downed retreat damage gauge hurt dying`) stays exactly as is and is applied to everything outside that list; the enemy-side list is an explicit allow-list in the structural test, so a new file is hero-side (banned words) by default.
- **The party fights as one.** A strike by any fighting hero hits the nearest engaged enemy; all classes deal the same cosmetic amount. Classes keep no stats ([game design](../../design/game-design.md#classes)).
- **Summons are never targets and never read combat.** `Combat` has no summon import and the fighter buffer lists heroes only. The H3 plan's optional "pool may read enemies to aim" is withdrawn for E1.
- **Hero lifecycle is untouched.** Wave, boss, stage, and progress events drive only the enemy side, the stage runtime, and the corridor scroll through `Engagement`. A stage change swaps environment art; it never touches the roster.

## Consequences

- The hero-invariant test gains stimuli (enemy attacks on every slot, boss telegraph and slam, boss phase change, boss defeat, stage transition, progress load, `Combat` throwing) and asserts `Game.heroSnapshot()` and every hero's `x`, `y`, `phase` are unchanged; the structural test pins the two buffers, the import rules, and the allow-list.
- Class effects fly into the corridor as before and do not home on enemies; the hit is resolved from the strike counter and shown by the enemy's flash and an impact spark. The picture and the number can disagree by a few pixels; accepted as cosmetic.
- Combat is easy to disable: with enemies off or the enemy table invalid, `Engagement` falls back to the M4 timer and the party marches in an empty corridor.
- Cost: two small shared buffers and a second vocabulary list in the structural test, in exchange for removing every path from combat to a hero.
- Rejected alternatives: combat calling a hero method (`hero.onHit()`), even a cosmetic one (a path to hero fields that grows with every feature); passing `Combat` in `World` so class hooks can aim (lets class code read enemy hits, the Berserker rule); one global ban list with neutral enemy names such as "vigor" (hides what the code means and still passes a hero-side typo); a reaction applied by `Renderer` through a canvas transform (the `Surface` port has no transform, and knockback must offset the hero's draw position).

## As built (E1 clarifications; the decision above is unchanged)

Checked against the E1 tree before commit; details in [E1 plan section 13](../plans/e1-enemies.md#13-as-built-drift-checked-against-the-e1-working-tree). Each point keeps or tightens the seam.

- **The seam is as decided.** `Engagement.ts` imports one `import type { Combat }` and `CombatEngagement` reads `inContact` and `disabled` through `Pick<Combat, ...>`; `Game.ts` and `Renderer.ts` import both sides; `Game.ts` also imports the value `MAX_AGENTS` from `src/shared/protocol` to size the two buffers. No other hero-side file imports the enemy side.
- **`Combat` takes an `ErrorSink`** as an optional seventh constructor argument so a throwing `Enemy.update` is reported once and quarantines only that enemy, and exposes `setTransitioning` and `recordFault` for `Game`. These pass booleans and nothing about a hero.
- **`inContact` is based on `isEngaged`**, so the corridor stops during the boss intro. The boss is untargetable and does not attack for those 1.2 s: heroes swing at it with no effect until the intro ends. A regular enemy has no intro.
- **First-sight baseline.** `Combat` records a slot's serials the first time it sees the slot (and again after the slot leaves the buffer) and counts strikes only from later deltas, so a hero entering the buffer, or a reused slot, cannot inject strikes.
- **The reaction board** ignores a slot flashed within `HERO_FLASH_GAP_MS` 500, so a hero flashes at most twice per second; the push sign is always `-1` and `strong` marks a boss slam (2 px instead of 1).
- **Health bars** are enemy-only: 2 `fillRect` and 1 bitmap each, drawn after damage or for an engaged boss; there is no bar, number, or tint on a hero or summon.
- **Drop constants** live in `data/drops.ts` on the enemy side; `ENEMY_DISSOLVE_FRAMES` lives in `tuning.ts`.
