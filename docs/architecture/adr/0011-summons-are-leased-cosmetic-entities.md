# ADR 0011: Summons are leased, pooled cosmetic entities outside the roster

Purpose: records how summoning classes (Necromancer skeleton in H2; Druid beast and Artificer turret in H3) are modelled so that a summon can never change, hide, or despawn a hero, can never be a target, and cannot leak or outlive its owner's visible fighting.
Related: [H2 plan](../plans/h2-classes.md), [game engine](../game-engine.md), [data model](../data-model.md), [ADR 0002 no hero health](0002-no-hero-health.md), [ADR 0009 hero lifecycle isolation](0009-hero-lifecycle-isolation.md), [roadmap A6](../../engineering/roadmap.md#7-assumptions-and-defaults), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

The roadmap (A6) says summons are cosmetic allies with no health shown and no effect on hero state. Three classes will use them and E1 will add enemies next to them, so the shape chosen now is costly to change later. Natural but dangerous designs exist: a summon as a second kind of roster member (so it shows up wherever heroes are counted, snapshotted, and removed), a summon that holds a reference to its owner hero (a path to hero fields), or a summon that is removed by game events. Core invariants 1, 2, and 4 require that no such path exists and that a fault in a summon cannot spread. A summon also needs a cleanup rule that is right in every exit path: the owner going idle, being despawned, being replaced, being quarantined, or the webview reloading.

## Decision

- **Not a hero, not in the roster.** A `Summon` extends `GuardedEntity` (the same per-entity guard as other entities) and lives in a fixed-size `SummonPool` held by `World.summons`. `Roster`, `Hero`, `HeroSnapshot`, and `applyAgentState` are untouched.
- **No references, numbers only.** The owning `ClassHero` talks to the pool through `raise(slot, kind, x, y, faceRight)` and `renew(slot, x, y, faceRight, pose)`: plain numbers, a kind id, and a boolean, nothing returned. The pool is keyed by the hero's `slot` integer. `Summon.ts` and `Summons.ts` import neither `Hero`, `ClassHero`, nor `Roster`; a structural test enforces it.
- **Lease, not ownership.** A summon exists only while its owner keeps renewing a short lease (`SUMMON_LEASE_MS`) from its own `update`, and only while the owner's cosmetic phase is `advance`, `attack`, or `ability`. When renewals stop for any reason (the owner went to `travel` because the host said `idle`, entered `victory` because the host said `despawned`, was replaced, was frozen by quarantine, or was removed) the lease expires and the summon plays a short `sink` and is freed. Nothing needs to detect those cases individually, so none can be missed. A webview reload builds a new `Game` with an empty pool.
- **Disposable on fault.** Phase timers are plain arithmetic in the pool, not in the guarded entity update, so a quarantined summon cannot strand a phase. A summon that faults three times is freed, not frozen (the opposite of heroes, [ADR 0009](0009-hero-lifecycle-isolation.md), because a summon holds no state worth keeping). The pool updates inside its own try/catch in `Game.step`; a pool fault reports once and clears the pool.
- **Never a target, never hurt.** A summon has no hp, no gauge, no hit flash, and no hit box. It is not registered in `Collision` or in any `Combat` target query (E1 must keep it out). Enemy attacks cannot reach it.
- **Bounded.** One summon per slot, `SUMMON_CAPACITY` (8) in total; a raise into a full pool is dropped silently. At most 8 extra bitmap draws and 8 shadow rects per frame.
- **Data-driven.** A class row declares `summon: { kind, dx, dy } | null`; `ClassHero` implements the generic raise-and-renew. A new summoning class adds a row and a summon id (an art template and a `SUMMON_IDS` entry), not code.
- **Art convention.** A summon is one non-layered template `summons/<name>` with `idle 2, walk 4, attack 3, rise 4, sink 3`, master palette, at most 8 colors and 24x24, and no animation name matching the forbidden hero pattern (the exit is called `sink`).

## Consequences

- The hero-invariant test is unchanged in shape: every summon stimulus must leave `Game.heroSnapshot()` equal. The review question is "does `Summon.ts` or `Summons.ts` import a hero?".
- Summons can disappear a fraction of a second after the owner stops fighting, and a snapshot rebuild or reload shows no skeleton until the next Bone Call. This is cosmetic and accepted.
- A replacement hero that reuses a slot may adopt a live summon of the same slot; harmless because the replacement has the same id and class.
- If E1 wants summons to attack enemies, the pool may read enemies to aim a swing; the enemy takes the cosmetic hit. That change is made in E1's plan and does not alter this decision.
- Cost: a second small entity pool and one renderer line to y-sort it, in exchange for removing every path from a summon to hero state.
- As built (a note, the decision above is unchanged): `Summon` carries extra pool-only members (`step` for phase and lease arithmetic, `release`, `inUse`, `finished`, `slot`, `pose`), all taking plain numbers; `Summon.ts` and `Summons.ts` still import no hero. See [game engine 13.2](../game-engine.md) and [H2 plan 3.2](../plans/h2-classes.md).
- Rejected alternatives: a roster member via `HeroInit` (puts a non-agent among heroes, invites lifecycle coupling); an owner reference held by the summon (a read-write path to hero fields, and a lifetime tied to object identity); removal by game events (violates invariant 2's spirit and misses exit paths); one subclass file per summoning class (duplicates the tending code three times).
