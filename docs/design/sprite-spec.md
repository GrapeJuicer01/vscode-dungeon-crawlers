# Sprite spec

Purpose: the exact format of palette-indexed pixel maps, how to author a sprite template, and a worked example. Owned by the pixel-artist; the renderer in `src/game/sprites/spriteFactory.ts` (developer-owned) implements it.
Related: [art style guide](art-style-guide.md), [game engine](../architecture/game-engine.md) (planned, M4), [adding content](../development/adding-content.md) (planned, M9).

If the format changes, update this doc and tell the developer in the handoff so `spriteFactory.ts` changes with it.

## 1. Format (default until `spriteFactory.ts` says otherwise)

A sprite is a template of named animations. Each animation is a list of frames, each frame a list of equal-length strings with one palette character per pixel.

```ts
export interface SpriteTemplate {
  id: string; // matches the data id (class id, enemy id, prop id)
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
- Hero animation names: `idle`, `walk`, `attack`, `ability`, `sit`, `eat`, `sleep`, `polish`, `read`, `warmHands`, `victory`. There are no hurt, downed, or death animations for heroes.
- Heroes are layered: `body`, `head`, `gear`, `weapon`. The factory composites them in that order and applies palette swaps (skin, hair, class accent).

## 2. Authoring guide

1. Read the class or enemy entry in the [art style guide](art-style-guide.md) and write a one-line design note.
2. Start from the base body for heroes; for enemies, block the silhouette first.
3. Draw frame 1, then derive other frames by moving only the pixels that change.
4. Use at most 12 colors, and only characters defined in `palettes.ts`.
5. Run the validator (row lengths, frame sizes, palette usage, color count) and fix every error.
6. Add the template id to the data table so it can be looked up by id.

## 3. Worked example: base hero body, idle frame 1 (16x20)

```text
................
................
....oooooooo....
...ohhhhhhhho...
...ohhhhhhhho...
...ohssssssho...
...osesssseso...
...osssssssso...
....osssssso....
.....oooooo.....
....occcccco....
...occcccccco...
...osccccccso...
....oddddddo....
....obbbbbbo....
....obboobbo....
....obboobbo....
....okkookko....
....oooooooo....
................
```

Rows 2-9 are the head (row 9 is the chin outline), rows 10-13 the torso with hands, rows 14-18 legs and boots. Hair, hats, gear, and weapons are separate layers drawn on top.

## 4. Validation rules

A template is valid when every row length equals `w`, every frame has `h` rows, all characters exist in the palette (plus `.`), and the sprite uses at most 12 colors including the outline.
