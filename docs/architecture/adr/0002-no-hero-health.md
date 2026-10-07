# ADR 0002: Heroes have no health; hero state follows agent events only

Purpose: records why heroes are invulnerable and why only host agent-state events may change a hero's state, so the game can never misrepresent a real agent.
Related: [architecture overview](../overview.md), [CLAUDE.md core invariants](../../../CLAUDE.md), [art style guide](../../design/art-style-guide.md#5-cosmetic-hit-reaction-visual-language), [game engine](../game-engine.md) (planned), [roadmap](../../engineering/roadmap.md).

## Status

Accepted

## Context

Each hero is a visual stand-in for a real Claude Code session. The scene is a status display first and a game second. If a hero could be hurt, die, retreat, or be despawned by gameplay, a user glancing at the panel could conclude that an agent failed, stopped, or needs attention when it did not. Conversely, gameplay bugs (a boss loop, a stage transition error) could hide a running agent.

The user also never controls the game; there is nothing to win by keeping heroes alive, so health adds risk without adding play.

## Decision

- Heroes have **no** HP, mana, damage intake, death, downed, or retreat-when-hurt logic, and no gauge of any kind is drawn on or above a hero (Core invariant 1).
- A hero's lifecycle state changes **only** in response to the host agent-state events `spawned`, `working`, `idle`, `despawned` (Core invariant 2). Combat, bosses, stages, New Game+, hazards, summons, buffs, and the game loop may not change hero state or despawn a hero.
- Enemy attacks on heroes are cosmetic: a renderer-side white flash, a 1-2px knockback that settles, a small spark. Status-like effects (frost, shadow) are tints and icons that never delay a lifecycle transition.
- Only enemies have health, health bars, hit-flash art, and death dissolves.
- Enforcement is by test, not convention: a hero-invariant test (from M4) and a structural check that greps hero code for `hp`, `health`, `mana`, `dead`, `downed`, `retreat`.

## Consequences

- The panel is a trustworthy status display: a visible hero means a live session, and its pose reflects the agent's real state.
- Game design leans on enemy-side feedback (damage numbers, enemy health bars, drops, stage progress) for a sense of progress.
- Every milestone that adds behavior near heroes (H1-H3, E1-E5, M7) must extend the hero-invariant test and the structural check.
- Art never needs hurt, downed, or death frames for heroes, which shrinks the sprite budget.
- This decision mirrors two Core invariants; only the human can change those, so this ADR cannot be superseded by an agent.
