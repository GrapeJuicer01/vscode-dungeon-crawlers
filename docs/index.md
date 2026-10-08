# Docs index

Purpose: the map of every Pixel Agents document, what it covers, and who owns it. Owned by the architect; a complete, cross-linked pass happens in M9.
Related: [CLAUDE.md](../CLAUDE.md), [architecture overview](architecture/overview.md), [glossary](glossary.md), [roadmap](engineering/roadmap.md), [team workflow](engineering/team-workflow.md).

Entries marked "planned" do not exist yet; the milestone in brackets is when they arrive.

## Start here

| Doc | Owner | Covers |
|---|---|---|
| [glossary](glossary.md) | architect | terms used across the docs (hero, agent session, host, webview, stage, gate, ...), including the protocol terms (bridge, mirror, snapshot, `ready`, allow-list creator) |

## Architecture (architect)

| Doc | Covers |
|---|---|
| [overview](architecture/overview.md) | system context, containers (incl. `src/host/` and the webview protocol modules), data flow, safety and security boundaries, current state |
| [host-webview protocol](architecture/host-webview-protocol.md) | [M2] message catalog, field and validation rules, `WebviewBridge` states, `ready` handshake, a sequence diagram per flow, how to add a message |
| [security and safety](architecture/security-and-safety.md) | [M2, M3] threat model (T1-T19), trust boundaries B1-B4, CSP, validation, data inventory, read-only and reveal-only guarantees, monitor file access |
| [agent detection](architecture/agent-detection.md) | [M3] monitor components (core and adapters), transcript, terminal, and simulator sources, session state machine, registry and coalescing, settings, error logging, platform notes, limits |
| [game engine](architecture/game-engine.md) | planned [M4]: loop, renderer, entities, crash isolation |
| [data model](architecture/data-model.md) | planned [M4]: data tables, persisted progress, migrations |

### Plans

| Plan | Milestone |
|---|---|
| [m1-scaffold](architecture/plans/m1-scaffold.md) | M1 Scaffold |
| [m2-protocol](architecture/plans/m2-protocol.md) | M2 Protocol (refreshed against M1 as built; includes integration test notes) |
| [m3-monitor](architecture/plans/m3-monitor.md) | M3 Monitor (checked against M2 as built; includes decisions for the human) |

### ADRs

| ADR | Decision |
|---|---|
| [0001](architecture/adr/0001-bottom-panel-webview.md) | bottom-panel webview view |
| [0002](architecture/adr/0002-no-hero-health.md) | heroes have no health; state follows agent events only |
| [0003](architecture/adr/0003-procedural-sprites.md) | procedural palette-indexed sprites, synthesized audio |
| [0004](architecture/adr/0004-esbuild-two-bundles.md) | esbuild, two bundles (host CJS, webview IIFE); implementation notes for M1, M2 (`src/host/`), and M3 (monitor core and adapters) |
| [0005](architecture/adr/0005-transcript-watching.md) | detect agents by polling Claude Code transcripts read-only (no hooks, no watchers, workspace scope by default) |
| [0006](architecture/adr/0006-node-test-runner.md) | `node:test` compiled by esbuild, no runner package; amended: integration tests via `@vscode/test-electron` |
| [0007](architecture/adr/0007-allow-list-protocol-pull-handshake.md) | allow-list protocol with exact-key validation and a pull handshake |

## Engineering

| Doc | Owner | Covers |
|---|---|---|
| [roadmap](engineering/roadmap.md) | architect | milestones, batches, gates, status |
| [team workflow](engineering/team-workflow.md) | architect | agent loop, handoffs, ownership, autofix rule, escalation |
| [coding standards](engineering/coding-standards.md) | architect | TypeScript, boundaries (incl. `src/host/`), errors and try/catch, logging channel, untrusted text, lint, dependencies |
| [testing strategy](engineering/testing-strategy.md) | tester | unit runner, extension-host integration runner, suites, manual QA, benchmarks |

## Design

| Doc | Owner | Covers |
|---|---|---|
| [art style guide](design/art-style-guide.md) | pixel-artist | look, palettes, classes, stages, hit-reaction rules |
| [sprite spec](design/sprite-spec.md) | pixel-artist | template format, grids, animations, validation |

Further design and development docs (game design, classes, enemies and stages, UI/UX, accessibility, audio, setup, release) arrive with their milestones and are added here by the architect.
