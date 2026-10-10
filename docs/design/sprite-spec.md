# Sprite spec

Purpose: the exact format of palette-indexed pixel maps, how to author a sprite template, and a worked example. Owned by the pixel-artist; the renderer in `src/game/sprites/spriteFactory.ts` (developer-owned) implements it.
Related: [art style guide](art-style-guide.md), [game engine](../architecture/game-engine.md#13-sprites), [data model art contract](../architecture/data-model.md#3-art-data-contract-batch-a0), [M4 plan section 10](../architecture/plans/m4-engine.md#10-art-needs-batch-a0), [adding content](../development/adding-content.md) (planned, M9).

If the format changes, update this doc and tell the developer in the handoff so `spriteFactory.ts` changes with it.

## 1. Format

A sprite is a template of named animations. Each animation is a list of frames, each frame a list of equal-length strings with one palette character per pixel.

```ts
export interface SpriteTemplate {
  id: string; // matches the data id (class id, enemy id); stage art is `<stage id>/<name>`
  w: number;
  h: number;
  anchor: { x: number; y: number }; // foot pixel used for placement and mirroring
  animations: Record<string, string[][]>; // name -> frames -> rows
}

export type Palette = Record<string, string>; // palette char -> color
```

- `.` is always transparent. Characters come from `palettes.ts`; raw hex never appears in a template.
- Frames in one animation share the same `w` and `h`. Every row has exactly `w` characters, and each frame has exactly `h` rows.
- Heroes face right. The renderer mirrors horizontally for left.
- Template data may be built at module load by pure helpers (`spriteBuilder.ts`: `Grid`, `seeded`, `staticTemplate`, `loopTemplate`) as long as the exported value is a plain `SpriteTemplate` of string rows. Generation is deterministic (fixed seeds), so art is identical on every load. Nothing runs per frame.

## 2. Anchor and mirroring

- The **anchor** is the foot pixel: the pixel under the character's center on the ground line. For heroes it is `(8, 19)`, the bottom outline row of the boots, in every layer of every animation.
- Placement: unflipped, the sprite's top-left is drawn at `x - anchor.x`, `y - anchor.y`.
- Mirroring keeps the anchor fixed: flipped, the top-left is `x - (w - 1 - anchor.x)`. A pixel at column `px` lands at `x + (anchor.x - px)`.
- Layers composite on their anchors over the union bounds of all layers, frames, and animations, so a layer may be wider than another (the weapon layer is 24 wide, the body 16) and a frame may leave its canvas partly empty. Later layers overwrite earlier ones wherever they are not `.`.
- Tiles and wall props use anchor `(0, 0)` (top-left); floor props use the base center.

## 3. Animation names

- **Heroes:** the required set is eleven animations: `idle` 2, `walk` 4, `attack` 3, `ability` 3, `sit` 2, `eat` 2, `sleep` 2, `polish` 2, `read` 2, `warmHands` 2, `victory` 2 = 26 frames per layer. `ability` (the class signature move, added in A1-1) is a generic raise, thrust, recover pose on the base hero that the base hero never plays; the renderer times it 120/140/200 ms. There are no hurt, downed, dying, or dead animations for heroes, and the validator rejects those names.
- **Effects** (`EFFECT_SPRITES`, A1-1) use `idle` only, with the anchor at the sprite centre (`floor(w/2)`, `floor(h/2)`), drawn with master characters (assumption: no class palette is applied to effects), at most 8 colors, no outline on the 24-wide ones.
- **Everything that is not a hero** (campfire, tiles, props, backdrop; later enemies and bosses) uses the single animation name **`idle`**. A static sprite has one frame; a loop (flame, torch, ripple) has several. Enemies add `walk`, `attack`, and for bosses `telegraph` and `intro` (section 10); there is no `hit` or `death` art, the engine makes the flash and the dissolve.
- **Class layer sets** (`CLASS_LAYERS`, A1-2 and A1-3): the `body` is the shared base template object (id `hero/body`, recolored by the class palette); `head` (16x20), `gear` (16x20, never `null` for a class) and `weapon` (24x20) are class-specific, ids `<class>/head`, `<class>/gear`, `<class>/weapon`, anchor `(8, 19)` like the base hero. They are rendered from the same poses as the base hero, so hand and torso positions match the body in every frame. `attack` is exactly 3 frames. A class head may sit 1 px lower or forward (Mage 1 px down so the hat cone fits, Rogue 1 px down and 1 px forward for the crouch and lean). The weapon layer is empty except in `idle`, `walk`, `attack`, `ability`, `victory`, and `polish`; head and gear stay visible in every rest pose. Layer outlines are added per piece with `Grid.outline`; gear and weapon outlines never cover skin or the eye pixel.
- Heroes are layered: `body`, `head`, `gear`, `weapon`, composited in that order. All layers share the animation names and frame counts; a layer may hold all-transparent frames (the weapon layer is empty while resting, except `polish`). `gear` is `null` in the classless base hero.

## 4. Palette swaps are partial palettes

`SKIN_TONES` (4) and `HAIR_COLORS` (6) are partial palettes: each holds only the characters it overrides (`s` for skin, `h` for hair), not a full copy. The factory resolves a character by looking in the swap first and the master palette second, after layers are composited, so a swap recolors every layer at once. Index 0 of each list equals the master color.

`CLASS_PALETTES` (A1-1) are partial palettes too, one per class (`warrior`, `mage`, `archer`, `rogue`), overriding only `a c d b k m` (accent, cloth, cloth shade, pants, boots, metal), never `o s h e w`. Resolution order for a hero bitmap is master, class, skin, hair, so skin and hair still recolor over a class. Class sprites are drawn with the same characters as the base hero; only the palette changes. Red stays on small parts (plume, trim, shield), never the whole body.

H2 adds `CLASS_PALETTES_H2` (`palettesH2.ts`, keys `cleric`, `paladin`, `necromancer`, `bard`) under the same rules. It is a separate export so the H1 table stays untouched; the developer merges both into one `classPalettes` record when wiring H2. A composited H2 look uses at most 12 colors: the eleven hero characters plus `Y` (glow) for Cleric and Paladin.

## 5. Authoring guide

1. Read the class or enemy entry in the [art style guide](art-style-guide.md) and write a one-line design note.
2. Start from the base body for heroes; for enemies, block the silhouette first.
3. Draw frame 1, then derive other frames by moving only the pixels that change.
4. Use at most 12 colors per sprite (stage templates: only the stage's 8 characters), and only characters defined in `palettes.ts`.
5. Run the validator (row lengths, frame sizes, palette usage, color count) and fix every error.
6. Add the template id to the data table so it can be looked up by id.

Tiles that sit side by side keep columns 0 and 15 identical across variants (variation only touches the interior), and wall tiles that stack keep rows 0 and 15 identical, so any random pick joins cleanly.

## 6. Worked example: base hero, idle frame 1 (16x20, head and body layers composited)

The real `hero/head` and `hero/body` layers merged. The head layer fills rows 1-9, the body layer rows 9-19. The anchor is the bottom outline row of the boots at column 8, row 19. Weapon and gear are separate layers drawn on top.

```text
................
....oooooooo....
...ohhhhhhhho...
..ohhhhhhhhhho..
..ohhhhhssssso..
..ohhhhssessso..
..ohhhhsssssso..
...ohhhsssssso..
....oosssssso...
.....ooooooo....
....oaaaaaao....
....occccccoooo.
....occccddddsso
....occccccoosso
....oddddddo.oo.
....obbbbbbo....
....obboobbo....
....obboobbo....
....okkookkko...
.....oo..ooo....
```

Rows 1-9 are the head (hair `h`, skin `s`, one dot eye `e`), row 10 the scarf in the accent `a`, rows 11-14 the torso with the sleeve and hand, rows 15-18 pants `b` and boots `k`. The authoritative source is `src/game/sprites/heroTemplates.ts`; bodies are built from inner pieces with no outline and `Grid.outline('o')` adds the 1px outline.

## 7. Validation rules

A template is valid when every row length equals `w`, every frame has `h` rows, all characters exist in the palette (plus `.`), the anchor is inside the sprite, and the sprite uses at most 12 colors including the outline. Additionally for heroes: the eleven required animation names and frame counts of section 3 (26 per layer), equal frame counts across layers, and no forbidden animation names. For stages: only the stage's tile characters, one `idle` animation per template, and tile edge matching (section 5).

## 8. Exports (what the engine imports)

| Export | File | Content |
|---|---|---|
| `MASTER_PALETTE`, `SKIN_TONES`, `HAIR_COLORS`, `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR`, `LIGHT_CHARS`, `PARTICLE_PALETTE`, `Palette` | `palettes.ts` | colors and character groups |
| `SpriteTemplate`, `HeroLayerSet`, `CampfireSprites`, `StageSprites`, `BASE_HERO`, `CAMPFIRE`, `STAGE_SPRITES` | `spriteTemplates.ts` | types re-exported from `spriteTypes.ts`; data built in `heroTemplates.ts`, `campfireTemplates.ts`, `stage1Templates.ts` |

| `CLASS_PALETTES` | `palettes.ts` (A1-1) | `Record<ClassPaletteId, Palette>`, partial palettes over `a c d b k m` |
| `EFFECT_SPRITES`, `EffectSpriteId`, `ClassPaletteId` | `effectTemplates.ts`, types in `spriteTypes.ts`, re-exported from `spriteTemplates.ts` (A1-1) | six effect templates, ids `effects/<name>`, `idle` only, centre anchor |
| `CLASS_LAYERS` | `classTemplates.ts`, re-exported from `spriteTemplates.ts` (A1-2, A1-3) | `Readonly<Record<string, HeroLayerSet>>`, keys `warrior`, `mage`, `archer`, `rogue`; all eleven animations, 26 frames per layer |
| `HERO_POSES`, `HERO_HEAD`, `HeroPose` | `heroTemplates.ts` | base pose data the class layers are derived from (art-internal; the engine does not import them) |

Stage 2 (`stage2Templates.ts`, `GOBLIN_MINE_SHAFTS`, registered in `STAGE_SPRITES`) props are keyed `support`, `pickaxe`, `oreVein`, `lantern` (4 frames), `minecart`, `rubble`, `doorFrame`, ids `goblin-mine-shafts/<name>`; it has no `barrel`, `crate`, `bonePile`, `puddle`, `cobweb`, `chains`, or `torch`, so the per-stage required-prop list in `spriteValidator.ts` must become per stage.

Stage props are keyed by their short name (`barrel`, `crate`, `bonePile`, `puddle`, `cobweb`, `chains`, `torch`, `doorFrame`), while template ids are `forgotten-cellar/<name>` so the sprite cache never collides across stages.

H2 exports (batch A2, new files so the H1 art files stay clean):

| Export | File | Content |
|---|---|---|
| `CLASS_LAYERS_H2` | `classTemplatesH2.ts` | `Record<string, HeroLayerSet>`, keys `cleric`, `paladin`, `necromancer`, `bard`; same eleven animations, 26 frames per layer, same anchors and sizes as H1 |
| `CLASS_PALETTES_H2`, `ClassPaletteIdH2` | `palettesH2.ts`, type in `spriteTypes.ts` | partial palettes over `a c d b k m` |
| `EFFECT_SPRITES_H2`, `EffectSpriteIdH2` | `effectTemplatesH2.ts`, type in `spriteTypes.ts` | `buffSparkle`, `note`, `healGlow`, `holyBurst`, `soulWisp`; ids `effects/<name>`, `idle` only, centre anchor |
| `SUMMON_SPRITES`, `SummonSpriteId` | `summonTemplates.ts` (skeleton, merges `SUMMON_SPRITES_H3`), type in `spriteTypes.ts` | `skeleton`, `beast`, `turret` (section 9) |
| `SUMMON_SPRITES_H3` | `summonTemplatesH3.ts` | `beast` 20x16 and `turret` 16x16, merged into `SUMMON_SPRITES` |
| `CLASS_LAYERS_H3` | `classTemplatesH3.ts` | `Record<string, HeroLayerSet>`, keys `druid`, `monk`, `artificer`, `berserker`; same eleven animations, 26 frames per layer, same anchors and sizes as H1 |
| `CLASS_PALETTES_H3`, `ClassPaletteIdH3` | `palettesH3.ts`, type in `spriteTypes.ts` | `druid`, `monk`, `artificer`, `berserker`; partial palettes over `a c d b k m` (Berserker red only as `a`, static stripes) |
| `EFFECT_SPRITES_H3`, `EffectSpriteIdH3` | `effectTemplatesH3.ts`, type in `spriteTypes.ts` | `leaf`, `chiOrb`, `chiBurst`, `warCry`, `wrench`; ids `effects/<name>`, `idle` only, centre anchor |

All are re-exported from `spriteTemplates.ts`. From H3 the merged barrel exports `CLASS_PALETTES` (in `palettes.ts`, H1 + H2 + H3) and `EFFECT_SPRITES` (H1 + H2 + H3) hold every delivered id, and `ClassPaletteId` / `EffectSpriteId` are the unions of all batches. The merged `CLASS_LAYERS` (H1 + H2 + H3) now holds all twelve classes and `SUMMON_SPRITES` holds all three summons. The master palette is 37 colors (cap 48).

## 9. Summon sprites

A summon is a cosmetic ally a class may call (the Necromancer's skeleton, the Druid's beast, the Artificer's turret). Convention ratified in the [H2 plan section 3.5](../architecture/plans/h2-classes.md#35-sprites-classes-effects-and-the-summon-convention) and applied unchanged by the [H3 plan section 3.3](../architecture/plans/h3-classes.md#33-sprites-classes-effects-and-the-two-new-summons). Nothing here changes who has health: only enemies do, and a summon has no gauge, no hurt, no death, and no downed art.

- **Template**: one composite `SpriteTemplate` (not layered), id `summons/<name>` equal to its key, at most 24x24, anchor on the foot pixel (the bottom outline row), facing right, 1px `o` outline, at most 8 colors including the outline. The engine draws the shadow.
- **Animations** (exactly): `idle` 2, `walk` 4, `attack` 3, `rise` 4, `sink` 3. `rise` and `sink` play once (a sprout from, and a descent into, the floor); there is no separate despawn name. Names matching `hurt|downed|death|dead|die|dying` are forbidden, the same rule as heroes. Every summon has a `walk`, so the turret is a clockwork walker, not a fixed emplacement.
- **Palette**: master characters only, never class-swapped.

| Summon | Size, anchor | Colors | Notes |
|---|---|---|---|
| `skeleton` | 16x20, `(8, 19)` | `o m w G d L N` | green puff on `rise` and `sink` |
| `beast` | 20x16, `(10, 15)` | `o h W 7 e L N` | wolf cub; leaf puffs on `rise` and `sink`; open mouth only in `attack` frame 1 |
| `turret` | 16x16, `(8, 15)` | `o C Z m Q q Y` | clockwork walker; one pale `Y` muzzle pixel for one frame in `attack`, no projectile; cog sparks on `rise` and `sink` |

- **Floor frames**: `rise` and `sink` are the finished idle figure shifted down by N rows and clipped at the ground line (the inner row above the bottom outline), with a closing outline row, so the figure stays upright and never collapses. The shared helper is `floorFrame` in each summon file.
- **Exports**: `SUMMON_SPRITES: Readonly<Record<SummonSpriteId, SpriteTemplate>>`, `SummonSpriteId = 'skeleton' | 'beast' | 'turret'`; `ArtSet.summons` and `validateSummonArt` (sizes, names, colors, the five animations) are developer-owned and already in place.

## 10. Enemy-side shared art (batch E1)

Delivered in steps A-E1-1 to A-E1-6 ([E1 plan section 10](../architecture/plans/e1-enemies.md)).

| Export | File | Content |
|---|---|---|
| `STAGE_PALETTES` | `palettesE1.ts`, re-exported from `palettes.ts` and `spriteTemplates.ts` | `Record<stageId, Palette>`: partial overrides of `1`-`8` (and `g`, `T`) over the master. `forgotten-cellar` is `{}`; `goblin-mine-shafts` recolors all eight. `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR` also have `goblin-mine-shafts` entries (`12345678`, `n`, `g`) |
| `PARTICLE_PALETTE.mote` | `palettes.ts` | `['a', 'V', 'W']`, bright to dim warm dust (master characters) |
| `ENEMY_BAR` | `enemyTemplates.ts` | `{ frame, bossFrame, fillChar: 'R', backChar: 'P' }`; frames are templates `ui/enemyBar` 18x4 and `ui/bossBar` 34x5, outline `o` with transparent interior, `idle` 1 frame, anchor `(0, 0)`. The engine draws back, then fill, inside the inset interior, then the frame |
| `ENEMY_SPRITES`, `ENEMY_PHASE_PALETTES` | `enemyTemplates.ts` (data in `enemiesStage1.ts`, `ratKingTemplate.ts`, `enemiesStage2.ts`, `goblinForemanTemplate.ts`; phase palettes in `palettesE1.ts` as `BOSS_PHASE_PALETTES`) | ten `enemies/<id>` templates and `rat-king` / `goblin-foreman` -> `[phase 2 palette]` (see below) |
| `DROP_SPRITES`, `DropSpriteId` | `dropTemplates.ts`, type in `spriteTypes.ts` | `coin`, `gem`, `ore` 6x6 anchor `(3, 5)`, `chest` 12x10 anchor `(6, 9)`; ids `drops/<kind>`, `idle` 2 frames, at most 8 colors, master characters |

Stage palette mechanism: a stage sprite is validated against the merged palette `{ ...MASTER_PALETTE, ...STAGE_PALETTES[stageId] }`, and rendered with it, so a character means the same role in every stage but a different color. Enemy rules (left-facing, `idle 2 / walk 2 / attack 3`, no `hit` or `death` frames, size by tier, at most 12 colors) are in the [art style guide section 7](art-style-guide.md#7-enemy-rules).

### Enemy templates in detail

- Id `enemies/<id>` equal to the key of `ENEMY_SPRITES` and the id in `src/game/data/enemies.ts`; one non-layered template per enemy, facing **left**, 1 px outline in `1` (the stage's deepest shadow), foot anchor on the bottom outline row (minion `(8, 15)`, elite `(12, 23)`, boss `(24, 47)`). A flying enemy (bat) keeps its claws on the bottom row; the engine's gait offset lifts it.
- Animations exactly `idle 2, walk 2, attack 3`; bosses add `telegraph 2` and `intro 2`. No `hit`, `death`, or `hurt` animation: the engine builds the flash and dissolve from `idle` frame 0 and the `attack` frames.
- Characters: master characters plus the stage's `1`-`8` (the engine resolves enemies of stage N with `{ ...MASTER_PALETTE, ...STAGE_PALETTES[stage id] }`); at most 12 colors over all frames; no frame draws opaque pixels on the top row or side columns other than the outline (so the outline is never clipped; the spider's thread starts at row 0 on purpose).
- Authoring: `enemyBuilder.ts` (`draft`, `put`, `dots`, `poly`, `ellipse`, `stroke`, `looseLine`, `finish`) draws the fill, `finish` adds the outline, and thin parts (spider and beetle legs) are "loose" pixels added after the outline.
- Phase palettes: `ENEMY_PHASE_PALETTES[bossId]` is an array of partial palettes for phases 2..n (here one each), overriding at most four characters over master plus stage.
- Preview tool: `tools/sprite-preview.mjs` (excluded from the package by `tools/**` in `.vscodeignore`).

## 11. Batch E2 art (Stages 3 and 4)

Delivered in steps A-E2-1 to A-E2-6 ([E2 plan section 11](../architecture/plans/e2-stages-3-4.md)). Atomic wiring: the new files exist on their own until the final step edits the barrels, because `Game` and the validators reject art without data rows and data rows without art.

| Export | File | Content |
|---|---|---|
| `STAGE_PALETTES['toxic-slime-caverns']`, `['ancient-catacombs']` | `palettesE1.ts` | overrides of `1`-`8`, `g`, `T` only |
| `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR` entries for both ids | `palettes.ts` | `12345678`, `n`, `g` |
| `PARTICLE_PALETTE.bubble`, `.wisp` | `palettes.ts` | `['L', 'N', 'Q']`, `['G', 'g', 'P']`; the type is widened to seven kinds |
| `TOXIC_SLIME_CAVERNS` | `stage3Templates.ts` | `StageSprites`; props `pipe slimeDrape glowShroom(2) toxicBarrel slimePool mushrooms doorFrame`, ids `toxic-slime-caverns/<name>` |
| `ANCIENT_CATACOMBS` | `stage4Templates.ts` | `StageSprites`; props `skullNiche candelabra(4) crackedPillar sarcophagus urn boneRubble doorFrame`, ids `ancient-catacombs/<name>` |
| `ENEMIES_STAGE3` | `enemiesStage3.ts` | `green-slime spore-shroom toxic-toad jelly-cube` |
| `ENEMIES_STAGE4` | `enemiesStage4.ts` | `bone-soldier wailing-ghost tomb-scarab crypt-mummy` |
| `OOZE_QUEEN`, `TOMB_LICH` | `oozeQueenTemplate.ts`, `tombLichTemplate.ts` | boss templates (11 frames each) |
| `BOSS_PHASE_PALETTES_E2` | `palettesE2.ts` | phase 2 palettes for `ooze-queen` and `tomb-lich` (four overrides each); merged into `ENEMY_PHASE_PALETTES` by `enemyTemplates.ts` |

Notes: stage props follow the same rules as Stages 1 and 2 (characters `1`-`8` only, at most 8 colors, `idle` only). Light props: `glowShroom` 2 frames (a slow pulse, no flicker) and `candelabra` 4 frames; the developer adds both to `FLAME_PROPS` (`glowShroom: 2`, `candelabra: 4`) and the required-prop lists. Solid alcove props are `toxicBarrel` and `sarcophagus` (foot anchor `(8, 14)`, drawn at foot y 134). Do not name a prop `puddle`. The preview tool accepts `SPRITE_ENTRY=<file.ts>` to preview art that is not wired yet.

## 12. Batch E3 art (Stages 5 and 6)

Delivered in steps A-E3-0 to A-E3-6 ([E3 plan section 11](../architecture/plans/e3-stages-5-6.md#11-art-needs-batch-e3)). Atomic wiring as in E2: the new files exist on their own until the final step edits the barrels (`enemyTemplates.ts`, `spriteTemplates.ts`).

| Export | File | Content |
|---|---|---|
| `STAGE_PALETTES['enchanted-forest-ruins']`, `['molten-core']` | `palettesE1.ts` | overrides of `1`-`8`, `g`, `T` only |
| `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR` entries for both ids | `palettes.ts` | `12345678`, `n`, `g` |
| `PARTICLE_PALETTE.firefly` | `palettes.ts` | `['Y', 'N', 'L', 'N', 'Y']`; the type is widened to eight kinds |
| `ENCHANTED_FOREST_RUINS` | `stage5Templates.ts` | `StageSprites`; props `brokenPillar hangingRoots glowBloom(2) ruinedStatue fernPatch flowerBed doorFrame`, ids `enchanted-forest-ruins/<name>` |
| `MOLTEN_CORE` | `stage6Templates.ts` | `StageSprites`; props `obsidianPillar lavaFall(4) lavaChannel(2) anvil slagHeap toolRack doorFrame`, ids `molten-core/<name>` |
| `ENEMIES_STAGE5` | `enemiesStage5.ts` | `thorn-sprout moss-wolf bramble-pixie ancient-treant` |
| `ENEMIES_STAGE6` | `enemiesStage6.ts` | `ember-imp slag-snail magma-crab furnace-guard` |
| `ELDER_DRYAD`, `MOLTEN_COLOSSUS` | `elderDryadTemplate.ts`, `moltenColossusTemplate.ts` | boss templates (11 frames each) |
| `BOSS_PHASE_PALETTES_E3` | `palettesE3.ts` | phase 2 palettes for `elder-dryad` and `molten-colossus` (four overrides each); merged into `ENEMY_PHASE_PALETTES` by `enemyTemplates.ts` |
| `fromFill`, `shiftRows`, `lift`, `squash`, `stretch`, `patch`, `recolorRows`, `checked` | `enemyFrames.ts` | row-level frame helpers (pure, run at module load); `fromFill` draws a fill-only picture and adds the outline |

Notes:

- Stage props follow the same rules as Stages 1 to 4 (characters `1`-`8` only, at most 8 colors, `idle` only). Light props: `glowBloom` 2 frames (a slow pulse), `lavaFall` 4 frames (a slow flow), `lavaChannel` 2 frames (a shimmer); the developer adds them to `FLAME_PROPS` (`glowBloom: 2`, `lavaFall: 4`, `lavaChannel: 2`) with the required-prop lists, and their lights use `flicker: false`. Solid alcove props are `ruinedStatue` and `anvil` (foot anchor `(8, 14)`, drawn at foot y 134). No prop is named `puddle` or `lava...` on the floor layer; lava (`6`, `7`) appears only in wall props, wall tiles, and the backdrop.
- Hand-drawn enemies: the base frame is a fill-only picture (`fromFill` adds the outline), and the other frames are derived with the helpers; the helper `patch` treats `.` as "leave" and `,` as "clear".
- The new enemies are checked against the look-alike policy before wiring: `node test/support/lookAlikesReport.mjs src/game/sprites/enemiesStage5.ts:ENEMIES_STAGE5:5` (and the same for the other files), see the art style guide.
- Two enemies are drawn off their frame center to clear an older silhouette (`furnace-guard` about four pixels left, `wailing-ghost` two pixels right); the anchor is unchanged. `bramble-pixie` hovers: its lowest pixels are three rows above the bottom outline row.
- A-E3-0 reworked six shipped E2 templates in place (`green-slime`, `spore-shroom`, `toxic-toad`, `jelly-cube`, `ooze-queen`, `wailing-ghost`) with the same ids, sizes, anchors, and animation sets, so no data change follows.
- The preview tool knows the new stage ids (`node tools/sprite-preview.mjs enemies enchanted-forest-ruins out.png`); `SPRITE_ENTRY=<file.ts>` previews unwired art.

## 13. Batch E4 art (Stages 7 and 8)

Delivered in steps A-E4-0 to A-E4-6 ([E4 plan section 11](../architecture/plans/e4-stages-7-8.md#11-art-needs-batch-e4)). Atomic wiring as in E2 and E3: the new files exist on their own until the final step edits the barrels (`enemyTemplates.ts`, `spriteTemplates.ts`).

| Export | File | Content |
|---|---|---|
| `STAGE_PALETTES['frozen-citadel']`, `['shadow-realm']` | `palettesE1.ts` | overrides of `1`-`8`, `g`, `T` only |
| `STAGE_TILE_CHARS`, `STAGE_CLEAR_CHAR`, `STAGE_AMBIENT_CHAR` entries for both ids | `palettes.ts` | `12345678`, `n`, `g` |
| `PARTICLE_PALETTE.snow`, `.murk` | `palettes.ts` | `['w', 'q', 'Q']` and `['g', 'b', 'P']`; the type is widened to ten kinds; master characters only |
| `FROZEN_CITADEL` | `stage7Templates.ts` | `StageSprites`; props `icePillar icicleCluster frostBanner iceLamp(2) iceSheet(2) iceThrone snowDrift doorFrame`, ids `frozen-citadel/<name>` |
| `SHADOW_REALM` | `stage8Templates.ts` | `StageSprites`; props `duskPillar floatingShard(2) mirrorFrame wispTorch(4) duskAltar shardPatch doorFrame`, ids `shadow-realm/<name>` |
| `ENEMIES_STAGE7` | `enemiesStage7.ts` | `rime-penguin frost-hare snow-sentry snow-yeti` |
| `ENEMIES_STAGE8` | `enemiesStage8.ts` | `lantern-wraith shard-cluster mirror-mimic gloom-stag` |
| `GLACIER_MAMMOTH`, `ECLIPSE_WARDEN` | `glacierMammothTemplate.ts`, `eclipseWardenTemplate.ts` | boss templates (11 frames each); the files also export the builder functions `mammothFrame`, `wardenFrame` and the geometry constants `MAMMOTH_GEOM`, `WARDEN_GEOM` (used for the look-alike sweep) |
| `BOSS_PHASE_PALETTES_E4` | `palettesE4.ts` | phase 2 palettes for `glacier-mammoth` and `eclipse-warden` (four overrides each); merged into `ENEMY_PHASE_PALETTES` by `enemyTemplates.ts` |

Notes:

- Stage props follow the same rules as Stages 1 to 6 (characters `1`-`8` only, at most 8 colors, `idle` only). Light props: `iceLamp` 2 frames, `iceSheet` 2 frames, `floatingShard` 2 frames, `wispTorch` 4 frames; the developer adds them to `FLAME_PROPS` (`iceLamp: 2`, `iceSheet: 2`, `floatingShard: 2`, `wispTorch: 4`) with the required-prop lists, and their lights use `flicker: false`. Solid alcove props are `iceThrone` and `duskAltar` (foot anchor `(8, 14)`, drawn at foot y 134). The floor-layer props are exactly `iceThrone snowDrift duskAltar shardPatch`.
- **Frame timing is not a template field.** The format has no per-frame time: `Stage.ts` gives every non-torch, non-lantern prop `PROP_FRAME_MS` (500 ms) and torches and lanterns `TORCH_FRAME_MS` (130 ms). So `iceSheet` and `floatingShard` loop at 500 ms per frame and `iceLamp` and `wispTorch` at 500 ms (all at least the plan's 500 and 300 ms floors); no template field exists to state or assert, a test can read the constants.
- Pixel change between consecutive idle frames (limit: the largest shipped enemy idle pair, `ooze-queen` 466): `iceLamp` 6, `iceSheet` 8, `floatingShard` 50, `wispTorch` 10 to 13; enemies 22 to 94, `glacier-mammoth` 362, `eclipse-warden` 240.
- Enemy frames come from `enemyBuilder.ts` primitives plus `enemyFrames.ts` helpers or from a builder pose parameter (the bosses). The base idle frame's silhouette was tuned with the look-alike tool; do not change an idle frame 0 outline without re-running `node test/support/lookAlikesReport.mjs <file.ts>:<Export>:<stage>[:<id>]`.
- Three enemies are drawn off their frame center on purpose so the anchor-relative silhouette clears older enemies: `rime-penguin` two pixels left, `frost-hare` one pixel right, `lantern-wraith` about two pixels left. The anchor stays at the foot center. `lantern-wraith`, `shard-cluster` and the `eclipse-warden` boss are `float` enemies: the sprites are drawn complete and the engine adds the hover as a cosmetic draw offset (the warden's tendril tips reach row 46, next to the foot row 47).
- The preview tool knows both new ids (`SPRITE_ENTRY=<file.ts> node tools/sprite-preview.mjs enemies shadow-realm out.png`, and `stage` mode); until the barrels are wired use a small entry file that re-exports the wired tables plus the new ones.
