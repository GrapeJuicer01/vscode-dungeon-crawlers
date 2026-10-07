# Glossary

Purpose: one-line definitions of the terms used across the Pixel Agents docs, so every agent and contributor means the same thing by "hero", "host", "stage", or "gate". Owned by the architect; extended as milestones add terms.
Related: [docs index](index.md), [CLAUDE.md](../CLAUDE.md), [architecture overview](architecture/overview.md), [host-webview protocol](architecture/host-webview-protocol.md), [roadmap](engineering/roadmap.md), [team workflow](engineering/team-workflow.md), [art style guide](design/art-style-guide.md).

## Agents and the game

| Term | Meaning |
|---|---|
| agent session | one running Claude Code session the extension observes. Identified by a session id; never controlled by the extension (Core invariant 3). |
| agent state | the lifecycle state of an agent session as reported by the host: `spawned`, `working`, `idle`, or `despawned`. The only input that changes a hero's state (Core invariant 2). |
| hero | the pixel-art character that represents one agent session. Invulnerable: no HP, mana, damage, death, or gauges (Core invariant 1, [ADR 0002](architecture/adr/0002-no-hero-health.md)). |
| class | a hero's look and attack style (Warrior, Mage, and 10 more), picked from the agent's tool activity and sticky per session (H1-H3). |
| summon | a cosmetic ally of a summoning class (skeleton, beast, turret); no health shown, no effect on hero state (H2, H3). |
| enemy | a monster heroes fight while their agent is working. Only enemies have health. 50 types from a compact data table (E1-E5). |
| boss | the one special enemy per stage, with intro pose, telegraph, and phases. |
| stage | one of the 10 dungeon levels heroes progress through by cumulative work, each with 4 regular enemies and 1 boss. |
| biome | the visual environment of a stage (tiles, props, backdrop, ambient effect). CLAUDE.md's "10 biomes" are the 10 stages' environments. |
| campfire | the rest spot idle heroes walk to and use rest poses at. |
| cosmetic hit reaction | what an enemy attack does to a hero: flash, stagger, small knockback, spark. Never changes hero state ([art style guide](design/art-style-guide.md#5-cosmetic-hit-reaction-visual-language)). |
| New Game+ | the loop back to Stage 1 with higher scaling after Stage 10 (E5). |

## Extension architecture

| Term | Meaning |
|---|---|
| host, extension host | the Node.js process inside VS Code that runs `dist/extension.js` with the `vscode` API. Source of truth for agent state. |
| webview | the sandboxed browser iframe that runs `dist/webview.js` and draws the game. Never a source of truth; rebuilt from the host on every load. |
| webview view, panel | the "Pixel Agents" tab in VS Code's bottom panel that hosts the webview ([ADR 0001](architecture/adr/0001-bottom-panel-webview.md)). |
| bundle | one esbuild output: the host bundle (Node CJS) or the webview bundle (browser IIFE). They share only `src/shared/` ([ADR 0004](architecture/adr/0004-esbuild-two-bundles.md)). |
| protocol | the typed, validated messages between host and webview in `src/shared/protocol.ts` ([host-webview protocol](architecture/host-webview-protocol.md)). |
| handshake | the webview sends `ready`; the host answers with `config` then `agentList` snapshots, and only then pushes `agentState` events ([ADR 0007](architecture/adr/0007-allow-list-protocol-pull-handshake.md)). |
| `focusAgent` | the only webview action that reaches the host: reveal (show) an agent's terminal. It never writes to or controls the terminal. |
| monitor | the read-only host code in `src/monitor/` that detects agent sessions and emits agent-state events (M3). |
| source | one input to the monitor: transcript watching, terminal observation, or the simulator (fake agents for demo and tests). |
| allow-list | the only agent fields that may be read, stored, logged, or sent: session id, name, state, tool name, timestamp (Core invariant 7). |
| CSP, nonce | the webview's Content-Security-Policy and the per-load random value that authorizes our single script and style block ([overview](architecture/overview.md#6-security-boundary)). |
| data table | a typed, `readonly` table of game content under `src/game/data/` (enemies, stages, classes, drops, achievements). |
| sprite template, palette | procedural pixel art: palette-indexed character maps in code, rasterized at runtime. No image files (Core invariant 5, [ADR 0003](architecture/adr/0003-procedural-sprites.md)). |
| Extension Development Host | the second VS Code window F5 opens to run the extension under development. Use `--disable-extensions` or a clean profile so unrelated installed extensions do not load beside it. |
| integration test | a test that runs the extension inside a downloaded VS Code via `@vscode/test-electron`, with `--disable-extensions` ([ADR 0006](architecture/adr/0006-node-test-runner.md)). |

## Process

| Term | Meaning |
|---|---|
| invariant, Core invariant | one of the seven non-negotiable rules in `CLAUDE.md`. Only the human may change them; they win over every doc. |
| milestone | one roadmap step (M1-M9), planned, built, tested, reviewed, and committed once ([roadmap](engineering/roadmap.md)). |
| batch | a slice of a milestone with its own art and commit: hero batches H1-H3, enemy batches E1-E5, art batches A0 and U1. |
| plan | the architect's task-level document for one milestone, under `docs/architecture/plans/`. |
| gate | a check every milestone must pass, G1-G7 (build, lint, typecheck, test; generated docs; invariants; no deps or assets; docs; CLAUDE.md sync; review and commit) ([roadmap section 2](engineering/roadmap.md#2-standard-gates-apply-to-every-milestone-and-batch)). |
| ADR | Architecture Decision Record under `docs/architecture/adr/` (Nygard template). Accepted decisions are never edited, only superseded. |
| handoff | the block every agent ends its reply with: done, files, gates, open issues, next agent ([team workflow](engineering/team-workflow.md#3-handoff-block)). |
| owner | the one agent allowed to write a file ([CLAUDE.md ownership table](../CLAUDE.md)). |
