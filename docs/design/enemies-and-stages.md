# Enemies and stages

Purpose: the enemies, bosses, and stages of Pixel Agents as delivered so far (ten stages, fifty enemies, ten bosses), how the party fights them, how stage progress works and is saved, and what an enemy attack does to a hero (only a brief cosmetic flash). The enemy table below is generated from `src/game/data/enemies.ts` by `npm run docs:tables`; do not edit it by hand.
Related: [game design](game-design.md), [classes](classes.md), [art style guide](art-style-guide.md), [sprite spec](sprite-spec.md), [E1 plan](../architecture/plans/e1-enemies.md), [E2 plan](../architecture/plans/e2-stages-3-4.md), [ADR 0002 no hero health](../architecture/adr/0002-no-hero-health.md), [ADR 0012 host-owned versioned progress](../architecture/adr/0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and the hero reaction board](../architecture/adr/0013-enemy-health-and-hero-reaction-board.md), [data model](../architecture/data-model.md), [glossary](../glossary.md).

## The rule that does not bend

Heroes are invulnerable. Only enemies have health, and only enemies have a health bar. An enemy attack never hurts a hero: it makes one nearby fighting hero flash white for a tenth of a second and slide one or two pixels, nothing more. There is no stun, slow, knock-down, retreat, or defeated pose, and nothing is drawn on a hero except its shadow and sprite. Bosses attack the same way (a slam flashes up to three heroes at once). A hero's state changes only when the host reports that its agent started, worked, went idle, or ended; no enemy, boss, wave, or stage event can change or remove a hero.

## Stages

| Stage | Name | Mood | Ambient |
|---|---|---|---|
| 1 | The Forgotten Cellar | damp stone, torch orange | dripping water |
| 2 | Goblin Mine Shafts | timber brown, ore glints, lantern yellow | drifting dust motes |
| 3 | Toxic Slime Caverns | murky teal rock, acid-green glow, slime accents | rising bubbles |
| 4 | Ancient Catacombs | bone beige, dusty purple, candle glow | low drifting fog and a few dust motes |
| 5 | Enchanted Forest Ruins | moss green over ruin gray, glowing blue flowers | blinking fireflies |
| 6 | Molten Core | basalt black, rust iron, orange glow | rising embers |
| 7 | Frozen Citadel | pale ice blue, frosted stone, cold crystal glow | slow falling snow |
| 8 | Shadow Realm | dark indigo dusk, violet crystal, pale wisp glow | dim drifting murk |
| 9 | Dragon's Lair | scorched stone, sand bronze, hoard gold, brazier glow | faint heat shimmer rising from the floor |
| 10 | Void Spire | dark slate-blue spire, pale star points, thin rift glow | tiny slits that pulse slowly |

After Stage 10 the game wraps to Stage 1 and counts one more cycle. That loop is New Game+: it needs no marker and no save migration, and the cycle counter already scales enemy health by 25 percent per completed cycle, capped at eight cycles ([ADR 0014](../architecture/adr/0014-new-game-plus-is-the-ten-stage-loop.md)). A save from before Stages 9 and 10 existed simply continues; a cycle is now a pass through ten stages. The Stage 6 lava, its embers, the Stage 5 fireflies, the Stage 7 ice and snow, the Stage 8 mirrors, shards, and murk, the Stage 9 gold, braziers, and heat shimmer, and the Stage 10 rifts, stars, and rings are scenery only: they are drawn in the background or as small particles, sit nowhere near the floor the party walks on, and nothing in the game reads them (no burn, chill, slow, or glow can touch a hero, and nothing icy, scorched, or dark is ever drawn on a hero). The four late bosses have a `vigor` below 1.0 (Elder Dryad 0.9, Molten Colossus 0.8, Glacier Mammoth 0.6, Eclipse Warden 0.5, the lowest the validator allows) so their fights do not drag: with a party of eight the Elder Dryad starts with 1238 health, the Molten Colossus with 1485, the Glacier Mammoth with 1504, and the Eclipse Warden with 1692. The two final bosses also sit at 0.5, and from Stage 9 the per-stage health growth drops from 1.35 to 1.05 so their fights stay near the Stage 8 length: with a party of eight the Hoard Dragon starts with 1776 health and the Void Sovereign with 1865 (515 and 541 alone). Stages share one room layout, so heroes keep their seats and formation across a stage change; only the dressing, palette, and enemies differ.

## Enemies

<!-- BEGIN GENERATED: enemies -->
Delivered enemies: 50 of 50.

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
| 3. Toxic Slime Caverns | `green-slime` | Green Slime | minion | hop | 18 | 23.4 | coin |
| 3. Toxic Slime Caverns | `spore-shroom` | Spore Shroom | minion | walk | 22 | 20.8 | coin |
| 3. Toxic Slime Caverns | `toxic-toad` | Toxic Toad | minion | hop | 16 | 31.2 | coin |
| 3. Toxic Slime Caverns | `jelly-cube` | Jelly Cube | elite | walk | 57 | 10 | gem |
| 3. Toxic Slime Caverns | `ooze-queen` | Ooze Queen | boss | walk | 219 | 8.4 | chest |
| 4. Ancient Catacombs | `bone-soldier` | Bone Soldier | minion | walk | 25 | 26 | coin |
| 4. Ancient Catacombs | `wailing-ghost` | Wailing Ghost | minion | float | 20 | 31.2 | coin |
| 4. Ancient Catacombs | `tomb-scarab` | Tomb Scarab | minion | walk | 27 | 23.4 | ore |
| 4. Ancient Catacombs | `crypt-mummy` | Crypt Mummy | elite | walk | 71 | 12 | gem |
| 4. Ancient Catacombs | `tomb-lich` | Tomb Lich | boss | walk | 295 | 8.4 | chest |
| 5. Enchanted Forest Ruins | `thorn-sprout` | Thorn Sprout | minion | walk | 33 | 23.4 | coin |
| 5. Enchanted Forest Ruins | `moss-wolf` | Moss Wolf | minion | walk | 30 | 33.8 | coin |
| 5. Enchanted Forest Ruins | `bramble-pixie` | Bramble Pixie | minion | float | 27 | 28.6 | ore |
| 5. Enchanted Forest Ruins | `ancient-treant` | Ancient Treant | elite | walk | 104 | 10 | gem |
| 5. Enchanted Forest Ruins | `elder-dryad` | Elder Dryad | boss | walk | 359 | 8.4 | chest |
| 6. Molten Core | `ember-imp` | Ember Imp | minion | hop | 45 | 31.2 | coin |
| 6. Molten Core | `slag-snail` | Slag Snail | minion | walk | 58 | 13 | ore |
| 6. Molten Core | `magma-crab` | Magma Crab | minion | walk | 49 | 26 | ore |
| 6. Molten Core | `furnace-guard` | Furnace Guard | elite | walk | 129 | 10 | gem |
| 6. Molten Core | `molten-colossus` | Molten Colossus | boss | walk | 430 | 8.4 | chest |
| 7. Frozen Citadel | `rime-penguin` | Rime Penguin | minion | walk | 48 | 20.8 | coin |
| 7. Frozen Citadel | `frost-hare` | Frost Hare | minion | hop | 42 | 36.4 | coin |
| 7. Frozen Citadel | `snow-sentry` | Snow Sentry | minion | walk | 54 | 18.2 | ore |
| 7. Frozen Citadel | `snow-yeti` | Snow Yeti | elite | walk | 145 | 12 | gem |
| 7. Frozen Citadel | `glacier-mammoth` | Glacier Mammoth | boss | walk | 436 | 7 | chest |
| 8. Shadow Realm | `lantern-wraith` | Lantern Wraith | minion | float | 49 | 26 | coin |
| 8. Shadow Realm | `shard-cluster` | Shard Cluster | minion | float | 41 | 33.8 | ore |
| 8. Shadow Realm | `mirror-mimic` | Mirror Mimic | minion | walk | 57 | 20.8 | coin |
| 8. Shadow Realm | `gloom-stag` | Gloom Stag | elite | walk | 157 | 16 | gem |
| 8. Shadow Realm | `eclipse-warden` | Eclipse Warden | boss | float | 490 | 8.4 | chest |
| 9. Dragon's Lair | `drake-whelp` | Drake Whelp | minion | walk | 51 | 23.4 | coin |
| 9. Dragon's Lair | `kobold-sapper` | Kobold Sapper | minion | walk | 56 | 26 | ore |
| 9. Dragon's Lair | `gilded-crown` | Gilded Crown | minion | float | 43 | 31.2 | coin |
| 9. Dragon's Lair | `ash-wyvern` | Ash Wyvern | elite | float | 154 | 16 | gem |
| 9. Dragon's Lair | `hoard-dragon` | Hoard Dragon | boss | walk | 515 | 7 | chest |
| 10. Void Spire | `crescent-drifter` | Crescent Drifter | minion | float | 45 | 26 | coin |
| 10. Void Spire | `comet-tadpole` | Comet Tadpole | minion | hop | 50 | 36.4 | ore |
| 10. Void Spire | `eye-strider` | Eye Strider | minion | walk | 54 | 20.8 | coin |
| 10. Void Spire | `obelisk-sentinel` | Obelisk Sentinel | elite | float | 151 | 12 | gem |
| 10. Void Spire | `void-sovereign` | Void Sovereign | boss | float | 541 | 8.4 | chest |
<!-- END GENERATED: enemies -->

Every stage has four regular enemies (three minions and one elite) and one boss. Health comes from a small formula, not a hand-written number per enemy: the tier base, times the row's `vigor`, times 1.35 for each stage after the first (1.05 for each stage from Stage 9 on), plus 25 percent per completed cycle (up to eight), and, for bosses only, plus 35 percent per fighting hero beyond the first (the party counts up to eight). The Health column is the cycle-0, party-of-one value. Pace is walking speed. The table is checked at startup: the table must cover exactly ten stages and hold exactly 50 enemies with 50 unique ids, every stage must have exactly five enemies with exactly one boss and at least one minion, and every enemy must name an existing stage. An invalid table disables combat for the page load and the party marches in an empty corridor.

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
