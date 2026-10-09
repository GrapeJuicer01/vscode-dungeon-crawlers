# Hero classes

Purpose: the hero classes of Pixel Agents, how a hero gets its class, and what each class plays while it fights. Classes are cosmetic: a look, a weapon, and a small effect. The table below is generated from `src/game/data/classes.ts` by `npm run docs:tables`; do not edit it by hand.
Related: [game design](game-design.md), [art style guide](art-style-guide.md), [sprite spec](sprite-spec.md), [H1 plan](../architecture/plans/h1-classes.md), [game engine](../architecture/game-engine.md), [data model](../architecture/data-model.md), [ADR 0002 no hero health](../architecture/adr/0002-no-hero-health.md), [glossary](../glossary.md).

## Assignment

A hero's class is `classFor(sessionId)` in `src/game/data/classMap.ts`: a pure hash of the session id over the delivered classes. It uses no state, no storage, no tool names, and no transcript content. The same id always gives the same class, so a class survives hiding and re-showing the tab, "Developer: Reload Webviews", and a replaced or rebuilt hero. When a later batch delivers more classes the count changes and an id may get a different class once, after the extension updates (H2 did this: the eight-class mapping reads a different slice of the id hash).

## Class table

<!-- BEGIN GENERATED: classes -->
Delivered classes: 8 of 12.

| Class | Role | Colors | Silhouette | Strike effect | Ability (effects) |
|---|---|---|---|---|---|
| Warrior | melee | red + steel | wide shoulders, red plume above a steel helm, round shield | none | Whirlwind (`whirl`) |
| Mage | caster | blue + gold | tallest figure, pointy hat with a gold band, orb staff | `orbBolt` | Arcane Burst (`arcaneBurst`) |
| Archer | ranged | forest green + brown | pointed hood, quiver bulge behind the shoulder, bow | `arrow` | Volley (`arrow` x3) |
| Rogue | melee | slate + purple | low forward crouch, hood and mask, twin daggers | none | Dagger Flurry (`smokePuff`, `dagger` x2) |
| Cleric | melee | white + gold | rounded hood or mitre, soft glow pixel, mace | none | Blessing (`blessGlow`, `buffSparkle` x2) |
| Paladin | melee | gold + white | winged helm, tall kite shield, glowing sword | none | Radiant Smite (`holyBurst`, `buffSparkle`) |
| Necromancer | caster | dark purple + sickly green | hood, hunched, skull staff, skeleton beside it | `soulWisp` | Bone Call (`soulWisp` x2; summons a skeleton) |
| Bard | caster | teal + magenta | big feathered hat, lute | `note` | Chorus (`note` x3) |
<!-- END GENERATED: classes -->

## What each class plays

Every class uses the same three-frame `attack` cycle. A strike effect, where there is one, is released on the strike frame. Every few seconds of attacking (a hidden, seeded timer of 4 to 8 seconds, never shown) a hero also plays its three-frame `ability` animation and releases the ability effects. With no enemies yet, shots fly into the empty corridor and end in a small spark. Resting, warp-in, warp-out, and victory look the same for every class apart from the class look.

- **Warrior**: swings a sword in the attack cycle (no projectile). Whirlwind: a steel ring spins out around the hero.
- **Mage**: thrusts an orb staff and sends a blue `orbBolt` flying right. Arcane Burst: a blue and gold star and ring blooms in front of the hero.
- **Archer**: draws and releases a bow, firing one `arrow` per cycle. Volley: three arrows fan out.
- **Rogue**: quick stabs with the front dagger (no projectile). Dagger Flurry: a smoke puff at the feet and two thrown daggers.
- **Cleric**: swings a mace overhead (no projectile). Blessing: a calm gold glow ring at the cleric's feet and two sparkles rising from it. It is a picture of a blessing; it restores nothing and targets nobody, because heroes have nothing to restore.
- **Paladin**: cuts with a glowing sword (the glow is part of the sword art), behind a tall kite shield. Radiant Smite: a gold-white burst in front of the paladin and one rising sparkle.
- **Necromancer**: thrusts a skull staff and sends a green `soulWisp` drifting right. Bone Call: two wisps rise, and a small skeleton climbs out of the floor beside the necromancer. The skeleton is decoration with no health and no effect on anything or anyone: it walks in place while the hero advances, swings at nothing while the hero fights, and sinks into the floor about half a second after the hero stops fighting (goes to the campfire, or leaves). See [ADR 0011](../architecture/adr/0011-summons-are-leased-cosmetic-entities.md).
- **Bard**: strums a lute and sends a musical `note` drifting up and forward. Chorus: three notes fan out.

## No health, no damage

Heroes are invulnerable ([ADR 0002](../architecture/adr/0002-no-hero-health.md)). A class has no hit points, mana, power, cooldown display, or any number that could become one; the ability timer is hidden and is not drawn. Effects are pictures that fly and fade. None targets a hero, none is drawn as a bar or icon on a hero, and none changes what a hero does: a hero's lifecycle (`spawned`, `working`, `idle`, `despawned`) comes only from the host's agent-state events.
