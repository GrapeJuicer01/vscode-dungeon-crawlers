# ADR 0010: Stages use a fixed 320x180 split room: static campfire alcove plus scrolling corridor

Purpose: records the screen layout every stage and every sprite is authored against, because the tile grid, the sprite sizes, and the pixel-artist's work all depend on it and it is costly to change once art exists.
Related: [game engine](../game-engine.md#3-room-layout), [M4 plan](../plans/m4-engine.md), [art style guide](../../design/art-style-guide.md), [sprite spec](../../design/sprite-spec.md), [ADR 0003 procedural sprites](0003-procedural-sprites.md), [ADR 0008 DOM-free engine](0008-dom-free-engine-behind-ports.md), [roadmap](../../engineering/roadmap.md).

## Status

Accepted

## Context

The scene must show two kinds of hero at once: working heroes that advance through a dungeon, and idle heroes at a campfire. The look is Tiny Towers-style cutaway rooms ([art style guide](../../design/art-style-guide.md)), the internal buffer is 320x180, and the panel is short and wide. A single long world with a following camera would need a world map, hide idle heroes whenever the camera follows the party, and make a hero's position depend on camera state. Heroes and the campfire must be readable at a glance in a small panel.

## Decision

- The view is always one fixed 320x180 buffer on a 16x16 tile grid (20 columns). Rows: 8 back-wall rows (y 0-127), 2 floor rows (y 128-159, the walkable band), 1 foreground row (y 160-175), 4 px of fill below.
- Columns 0-7 (x 0-127) are the **alcove**: a static room with the campfire and rest seats. Column 8 (x 128-143) is a door frame. Columns 9-19 (x 144-319) are the **corridor**: a repeating 24-tile (384 px) segment that scrolls horizontally.
- Working heroes stand in formation slots in the corridor and walk in place while the corridor scrolls (they "advance"); when engaged they stop scrolling and attack. Idle heroes sit in seats around the campfire in the alcove. Moving between them is a walk through the door.
- Nothing scrolls the alcove. The camera is a scroll offset for corridor layers and (from E1) a shake offset; it never follows a hero.
- Draw order: backdrop (parallax 0.25), wall tiles and wall props, floor tiles, then floor props, campfire, and heroes sorted by foot y, then foreground tiles, particles. Environment layers are lit; heroes are drawn after the light pass so they always read clearly ([style guide pillar](../../design/art-style-guide.md#1-style-pillars)).
- Hero foot y stays within y 140-158. Hero cells are 16x20; sprite sizes in the [art style guide](../../design/art-style-guide.md#2-grid-sizes-assumptions-update-here-if-the-engine-differs) are unchanged.

## Consequences

- Every stage reuses one geometry, so a stage is data (tile choices, props, lights, ambient effect) plus art, not new layout code.
- Heroes need no world coordinates beyond slot indices and seat indices, which also makes the scene trivially rebuildable on reload.
- Enemies (E1) enter from the right edge of the corridor; bosses up to 64x48 fit the 128 px wall height plus the floor band.
- The corridor only suggests travel; there is no real world to explore. Accepted: the panel is a status display ([ADR 0002](0002-no-hero-health.md)).
- With more than 32 heroes, extra heroes share slots and overlap. Accepted: the protocol caps agents at 64 and realistic use is single digits.
- Changing the tile rows or zone widths later invalidates all backdrop and wall art; that is why this is an ADR.
