# Art style guide

Purpose: the visual rules for every sprite, tile, and effect in Pixel Agents, so all art stays consistent. Owned by the pixel-artist.
Related: [sprite spec](sprite-spec.md), [classes](classes.md) (planned, M5), [enemies and stages](enemies-and-stages.md) (planned, M6), [accessibility](accessibility.md) (planned, M7), [security and safety](../architecture/security-and-safety.md).

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
| Prop | 8-32 px, multiples of 4 preferred |
| Internal buffer | 320x180 |

## 3. Palettes

- One **master palette** (about 32 colors) in `src/game/sprites/palettes.ts`. Sprites reference palette characters, never hex.
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

- 4 skin tones and 6 hair colors are provided as palette swaps.
- Each biome has an **8-color tile palette**. Enemies in a stage share 2-3 of those colors plus their own accent.
- Colorblind-safe variant: never rely on red versus green alone; pair color with a shape cue.

## 4. Hero construction

Heroes are layered: **base body** (shared), **head/hair**, **gear**, **weapon** (separate so attack frames can offset it).

| Animation | Frames | Notes |
|---|---|---|
| idle | 2 | gentle 1px bob |
| walk | 4 | classic two-step bounce |
| attack | 3-4 | wind-up, strike, recover; class-specific |
| ability | 3 | cooldown-based signature move |
| rest poses | 2 each | sit, eat, sleep (with "z"), polish weapon, read, warm hands |
| victory | 2 | despawn pose before warp-out |

## 5. Cosmetic hit-reaction visual language

Heroes are invulnerable, so hits are theater, never damage.

- **Allowed**: a 2-4 frame white flash applied by the renderer, a 1-2px knockback offset that settles, a small spark effect.
- **Never**: hurt or pained faces, sweat drops, dizzy stars, slumped or downed poses, low-health tints, health ticks, or any gauge over a hero.
- Red is reserved for enemy damage numbers and the harmless screen-edge flash on tool errors. It is never used as a hero hit tint.
- Buff and status icons above heroes are small, decorative, and never read as a resource bar.

## 6. Hero classes

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

**Campfire**: logs and seats, a 3-4 frame flame loop, ember sparks. It grows as more heroes rest and is drawn identically across stages.
