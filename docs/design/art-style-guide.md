# Art style guide

Purpose: the visual rules for every sprite, tile, and effect in Pixel Agents, so all art stays consistent. Owned by the pixel-artist.
Related: [sprite spec](sprite-spec.md), [game engine room layout](../architecture/game-engine.md#3-room-layout), [ADR 0010](../architecture/adr/0010-split-room-stage-layout.md), [classes](classes.md) (planned, M5), [enemies and stages](enemies-and-stages.md) (planned, M6), [accessibility](accessibility.md) (planned, M7), [security and safety](../architecture/security-and-safety.md).

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

- One **master palette** (33 colors; cap 48, unchanged by A1-1) in `src/game/sprites/palettes.ts`. Sprites reference palette characters, never hex.
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
| attack | 3 (A0 base hero; classes may use 3-4) | wind-up, strike, recover; the base hero swings a plain short sword with a crescent of air on the strike frame |
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

Delivered so far (A1-1): the class palettes for Warrior, Mage, Archer, and Rogue, and the effects below. Class layers arrive with A1-2 (Warrior, Mage) and A1-3 (Archer, Rogue). Each layer set has all eleven animations (26 frames per layer).

| Class | `a` accent | `c` cloth | `d` shade | `b` pants | `k` boots | `m` metal |
|---|---|---|---|---|---|---|
| Warrior | red `#d83a3a` | steel `#8d9ab4` | `#5c6886` | `#5a4a52` | `#5a3826` | `#d8e0ee` |
| Mage | gold `#f4c430` | royal blue `#3f6fe0` | `#2a47a8` | `#35358a` | `#6a4020` | `#a9d6ff` |
| Archer | brown `#a8703a` | leaf green `#3fa650` | `#276b35` | `#6b4a2a` | `#46301c` | `#c9d1c0` |
| Rogue | purple `#a05ae6` | slate `#5f6e88` | `#3e4862` | `#2d3144` | `#392a3c` | `#c4cad8` |

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

Planned class list:

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
| Druid | earth brown + leaf green | antler or leaf crown | gnarled wooden staff |
| Monk | orange + cream | headband, bare forearms | glowing fists, no weapon |
| Artificer | copper + teal | goggles on forehead, gear backpack | wrench / bomb |
| Berserker | fur brown + war-paint red | wild spiky hair, bare chest | oversized axe |

## 7. Enemy rules

- **Silhouette first**: every enemy in a stage is distinguishable when filled solid black.
- Each stage has 4 regular enemies plus 1 boss; vary shape across the four.
- **Tiers**: minion 16px, elite 24px, boss 48px or larger. Bosses get an intro pose, a 2-frame telegraph for attacks, and 2-3 phase variants (palette shift or added feature).
- Enemies may have hit-flash, death dissolve, and knockback. Only enemies have health bars.
- Weakness and resistance are hinted by color or detail.
- Tone is cute-spooky, never gory: big eyes, chunky shapes.

## 8. Stages

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

**Campfire**: logs and seats, a 4-frame flame loop in two sizes (small, large from 3 resting heroes), ember sparks. It grows as more heroes rest and is drawn identically across stages with master characters only. Delivered: `logs` (a stone ring, two crossed logs, a flanking decorative log each side; anchor at the pit's front-edge center), `flameSmall`, `flameLarge`.
