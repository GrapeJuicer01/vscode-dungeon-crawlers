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
- **Particle ramps** (bright to dim): ember `Y O R D`, spark `w Y O`, drip `q Q 8`, splash `w q Q`, mote `a V W`, bubble `L N Q`, wisp `G g P`, and (E3) **firefly `Y N L N Y`**: the one ramp that alternates bright and dim, so a 1x1 firefly blinks slowly (each step is a fifth of its 3.5 to 6.5 s life, never faster than 0.5 s). The Stage 6 embers reuse the `ember` ramp. No new master character was added in E3: the master palette stays at 37 of 48.
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

### Delivered enemies (batch E2, steps A-E2-4 to A-E2-6)

Same contract as above (left-facing, foot anchor, fill plus auto outline in the stage's `1`). Stage 3 enemies are bright and warm or saturated against dark teal rock; Stage 4 enemies are pale or gold against dusty purple stone, outlined in the stage's near-black `1`.

| Stage | id | Tier, size, anchor | Frames | Colors | Silhouette cue |
|---|---|---|---|---|---|
| 3 | `green-slime` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 6: `1 L N w e q` | tall pear-shaped drop with a pointed tip leaning back, two big off-center eyes, a dark base rim, no limbs (reworked in A-E3-0); `walk` leans and squashes (the engine hops it); `attack` squashes back, lunges flat with a small mouth |
| 3 | `spore-shroom` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 R D w 7 G e L k` | very wide tilted red cap (lifted brim on the left, scalloped gills on the right) with uneven white spots on a thin pale stem with dot eyes, two tiny feet (reworked in A-E3-0); `attack` squeezes the cap and puffs green spores to the front |
| 3 | `toxic-toad` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 C Z Y R e O` | upright sitting orange toad: two yellow eye globes on thin stalks, a wide mouth line, pale belly, red warts, Z-bent hind leg (reworked in A-E3-0); `attack` lunges a pink tongue to the front |
| 3 | `jelly-cube` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 9: `1 c d Q q e w a Y` | tall flat-topped pillar of blue jelly leaning back and melting into a wide puddle skirt, a glossy rim, a gold coin and a bone suspended inside (reworked in A-E3-0); `attack` stretches up, then slams flat |
| 3 | `ooze-queen` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 9: `1 L N a Y R w e q` | lime slime queen with a narrow gown, a tall drippy gold crown, large eyes, bubbles rising inside, and both slime arms raised in a wave (reworked in A-E3-0; the lunge reaches one arm forward) |
| 4 | `bone-soldier` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 10: `1 7 5 G P Y R D k e` | leaning skeleton, dented iron helmet, amber eyes, round wooden shield in front, rusty red sword behind; thin loose bone legs |
| 4 | `wailing-ghost` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 5: `1 w q Q e` | tall narrow white teardrop sheet with a round head, hollow eyes, an open mouth and a ragged hem; drawn two pixels right of the frame center so it clears the Bone Soldier (reworked in A-E3-0); `attack` raises an arm and wails (pale sound ticks to the front) |
| 4 | `tomb-scarab` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 8: `1 a Y O k e 8 q` | flat golden beetle, short orange horn, segmented shell, violet gem, spread dark legs |
| 4 | `crypt-mummy` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 7: `1 7 5 2 e Y 8` | bandaged shuffler leaning forward, glowing eyes in a dark gap, arms reaching forward at chest height, one trailing wrap; `attack` pulls the arms back, then lunges them forward |
| 4 | `tomb-lich` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 11: `1 8 2 7 5 a k L N Y e` | hooded skeleton in a violet robe with gold belt and hem, tall spiked gold crown, green eye glow, staff with a floating green gem |

Silhouette separation: Bone Soldier differs from the Necromancer's skeleton summon (helmet, shield, rusty sword, amber eyes, lean, versus the summon's bare upright bones with green eyes); Wailing Ghost differs from Cave Bat (tall pale teardrop with a hem versus a dark wide-winged flyer); within Stage 3 the four read as dome, umbrella, wide low frog, and square block; within Stage 4 as a gear-laden skeleton, a tall sheet, a flat beetle, and a wide bandaged brute. Boss telegraphs: Ooze Queen swells wide with glowing eyes, then tips forward with a wide open mouth (her `attack` is a low lunge with a slime arm); Tomb Lich lifts the staff high while the gem swells and throws out rays (his `attack` winds the staff back, then thrusts it forward).

Phase palettes (`BOSS_PHASE_PALETTES_E2` in `palettesE2.ts`, merged into `ENEMY_PHASE_PALETTES` at wiring; phase 2 is index 0): Ooze Queen overrides `L #ff9a6a`, `N #d8456a`, `a #ff5a1c`, `Y #fff6c0` (hot pink-orange glow, molten crown); Tomb Lich overrides `L #ffffff`, `N #b8e0ff`, `8 #ff5ad8`, `Y #ffffff` (white-hot gem and eyes, hot magenta robe). Same silhouettes.

Boss readability: `telegraph` for both bosses is clearly unlike `attack`. Rat King rears up with both arms raised and the mouth open, then throws his head and one arm back; his `attack` is a low forward claw swipe. Goblin Foreman raises the pickaxe straight overhead, then pulls it back behind him with lantern rays; his `attack` is a low forward swing. `intro` is a stand-tall pose (Rat King spreads both arms and roars, with a crown glint on frame 1; Foreman plants the pick like a cane and lifts the lantern, with glow rays on frame 1).

Phase palettes (`BOSS_PHASE_PALETTES` in `palettesE1.ts`, exported as `ENEMY_PHASE_PALETTES`; phase 2 is index 0): Rat King overrides `d #d8452c`, `b #8f2a1c`, `a #ff9a2e`, `R #ff3a2a` (hot red-orange cape, orange crown, brighter jewel); Goblin Foreman overrides `Y #fff6c0`, `O #ff5a1c`, `6 #ff8a2c` (white-hot lantern, orange hat). Same silhouettes. Red and orange are fine here: bosses are enemies.

Contrast note: stage 1 enemies avoid the stone grays of floor and wall with master accents (gray rat with pink, indigo bat, brown spider with red hourglass, wooden crate); stage 2 enemies use goblin green, indigo and rock gray against timber brown.

### Delivered enemies (batch E3, steps A-E3-4 to A-E3-6)

Same contract as above (left-facing, foot anchor, outline in the stage's `1`). Stage 5 enemies are bright greens, warm browns, and glowing blue accents over dark gray-green ruin stone; Stage 6 enemies are warm reds, oranges, and glowing cracks against near-black basalt. The base frame of most E3 enemies is a hand-drawn fill picture (outlined by `fromFill`); the other frames derive from it with the row-level helpers in `enemyFrames.ts` (`shiftRows`, `lift`, `squash`, `patch`). Ids and names match [the E3 plan](../architecture/plans/e3-stages-5-6.md#52-data-enemy-rows-and-stage-props).

| Stage | id | Tier, size, anchor | Frames | Colors | Silhouette cue |
|---|---|---|---|---|---|
| 5 | `thorn-sprout` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 L 5 w e W N` | round moss bulb with one big eye, a spiked radial crown of thorny leaves, three thin root legs; `attack` leans forward and flares the leaves |
| 5 | `moss-wolf` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 G Y 5 L e P w R` | lean gray wolf on four thin legs, two tall pointed ears, a yellow eye, mossy back, tail raised high; `attack` crouches, then lunges the head forward with open jaws |
| 5 | `bramble-pixie` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 11: `1 N 6 7 e s 5 D W 8 k` | a thin X of glowing wings (cyan upper pair, blue lower pair) around a small leaf-haired pixie with dangling legs, a thorny stick held to the front; hovers three pixels above the ground; `attack` flicks the stick and flares the wings |
| 5 | `ancient-treant` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 8: `1 L W V 5 6 7 e` | gnarled tree: wide root base, bark trunk with a glowing-eyed face, a Y of branches ending in leaf tufts, two low branch arms held forward at chest height, never overhead; `attack` pulls the arms back, then thrusts them forward |
| 5 | `elder-dryad` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 10: `1 w W a Y V N e L 5` | tall tree-spirit woman: antler-branch crown with white and gold blossoms, bark-brown face, leafy hair trailing back, a gown of trailing vines, a vine staff topped with a glowing blossom |
| 6 | `ember-imp` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 w R O Y D e` | small red imp, no wings: two pale horns, yellow eyes, a claw held forward, a long curved tail ending in a tiny flame; the walk is a hop; `attack` swipes the claw with yellow slash ticks |
| 6 | `slag-snail` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 Y D 4 3 e 2 6 O` | dark red snail with two eyestalks, an orange belly, and a high cooled-basalt spiral shell behind the head that glows at the cracks; `idle` retracts the stalks, `attack` thrusts the head forward with the stalks laid back |
| 6 | `magma-crab` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 R D Y 4 3 6 2 P` | wide flat basalt-plated crab with a glowing crack, two long arms ending in raised red pincers, eyes on short stalks, thin legs splayed out; `attack` opens the claws, then snaps them shut as the body lunges |
| 6 | `furnace-guard` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 10: `1 P 7 2 5 e Y 3 6 4` | squat iron guard: horned helmet with a small smoking chimney, rust shoulder plates, a box torso with a glowing grate, a big hammer carried low in front; drawn about four pixels left of the frame center so it clears the Crate Mimic; `attack` rocks back, then swings the hammer up in front |
| 6 | `molten-colossus` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 8: `1 2 3 4 5 6 7 8` | hulking basalt giant: a small blocky head with glowing eyes and a jagged crest, huge rust-banded shoulders, a furnace door in the chest, orange cracks, two heavy fists raised at the sides, legs set wide apart |

Silhouette separation inside Stage 5: tall spiky bulb, standing wolf with tall ears and a raised tail, a thin X of wings, and a Y-crowned tree. Inside Stage 6: thin horned biped with a flame-tipped tail, low snail with a high shell, wide flat crab with two claws up, and a boxy horned guard with a chimney. All new minions are measured against every older 16x16 enemy with the look-alike tool (see "Look-alike policy" below).

Boss readability: Elder Dryad `telegraph` lifts the staff high while the blossoms open wide and the eyes glow; her `attack` thrusts the staff forward in a long reach with gold sparkles; `intro` rises out of the ground. Molten Colossus `telegraph` gathers both fists in front of the chest while the cracks and grate brighten; his `attack` raises the fists, then slams both to the floor; `intro` climbs out of the ground.

Phase palettes (`BOSS_PHASE_PALETTES_E3` in `palettesE3.ts`, merged into `ENEMY_PHASE_PALETTES` at wiring; phase 2 is index 0): Elder Dryad overrides `L #ff9a3c`, `N #c8501c`, `w #fff6d8`, `a #ffe08a` (warm autumn orange leaves, white-gold blossoms); Molten Colossus overrides `5 #d8883c`, `6 #ffd24a`, `7 #ffffff`, `8 #ff7a1c` (white-hot cracks and furnace glow, heated rust bands). Same silhouettes. No hero ever gets a phase or a hot tint.

## 8. Stages

**Per-stage palettes (decision E1-2).** Each stage keeps the eight tile characters `1` to `8`, but their colors are a partial palette per stage (`STAGE_PALETTES` in `palettesE1.ts`), laid over the master palette; it may also override `g` (ambient) and `T` (torch or lantern light). Stage 1 is `{}` (the master values). Stage 2, Goblin Mine Shafts: `1 #1a120d`, `2 #3b2a1e`, `3 #5f4430`, `4 #8c6a46`, `5 #b07a3c`, `6 #ffd24a` lantern yellow, `7 #f2e8c8` chalk, `8 #62d0bc` ore glint, `g #7a6a84`, `T #ffc94a`. Meaning is stable across stages (1 deepest shadow, 2 dark rock, 3 mid rock, 4 lit rock, 5 timber, 6 light source, 7 highlight, 8 accent), so shared sprite logic still reads. No new master characters per stage; the master palette stays at 37 colors (cap 48). The `mote` particle ramp (warm dust, stage 2 ambient) reuses master `a V W`.

Stage 3, Toxic Slime Caverns (batch E2): `1 #0b1816`, `2 #1d3836`, `3 #2f5652`, `4 #4b7d73`, `5 #7b7a3a` olive crust, `6 #b4ff3c` acid glow, `7 #dcf5c6`, `8 #3fd0a0` aqua slime, `g #5a8a80`, `T #8fe84a`. Stage 4, Ancient Catacombs: `1 #150f1c`, `2 #2e2438`, `3 #4f4160`, `4 #76668a`, `5 #b8a67c` bone beige, `6 #b8fff0` cold candle flame, `7 #f2ead2` bone white, `8 #a85cf0` violet, `g #6a5a92`, `T #8fe8d8`. Both keep the clear color `n` (master near-black). The master palette stays at 37 colors. Particle ramps added in E2: `bubble` `L N Q` (lime, green, blue-gray; rising toxic bubbles) and `wisp` `G g P` (dim grays and violet; low fog), master characters only.

Stage 5, Enchanted Forest Ruins (batch E3): `1 #0b1511`, `2 #222f29`, `3 #3b4f43`, `4 #62786a`, `5 #5fa24a` moss green, `6 #7fe4ff` glowing blue flora, `7 #e6f3dc`, `8 #3f8cff` deep blue bloom, `g #3f7468` (dark blue-green), `T #7fd0ff` (soft blue bloom light). Stage 6, Molten Core: `1 #0e0a0c` basalt black, `2 #241d22`, `3 #3a3238`, `4 #5d5059`, `5 #a8643c` rust iron, `6 #ff7a1c` glowing orange, `7 #ffe49a` hot yellow-white, `8 #7a2a1c` deep red-brown, `g #6b6058` (gray-brown), `T #ffa040` (warm orange). Both keep the clear color `n`. **Tint rule:** the Stage 6 ambient tint `g` is a dark neutral warm gray-brown whose red channel is at most 1.3 times the larger of green and blue (107 against 96); a strong red wash over a hero would read as "hurt", so the lava glow comes only from lights (`T`), bright pixels, and prop animation. The master palette stays at 37 colors.

**Lava rules (cosmetic only, no hazard).** Lava (`6` and `7`) appears only in the backdrop, in wall-layer props (`lavaFall`, `lavaChannel`) and wall tiles (the lit opening, the door gap). Floor tiles and floor props use only the dark `8` and rust `5`; no floor prop is named `lava...`; no prop or particle is solid except the alcove floor props. The lava lights (`lavaFall`, `lavaChannel`) and `glowBloom` use `flicker: false`.

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

### Stage 3 characters and props (delivered, batch E2 step A-E2-2)

Tile palette (`STAGE_TILE_CHARS['toxic-slime-caverns']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` deepest shadow and outline, `2` dark rock, `3` mid rock, `4` lit rock, `5` olive crust and old metal, `6` acid glow, `7` pale highlight, `8` aqua slime. The rock stays dark and dull so the enemies stand out.

Tiles: `wallTop` 2 (stalactites ending in slime drops), `wallMid` 5 (rounded rock lumps from a wrapped Voronoi; slime streaks, an olive pipe stub, plus variant 4, a round metal-framed opening with transparent pixels for the backdrop), `wallBase` 2, `floorBack` 3 and `floorFront` 3 (wet rock; variants 1 and 2 carry thin slime films), `foreground` 2. Backdrop 128x128, period 64: dripping cavern arches with distant glowing growths and slow stalactite drips.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `pipe` | 16x16 | top-left | 1 | wall (olive pipe run with a flange joint and a slime leak; no dial or gauge) |
| `slimeDrape` | 16x40 | top-left | 1 | wall (slime curtain dripping from the ceiling) |
| `glowShroom` | 16x16 | top-left | 2 (slow pulse, no flicker) | wall, light source (`T` light) |
| `toxicBarrel` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove |
| `slimePool` | 16x8 | `(8, 7)` | 1 | floor, decoration (not named `puddle`, which the engine treats as a drip point) |
| `mushrooms` | 16x12 | `(8, 10)` | 1 | floor, decoration |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (crusted metal lintel, slime drips) |

Ambient: rising `bubble` particles (`L N Q`).

### Stage 4 characters and props (delivered, batch E2 step A-E2-3)

Tile palette (`STAGE_TILE_CHARS['ancient-catacombs']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` deepest shadow and outline, `2` dark stone, `3` mid stone, `4` lit stone, `5` bone beige, `6` cold candle flame, `7` bone white, `8` violet accent.

Tiles: `wallTop` 2, `wallMid` 5 (4 masonry variants: plain, cracked, a skull set in the wall, violet rune scratches; variant 4 a barred arch with transparent pixels for the backdrop), `wallBase` 2 (bone beige skirting), `floorBack` 3 and `floorFront` 3 (flagstones; variant 1 cracked, variant 2 a violet rune), `foreground` 2 (variant 1 has loose bones above the lip). Masonry is 4 px courses of 8 px blocks, periodic in 16. Backdrop 128x128, period 64: pointed vault arches receding, with pillars at the period edge and a few distant candle glints. Skulls are stylized and cute-spooky, no gore.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `skullNiche` | 16x32 | top-left | 1 | wall (three stacked skull recesses) |
| `candelabra` | 16x20 | top-left | 4 (flame sway and height flicker) | wall, light source (`T` light, flicker on) |
| `crackedPillar` | 16x112 | top-left | 1 | wall (fluted column with capital, base, cracks) |
| `sarcophagus` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove |
| `urn` | 12x14 | `(6, 12)` | 1 | floor, decoration |
| `boneRubble` | 16x8 | `(8, 6)` | 1 | floor, decoration (not `bonePile`) |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (bone-beige lintel with a skull, violet marks) |

Ambient: low `wisp` particles (`G g P`) plus warm dust motes.

### Stage 5 characters and props (delivered, batch E3 step A-E3-2)

Tile palette (`STAGE_TILE_CHARS['enchanted-forest-ruins']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` deepest shadow and outline, `2` dark ruin stone, `3` mid stone, `4` lit stone, `5` moss green, `6` glowing blue flora, `7` pale highlight, `8` deep blue bloom. Stone stays darker and less saturated than the enemies.

Tiles: `wallTop` 2 (hanging vines ending in a blue bud), `wallMid` 5 (4 mossy masonry variants: moss patches, a climbing vine, a worn blue rune, heavy moss with tiny blooms; variant 4 a vine-wrapped window with transparent pixels for the backdrop), `wallBase` 2 (a moss strip along the base; variant 1 has blooms), `floorBack` 3 and `floorFront` 3 (mossy flagstones with grass tufts; variant 1 cracked, variant 2 a blue bloom), `foreground` 2 (grass blades on the lip; variant 1 a bloom). Masonry is 4 px courses of 8 px blocks, periodic in 16. Backdrop 128x128, period 64: ruined arches (upper right broken away) between dark tree trunks with hanging vines and glowing flowers in the distance.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `brokenPillar` | 16x96 | top-left | 1 | wall (a fluted column snapped to a jagged top, wrapped by roots, moss at the base) |
| `hangingRoots` | 16x40 | top-left | 1 | wall (roots and vines hanging from the ceiling, a few leaves and a bloom) |
| `glowBloom` | 16x20 | top-left | 2 (slow pulse) | wall, light source (`T` soft blue, flicker false) |
| `ruinedStatue` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove (mossy robed bust on a pedestal) |
| `fernPatch` | 16x10 | `(8, 8)` | 1 | floor, decoration |
| `flowerBed` | 16x8 | `(8, 6)` | 1 | floor, decoration (small glowing flowers) |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (ruined stone arch with a mossy lintel, ivy, blue blooms) |

Ambient: `firefly` particles (ramp `Y N L N Y`).

### Stage 6 characters and props (delivered, batch E3 step A-E3-3)

Tile palette (`STAGE_TILE_CHARS['molten-core']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` basalt black and outline, `2` dark charcoal, `3` mid charcoal, `4` lit basalt, `5` rust iron, `6` glowing orange, `7` hot yellow-white, `8` deep red-brown.

Tiles: `wallTop` 2 (basalt points under the lip), `wallMid` 5 (4 basalt variants: plain, a crack with a dark red glow, a rust iron band with rivets, cooling embers; variant 4 a lit opening framed in dark red with transparent pixels for the backdrop), `wallBase` 2 (a dark red skirting line), `floorBack` 3 and `floorFront` 3 (basalt flagstones, dark red seams only, no glow colors), `foreground` 2. Basalt is 4 px wide columns with a lit left edge and dark seams in 8 px courses, periodic in 16. Backdrop 128x128, period 64: a far lava river under a dithered dark-red horizon glow, black basalt columns.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `obsidianPillar` | 16x112 | top-left | 1 | wall (glossy dark column with long glints and a rust band) |
| `lavaFall` | 16x96 | top-left | 4 (slow flow loop) | wall, light source (`T` orange, flicker false) |
| `lavaChannel` | 16x8 | top-left | 2 (shimmer) | wall-base band, light source (flicker false; edge columns repeat so it tiles) |
| `anvil` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove |
| `slagHeap` | 16x8 | `(8, 7)` | 1 | floor, decoration (cooled rubble, dark red crack, no bright glow; not named `lava...`) |
| `toolRack` | 16x24 | top-left | 1 | wall decoration (hung hammer and tongs on a rust beam) |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (blackened iron-banded arch with an orange glow in the gap) |

Ambient: rising `ember` particles (the existing `Y O R D` ramp).

**Campfire**: logs and seats, a 4-frame flame loop in two sizes (small, large from 3 resting heroes), ember sparks. It grows as more heroes rest and is drawn identically across stages with master characters only. Delivered: `logs` (a stone ring, two crossed logs, a flanking decorative log each side; anchor at the pit's front-edge center), `flameSmall`, `flameLarge`.

## Look-alike policy

Silhouette overlap is measured on idle frame 0 (opaque pixels as anchor-relative keys). `overlap` is shared pixels over the smaller count; `IoU` is shared over the union. Policy: every pair of same-size enemies (minion 16x16, elite 24x24, boss 48x48) has overlap under 0.85 and IoU at most 0.80, and two minions of one stage stay under 0.75 overlap. Run `node test/support/lookAlikesReport.mjs <file.ts>:<ExportName>[:<stage>]` on new art before wiring it; it prints the worst pairs and `policy holds` when the art passes.

Lessons from E3: a sprite that is larger than another is judged by how much of the smaller one it covers, so a big solid blob loses to every small enemy; keep new minions near 110 to 160 pixels, spend 15 percent or more of the pixels where the others are empty (the top rows, the side columns, tall ears, horns, tails, wings, a raised claw), and leave holes (gaps between legs, between arms and torso). The `ooze-queen` and `molten-colossus` are separated from the solid `rat-king` the same way (raised arms and fists in the empty top corners).

Reworked in E3 step A-E3-0 (art only, same ids, sizes, anchors, animation sets): `green-slime`, `spore-shroom`, `toxic-toad`, `wailing-ghost` clear all ten former `KNOWN_OVER` pairs; `jelly-cube` and `ooze-queen` clear the legacy pairs against `crate-mimic` and `rat-king`; `green-slime` and `toxic-toad` no longer exceed the same-stage limit (0.748 against 0.75). Two older sprites were left alone on purpose: `crate-mimic`, `rat-king`, and the Stage 1 and 2 minions are E1 art. Legacy pairs that still exceed (all among E1 and E2 enemies, still pinned in `test/support/lookAlikes.ts` `LEGACY_OVER`): crate-mimic vs rock-golem and crypt-mummy; rock-golem vs crypt-mummy; rat-king vs tomb-lich; cellar-rat vs cave-bat, web-spider, and ore-beetle; cave-bat vs web-spider and ore-beetle; web-spider vs ore-beetle; goblin-miner vs goblin-scout. The pins for the pairs reworked here (17 pairs, listed by the report as `stale pins`) must be removed by the tester.

Two sprites sit off their frame center on purpose so that the anchor-relative silhouette clears an older enemy: `furnace-guard` (about four pixels left, away from `crate-mimic`) and `wailing-ghost` (two pixels right, away from `bone-soldier`). The anchor stays at the foot center.
