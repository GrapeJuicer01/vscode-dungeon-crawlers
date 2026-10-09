# Art style guide

Purpose: the visual rules for every sprite, tile, and effect in Pixel Agents, so all art stays consistent. Owned by the pixel-artist.
Related: [sprite spec](sprite-spec.md), [game engine room layout](../architecture/game-engine.md#3-room-layout), [ADR 0010](../architecture/adr/0010-split-room-stage-layout.md), [classes](classes.md), [enemies and stages](enemies-and-stages.md) (planned, M6), [accessibility](accessibility.md) (planned, M7), [security and safety](../architecture/security-and-safety.md).

Heroes follow a **Tiny Towers-inspired** look: tiny, chunky, chibi characters with big heads and simple faces, seen from the side in cutaway rooms. All art is procedural: palette-indexed pixel maps in code, no image files.

## 1. Style pillars

- **Chibi proportions**: the head is about 40% of sprite height. Stubby limbs, no necks.
- **Side view**, facing right (the renderer mirrors for left). Flat 2D, no perspective.
- **1px dark outline** on every sprite, in a very dark tinted color (not pure black).
- **Flat colors plus one shade tone** per material, with at most one highlight pixel. No dithering, gradients, or anti-aliasing.
- **Faces**: single-pixel dot eyes, no mouth. Expression comes from pose and hair.
- **Readable at a glance**: classes are identifiable by silhouette alone (hat, weapon, hair, cape).
- **Bright, saturated hero palettes** even on dark stages, so heroes always pop.
- **Cutaway rooms** like tower floors: a back wall, a floor strip to stand on, and props along the wall.

## 2. Grid sizes (assumptions; update here if the engine differs)

| Asset | Size |
|---|---|
| Hero | 16w x 20h |
| Minion enemy | 16x16 (12-20 wide allowed) |
| Elite enemy | 24x24 |
| Boss | 48x48 (large bosses 64x48) |
| Tile | 16x16 |
| Prop | 8-32 px, multiples of 4 preferred (door frame 16x128) |
| Hero weapon layer | 24w x 20h (wider than the body for the swing), same foot anchor |
| Campfire | logs 48x12, small flame 8x12, large flame 12x20 |
| Backdrop | 128x128, tiles horizontally |
| Internal buffer | 320x180 |

### Room layout (all stages share it)

Fixed 320x180 buffer on a 16x16 tile grid, 20 columns ([ADR 0010](../architecture/adr/0010-split-room-stage-layout.md)).

| Rows (y px) | Content | Tile set |
|---|---|---|
| 0 (0-15) | ceiling edge | `wallTop` |
| 1-6 (16-111) | back wall, backdrop shows through transparent pixels | `wallMid` |
| 7 (112-127) | wall-to-floor edge | `wallBase` |
| 8 (128-143) | far floor, heroes walk here (foot y 140-158) | `floorBack` |
| 9 (144-159) | near floor | `floorFront` |
| 10 (160-175), then 4 px fill | dark front lip over everything | `foreground` |

Columns 0-7 are the alcove (campfire at x 64), column 8 is the door frame (16x128), columns 9-19 are the scrolling corridor (a repeating 24-tile segment). Tile variants join side by side (columns 0 and 15 identical across a set), and wall variants stack (rows 0 and 15 identical). Wall props sit on the wall (anchor top-left); floor props stand on the floor (anchor base center).

## 3. Palettes

- One **master palette** (37 colors: 33 through H2 plus `L N` summon greens counted, then `C Z` copper in A3-1; E1 added none; cap 48) in `src/game/sprites/palettes.ts`. Sprites reference palette characters, never hex.
- At most **12 colors per sprite**, outline included.
- Standard hero characters (extend, never repurpose):

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `.` | transparent | `k` | boots |
| `o` | outline | `m` | metal |
| `s` | skin | `w` | white highlight |
| `h` | hair | `a` | accent (class color) |
| `e` | eye | `c` | cloth primary |
| `d` | cloth shade / belt | `b` | pants |

- Other master characters (extend, never repurpose):

| Group | Characters |
|---|---|
| Fire (campfire flames, embers) | `Y` yellow core, `O` orange, `R` red-orange, `D` dark ember |
| Campfire base | `W` log, `V` log light, `G` stone, `P` stone shade |
| Stage 1 tiles | `1` to `8` (below) |
| World | `n` clear color (near-black), `g` ambient darkness tint (cool gray-blue) |
| Light | `T` torch light, `F` campfire light |
| Water particles | `q` light, `Q` mid (`8` is the dim end) |

- 4 skin tones and 6 hair colors are **partial palette swaps**: a skin tone overrides only `s`; a hair color overrides only `h`. Index 0 of each equals the master color. Class palettes are partial swaps over `a c d b k m` only (never `o s h e w`), applied after the master and before skin and hair (see the class table in section 6).
- **Particle ramps** (bright to dim): ember `Y O R D`, spark `w Y O`, drip `q Q 8`, splash `w q Q`.
- Each biome has an **8-color tile palette**. Enemies in a stage share 2-3 of those colors plus their own accent.
- Colorblind-safe variant: never rely on red versus green alone; pair color with a shape cue.

## 4. Hero construction

Heroes are layered: **base body** (shared), **head/hair**, **gear**, **weapon** (separate so attack frames can offset it).

| Animation | Frames | Notes |
|---|---|---|
| idle | 2 | gentle 1px bob |
| walk | 4 | classic two-step bounce |
| attack | 3 (base hero and every H1 class) | wind-up, strike, recover; the base hero swings a plain short sword with a crescent of air on the strike frame |
| ability | 3 | signature move, in the hero set since A1-1: raise the weapon arm, thrust forward, recover (timing 120/140/200 ms, release on frame 1). The base hero has the generic pose and never plays it; classes override it |
| rest poses | 2 each | sit, eat, sleep (closed-eye line and a small "z"), polish weapon (the weapon layer is visible), read, warm hands |
| victory | 2 | despawn pose before warp-out (sword raised, then a 1px hop) |

The default base hero (A0) is classless: neutral blue cloth, a sand scarf in the accent `a`, brown boots, a plain short sword in the weapon layer, `gear` null. Skin and hair vary by palette swap. Sleep uses closed-eye lines and nothing else; it is a rest pose, never a hurt pose.

## 5. Cosmetic hit-reaction visual language

Heroes are invulnerable, so hits are theater, never damage.

- **Allowed**: a 2-4 frame white flash applied by the renderer, a 1-2px knockback offset that settles, a small spark effect.
- **Never**: hurt or pained faces, sweat drops, dizzy stars, slumped or downed poses, low-health tints, health ticks, or any gauge over a hero.
- Red is reserved for enemy damage numbers and the harmless screen-edge flash on tool errors. It is never used as a hero hit tint.
- Buff and status icons above heroes are small, decorative, and never read as a resource bar.

## 6. Hero classes

Delivered: all four H1 classes (A1-1 palettes and effects, A1-2 Warrior and Mage layers, A1-3 Archer and Rogue layers). Each layer set has all eleven animations (26 frames per layer, `attack` exactly 3). Body is shared; each class supplies `head`, `gear`, `weapon` (`classTemplates.ts`). The master palette was 33 colors at A1-1 (counts: 35 after the `L N` summon greens, 37 after A3-1; cap 48); classes use only `a c d b k m` overrides plus master characters, at most 11 colors per composited look (cap 12).

| Class | `a` accent | `c` cloth | `d` shade | `b` pants | `k` boots | `m` metal |
|---|---|---|---|---|---|---|
| Warrior | red `#d83a3a` | steel `#8d9ab4` | `#5c6886` | `#5a4a52` | `#5a3826` | `#d8e0ee` |
| Mage | gold `#f4c430` | royal blue `#3f6fe0` | `#2a47a8` | `#35358a` | `#6a4020` | `#a9d6ff` |
| Archer | brown `#a8703a` | leaf green `#3fa650` | `#276b35` | `#6b4a2a` | `#46301c` | `#c9d1c0` |
| Rogue | purple `#a05ae6` | slate `#5f6e88` | `#3e4862` | `#2d3144` | `#392a3c` | `#c4cad8` |

Silhouette cues as delivered (each reads from the outline alone at 16x20):

| Class | Head | Gear | Weapon | Cue |
|---|---|---|---|---|
| Warrior | steel helm with brow band, red plume rising and streaming back | broad pauldrons, round red-and-steel shield on the near arm | two-pixel sword; the strike frame adds a crescent, the `ability` thrust adds spin lines | wide shoulders, red plume |
| Mage | tall bent pointed hat, gold band, wide brim (head 1 px lower) | flared robe, gold hem and belt | staff with a pale-blue orb in a gold cradle; the orb brightens with gold sparks on strike and ability | tallest silhouette, hat tip at the top edge |
| Archer | green hood with a peak that bends back | quiver with white fletching behind the shoulder, chest strap | bow with a white string; the string pulls back and an arrow is nocked on the strike frame | hood point, quiver bulge |
| Rogue | low rounded cowl, dark mask over the lower face, purple scarf tail (head 1 px lower and forward) | cape trailing back, purple belt | front dagger plus a short back dagger; the `ability` throw sends two blades forward and leaves the hands empty | low, forward-leaning, masked |

Rules: red is only the Warrior accent (plume, trim, shield) and the body cloth is steel, so a Warrior never reads as tinted by a hit. Pair color with shape (plume, hat, hood, mask).

### Effects (A1-1)

Master characters, `idle` only, centre anchor, calm things the hero does (never damage taken).

| Effect | Size | Frames | Colors | Used by |
|---|---|---|---|---|
| `whirl` | 24x12 | 3 (expanding edge-on steel ring, dashed last frame) | `m w G` | Warrior ability |
| `orbBolt` | 6x6 | 2 (pulse) | `d c w a` | Mage strike |
| `arcaneBurst` | 24x24 | 3 (star, ring, fading ring) | `c d w a` | Mage ability |
| `arrow` | 10x3 | 1 | `k m w` | Archer |
| `dagger` | 7x5 | 2 (flat, tilted spin) | `o b m w` | Rogue ability |
| `smokePuff` | 12x10 | 3 (grow, thin) | `G P b` | Rogue ability |

The Rogue purple in `dagger` and `smokePuff` is the master indigo `b` and slate `G`/`P`, so these read slate and purple without a new master color.

### H2 classes and effects (batch A2)

Delivered: Cleric, Paladin, Necromancer, Bard (`classTemplatesH2.ts`, `palettesH2.ts`). Same layers, eleven animations, 26 frames per layer, anchors, and canvas sizes as H1. Master was 35 colors at the end of H2 (an earlier text said 33, which missed `L N`; cap 48). Cleric and Paladin use one extra master character, `Y`, for glow sparkles (12 colors composited, the cap).

| Class | `a` accent | `c` cloth | `d` shade | `b` pants | `k` boots | `m` metal |
|---|---|---|---|---|---|---|
| Cleric | gold `#e8a820` | cream white `#f3f0e6` | `#b7bcd6` | `#a8926c` | `#7a5634` | pale gold `#f6e49a` |
| Paladin | soft white `#dde3f4` | gold `#f0b830` | `#b27a18` | `#c9ccd8` | `#8a5a2a` | pale glow `#fff1b0` |
| Necromancer | sickly green `#8fe03c` | violet `#7a3fc0` | `#4b2480` | `#2d2238` | `#3a2a30` | bone `#e8e4c4` |
| Bard | magenta `#e0409a` | teal `#20b4a6` | `#157d80` | `#5a3f86` | `#8a4e26` | gold `#f0cf72` |

| Class | Head | Gear | Weapon | Cue |
|---|---|---|---|---|
| Cleric | wide flat-topped white mitre with a gold cross and band, gold ribbons behind (head 1 px lower) | white mantle, gold stole, robe with gold hem | flanged mace with a pale-gold head; gold glints on strike and ability | wide mitre, stole |
| Paladin | gold winged helm, one white wing fanning up and back (head 1 px lower) | white cape behind, gold pauldron, tall kite shield with a gold cross (small buckler at rest) | glowing sword, gold sparks beside the blade | wing, tall shield |
| Necromancer | deep violet hood drooping forward, shadowed brow (head 1 px down and forward) | hunched back hump, ragged hem with green trim, bone shoulder spike | skull staff, green eye glint and wisps on strike and ability | hump, skull on a staff |
| Bard | wide-brim teal hat with a long magenta feather (head 1 px lower) | short cape, magenta sash, golden buckle | golden lute held at the hip; strummed across the body in attack and ability | big hat and feather, lute |

Effects (master characters, `idle` only, centre anchor, at most 8 colors, calm and never damage taken): `buffSparkle` 16x16 3 frames (twinkling gold stars; any buff or ability), `note` 7x8 2 frames (pale-blue eighth note, Bard strike and ability), `healGlow` 24x12 3 frames (gold ring at the feet, Cleric ability), `holyBurst` 24x24 3 frames (gold-white cross, rays, thin ring, Paladin ability), `soulWisp` 10x7 3 frames (pale-blue wisp flying right, Necromancer strike and ability). No sickly-green or magenta effect exists because effects use master characters only; the wisp and note read pale blue.

Summon: `skeleton` 16x20 (`summonTemplates.ts`, `idle` 2, `walk` 4, `attack` 3, `rise` 4, `sink` 3). Convention: [sprite spec section 9](sprite-spec.md#9-summon-sprites).

### H3 classes, effects, and summons (batch A3)

Delivered: Druid, Monk, Artificer, Berserker (`classTemplatesH3.ts`, palettes in `palettesH3.ts`), five effects (`effectTemplatesH3.ts`), and the `beast` and `turret` summons (`summonTemplatesH3.ts`). Same layers, eleven animations, 26 frames per layer, anchors, and canvas sizes as H1 and H2. The master palette is 37 colors (cap 48): H3 added only `C` copper `#d9824a` and `Z` copper shade `#9a4f26` (wrench and turret). Druid and Monk use the extra master character `Y` for glints and fist halos (12 colors composited, the cap); Artificer and Berserker use the 11 hero characters only. With H3 the class table is complete at twelve.

| Class | `a` accent | `c` cloth | `d` shade | `b` pants | `k` boots | `m` metal |
|---|---|---|---|---|---|---|
| Druid | leaf green `#5cba4a` | earth brown `#9a6a3a` | `#6b4526` | moss `#4a5a30` | `#5a3c22` | pale bark `#d8c9a0` |
| Monk | cream `#f3e6c4` | orange `#f08a2c` | `#b85a1a` | `#6a3a22` | `#5a3822` | warm glow `#ffe6a8` |
| Artificer | teal `#2cb4a8` | copper `#c8743a` | `#8f4a24` | slate teal `#35566a` | `#4a2e22` | light steel `#bfd4dc` |
| Berserker | war-paint red `#d03030` | fur brown `#9a6a3c` | `#6b4426` | `#4a3a34` | `#3a2616` | steel `#c4c8d0` |

| Class | Head | Gear | Weapon | Cue |
|---|---|---|---|---|
| Druid | pale forked antlers over a leaf crown, a leaf tuft trailing behind (head 1 px lower) | leafy shoulder wrap, brown strap, leaf fringe at the hip | crooked wooden staff with a pale knot and a leaf cluster on top; the cluster gets `Y` glints on strike and ability | antlers, crooked staff |
| Monk | cream headband with a knot and two tails trailing back, small topknot (head 1 px lower) | orange gi with cream lapel and sash, knotted tail behind, bare forearms (skin) | no weapon: both fists glow, a near fist (the pose's hand) and a far fist behind the body, each with a small `Y` halo; a 2-frame shimmer in `idle`, strongest in `attack` frame 1 and `ability` | headband, bare arms, glowing fists |
| Artificer | steel-rimmed teal goggles pushed up on the forehead on a dark strap | big copper gear backpack (cog and two pipes) behind the shoulders, bandolier, belt, teal chest gauge | steel wrench with a copper grip; white glints at the goggles on `ability` frames 0 and 1 | big backpack bump, goggles, wrench |
| Berserker | wild spiky hair (three spikes, two strands streaming back), war paint (below), head 1 px lower | fur collar and mantle, bare chest with a leather strap, belt, fur loincloth, bare arms | oversized axe: a 6x7 head on a long haft, a 4x9 head face-on on the forward swing | spiky hair, bare chest, huge axe |

Berserker rules (invariant 1 safe look): war-paint red exists solely as `a`, and the class uses exactly **two** `a` pixels, a horizontal cheek bar at head `(x+4..x+5, y+5)`, drawn in the head layer so it is identical in every frame of every animation relative to the head (the gear layer leaves those two cells empty so a sleeping head never hides them). The torso scarf row of the base body is also `a`, and the Berserker's fur collar covers it in every pose; the composited look has exactly 2 red pixels in all 26 frames. No red in fur, body, weapon, or any effect. The mouth opens (two dark pixels at the chin, weapon layer) only in `ability` frames 0 and 1. Nothing grows, pulses, or varies with state, and there is no hurt face.

Effects (A3-1): `leaf` 6x6 2 frames (`L N k w`, Druid strike and ability), `chiOrb` 7x7 2 (`O Y w`, Monk strike and ability), `chiBurst` 24x24 3 (star, ring, fading ring; `O Y w`, Monk ability), `warCry` 28x12 3 (tight, wide, thin dust ring; `a V O Y`, where `a` is the master sand-gold because effects are never class-swapped, so it is never the Berserker red; no red, transparent centre, Berserker ability), `wrench` 7x7 2 (`C Z m w`, Artificer strike and ability). Auras and bursts are one-shot, engine-driven; no effect is a persistent aura.

Summons (A3-2, A3-3), master characters only, `idle` 2, `walk` 4, `attack` 3, `rise` 4, `sink` 3 (see [sprite spec section 9](sprite-spec.md#9-summon-sprites)):

| Summon | Size, anchor | Colors | Look |
|---|---|---|---|
| `beast` (Druid) | 20x16, `(10, 15)` | 7: `o h W 7 e L N` | small friendly wolf cub: brown fur with a darker back, cream muzzle, belly, paw tips, and tail tip, leaf-green collar. `idle` tail and body bob, `walk` a trot in place, `attack` a short playful snap (crouch, lunge with open mouth, recover). `rise` sprouts up out of the floor in green leaf puffs; `sink` goes down upright and thins into drifting leaves. Never feral, never collapses. |
| `turret` (Artificer) | 16x16, `(8, 15)` | 7: `o C Z m Q q Y` | clockwork walker: copper dome on two stubby steel-footed legs, steel back cog (turns in `idle`), blue lens (blinks in `idle`), short steel barrel. `walk` alternates the legs with a small body bob. `attack`: the barrel swivels up, levels with one pale `Y` muzzle pixel for one frame (no projectile, no beam), then settles down. `rise` unfolds out of the floor with a hop of cog sparks; `sink` folds down into the floor. Never smokes, breaks, or shows red. The lens is the master light blue `Q`; no teal master character was added. |

Class list (final, all twelve delivered):

| Class | Palette | Silhouette cues | Signature prop |
|---|---|---|---|
| Warrior | red + steel | plumed helmet, broad shoulders | big sword + round shield |
| Mage | blue + gold | tall pointy hat | staff with glowing orb |
| Archer | forest green + brown | hood, quiver on back | bow |
| Rogue | slate + purple | hood + mask, low crouch | twin daggers |
| Cleric | white + gold | rounded hood or mitre, soft glow pixel | mace / holy symbol |
| Paladin | gold + white | winged helm, tall kite shield | glowing sword |
| Necromancer | dark purple + sickly green | hood, hunched | skull staff |
| Bard | teal + magenta | big feathered hat | lute |
| Druid | earth brown + leaf green | antlers, leaf crown | gnarled wooden staff |
| Monk | orange + cream | headband, bare forearms | glowing fists, no weapon |
| Artificer | copper + teal | goggles on forehead, gear backpack | wrench |
| Berserker | fur brown + war-paint red | wild spiky hair, bare chest | oversized axe |

## 7. Enemy rules

- **Silhouette first**: every enemy in a stage is distinguishable when filled solid black.
- Each stage has 4 regular enemies plus 1 boss; vary shape across the four.
- **Tiers**: minion 16px, elite 24px, boss 48px or larger. Bosses get an intro pose, a 2-frame telegraph for attacks, and 2-3 phase variants (palette shift or added feature).
- **No hit, death, or dissolve art.** The hit flash (white silhouette) and the death dissolve (four-step seeded pixel removal) are generated by the engine from the existing idle and attack frames ([E1 plan decision E1-3](../architecture/plans/e1-enemies.md)). Enemy animations are `idle 2, walk 2, attack 3` (bosses add `telegraph 2`, `intro 2`); no animation is named `hit`, `death`, `dead`, `die`, `dying`, `hurt`, or `downed`.
- **Enemies face left** (authored once, never mirrored; decision E1-19). Only enemies have health bars.
- **Health bar**: 18x4 frame (16x2 interior) for minions and elites, 34x5 (32x3 interior) for bosses, 1 px `o` outline, top-left anchor, warm fill `R` over empty back `P`. Bars belong to enemies; a hero never gets a gauge.
- **Drops** (`drops/coin|gem|ore|chest`): calm cosmetic keepsakes, coin/gem/ore 6x6 and chest 12x10, two-frame `idle` (one white glint), foot-anchored, at most 8 colors, master characters only. Nothing that looks like a potion, heart, or bar.
- Weakness and resistance are hinted by color or detail.
- Tone is cute-spooky, never gory: big eyes, chunky shapes.

### Delivered enemies (batch E1, steps A-E1-2, A-E1-3, A-E1-5, A-E1-6)

All templates are `enemies/<id>`, left-facing, foot anchor on the bottom outline row, drawn from fill plus an auto 1 px outline in the stage's `1` (stage 2 recolors it to shaft brown-black). Colors listed exclude nothing: they are the full set per sprite (cap 12). Preview with `node tools/sprite-preview.mjs enemies <stage id|enemy id|all> out.png`.

| Stage | id | Tier, size, anchor | Frames | Colors | Silhouette cue |
|---|---|---|---|---|---|
| 1 | `cellar-rat` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 G P s w e R` | low and long, pink curled tail, big ear |
| 1 | `cave-bat` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 b 2 P s Y e w R` | wide scalloped wings, pointed ears (flaps; the engine floats it) |
| 1 | `web-spider` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 W V R w e 7` | round body, eight splayed loose legs, hanging thread |
| 1 | `crate-mimic` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 10: `1 5 2 4 3 D w R Y e` | boxy crate, slanted jagged lid, teeth; `attack` opens the lid wide, snaps it shut, then sticks out a tongue |
| 1 | `rat-king` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 12: `1 G P m s w e a Y R d b` | huge hunched rat, bent gold crown, royal-blue cape (`d` main, `b` shade), heap of tiny pink tails |
| 2 | `goblin-miner` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 10: `1 N L m 6 e w 5 2 k` | upright, helmet lamp, long ears, pickaxe over the shoulder |
| 2 | `goblin-scout` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 N L 4 3 e w k m` | lean, forward-leaning sprint, two long ears streaming back |
| 2 | `ore-beetle` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 11: `1 b d 2 8 7 Y e k P w` | low wide dome, teal ore crystals on an indigo shell |
| 2 | `rock-golem` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 7: `1 N G m P Y O` | compact stack of rock slabs, mossy head, glowing eyes, arm held low or back, never overhead |
| 2 | `goblin-foreman` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 12: `1 N L 6 5 2 m k e w Y O` | big goblin, yellow hard hat with lamp, huge pickaxe, lantern in the far hand |

Boss readability: `telegraph` for both bosses is clearly unlike `attack`. Rat King rears up with both arms raised and the mouth open, then throws his head and one arm back; his `attack` is a low forward claw swipe. Goblin Foreman raises the pickaxe straight overhead, then pulls it back behind him with lantern rays; his `attack` is a low forward swing. `intro` is a stand-tall pose (Rat King spreads both arms and roars, with a crown glint on frame 1; Foreman plants the pick like a cane and lifts the lantern, with glow rays on frame 1).

Phase palettes (`BOSS_PHASE_PALETTES` in `palettesE1.ts`, exported as `ENEMY_PHASE_PALETTES`; phase 2 is index 0): Rat King overrides `d #d8452c`, `b #8f2a1c`, `a #ff9a2e`, `R #ff3a2a` (hot red-orange cape, orange crown, brighter jewel); Goblin Foreman overrides `Y #fff6c0`, `O #ff5a1c`, `6 #ff8a2c` (white-hot lantern, orange hat). Same silhouettes. Red and orange are fine here: bosses are enemies.

Contrast note: stage 1 enemies avoid the stone grays of floor and wall with master accents (gray rat with pink, indigo bat, brown spider with red hourglass, wooden crate); stage 2 enemies use goblin green, indigo and rock gray against timber brown.

## 8. Stages

**Per-stage palettes (decision E1-2).** Each stage keeps the eight tile characters `1` to `8`, but their colors are a partial palette per stage (`STAGE_PALETTES` in `palettesE1.ts`), laid over the master palette; it may also override `g` (ambient) and `T` (torch or lantern light). Stage 1 is `{}` (the master values). Stage 2, Goblin Mine Shafts: `1 #1a120d`, `2 #3b2a1e`, `3 #5f4430`, `4 #8c6a46`, `5 #b07a3c`, `6 #ffd24a` lantern yellow, `7 #f2e8c8` chalk, `8 #62d0bc` ore glint, `g #7a6a84`, `T #ffc94a`. Meaning is stable across stages (1 deepest shadow, 2 dark rock, 3 mid rock, 4 lit rock, 5 timber, 6 light source, 7 highlight, 8 accent), so shared sprite logic still reads. No new master characters per stage; the master palette stays at 37 colors (cap 48). The `mote` particle ramp (warm dust, stage 2 ambient) reuses master `a V W`.

Each stage needs a tile palette, floor tiles, back-wall tiles, 6+ props, a parallax backdrop, and an ambient effect.

| # | Stage | Mood / palette | Props | Ambient |
|---|---|---|---|---|
| 1 | The Forgotten Cellar | damp stone gray-brown, torch orange | barrels, crates, cobwebs, chains | dripping water |
| 2 | Goblin Mine Shafts | timber brown, ore glints, lantern yellow | supports, minecart, pickaxes, ore veins | dust motes |
| 3 | Toxic Slime Caverns | teal and acid green glow | slime puddles, glowing mushrooms, pipes | rising bubbles |
| 4 | Ancient Catacombs | bone beige, dusty purple | sarcophagi, skull niches, candles | low fog, dust |
| 5 | Enchanted Forest Ruins | moss green, ruin gray, glowing blue flora | broken pillars, roots, glowing flowers | fireflies |
| 6 | Molten Core | basalt black, lava orange and red | lava channels, obsidian pillars, anvils | embers, lava glow |
| 7 | Frozen Citadel | ice blue, frost white | icicles, frozen banners, ice thrones | falling snow |
| 8 | Shadow Realm | deep indigo and violet | floating shards, dark mirrors, wisp torches | shadow wisps |
| 9 | Dragon's Lair | red-brown rock, gold hoard | coin piles, giant bones, broken armor | heat shimmer |
| 10 | Void Spire | near-black, magenta and cyan cracks | floating runes, rifts, crystal pillars | pulsing void rifts |

### Stage 1 characters and props (delivered, batch A0)

Tile palette (`STAGE_TILE_CHARS['forgotten-cellar']` = `12345678`, clear `n`, ambient `g`, light `T`):

| Char | Role | Char | Role |
|---|---|---|---|
| `1` | deepest shadow, outlines | `5` | wood (barrel, crate, torch handle) |
| `2` | stone dark, mortar | `6` | torch orange |
| `3` | stone mid | `7` | bone, cobweb, flame core |
| `4` | stone light, highlights | `8` | damp water blue |

Tiles: `wallTop` 2, `wallMid` 5 (4 stone plus 1 barred window, transparent so the backdrop shows; place the window deliberately, not by random pick on every row), `wallBase` 2, `floorBack` 3, `floorFront` 3 (one has a small puddle), `foreground` 2 (one has rubble bumps with transparent top pixels). Backdrop: dark arcades with a farther arch inside each opening, period 64 px.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `barrel` | 16x16 | base center | 1 | floor, solid |
| `crate` | 16x16 | base center | 1 | floor, solid |
| `bonePile` | 16x8 | base center | 1 | floor, decoration |
| `puddle` | 16x4 | base center | 2 (ripple glint) | floor, drip target |
| `cobweb` | 16x16 | top-left | 1 | wall, corner |
| `chains` | 8x24 | top-left | 1 | wall |
| `torch` | 8x16 | top-left | 4 (flame loop) | wall, light source |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column |

### Stage 2 characters and props (delivered, batch E1 step A-E1-4)

Tile palette (`STAGE_TILE_CHARS['goblin-mine-shafts']` = `12345678`, clear `n`, ambient `g`, light `T`; colors from `STAGE_PALETTES`, see section 8): `1` shaft shadow and outline, `2` dark rock, `3` rock and old timber, `4` lit rock, `5` fresh timber, `6` lantern yellow, `7` chalk and sparkle, `8` ore glint (teal).

Tiles: `wallTop` 2 (stalactites), `wallMid` 5 (4 rock variants, two with ore glints, one with a crack and a wooden peg, plus variant 4, a timber-framed shaft opening with transparent pixels for the backdrop), `wallBase` 2, `floorBack` 3 and `floorFront` 3 (packed dirt and gravel; variant 1 has an ore sparkle, variant 2 a half-buried timber sleeper), `foreground` 2 (variant 1 has loose rocks above the lip). The rock pattern is a wrapped, seeded Voronoi (periodic in 16, so tiles join); variants only touch the interior. Backdrop 128x128, period 64: a receding timbered shaft (near frame with posts, lintel, and corner braces, a smaller farther frame, dark opening, ceiling and ground shadow).

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `support` | 16x96 | top-left | 1 | wall (timber post with crossbeam, braces, base stone) |
| `pickaxe` | 16x16 | top-left | 1 | wall decoration |
| `oreVein` | 16x16 | top-left | 1 | wall (rock patch with teal glints) |
| `lantern` | 8x16 | top-left | 4 (flicker) | wall, light source (`T` light) |
| `minecart` | 16x16 | base center | 1 | floor, solid (cart of ore) |
| `rubble` | 16x8 | base center | 1 | floor, decoration |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (timber lintel and posts) |

Ambient: `dust` motes use the `mote` ramp `a V W` (warm sand, light wood, dark wood).

**Campfire**: logs and seats, a 4-frame flame loop in two sizes (small, large from 3 resting heroes), ember sparks. It grows as more heroes rest and is drawn identically across stages with master characters only. Delivered: `logs` (a stone ring, two crossed logs, a flanking decorative log each side; anchor at the pit's front-edge center), `flameSmall`, `flameLarge`.
