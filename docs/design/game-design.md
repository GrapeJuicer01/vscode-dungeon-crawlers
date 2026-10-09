# Game design

Purpose: the player-facing design of Pixel Agents in one page: what the panel shows, how heroes follow agents, and how classes and effects fit in. Detail lives in the linked docs.
Related: [classes](classes.md), [art style guide](art-style-guide.md), [sprite spec](sprite-spec.md), [game engine](../architecture/game-engine.md), [roadmap](../engineering/roadmap.md), [ADR 0002 no hero health](../architecture/adr/0002-no-hero-health.md), [glossary](../glossary.md).

## The idea

The panel is a watch window, not a game you play. Each active Claude Code agent session appears as a hero. While the agent works, its hero marches down a corridor with the rest of the party and fights. While the agent is idle, the hero rests at the campfire. When the session ends, the hero celebrates and warps out. You cannot control, stop, or message a session from the panel; it only observes.

## Heroes follow agents

A hero is exactly as alive as its agent. Its state changes only when the host reports that the agent was spawned, started working, went idle, or ended. Nothing that happens in the scene (a fight, an effect, a crash) can change a hero's state, hurt it, or remove it. Heroes have no health, and no bars or numbers are drawn on them.

## Classes

Every hero is one of the delivered classes (Warrior, Mage, Archer, Rogue, Cleric, Paladin, Necromancer, and Bard so far; twelve are planned). The class is chosen from the session id alone, so it never changes for a session. A class is a look (palette, silhouette, weapon) plus a small effect it plays while fighting, and nothing more: no stats, no roles that matter to your agents. See [classes](classes.md).

## Effects

While the party fights, class heroes release small effects: an orb bolt, an arrow, a whirl, a burst, a thrown dagger. They are short pictures that fly right and fade, kept calm and small (at most 24 live at once, never a full-screen flash). They do not hit or mark a hero. In H1 there are no enemies, so they play into the empty corridor.

## Summons and aura effects

A class may raise a summon: the Necromancer's Bone Call lifts a small skeleton beside it. A summon is decoration. It has no health, is never a target, and has no effect on any hero; it walks in place while the hero advances, swings at nothing while the hero fights, and sinks into the floor shortly after the hero stops fighting. Blessings and music (Cleric, Paladin, Bard) are one-shot aura effects of at most a second, centered on the caster: calm gold sparkles, a glow at the feet, drifting notes. They restore, buff, and mark nothing, and no icon or bar stays on a hero.

## Rhythm

Fights come in cycles: the party advances, engages for a few seconds, and advances again, so the corridor scrolls and the scene always looks alive. The campfire grows with the number of resting heroes. Stages, enemies, achievements, and sound arrive in later milestones; see the [roadmap](../engineering/roadmap.md).
