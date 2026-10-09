# Enemies and stages

Purpose: the enemies, bosses, and stages of Pixel Agents as delivered so far (two stages, ten enemies), how the party fights them, how stage progress works and is saved, and what an enemy attack does to a hero (only a brief cosmetic flash). The enemy table below is generated from `src/game/data/enemies.ts` by `npm run docs:tables`; do not edit it by hand.
Related: [game design](game-design.md), [classes](classes.md), [art style guide](art-style-guide.md), [sprite spec](sprite-spec.md), [E1 plan](../architecture/plans/e1-enemies.md), [ADR 0002 no hero health](../architecture/adr/0002-no-hero-health.md), [ADR 0012 host-owned versioned progress](../architecture/adr/0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and the hero reaction board](../architecture/adr/0013-enemy-health-and-hero-reaction-board.md), [data model](../architecture/data-model.md), [glossary](../glossary.md).

## The rule that does not bend

Heroes are invulnerable. Only enemies have health, and only enemies have a health bar. An enemy attack never hurts a hero: it makes one nearby fighting hero flash white for a tenth of a second and slide one or two pixels, nothing more. There is no stun, slow, knock-down, retreat, or defeated pose, and nothing is drawn on a hero except its shadow and sprite. Bosses attack the same way (a slam flashes up to three heroes at once). A hero's state changes only when the host reports that its agent started, worked, went idle, or ended; no enemy, boss, wave, or stage event can change or remove a hero.

## Stages

| Stage | Name | Mood | Ambient |
|---|---|---|---|
| 1 | The Forgotten Cellar | damp stone, torch orange | dripping water |
| 2 | Goblin Mine Shafts | timber brown, ore glints, lantern yellow | drifting dust motes |

After the last delivered stage the game wraps to Stage 1 and counts one more cycle (the later New Game+ builds on that). Stages share one room layout, so heroes keep their seats and formation across a stage change; only the dressing, palette, and enemies differ.

## Enemies

<!-- BEGIN GENERATED: enemies -->
Delivered enemies: 10 of 50.

| Stage | Id | Name | Tier | Gait | Health | Pace (px/s) | Drop |
|---|---|---|---|---|---|---|---|
| 1. The Forgotten Cellar | `cellar-rat` | Cellar Rat | minion | walk | 10 | 28.6 | coin |
| 1. The Forgotten Cellar | `cave-bat` | Cave Bat | minion | float | 8 | 33.8 | coin |
| 1. The Forgotten Cellar | `web-spider` | Web Spider | minion | walk | 11 | 26 | coin |
| 1. The Forgotten Cellar | `crate-mimic` | Crate Mimic | elite | hop | 24 | 16 | gem |
| 1. The Forgotten Cellar | `rat-king` | Rat King | boss | walk | 120 | 8.4 | chest |
| 2. Goblin Mine Shafts | `goblin-miner` | Goblin Miner | minion | walk | 14 | 26 | ore |
| 2. Goblin Mine Shafts | `goblin-scout` | Goblin Scout | minion | walk | 11 | 33.8 | ore |
| 2. Goblin Mine Shafts | `ore-beetle` | Ore Beetle | minion | walk | 18 | 20.8 | ore |
| 2. Goblin Mine Shafts | `rock-golem` | Rock Golem | elite | walk | 39 | 12 | gem |
| 2. Goblin Mine Shafts | `goblin-foreman` | Goblin Foreman | boss | walk | 162 | 8.4 | chest |
<!-- END GENERATED: enemies -->

Every stage has four regular enemies (three minions and one elite) and one boss. Health comes from a small formula, not a hand-written number per enemy: the tier base, times the row's `vigor`, times 1.35 for each stage after the first, plus 25 percent per completed cycle (up to eight), and, for bosses only, plus 35 percent per fighting hero beyond the first (the party counts up to eight). The Health column is the cycle-0, party-of-one value. Pace is walking speed. The table is checked at startup: every delivered stage must have exactly five enemies with exactly one boss, ids must be unique, and every enemy must name an existing stage. An invalid table disables combat for the page load and the party marches in an empty corridor.

## How a fight goes

- While an agent is working, its hero marches down the corridor with the rest of the party. While it is idle, the hero rests at the campfire and is never attacked.
- Waves of enemies walk in from the right and stand in front of the party. The wave size grows with the number of fighting heroes (one, plus half the fighters, up to the `pixelAgents.maxEnemies` setting).
- Every fighting hero's strike hits the nearest standing enemy for the same amount, whatever its class; an ability hits up to three. Classes are cosmetic and keep no stats. A damaged enemy shows a small health bar for a couple of seconds, flashes white when struck, and dissolves when its health runs out.
- If every agent goes idle mid-fight, the enemies walk off after two seconds. A boss that walks off comes back later at full health; nothing about a fight is saved.
- Defeated enemies pop out a small keepsake (coin, gem, ore, or a chest from a boss). Drops are decoration: nothing collects them, they have no value, and they fade away.

## Bosses

A boss walks in once the stage's kill count (`pixelAgents.killsPerStage`, default 30) is reached and the field is clear. It strikes an intro pose, then fights: a two-frame wind-up before each attack so the slam reads clearly, and a second phase below half health (a hotter palette and attacks 30 percent faster). Its health grows with the number of fighting heroes, frozen when it spawns. Defeating it drops a chest and a burst of coins, holds for a moment, then fades to black (400 ms), swaps the stage, and fades back in.

## Progress and persistence

Progress is by cumulative work: kills happen only while heroes are working and fighting, so an idle or stopped agent adds nothing, and there is no wall-clock timer. The extension remembers five counters in VS Code's own extension storage: the current stage, kills in this stage, total kills, bosses defeated, and completed cycles. Nothing else is stored: no agent name, session, tool, class, or transcript text. The stored value carries a version number and is migrated forward on upgrade; a value from a newer version (after a downgrade) is left untouched and ignored. Saves are throttled (a kill is saved within about 15 seconds, a boss defeat at once) and never lower the stored total.

## Settings

| Setting | Default | Range | Meaning |
|---|---|---|---|
| `pixelAgents.enemies` | on | on or off | show enemies and stage progress; off keeps the party marching in an empty corridor |
| `pixelAgents.killsPerStage` | 30 | 5 to 500 | regular kills before the stage boss appears |
| `pixelAgents.maxEnemies` | 6 | 1 to 12 | most enemies on screen at once |
