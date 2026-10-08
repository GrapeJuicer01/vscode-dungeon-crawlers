# ADR 0009: Hero lifecycle is separated from animation phase and mutated in one place

Purpose: records how the engine makes Core invariants 1, 2, and 4 structural: a hero's lifecycle changes only through one roster method fed by queued host events, animation phase is derived from it, and a faulty entity is quarantined instead of removed.
Related: [game engine](../game-engine.md), [M4 plan](../plans/m4-engine.md), [ADR 0002 no hero health](0002-no-hero-health.md), [ADR 0008 DOM-free engine](0008-dom-free-engine-behind-ports.md), [host-webview protocol](../host-webview-protocol.md), [security and safety](../security-and-safety.md), [testing strategy](../../engineering/testing-strategy.md#5-hero-invariant-test-from-m4), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

[ADR 0002](0002-no-hero-health.md) says what must never happen: gameplay must not change or hide a hero. It does not say how the engine is shaped so the rule is hard to break. Later milestones add classes, abilities, summons, enemies, bosses, hazards, and stage changes, all of which run near heroes. A rule that depends on every future author remembering it will eventually fail; a shape in which the forbidden thing has no code path is much safer. Invariant 4 adds a second need: a thrown error in one entity must not take the scene, the loop, or any hero's state with it.

## Decision

- **Two layers.** `lifecycle` is exactly the host's `AgentState` (`spawned`, `working`, `idle`, `despawned`) and is the only fact about an agent that a hero stores. `phase` (`warpIn`, `standby`, `travel`, `advance`, `attack`, `rest`, `victory`, `warpOut`) is cosmetic and is derived each update from `lifecycle` plus timers. Nothing reads `phase` to decide `lifecycle`.
- **One mutator.** `Hero.applyAgentState(info)` is the only code that writes `lifecycle`. It is called only from `Roster.ts`, which is called only from `Game`'s event drain. A structural test greps for both rules; classes, abilities, combat, bosses, stages, summons, and effects have no call to it.
- **Queued events.** `Game.enqueueAgent` and `enqueueSnapshot` append to a bounded queue. The queue is drained at the start of the next fixed update step, so an event that arrives during an effect takes effect on the next update, and a frame that throws cannot lose or half-apply an event. On queue overflow the engine discards the queue and reconciles from the host mirror's agent list (the mirror is authoritative).
- **Removal only after `despawned`.** A hero leaves the roster only after its lifecycle is `despawned` and its exit animation has finished (or a 5 s failsafe elapsed), or when a snapshot omits it, which is itself a host message. Nothing else removes a hero.
- **Quarantine, not removal.** Every entity `update` and `draw` runs inside its own try/catch. After three consecutive faults an entity is frozen (not updated, last pose still drawn if drawing works) and the error is reported once per distinct message. A frozen hero still accepts lifecycle events; an event gives it a fresh start. Faults never change `lifecycle` and never remove a hero.
- **No outward channel.** The engine has no host channel and no `postMessage`; a thrown error reaches only the `onError` callback supplied by the webview host.
- Hero subclasses (H1-H3) and the entity factory seam (`HeroFactory`) may add behavior in `update` and `draw` but not touch `lifecycle`; the structural check scans every file under `src/game/entities/`.

## Consequences

- The hero-invariant test is concrete: apply every non-lifecycle stimulus, then assert `Game.heroSnapshot()` is unchanged; apply each of the four events and assert exact effects.
- A new feature near heroes cannot silently gain a path to hero state; the review question becomes "does this file call `applyAgentState`?".
- Cosmetic phases can lag the lifecycle by a few hundred milliseconds (a warp-in finishes before a `working` hero walks to its slot). The lifecycle is already correct at that moment, so nothing observable to the host or to tests of `lifecycle` is late.
- A frozen entity shows a stuck pose rather than vanishing; the failsafe guarantees a despawned hero is still removed.
- Cost: an event queue and a derived-phase function instead of direct event handlers. The machine is small (eight phases).
