# Changelog

Purpose: a human-readable record of notable changes to Pixel Agents, newest first.
Related: [README](README.md), [roadmap](docs/engineering/roadmap.md), [contributing](CONTRIBUTING.md).

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Four more hero classes (Cleric, Paladin, Necromancer with a cosmetic skeleton, Bard), eight in all; cosmetic only. New one-shot aura effects (sparkle, note, blessing glow, holy burst, soul wisp) and the summon convention: a pooled `Summon` entity (`SummonPool`, capacity 8) owned by a lease its hero renews while fighting, that sinks about half a second after the hero stops. A summon has no health, is never a target, and cannot touch a hero. Hero classes are reassigned once, because the class mapping reads a different slice of the session id hash. `npm run docs:tables` now notes summons. No new settings, messages, or dependencies.
- Four hero classes (Warrior, Mage, Archer, Rogue) with their own look, attack, and signature effect; cosmetic only. A hero's class is derived from its session id (`classFor`), so it never changes and survives webview reloads. New 3-frame `ability` animation every few seconds of attacking, a pooled cosmetic effect layer (orb bolt, arrow, whirl, burst, dagger, smoke) drawn after the heroes, and `npm run docs:tables`, which regenerates the class table in `docs/design/classes.md` (CI fails on a stale table). No health, damage, or gauge exists; effects are pictures only. Adds `docs/design/classes.md` and `docs/design/game-design.md`. No new settings, messages, or dependencies.
- Animated pixel dungeon: heroes follow agent state (working advances down a scrolling corridor, idle rests at the campfire in changing poses, despawn plays a victory pose and warps out). Stage 1, "The Forgotten Cellar", with torches, a lit campfire, and dripping water; DOM-free engine in `src/game/` behind two ports (fixed 60 Hz step, crash-isolated per entity, step, render, and frame), a seeded random generator, pooled particles, banded lighting, grid A* pathfinding, and a sprite factory and validator for the palette-indexed art (base hero, campfire, Stage 1). Heroes have no health and no gauges; their state changes only on host agent events. No new settings or messages.
- Read-only agent monitor: Claude Code transcripts, terminal reveal, labelled simulator; settings under `pixelAgents.*`. The monitor polls `~/.claude/projects` (only this window's workspace folders by default) with bounded read-only reads, never follows symbolic links below the root, and extracts only session id, name, state, tool name, and timestamp. Sessions go spawned, working, idle, and despawned through debounce, idle, pending-tool, and session-end timeouts; `focusAgent` reveals a linked terminal with `Terminal.show()` only. Simulated `Sim ...` agents (`auto` by default) appear only while no real session exists. Nine settings: `simulator`, `simulatorAgentCount`, `projectScope`, `transcriptPath`, `idleTimeoutSeconds`, `toolTimeoutSeconds`, `sessionEndTimeoutMinutes`, `debounceMs`, `pollIntervalMs`. Nothing is persisted.
- Typed host/webview protocol with validated messages, `ready` handshake, reveal-only `focusAgent`. Exact-key validators in both directions, host-side creators that copy only the five allow-listed agent fields, and a "Pixel Agents" log output channel for dropped messages and bridge errors (no payloads are logged).
- Extension scaffold: a "Pixel Agents" bottom-panel view container with one webview view (`pixelAgents.view`), activated only when the view is opened.
- Webview HTML builder with a strict Content-Security-Policy (`default-src 'none'`, a per-load script and style nonce, `base-uri 'none'`, `form-action 'none'`); webview resources limited to `dist/`, command URIs and forms disabled.
- Blank 320x180 canvas that stays integer-scaled and crisp across panel resizes and zoom levels, with crash-safe boot.
- esbuild build producing two bundles: `dist/extension.js` (Node, CommonJS) and `dist/webview.js` (browser, IIFE), with watch and production modes.
- Strict TypeScript configs for the host, webview, and tools projects; ESLint with bundle-boundary import rules, Prettier, and markdownlint.
- F5 launch configuration, `.vscodeignore` that ships only the manifest, docs, license, and the two bundles, and CI and release workflows.
- README, contributing guide, code of conduct, and MIT license.
- `@vscode/test-electron` (dev-only, exact-pinned) for integration tests that run the extension inside a downloaded VS Code; CI and release run them under `xvfb-run` against VS Code stable and 1.90.0 (the `engines.vscode` minimum). The download cache `.vscode-test/` is ignored by git, packaging, Prettier, ESLint, and markdownlint.
- Development webview builds use an inline sourcemap so DevTools works under the strict webview CSP; production builds have no sourcemaps.

### Fixed

- A hero that is exiting (victory or warp out) is now replaced by a fresh hero when its agent goes working or idle again, instead of lingering. The renderer's light pass is guarded: a throwing light path is reported once, then skipped after a limit, while entities, foreground, and particles keep drawing normally.
