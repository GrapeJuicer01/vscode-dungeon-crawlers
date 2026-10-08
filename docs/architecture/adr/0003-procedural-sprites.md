# ADR 0003: Procedural, palette-indexed sprites and synthesized audio

Purpose: records why all art is palette-indexed pixel maps in TypeScript and all sound is Web Audio synthesis, with no image or audio files in the repo or the package.
Related: [architecture overview](../overview.md), [sprite spec](../../design/sprite-spec.md), [art style guide](../../design/art-style-guide.md), [ADR 0001 bottom-panel webview](0001-bottom-panel-webview.md), [game engine](../game-engine.md), [data model](../data-model.md).

## Status

Accepted

## Context

The game needs 12 hero classes with layered animations, 50 enemies, 10 stage tilesets, props, effects, and UI glyphs. Shipping these as image files would:

- require `localResourceRoots` and `img-src` entries for each asset folder, widening the webview's CSP and file-access surface;
- add binary blobs that are hard to review, diff, recolor, or validate in CI;
- tie art changes to an external editor and an export step.

The art style (16x20 chibi heroes, flat colors plus one shade, 1px outline) is small enough to author as text grids.

## Decision

- Every sprite is a `SpriteTemplate` of equal-length strings, one palette character per pixel, as defined in the [sprite spec](../../design/sprite-spec.md). Templates live in `src/game/sprites/` (pixel-artist owned); colors live only in `palettes.ts`.
- `spriteFactory.ts` (developer owned) converts templates to offscreen canvases once, composites hero layers (`body`, `head`, `gear`, `weapon`), applies palette swaps, and caches the result. Nothing is decoded per frame.
- Templates are validated (row lengths, frame sizes, palette characters, at most 12 colors per sprite) by a test from M4.
- Audio (M8) is synthesized with the Web Audio API at runtime. No audio files.
- The repo and the `.vsix` contain no `.png`, `.gif`, `.jpg`, `.svg`, `.wav`, `.mp3`, `.ogg`, or font files (Core invariant 5, gate G4). This includes the view container icon (see [ADR 0001](0001-bottom-panel-webview.md)).

## Consequences

- The webview needs no `img-src`, `media-src`, or `font-src` for extension assets; CSP stays minimal and `localResourceRoots` covers only `dist/`.
- Art is reviewable as text diffs and recolorable via palette swaps (skin, hair, class accent, boss phases).
- Sprite data adds to the webview bundle size; templates should stay compact (shared layers, derived frames). Bundle size is watched from M4.
- First-render cost is a one-time template rasterization; the factory must cache and must not allocate per frame.
- Authoring is slower than drawing in an editor; the optional dev-only preview page under `tools/` (never shipped) mitigates this.
- A UI pixel font (M7) must also be a template glyph set, not a font file.
