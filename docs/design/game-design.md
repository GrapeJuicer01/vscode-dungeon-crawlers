# Game design

Purpose: the player-facing design of Pixel Agents in one page: what the panel shows, how heroes follow agents, and how classes and effects fit in. Detail lives in the linked docs.
Related: [classes](classes.md), [art style guide](art-style-guide.md), [sprite spec](sprite-spec.md), [game engine](../architecture/game-engine.md), [roadmap](../engineering/roadmap.md), [ADR 0002 no hero health](../architecture/adr/0002-no-hero-health.md), [glossary](../glossary.md).

## The idea

The panel is a watch window, not a game you play. Each active Claude Code agent session appears as a hero. While the agent works, its hero marches down a corridor with the rest of the party and fights. While the agent is idle, the hero rests at the campfire. When the session ends, the hero celebrates and warps out. You cannot control, stop, or message a session from the panel; it only observes.

## Heroes follow agents

A hero is exactly as alive as its agent. Its state changes only when the host reports that the agent was spawned, started working, went idle, or ended. Nothing that happens in the scene (a fight, an effect, a crash) can change a hero's state, hurt it, or remove it. Heroes have no health, and no bars or numbers are drawn on them.

## Classes

Every hero is one of the delivered classes (Warrior, Mage, Archer, Rogue, Cleric, Paladin, Necromancer, Bard, Druid, Monk, Artificer, and Berserker: the set is complete at twelve). The class is chosen from the session id alone, so it never changes for a session. A class is a look (palette, silhouette, weapon) plus a small effect it plays while fighting, and nothing more: no stats, no roles that matter to your agents. See [classes](classes.md).

## Effects

While the party fights, class heroes release small effects: an orb bolt, an arrow, a whirl, a burst, a thrown dagger. They are short pictures that fly right and fade, kept calm and small (at most 24 live at once, never a full-screen flash). They do not hit or mark a hero. Enemies stand in the corridor from E1 on; the shots still fly into the corridor and fade, and each strike is paired with an engine impact spark on the targeted enemy (see [enemies and stages](enemies-and-stages.md)).

## Summons and aura effects

A class may raise a summon: the Necromancer's Bone Call lifts a small skeleton beside it, the Druid's Wild Call a small wolf (the beast), and the Artificer's Deploy Turret a small clockwork turret. A summon is decoration. It has no health, is never a target, and has no effect on any hero; it walks in place while the hero advances, swings at nothing while the hero fights, and sinks into the floor shortly after the hero stops fighting. Blessings and music (Cleric, Paladin, Bard) are one-shot aura effects of at most a second, centered on the caster: calm gold sparkles, a glow at the feet, drifting notes. The Monk's Chi Burst and the Berserker's Battle Roar are likewise one-shot flourishes on the hidden ability timer; the roar is not a rage meter and nothing about it builds or reacts to the fight. They restore, buff, and mark nothing, and no icon or bar stays on a hero.

## Rhythm

Fights come in cycles: the party advances until an enemy stands in front of it, fights, and advances again, so the corridor scrolls and the scene always looks alive. With enemies turned off (or if combat is disabled after a fault) the party keeps the older timed rhythm: advance for five seconds, engage for a few, repeat. The campfire grows with the number of resting heroes. Enemies and bosses arrive with ten stages (The Forgotten Cellar, Goblin Mine Shafts, Toxic Slime Caverns with rising bubbles, Ancient Catacombs with low fog, Enchanted Forest Ruins with blinking fireflies, Molten Core with rising embers and lava scenery that is decoration only, Frozen Citadel with slow snowfall, Shadow Realm with dim drifting murk, Dragon's Lair with faint heat shimmer, and Void Spire with slowly pulsing rift slits; ice, snow, mirrors, shadow, gold, fire, and rifts are scenery only and nothing is drawn on a hero; see [enemies and stages](enemies-and-stages.md)): the party fights as one, any striking hero hits the nearest enemy for the same amount, enemies alone have health and a health bar, and an enemy attack only makes a fighting hero flash white and slide a pixel or two. Defeating each stage's boss after the kill threshold moves the party to the next stage (after Stage 10 it wraps back to Stage 1 and counts a cycle: New Game+, where enemy health grows 25 percent per cycle up to eight cycles), and progress is saved (five stage counters, nothing about agents). Achievements and sound arrive in later milestones; see the [roadmap](../engineering/roadmap.md).
