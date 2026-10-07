# Docs index

Purpose: the map of every Pixel Agents document, what it covers, and who owns it. Owned by the architect; a complete, cross-linked pass happens in M9.
Related: [CLAUDE.md](../CLAUDE.md), [architecture overview](architecture/overview.md), [glossary](glossary.md), [roadmap](engineering/roadmap.md), [team workflow](engineering/team-workflow.md).

Entries marked "planned" do not exist yet; the milestone in brackets is when they arrive.

## Start here

| Doc | Owner | Covers |
|---|---|---|
| [glossary](glossary.md) | architect | terms used across the docs (hero, agent session, host, webview, stage, gate, ...) |

## Architecture (architect)

| Doc | Covers |
|---|---|
| [overview](architecture/overview.md) | system context, containers, data flow, safety and security boundaries |
| [host-webview protocol](architecture/host-webview-protocol.md) | message types, handshake, sequence diagrams (M2) |
| [security and safety](architecture/security-and-safety.md) | threat model, CSP, validation, read-only guarantees (M2) |
| [agent detection](architecture/agent-detection.md) | planned [M3]: monitor sources and state machine |
| [game engine](architecture/game-engine.md) | planned [M4]: loop, renderer, entities, crash isolation |
| [data model](architecture/data-model.md) | planned [M4]: data tables, persisted progress, migrations |

### Plans

| Plan | Milestone |
|---|---|
| [m1-scaffold](architecture/plans/m1-scaffold.md) | M1 Scaffold |
| [m2-protocol](architecture/plans/m2-protocol.md) | M2 Protocol |

### ADRs

| ADR | Decision |
|---|---|
| [0001](architecture/adr/0001-bottom-panel-webview.md) | bottom-panel webview view |
| [0002](architecture/adr/0002-no-hero-health.md) | heroes have no health; state follows agent events only |
| [0003](architecture/adr/0003-procedural-sprites.md) | procedural palette-indexed sprites, synthesized audio |
| [0004](architecture/adr/0004-esbuild-two-bundles.md) | esbuild, two bundles (host CJS, webview IIFE) |
| 0005 | reserved: transcript watching (M3) |
| [0006](architecture/adr/0006-node-test-runner.md) | `node:test` compiled by esbuild, no runner package; amended: integration tests via `@vscode/test-electron` |
| [0007](architecture/adr/0007-allow-list-protocol-pull-handshake.md) | allow-list protocol with exact-key validation and a pull handshake |

## Engineering

| Doc | Owner | Covers |
|---|---|---|
| [roadmap](engineering/roadmap.md) | architect | milestones, batches, gates, status |
| [team workflow](engineering/team-workflow.md) | architect | agent loop, handoffs, ownership, autofix rule, escalation |
| [coding standards](engineering/coding-standards.md) | architect | TypeScript, boundaries, errors, logging, lint, dependencies |
| [testing strategy](engineering/testing-strategy.md) | tester | runner, suites, manual QA, benchmarks |

## Design

| Doc | Owner | Covers |
|---|---|---|
| [art style guide](design/art-style-guide.md) | pixel-artist | look, palettes, classes, stages, hit-reaction rules |
| [sprite spec](design/sprite-spec.md) | pixel-artist | template format, grids, animations, validation |

Further design and development docs (game design, classes, enemies and stages, UI/UX, accessibility, audio, setup, release) arrive with their milestones and are added here by the architect.
