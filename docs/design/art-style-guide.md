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
- **Particle ramps** (bright to dim): ember `Y O R D`, spark `w Y O`, drip `q Q 8`, splash `w q Q`, mote `a V W`, bubble `L N Q`, wisp `G g P`, and (E3) **firefly `Y N L N Y`**: the one ramp that alternates bright and dim, so a 1x1 firefly blinks slowly (each step is a fifth of its 3.5 to 6.5 s life, never faster than 0.5 s). The Stage 6 embers reuse the `ember` ramp. (E4) **snow `w q Q`** (white, pale water blue, mid water blue; Stage 7 falling snow, 1x1) and **murk `g b P`** (dim blue-gray, indigo, stone gray; Stage 8 drifting motes, 2x2): both master characters, neither contains `Y O R D` (so a flake or a mote is never mistaken for a hit spark or an ember), both step over at least 1 s per step (no flashing). (E5) **shimmer `C V W`** (copper, light wood, dark wood; Stage 9 heat haze, a 1x3 streak that only dims over at least 3 s, so 1 s per step, no `Y O R D w`) and **rift `g G Q G g`** (indigo-gray, stone gray, pale water blue, stone gray, indigo-gray; Stage 10 slits, 3x1, one slow pulse per 4 to 7 s life, 800 ms or more per step, adjacent steps under 2x in luminance, no `Y O R D w`). No new master character was added in E3, E4, or E5: the master palette stays at 37 of 48 (E5 hard cap was 40).
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
| 1 | `cellar-rat` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 G P s w e R` | low and long, big pink ear, pink tail climbing the right edge and hooking over at the top (A-E5-0) |
| 1 | `cave-bat` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 b 2 P s Y e w R` | wide wing fan with the tips in the top corners and a small belly (flaps; the engine floats it; A-E5-0) |
| 1 | `web-spider` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 W V R w e 7` | round body, eight splayed loose legs, hanging thread |
| 1 | `crate-mimic` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 9: `1 5 2 4 3 w R Y e` | crate on four stubby legs, lid hinged at the back and flung up like a jaw, see-through mouth gap with teeth; `attack` opens the lid wide, snaps it shut, then sticks out a tongue (A-E5-0) |
| 1 | `rat-king` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 12: `1 G P m s w e a Y R d b` | huge hunched rat, bent gold crown, royal-blue cape (`d` main, `b` shade), heap of tiny pink tails |
| 2 | `goblin-miner` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 10: `1 N L m 6 e w 5 2 k` | upright, helmet lamp, long ears, pickaxe over the shoulder |
| 2 | `goblin-scout` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 N L 4 3 e w k m` | crouch right of centre with a long diagonal spear from the top-left corner, ears streaming back (A-E5-0) |
| 2 | `ore-beetle` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 11: `1 b d 2 8 7 Y e k P w` | low long indigo shell, two horns, and a tall comb of teal ore crystals reaching the top centre (A-E5-0) |
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
| 4 | `crypt-mummy` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 7: `1 7 5 2 e Y 8` | bandaged shuffler right of centre, glowing eyes in a dark gap, long arms reaching forward to the left edge at chest height, one trailing wrap (A-E5-0); `attack` pulls the arms back, then lunges them forward |
| 4 | `tomb-lich` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 11: `1 8 2 7 5 a k L N Y e` | hooded skeleton leaning back to the right in a slim violet robe with gold belt and ragged tatters, tall spiked gold crown, green eye glow, staff with a floating green gem alone in the upper left (A-E5-0) |

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

### Delivered enemies (batch E4, steps A-E4-4 to A-E4-6)

Same contract as above (left-facing, foot anchor, outline in the stage's `1`). Stage 7 enemies are white fur, pale cyan, ice blue, and an orange beak or nose over cold blue-gray citadel stone; Stage 8 enemies are violet crystal, lilac-white light, and cyan accents over dark indigo stone, so they read lighter than the floor (measured: enemy fill luminance is 15 times the Stage 7 floor and 18 times the Stage 8 floor). Ids and names match [the E4 plan](../architecture/plans/e4-stages-7-8.md#52-data-enemy-rows-and-stage-props). Most base frames are built from `enemyBuilder.ts` primitives (`ellipse`, `poly`, `stroke`, `put`, `dots`, then `finish` adds the outline), the Stage 8 mimic and lantern from a hand-drawn fill picture (`fromFill`); the other frames come from `enemyFrames.ts` helpers or a builder pose parameter.

| Stage | id | Tier, size, anchor | Frames | Colors | Silhouette cue |
|---|---|---|---|---|---|
| 7 | `rime-penguin` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 6: `1 5 4 e O 7` | narrow upright penguin, an ice crest of three rime spikes, an orange beak pointing left, a white belly, two flippers held out and down, orange feet; drawn two pixels left of the foot anchor; `attack` lunges the beak forward |
| 7 | `frost-hare` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 5: `1 7 R e 6` | a hare sitting tall, two long ears up and out in a V, a pink nose, a pale-cyan haunch and a short hind foot; the walk is a hop; `attack` kicks the hind foot forward |
| 7 | `snow-sentry` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 8: `1 5 4 7 e O k 6` | a little snowman guard: three stacked balls narrowing to the top, a small blue-steel helmet with a spike, coal eyes, a carrot nose pointing left, stick arms held out and down; `attack` swings the near stick arm up and forward |
| 7 | `snow-yeti` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 6: `1 7 6 5 e w` | hunched white yeti: a high back hump over very wide shoulders, a small pale-blue face sunk low on the left, arms hanging out to the sides down to the knees with big fists, a narrow waist over two stumpy legs; `attack` swings the near arm forward at chest height, never overhead |
| 7 | `glacier-mammoth` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 9: `1 4 5 7 6 e w 8 2` | the first horizontal boss: a wide low frosted mammoth, a tall domed head at the upper left with an ear and an eye, a ringed trunk hanging down in front, two curved ivory tusks, four thick legs, a torn teal banner stripe across the flank |
| 8 | `lantern-wraith` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 6: `1 5 4 6 e 7` | a floating hooked lantern: a ring handle on top, a violet-framed glass box with a pale flame and two dark eyes, a wisp of smoke trailing to the lower right; drawn left of the foot anchor; `attack` leans the lantern forward |
| 8 | `shard-cluster` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 4: `1 5 7 6` | four detached violet crystal shards at the corners around a small glowing core, drifting; `attack` draws the shards in and thrusts them left |
| 8 | `mirror-mimic` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 5: `1 5 6 w 4` | an oval standing mirror: a violet frame around a hollow glass with two pale eyes peering out of the dark, a lilac glint on the frame, two short legs; `attack` leans the frame forward |
| 8 | `gloom-stag` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 7: `1 4 3 6 8 5 7` | a low dark-violet stag walking left: a pale-lilac muzzle, a cyan eye, a long back, four thin legs, a very wide fan of thin antlers whose tips glow lilac; `attack` lowers the antlers and thrusts the head forward |
| 8 | `eclipse-warden` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 8: `1 2 3 4 5 6 7 8` | a hovering dark disc with two cold cyan eyes, a thin gap, a lilac-white corona ring with eight pointed flares, and four tendril arms ending in small claws; the tendril tips reach row 46 (the hover is an engine draw offset) |

Silhouette separation inside Stage 7: a narrow oval with a crest, a V-eared hare, three stacked balls, and (elite) a wide hunch. Inside Stage 8: a ring-and-box lantern, a four-corner shard cross, an oval frame with a hollow glass, and (elite) a stag with a wide antler fan. All ten were measured against every other enemy of their size with the look-alike tool before wiring (`policy holds`, see "Look-alike policy" below); the tightest pairs (overlap) are ember-imp vs rime-penguin 0.847, rime-penguin vs lantern-wraith 0.840, crate-mimic vs gloom-stag 0.836, bone-soldier vs rime-penguin 0.832, and wailing-ghost vs snow-sentry 0.830 (all under 0.85), with the bosses at glacier-mammoth vs rat-king 0.804 and eclipse-warden vs molten-colossus 0.817. The same-stage minion pairs are 0.74 at most (frost-hare vs snow-sentry 0.737, lantern-wraith vs mirror-mimic 0.711), under the 0.75 limit.

Boss readability: Glacier Mammoth `telegraph` lowers the head while the tusks glint with white pixels; its `attack` raises, then sweeps the tusks up and forward as the head lunges; `intro` rises out of a snow drift. Eclipse Warden `telegraph` thickens and brightens the corona over two slow frames (a swell of one and then two rows, never a flash); its `attack` slams the two lower tendrils forward and down; `intro` rises from below the frame. The corona is the only large bright shape and never alternates between bright and dark: the idle loop only moves the lower tendrils and shifts a few glinting ring pixels (240 pixels of difference between the two idle frames, under the 466 of the largest shipped idle pair).

Phase palettes (`BOSS_PHASE_PALETTES_E4` in `palettesE4.ts`, merged into `ENEMY_PHASE_PALETTES` at wiring; phase 2 is index 0): Glacier Mammoth overrides `5 #35c9b3`, `6 #a6f2e2`, `7 #ffffff`, `8 #2e8fe0` (aurora-teal coat and mint frost, white tusks, a deep sky-blue banner); Eclipse Warden overrides `5 #c84fd6`, `6 #ffc6ef`, `7 #fff0fa`, `8 #ff62c8` hot pink eyes (the corona moves to pale magenta-white, the disc stays dark). Same silhouettes. Phase colors switch once. No hero ever gets a phase, a frost look, or a shadow tint.

### Delivered enemies (batch E5, steps A-E5-4 to A-E5-6)

Same contract as above (left-facing, foot anchor, outline in the stage's `1`, 12 colors at most). Stage 9 enemies are teal, gold, ash gray, and ember orange over dark red-brown stone; Stage 10 enemies are pale lilac-white, cold cyan, and slate over dark slate-blue stone, so every enemy reads far lighter than its floor (measured: mean idle fill luminance is 18 times the Stage 9 floor and 19 times the Stage 10 floor, rule 5 needs 2). Ids and names match [the E5 plan](../architecture/plans/e5-stages-9-10.md#52-data-enemy-rows). All are `enemyBuilder.ts` primitives plus `enemyFrames.ts` helpers or builder pose parameters (`dragonFrame`, `sovereignFrame`). Dragon, fire, void, and star art is drawn on enemies only; nothing is ever drawn on or toward a hero.

| Stage | id | Tier, size, anchor | Frames | Colors | Silhouette cue |
|---|---|---|---|---|---|
| 9 | `drake-whelp` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 10: `1 5 8 7 w e 6 O N Y` | upright teal hatchling, big round head, stubby wing nubs, S-curled tail, ember belly; `attack` snaps the head forward |
| 9 | `kobold-sapper` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 9: `1 R 2 V W m 5 e w` | a thin lizard-folk body under a large round powder keg held overhead; `attack` lunges with the keg lowered (no blast is drawn) |
| 9 | `gilded-crown` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 7 6 5 8 w e` | a floating gold crown, a wide band with a comb of spikes, two eyes under the rim; `attack` swoops the rim forward |
| 9 | `ash-wyvern` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 8: `1 O P w G e R Y` | ash-gray winged biped, wings spread in a Y fan with ember-orange edges, horned head, long tail; `attack` sweeps one wing forward at chest height |
| 9 | `hoard-dragon` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 11: `1 R 4 7 D Y e a 5 6 8` | a crimson dragon seated on a heap of gold, wings raised in an M, horned head lifted at the upper left, pale sand belly, tail curling up at the right |
| 10 | `crescent-drifter` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 6: `1 7 6 5 8 e` | a floating pale crescent moon with an eye in the hollow (a C shape); `attack` tips the horns forward |
| 10 | `comet-tadpole` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 7: `1 8 5 6 7 e w` | a round lilac head with big eyes and a long cyan tail streaking up and back (a diagonal); the walk is a hop; `attack` flicks the tail forward |
| 10 | `eye-strider` | minion 16x16, `(8, 15)` | idle 2, walk 2, attack 3 | 6: `1 6 w 8 e 5` | one big white eye with a cyan iris on two long thin legs (a circle on stilts with an open gap below); `attack` leans the eye forward |
| 10 | `obelisk-sentinel` | elite 24x24, `(12, 23)` | idle 2, walk 2, attack 3 | 6: `1 4 7 3 8 6` | a narrow pointed slate monolith with cyan runes and two detached fragments at its sides; `attack` tips forward |
| 10 | `void-sovereign` | boss 48x48, `(24, 47)` | idle 2, walk 2, attack 3, telegraph 2, intro 2 | 8: `1 6 7 2 4 3 8 5` | a hovering cloaked figure, an inverted triangle: broad under a spread crown of five pale shards, tapering to a point, a star-filled cleft down the chest, two detached hands |

Silhouette separation: inside Stage 9 a thin-bodied round head, a keg on a thin body, a spiked band, and (elite) a wide wing fan; inside Stage 10 a C, a diagonal streak, a circle on stilts, and (elite) a slim monolith. The Hoard Dragon is the only boss wide at the top with a raised-wing M over a mound; the Void Sovereign the only inverted triangle. The no-argument report over all 50 enemies prints `policy holds` (525 same-size pairs). Worst overlap and IoU per new enemy: drake-whelp 0.802 / 0.646 (vs web-spider, wailing-ghost), kobold-sapper 0.800 / 0.643, gilded-crown 0.792 / 0.586, ash-wyvern 0.815 / 0.547 (vs snow-yeti), hoard-dragon 0.827 / 0.616 (vs molten-colossus, rat-king), crescent-drifter 0.821 / 0.675, comet-tadpole 0.821 / 0.497, eye-strider 0.835 / 0.596 (vs toxic-toad; the tightest of the batch), obelisk-sentinel 0.825 / 0.529 (vs rock-golem), void-sovereign 0.808 / 0.621 (vs goblin-foreman, eclipse-warden); every overlap is under 0.85, every IoU is under 0.80 (largest 0.675), and every same-stage minion pair is under 0.75. No pin was needed (`LEGACY_OVER` and `KNOWN_OVER` stay empty).

Boss readability: Hoard Dragon `telegraph` rears the head back and up over two slow frames while the throat changes from pale sand to warm gold to bright gold (never a flash, 817 pixels differ from the attack); its `attack` sweeps the tail low and then snaps the head forward (nothing is drawn leaving the boss); `intro` rises from behind the heap. Void Sovereign `telegraph` raises both hands high over two slow frames while the cleft widens (641 pixels differ from the attack); its `attack` pulls the hands in, thrusts both forward (left), then settles; `intro` rises from below the frame. Idle loops move only the crown, hands, and wings (258 pixels of difference for the dragon, 196 for the sovereign, both under the 466 of the largest shipped idle pair; the minions and elites are 20 to 102).

Phase palettes (`BOSS_PHASE_PALETTES_E5` in `palettesE5.ts`, merged into `ENEMY_PHASE_PALETTES` at wiring; phase 2 is index 0): Hoard Dragon overrides `R #e8a62a`, `D #a8641a`, `a #ffe7a8`, `Y #fff6d0` (the scales turn bright gold and amber, the belly pale amber); Void Sovereign overrides `8 #f2b8ff`, `6 #d890e8`, `7 #fff0fa`, `5 #6a3a8c` (the cleft glow and eyes move from cyan to pale magenta-white while the cloak `2 3 4` stays dark). Same silhouettes, no large bright area, applied once. Phase 2 is a recolor, never a "wounded" look.

## 8. Stages

**Per-stage palettes (decision E1-2).** Each stage keeps the eight tile characters `1` to `8`, but their colors are a partial palette per stage (`STAGE_PALETTES` in `palettesE1.ts`), laid over the master palette; it may also override `g` (ambient) and `T` (torch or lantern light). Stage 1 is `{}` (the master values). Stage 2, Goblin Mine Shafts: `1 #1a120d`, `2 #3b2a1e`, `3 #5f4430`, `4 #8c6a46`, `5 #b07a3c`, `6 #ffd24a` lantern yellow, `7 #f2e8c8` chalk, `8 #62d0bc` ore glint, `g #7a6a84`, `T #ffc94a`. Meaning is stable across stages (1 deepest shadow, 2 dark rock, 3 mid rock, 4 lit rock, 5 timber, 6 light source, 7 highlight, 8 accent), so shared sprite logic still reads. No new master characters per stage; the master palette stays at 37 colors (cap 48). The `mote` particle ramp (warm dust, stage 2 ambient) reuses master `a V W`.

Stage 3, Toxic Slime Caverns (batch E2): `1 #0b1816`, `2 #1d3836`, `3 #2f5652`, `4 #4b7d73`, `5 #7b7a3a` olive crust, `6 #b4ff3c` acid glow, `7 #dcf5c6`, `8 #3fd0a0` aqua slime, `g #5a8a80`, `T #8fe84a`. Stage 4, Ancient Catacombs: `1 #150f1c`, `2 #2e2438`, `3 #4f4160`, `4 #76668a`, `5 #b8a67c` bone beige, `6 #b8fff0` cold candle flame, `7 #f2ead2` bone white, `8 #a85cf0` violet, `g #6a5a92`, `T #8fe8d8`. Both keep the clear color `n` (master near-black). The master palette stays at 37 colors. Particle ramps added in E2: `bubble` `L N Q` (lime, green, blue-gray; rising toxic bubbles) and `wisp` `G g P` (dim grays and violet; low fog), master characters only.

Stage 5, Enchanted Forest Ruins (batch E3): `1 #0b1511`, `2 #222f29`, `3 #3b4f43`, `4 #62786a`, `5 #5fa24a` moss green, `6 #7fe4ff` glowing blue flora, `7 #e6f3dc`, `8 #3f8cff` deep blue bloom, `g #3f7468` (dark blue-green), `T #7fd0ff` (soft blue bloom light). Stage 6, Molten Core: `1 #0e0a0c` basalt black, `2 #241d22`, `3 #3a3238`, `4 #5d5059`, `5 #a8643c` rust iron, `6 #ff7a1c` glowing orange, `7 #ffe49a` hot yellow-white, `8 #7a2a1c` deep red-brown, `g #6b6058` (gray-brown), `T #ffa040` (warm orange). Both keep the clear color `n`. **Tint rule:** the Stage 6 ambient tint `g` is a dark neutral warm gray-brown whose red channel is at most 1.3 times the larger of green and blue (107 against 96); a strong red wash over a hero would read as "hurt", so the lava glow comes only from lights (`T`), bright pixels, and prop animation. The master palette stays at 37 colors.

Stage 7, Frozen Citadel (batch E4): `1 #0e1424`, `2 #27334d`, `3 #41567a`, `4 #617da2`, `5 #86cdf0` ice blue, `6 #c4f6ff` pale cyan light, `7 #f2fbff` frost white (sparse highlights only), `8 #1fb2b8` teal accent (away from the Mage's cloth blue), `g #64759b` (cool blue-gray), `T #bfe8ff` (pale blue light). Stage 8, Shadow Realm: `1 #0c0b1c`, `2 #25233f`, `3 #3f3d66`, `4 #65629a`, `5 #9a6cf0` violet crystal, `6 #e6d4ff` lilac-white wisp light, `7 #f8f2ff`, `8 #38d0e8` cold cyan accent, `g #6a62a0` (dark indigo-violet), `T #c8a0ff` (soft violet light). Both keep the clear color `n`. The master palette stays at 37 colors (E4 added none; the E4 hard cap was 40 of 48).

**Ice and shadow rules (cosmetic only, no hazard).** Ice, snow, mirrors, shards, and murk appear only in the backdrop, in wall tiles, in wall-layer props, and as four small floor decorations (`iceThrone`, `snowDrift`, `duskAltar`, `shardPatch`). No floor surface slips, slows, or chills; no prop is named `puddle`; the only solid props are the alcove floor props `iceThrone` and `duskAltar` (foot y 134, 12x5 footprint). All E4 lights (`iceLamp`, `iceSheet`, `floatingShard`, `wispTorch`) use `flicker: false`, the engine loops non-torch props at 500 ms per frame, and the frame-to-frame pixel change is small (`iceLamp` 6 pixels, `iceSheet` 8, `wispTorch` 10 to 13, `floatingShard` 50 of 384). **Tint rule:** both ambient tints are blue-dominant (`g` red channel well under 1.3 times the larger of green and blue) and not near-black. Entities are drawn after the light map, so heroes are never darkened or tinted by the stage. Art never draws frost on, a chill on, or a dark cloak around a hero; "frozen" is the name of a stage and of scenery only.

**Stage 8 legibility (measured with the scratch luminance script, floor tiles times the ambient tint).** Mean floor luminance: Stage 7 0.028 (the brightest older floor is Stage 3 at 0.032, so Stage 7 is now below it; limit 1.30), Stage 8 0.017 (the darkest older floor is the Molten Core at 0.0096, ratio 1.8 against a 0.70 minimum). WCAG contrast of the hero cloth `c #4fa3e8` against the floor: 5.0 (Stage 7) and 5.8 (Stage 8), both over 2.0. Class cloth contrast against the Stage 7 floor: Necromancer 2.1, every other class higher (the Stage 7 ambient tint was darkened from `#7488b4` to `#64759b` for this). Against the Stage 8 floor: Necromancer 2.5, Rogue 3.0, Mage 3.4, every other class 3.3 or better. The Stage 8 floor is mid-dark desaturated indigo, lighter and bluer than the Necromancer's hood violet; near-black hair (hair color index 1) has the same near-1 contrast against every dark floor as in Stages 1 to 6, so hair never carries a sprite's legibility (cloth, skin, and the class accent do).

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
| 8 | Shadow Realm | deep indigo and violet | floating shards, dark mirrors, wisp torches | drifting murk |
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

### Stage 7 characters and props (delivered, batch E4 step A-E4-2)

Tile palette (`STAGE_TILE_CHARS['frozen-citadel']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` deep blue-black and outline, `2` dark citadel stone, `3` mid stone, `4` lit stone, `5` ice blue, `6` pale cyan light, `7` frost white (sparse), `8` teal accent.

Tiles: `wallTop` 2 (a frosted lip), `wallMid` 5 (citadel brickwork in 8 px courses with chips: plain, a frost seam, a frost-rimed arrow slit with transparent pixels for the backdrop, and two quiet variants), `wallBase` 2 (a lit stone skirting line), `floorBack` 3 and `floorFront` 3 (blue-gray flagstones in the stone tones `2 3 4` with a single ice fleck; ice and white only as highlights, never a glossy floor), `foreground` 2. Backdrop 128x128, period 64: distant frozen towers and battlements under a pale sky with hanging icicles along the top and a snowy ridge.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `icePillar` | 16x112 | top-left | 1 | wall (a fluted blue-white column with banded joints) |
| `icicleCluster` | 16x40 | top-left | 1 | wall (icicles hanging from the ceiling line) |
| `frostBanner` | 16x48 | top-left | 1 | wall decoration (a stiff tattered banner with a snowflake crest) |
| `iceLamp` | 16x24 | top-left | 2 (slow pulse) | wall, light source (`T` pale blue, flicker false) |
| `iceSheet` | 16x8 | top-left | 2 (slow glint) | wall-base band, weak light source (flicker false; edge columns repeat so it tiles) |
| `iceThrone` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove (a carved ice seat) |
| `snowDrift` | 16x8 | `(8, 7)` | 1 | floor, decoration (a small snow mound) |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (an iron-banded gate arch rimed with frost) |

Ambient: falling `snow` particles (ramp `w q Q`). Frame timing is not a template field: the engine loops every non-torch prop at `PROP_FRAME_MS` (500 ms), so `iceSheet` and `floatingShard` are exactly as slow as the plan asks and `iceLamp` and `wispTorch` are slower than 300 ms.

### Stage 8 characters and props (delivered, batch E4 step A-E4-3)

Tile palette (`STAGE_TILE_CHARS['shadow-realm']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` deep blue-black and outline, `2` dark indigo stone, `3` mid indigo stone, `4` lit stone, `5` violet crystal, `6` lilac-white wisp light, `7` pale highlight, `8` cold cyan accent.

Tiles: `wallTop` 2, `wallMid` 5 (crystal slabs, 8 px wide panels with a lit left edge: plain, a violet vein, a carved diamond rune with a cyan point, starry specks, and a dark violet-rimmed archway with transparent pixels for the backdrop), `wallBase` 2, `floorBack` 3 and `floorFront` 3 (mid-dark indigo flagstones; never black, no solid-black area beyond the outline pixels), `foreground` 2. Backdrop 128x128, period 64: a night void with stars, floating crystal shards, and a pale violet horizon glow over a dithered ridge.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `duskPillar` | 16x112 | top-left | 1 | wall (a dark crystal column with a violet edge and star flecks) |
| `floatingShard` | 16x24 | top-left | 2 (slow bob) | wall, dim light source (flicker false) |
| `mirrorFrame` | 16x48 | top-left | 1 | wall decoration (a tall dark mirror in a framed stand, faint stars in the glass) |
| `wispTorch` | 16x24 | top-left | 4 (slow loop) | wall, light source (`T` soft violet, flicker false; a pale wisp flame on a sconce) |
| `duskAltar` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove (a squat dark altar) |
| `shardPatch` | 16x8 | `(8, 7)` | 1 | floor, decoration (scattered crystal fragments) |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (a black arch with a violet rim and a faint star in the gap) |

Ambient: drifting `murk` particles (ramp `g b P`), dim and slow.

### Stage 9 characters and props (delivered, batch E5 step A-E5-2)

Tile palette (`STAGE_TILE_CHARS['dragons-lair']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` soot-black and outline `#1a0a0c`, `2` dark red-brown stone, `3` mid stone, `4` lit stone, `5` bronze, `6` warm gold light, `7` pale gold highlight (sparse), `8` teal accent `#2cb5a6` (away from the Mage's blue). `g` is a warm sand-bronze `#8a7a68` (red 1.13 times the larger of green and blue, under the 1.3 limit), `T` warm gold `#ffd070`.

Tiles: `wallTop` 2, `wallMid` 5 (scorched blocks; variant 4 is a high cave opening with transparent pixels), `wallBase` 2, `floorBack` 3 and `floorFront` 3 (mid-dark maroon flagstones: the floor is kept dark so every class cloth keeps contrast, the heat reads through the backdrop glow, gold accents, and lights), `foreground` 2. Backdrop 128x128, period 64: a vast cavern with distant gold heaps, a far dragon silhouette, and an ember glow on the horizon.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `scorchedPillar` | 16x112 | top-left | 1 | wall (a sooted column with claw scrapes) |
| `drakeSkull` | 16x40 | top-left | 1 | wall decoration (a horned skull relief) |
| `hoardBrazier` | 16x24 | top-left | 4 (slow loop) | wall, light source (`T` warm gold, flicker false) |
| `goldVein` | 16x16 | top-left | 2 (slow glint) | wall base band, weak light source (flicker false) |
| `scaleBanner` | 16x48 | top-left | 1 | wall decoration (a tattered scale-pattern banner) |
| `hoardPile` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove (a gold and gem heap) |
| `goldScatter` | 16x8 | `(8, 7)` | 1 | floor, decoration (loose coins and gems) |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (a scorched arch with claw gouges) |

Ambient: rising `shimmer` streaks (ramp `C V W`, below). Floor-layer props are exactly `hoardPile goldScatter` here.

### Stage 10 characters and props (delivered, batch E5 step A-E5-3)

Tile palette (`STAGE_TILE_CHARS['void-spire']` = `12345678`, clear `n`, ambient `g`, light `T`): `1` near-black blue and outline `#06080f`, `2` dark slate stone, `3` mid slate stone, `4` lit stone, `5` deep teal-slate, `6` pale magenta-white rift light, `7` cold highlight, `8` cyan accent. `g` is a dark slate-blue `#4e5f86` (not the indigo of Stage 8), `T` pale magenta-white `#f0c8ff`.

Tiles: `wallTop` 2, `wallMid` 5 (slate slabs; variant 4 is a window onto stars with transparent pixels), `wallBase` 2, `floorBack` 3 and `floorFront` 3 (dark slate-blue flagstones, never black), `foreground` 2. Backdrop 128x128, period 64: a black sky with stars, a distant tower, and a pale rift on the horizon.

| Prop | Size | Anchor | Frames | Layer |
|---|---|---|---|---|
| `spirePillar` | 16x112 | top-left | 1 | wall (a dark column with a star inlay) |
| `voidRift` | 16x48 | top-left | 4 (slow pulse) | wall, light source (`T` pale magenta-white, flicker false) |
| `starWindow` | 16x48 | top-left | 1 (static, no twinkle) | wall decoration |
| `orbitRing` | 16x24 | top-left | 2 (slow turn) | wall, dim light source (flicker false) |
| `riftPedestal` | 16x16 | `(8, 14)` | 1 | floor, solid in the alcove (a squat black pedestal with a glowing seam) |
| `crackedSlab` | 16x8 | `(8, 7)` | 1 | floor, decoration (a cracked slab with faint seams) |
| `doorFrame` | 16x128 | top-left | 1 | wall, door column (a black arch with a pale rift glow in the gap) |

Ambient: slow pulsing `rift` slits (ramp `g G Q G g`, below). Floor-layer props are exactly `riftPedestal crackedSlab`. No prop is named `torch`, `lantern`, or `puddle` in either stage, so the four animated props loop at `PROP_FRAME_MS` (500 ms per frame: brazier 2 s, vein 1 s, rift 2 s, ring 1 s).

Legibility (measured with `node test/support/legibilityReport.mjs`; floor mean luminance after the `g` multiply): Stage 9 floor 0.0182 (rgb 63,23,14), Necromancer cloth contrast 2.42, all twelve classes at least 2.42; Stage 10 floor 0.0109 (rgb 16,25,50), Necromancer 2.71, all twelve at least 2.71. All four calibration rules hold (cloth at least 2.0; Stage 9 under 0.0421; Stage 10 over 0.0067; mean floor colour 21.3 from the nearest stage for Stage 9 and 21.6 for Stage 10, against the 13.7 minimum). Hero-side stage tints are `g` only and are never applied to a hero.

**Campfire**: logs and seats, a 4-frame flame loop in two sizes (small, large from 3 resting heroes), ember sparks. It grows as more heroes rest and is drawn identically across stages with master characters only. Delivered: `logs` (a stone ring, two crossed logs, a flanking decorative log each side; anchor at the pit's front-edge center), `flameSmall`, `flameLarge`.

## Look-alike policy

Silhouette overlap is measured on idle frame 0 (opaque pixels as anchor-relative keys). `overlap` is shared pixels over the smaller count; `IoU` is shared over the union. Policy: every pair of same-size enemies (minion 16x16, elite 24x24, boss 48x48) has overlap under 0.85 and IoU at most 0.80, and two minions of one stage stay under 0.75 overlap. Run `node test/support/lookAlikesReport.mjs <file.ts>:<ExportName>[:<stage>[:<id>]]` on new art before wiring it (a file that exports one boss template is passed as `file.ts:GLACIER_MAMMOTH:7:glacier-mammoth`); it prints the worst pairs and `policy holds` when the art passes.

Lessons from E3: a sprite that is larger than another is judged by how much of the smaller one it covers, so a big solid blob loses to every small enemy; keep new minions near 110 to 160 pixels, spend 15 percent or more of the pixels where the others are empty (the top rows, the side columns, tall ears, horns, tails, wings, a raised claw), and leave holes (gaps between legs, between arms and torso). The `ooze-queen` and `molten-colossus` are separated from the solid `rat-king` the same way (raised arms and fists in the empty top corners).

Reworked in E3 step A-E3-0 (art only, same ids, sizes, anchors, animation sets): `green-slime`, `spore-shroom`, `toxic-toad`, `wailing-ghost` clear all ten former `KNOWN_OVER` pairs; `jelly-cube` and `ooze-queen` clear the legacy pairs against `crate-mimic` and `rat-king`; `green-slime` and `toxic-toad` no longer exceed the same-stage limit (0.748 against 0.75). Two older sprites were left alone on purpose: `crate-mimic`, `rat-king`, and the Stage 1 and 2 minions are E1 art. Legacy pairs that still exceed (all among E1 and E2 enemies, still pinned in `test/support/lookAlikes.ts` `LEGACY_OVER`): crate-mimic vs rock-golem and crypt-mummy; rock-golem vs crypt-mummy; rat-king vs tomb-lich; cellar-rat vs cave-bat, web-spider, and ore-beetle; cave-bat vs web-spider and ore-beetle; web-spider vs ore-beetle; goblin-miner vs goblin-scout. The pins for the pairs reworked here (17 pairs, listed by the report as `stale pins`) must be removed by the tester.

Two sprites sit off their frame center on purpose so that the anchor-relative silhouette clears an older enemy: `furnace-guard` (about four pixels left, away from `crate-mimic`) and `wailing-ghost` (two pixels right, away from `bone-soldier`). The anchor stays at the foot center.

Lessons from E4: with 40 enemies the free pixels are almost gone, so a solid new silhouette fails. What worked, in order: (1) draw tall and narrow (rows 0 to 14, 7 to 9 columns), because the older minions are wide and low and the top rows are nearly empty; (2) give each same-stage minion its own part of the frame (the penguin two pixels left of the anchor, the hare two pixels right, the sentry centered); (3) make big features out of thin strokes and hollows (the stag's antler fan reaches the top rows, the mimic is a frame with a hollow glass, the shard cluster is a four-corner cross, the warden has a ring with a gap); (4) for the 48x48 bosses, push mass into the empty upper-left or upper corners (the mammoth's dome head) or use a ring (the warden). A small parameter sweep over a builder function (positions and radii of ellipses and strokes, then a re-run of the report) found passing silhouettes faster than hand editing; the final numbers live in the exported geometry constants (`MAMMOTH_GEOM`, `WARDEN_GEOM`) and the builder functions. Color and detail inside the silhouette (belly, shade, eyes, frost dots) never change the measurement, so they were added last.

Stage 8 murk motes in the y 90 to 156 band can overlap a hero sprite on screen; they are scenery drawn behind, in the same pass as fireflies and embers, and are never hero state.

### Legacy debt rework (A-E5-0a and A-E5-0b, done)

The seven templates the A-E4-0 backlog listed were redrawn in place (same ids, sizes, anchors, animation sets, left-facing, stage-palette recoloring; all at most 12 colors), so all 11 `LEGACY_OVER` pairs now clear the policy and the no-argument report prints `policy holds` with those 11 pins listed as `stale pins` (the tester removes them). Rework per template:

- Batch one (`enemiesStage1.ts`, `enemiesStage2.ts`). `cellar-rat`: a low, long body in the lower left with the tail climbing the right edge to row 3 and hooking over. `cave-bat`: the idle pose is the wings-up fan, tips in both top corners, with a 7x8 belly. `ore-beetle`: a low, long shell with two curved horns and a tall comb of crystals standing up the top centre (the first dome and wide-leg versions all scored above 0.9 against `web-spider` and `tomb-scarab` because a wide solid shell contains the smaller sprite; the pixels had to move into the empty top rows). `goblin-scout`: a crouch moved two pixels right with a long diagonal spear from the top-left corner behind the body.
- Batch two (`enemiesStage1.ts`, `enemiesStage4.ts`, `tombLichTemplate.ts`). `crate-mimic`: the lid is a rotated slab hinged at the back (angle per frame, 48 to 65 degrees; 0 for the snap), the mouth gap is transparent, and the base stands on four stubby legs, so the sprite is a tilted slab over a base instead of a solid block (a solid base alone scored 0.849 against `jelly-cube`; the legs bring it to 0.844). `crypt-mummy`: the body stands three columns right of center, the arms stretch to the left edge, the wrap trails on the right. `tomb-lich` was chosen over `rat-king` (a boss that stays out of Stage 1, and the lich only had to change shape, not palette): a parameter search over the robe polygon, the lean, and the staff position (the method from E4) found that leaning the whole upper body four columns right (`LEAN_BASE`), a slimmer skewed robe with ragged tatters, and the staff alone in the empty upper left corner give 0.777 against `rat-king` and 0.787 against `molten-colossus`. The phase palette is untouched (`L N 8 Y` overrides).

Before and after (overlap / IoU; same-stage pairs must stay under 0.75 overlap):

| Pair | Before | After |
|---|---|---|
| `cellar-rat` vs `cave-bat` (same stage) | 0.856 / 0.686 | 0.714 / 0.536 |
| `cellar-rat` vs `web-spider` (same stage) | 0.830 / 0.564 | 0.651 / 0.408 |
| `cave-bat` vs `web-spider` (same stage) | 0.802 / 0.582 | 0.660 / 0.432 |
| `cellar-rat` vs `ore-beetle` | 0.862 / 0.718 | 0.780 / 0.585 |
| `cave-bat` vs `ore-beetle` | 0.856 / 0.723 | 0.770 / 0.551 |
| `web-spider` vs `ore-beetle` | 0.896 / 0.674 | 0.717 / 0.429 |
| `goblin-miner` vs `goblin-scout` (same stage) | 0.874 / 0.671 | 0.732 / 0.482 |
| `crate-mimic` vs `rock-golem` | 0.922 / 0.728 | 0.666 / 0.456 |
| `crate-mimic` vs `crypt-mummy` | 0.897 / 0.623 | 0.772 / 0.598 |
| `rock-golem` vs `crypt-mummy` | 0.869 / 0.692 | 0.782 / 0.613 |
| `rat-king` vs `tomb-lich` | 0.873 / 0.605 | 0.777 / 0.458 |

Side effects on pairs that were not pinned (all still under 0.85): `crate-mimic` vs `jelly-cube` 0.848 to 0.844, `crate-mimic` vs `gloom-stag` 0.836 to 0.609, `ore-beetle` vs `tomb-scarab` 0.819 to 0.828, `cellar-rat` vs `tomb-scarab` 0.802 to 0.828, `jelly-cube` vs `crypt-mummy` 0.766 to 0.809, `goblin-scout` vs `frost-hare` 0.756 to 0.813, `tomb-lich` vs `elder-dryad` 0.824 to 0.783, `tomb-lich` vs `molten-colossus` 0.848 to 0.787. The four tight E4 pairs are unchanged (`rime-penguin` vs `ember-imp` 0.847, `rime-penguin` vs `lantern-wraith` 0.840, `frost-hare` vs `snow-sentry` 0.737 same stage; `crate-mimic` vs `gloom-stag` improved).

Lessons from A-E5-0: (1) overlap is shared over the smaller count, so a sprite that is bigger than its neighbours is judged by how much of them it covers; shrink the solid mass and spend the pixels in the top rows and corners. (2) A gap that is meant to be see-through (a mouth, the space between legs) must be transparent, not dark fill, or it still counts as a pixel. (3) A throwaway script that renders the idle frame 0 of each candidate and prints the worst pairs (a parameter search over a handful of geometry numbers, including the lean of a boss) finished each hard sprite in minutes; hand editing without it kept trading one pair for another. (4) Animation order matters: `cave-bat` idle frame 0 is the wings-up pose because the metric reads frame 0.
