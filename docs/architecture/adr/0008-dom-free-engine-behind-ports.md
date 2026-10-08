# ADR 0008: The game engine is DOM-free and talks to the canvas through ports

Purpose: records why `src/game/**` never touches the DOM, the canvas, or the clock directly, and why a thin webview host owns the animation frame, the canvas context, and visibility.
Related: [game engine](../game-engine.md), [M4 plan](../plans/m4-engine.md), [ADR 0003 procedural sprites](0003-procedural-sprites.md), [ADR 0004 esbuild two bundles](0004-esbuild-two-bundles.md), [ADR 0009 hero lifecycle isolation](0009-hero-lifecycle-isolation.md), [coding standards](../../engineering/coding-standards.md#3-bundle-boundaries), [testing strategy](../../engineering/testing-strategy.md), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

The engine must hold 60fps with 8+ heroes and 30+ enemies, be provably unable to hurt a hero or reach the host, and be testable under `node:test` (ADR 0006), which has no browser. The existing webview already splits DOM-free modules (`hostMessages.ts`, `hostState.ts`) from the one DOM file (`main.ts`) for the same reason. The engine is far larger, so the split matters more: a game that reads `document`, `performance.now()`, or `Math.random()` directly cannot be driven deterministically in a test, and a game that holds the host channel could, by mistake, send something to the host.

## Decision

- `src/game/**` is DOM-free and clock-free. It uses no `document`, `window`, `requestAnimationFrame`, timers, `fetch`, `performance`, `Math.random`, or `Date.now`. Time arrives as a frame delta; randomness is a seeded generator; drawing goes through a `Surface` port and bitmap creation through a `BitmapFactory` port (both defined in `src/game/ports.ts`).
- `src/webview/` owns everything that touches the browser: `canvasSurface.ts` (the canvas adapters), `gameHost.ts` (animation frame, visibility, `pagehide`, crash reporting), `sceneFeed.ts` (feeds host messages to the engine, DOM-free), and `main.ts` (boot).
- The engine has no reference to the host channel. Its only inputs are `enqueueAgent` and `enqueueSnapshot` (host agent events) and frame deltas; its only outputs are pixels on a `Surface` and an error callback.
- ESLint enforces the bans with `no-restricted-globals` and `no-restricted-properties` on `src/game/**`, and a boundary block forbids `src/game/**` importing `src/webview/**`. Structural tests repeat the scan.

## Consequences

- The whole engine, including the loop, the roster, lighting, and the renderer's draw order, runs in `node:test` against a recording fake `Surface`. The hero-invariant test needs no browser.
- Nothing in the engine can send a message to the host, so invariants 2 and 3 hold by construction, not by discipline.
- Two small adapter files hold all canvas code; a canvas API change touches only them.
- Draw-call and frame-cost budgets are testable by counting calls on the fake surface.
- Cost: a few more files and an indirection per draw call. The `Surface` interface is deliberately tiny (clear, fill, draw bitmap, region, flip, composite, alpha) so the indirection is a direct pass-through in the adapter.
- Rendering correctness (pixels on screen) still needs a manual glance; the fake surface proves what is drawn and in what order, not how a real canvas rasterizes it.
