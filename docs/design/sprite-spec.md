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
- **Everything that is not a hero** (campfire, tiles, props, backdrop; later enemies and bosses) uses the single animation name **`idle`**. A static sprite has one frame; a loop (flame, torch, ripple) has several. Enemy-only extras (`attack`, `hit`, `death`, `telegraph`) arrive with E1 and are listed in the style guide when added.
- Heroes are layered: `body`, `head`, `gear`, `weapon`, composited in that order. All layers share the animation names and frame counts; a layer may hold all-transparent frames (the weapon layer is empty while resting, except `polish`). `gear` is `null` in the classless base hero.

## 4. Palette swaps are partial palettes

`SKIN_TONES` (4) and `HAIR_COLORS` (6) are partial palettes: each holds only the characters it overrides (`s` for skin, `h` for hair), not a full copy. The factory resolves a character by looking in the swap first and the master palette second, after layers are composited, so a swap recolors every layer at once. Index 0 of each list equals the master color.

`CLASS_PALETTES` (A1-1) are partial palettes too, one per class (`warrior`, `mage`, `archer`, `rogue`), overriding only `a c d b k m` (accent, cloth, cloth shade, pants, boots, metal), never `o s h e w`. Resolution order for a hero bitmap is master, class, skin, hair, so skin and hair still recolor over a class. Class sprites are drawn with the same characters as the base hero; only the palette changes. Red stays on small parts (plume, trim, shield), never the whole body.

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
| `CLASS_LAYERS` | `classTemplates.ts` (planned, A1-2 and A1-3) | class id to `HeroLayerSet`, all eleven animations, equal frame counts |

Stage props are keyed by their short name (`barrel`, `crate`, `bonePile`, `puddle`, `cobweb`, `chains`, `torch`, `doorFrame`), while template ids are `forgotten-cellar/<name>` so the sprite cache never collides across stages.
