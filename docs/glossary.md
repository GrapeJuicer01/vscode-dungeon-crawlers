# Glossary

Purpose: one-line definitions of the terms used across the Pixel Agents docs, so every agent and contributor means the same thing by "hero", "host", "stage", or "gate". Owned by the architect; extended as milestones add terms.
Related: [docs index](index.md), [CLAUDE.md](../CLAUDE.md), [architecture overview](architecture/overview.md), [host-webview protocol](architecture/host-webview-protocol.md), [agent detection](architecture/agent-detection.md), [game engine](architecture/game-engine.md), [roadmap](engineering/roadmap.md), [team workflow](engineering/team-workflow.md), [art style guide](design/art-style-guide.md).

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
| monitor | the read-only host code in `src/monitor/` that detects agent sessions and emits agent-state events (M3, [agent detection](architecture/agent-detection.md)). |
| source | one input to the monitor: transcript polling, terminal observation (reveal links only), or the simulator (fake agents for demo and tests). |
| allow-list | the only agent fields that may be read, stored, logged, or sent: session id, name, state, tool name, timestamp (Core invariant 7). |
| CSP, nonce | the webview's Content-Security-Policy and the per-load random value that authorizes our single script and style block ([overview](architecture/overview.md#6-security-boundary)). |
| data table | a typed, `readonly` table of game content under `src/game/data/` (enemies, stages, classes, drops, achievements). |
| sprite template, palette | procedural pixel art: palette-indexed character maps in code, rasterized at runtime. No image files (Core invariant 5, [ADR 0003](architecture/adr/0003-procedural-sprites.md)). |
| Extension Development Host | the second VS Code window F5 opens to run the extension under development. Use `--disable-extensions` or a clean profile so unrelated installed extensions do not load beside it. |
| integration test | a test that runs the extension inside a downloaded VS Code via `@vscode/test-electron`, with `--disable-extensions` ([ADR 0006](architecture/adr/0006-node-test-runner.md)). In-host suites are named `*.itest.ts`. |
| provider spy | the integration-test helper that wraps `registerWebviewViewProvider` before activation to observe each `WebviewView` (and, from M2, the webview's messages) without any production hook ([testing strategy](engineering/testing-strategy.md#11-extension-host-integration-runner)). |

## Protocol (M2)

Full contract in [host-webview protocol](architecture/host-webview-protocol.md); rationale in [ADR 0007](architecture/adr/0007-allow-list-protocol-pull-handshake.md).

| Term | Meaning |
|---|---|
| `AgentInfo` | the only agent record on the wire: exactly `id`, `name`, `state`, `toolName`, `timestamp` (the allow-list, Core invariant 7). |
| `ready` | the webview-to-host message `main.ts` sends once per document load (first open, every re-show, every reload) after registering its listener. Asks for snapshots; also the host-observable sign that the webview script ran. |
| snapshot | a full-state message the host sends in answer to `ready`: `config` (a `ConfigSnapshot`), then `agentList`. Authoritative: it replaces whatever the webview had and recovers any lost push. |
| push | an `agentState` message for one agent, sent only while the bridge is `ready`. Best effort; may be dropped while hidden or loading. |
| `PROTOCOL_VERSION` | the protocol's version number (1), carried in `config`. A mismatch makes the message invalid; bumped on any breaking shape change. |
| exact-key validation | the parsing rule on both sides: a plain object with exactly the expected own keys, a known `type`, bounded and pattern-checked fields, else dropped. Parsers never throw and return a new object. |
| creator | a host-side function (`toAgentInfo`, `create*Message`) that builds outgoing messages by copying only allow-listed keys. The only way the host builds a message. |
| `WebviewBridge` | the vscode-free host object in `src/host/webviewBridge.ts` that receives webview messages, answers `ready`, posts pushes, and handles `focusAgent`. |
| bridge state | `detached` (no view), `loading` (view attached or hidden, waiting for `ready`; pushes dropped), `ready` (pushes posted). |
| port | `WebviewPort`, the one-method interface (`postMessage`) through which the bridge posts; `extension.ts` adapts the real `vscode.Webview` to it. |
| reveal capability | `revealAgentTerminal`, the bridge's only outward action: show a live agent's terminal. `null` in M2; from M3 `AgentMonitor.revealAgentTerminal`, which ends in `Terminal.show()` for a linked agent. |
| `HostStateMirror` | the webview's in-memory copy of host state (config and agents), rebuilt from scratch on every load. The M4 `Game` reads it; the webview never writes state back. |
| `assertNever` | the shared exhaustiveness guard in `src/shared/assertNever.ts` that ends every `switch` over a union; its error never includes the value. |
| `src/host/` | host-bundle folder for vscode-free, unit-testable host logic; imports only `src/shared/` ([coding standards section 3](engineering/coding-standards.md#3-bundle-boundaries)). |
| log channel | the single "Pixel Agents" `LogOutputChannel`; fixed reason strings at trace level for drops, `error.name: message` at error level; never payloads. |

## Monitor (M3)

Full contract in [agent detection](architecture/agent-detection.md); rationale in [ADR 0005](architecture/adr/0005-transcript-watching.md).

| Term | Meaning |
|---|---|
| transcript | the JSONL file Claude Code appends to for one session, `<root>/<project dir>/<session uuid>.jsonl`. Read-only input; only five fields are derived from it. |
| transcript root | the directory the monitor reads: `pixelAgents.transcriptPath`, or `~/.claude/projects` by default. Resolved with `realpath`; nothing below it is followed through a symbolic link. |
| project directory | a directory under the root named by encoding a working directory (every character outside `[A-Za-z0-9]` becomes `-`). |
| project scope | which project directories are read: `workspace` (this window's folders, default) or `all` (every project on the machine). |
| poll | one pass of the transcript source: `lstat` tracked files, read appended bytes (bounded), classify complete lines, evaluate silence thresholds. Polls never overlap. |
| signal | the fixed result of classifying one transcript line: `prompt`, `assistant`, `toolUse` (with a tool name), `toolResult`, `turnEnd`, `ignored`, or `unparseable`. Carries no transcript text. |
| session state machine | the pure reducer that turns signals and silence into `spawned`, `working`, `idle`, `despawned` for one transcript session. |
| silence | time since a session's last activity signal; compared with the idle, tool, and session-end timeouts. |
| coalescing | the registry rule that emits at most one agent-state event per agent per `debounceMs`, always the latest; `spawned` and `despawned` go out immediately. |
| registry | `AgentRegistry`: the monitor's live agent records, the `AgentInfo` snapshot behind `getAgents()`, and the per-origin agent caps. |
| terminal link | the monitor's association of a session with the terminal that was active when the session appeared; used only to reveal. |
| simulated agent | a fake agent from `SimulatorSource`: id `sim-<slot>-<generation>`, name `Sim <Name>`. In `auto` mode only while no real session exists. |
| port (monitor) | a narrow interface the monitor core depends on (`ReadOnlyFileSystem`, `PathOps`, `Clock`, `TimerPort`, `TerminalPort`, `MonitorLogger`), implemented by an adapter. |
| adapter | a file under `src/monitor/adapters/`, the only monitor code allowed to import Node built-ins or `vscode`. |
| `safeErrorCode` | the only way monitor code describes an error: `error.code` or `error.name`, never the message or stack. |

## Engine (M4)

Full design in [game engine](architecture/game-engine.md) and [data model](architecture/data-model.md); rationale in ADRs [0008](architecture/adr/0008-dom-free-engine-behind-ports.md), [0009](architecture/adr/0009-hero-lifecycle-isolation.md), [0010](architecture/adr/0010-split-room-stage-layout.md).

| Term | Meaning |
|---|---|
| lifecycle | the one fact a hero stores about its agent: `spawned`, `working`, `idle`, or `despawned`. Changed only by `Hero.applyAgentState`, called only from `Roster`, fed by host events. |
| phase | a hero's cosmetic animation state (`warpIn`, `standby`, `travel`, `advance`, `attack`, `rest`, `victory`, `warpOut`), derived from lifecycle and timers. Never feeds back into lifecycle. |
| `Game` | the engine facade: event queue, fixed-step loop, render, `heroSnapshot`. DOM-free, has no host channel. |
| `Roster` | the engine's hero map; applies host events and snapshots and decides when a hero is removed. |
| `Surface`, `BitmapFactory` | the two ports through which the engine draws and creates bitmaps; implemented over canvas 2D in `src/webview/canvasSurface.ts`. |
| `GameHost` | the webview-side loop driver: schedules frames, pauses when hidden, reports errors. |
| `SceneFeed` | the webview `HostMessageTarget` that updates the `HostStateMirror` and queues the same events into the engine. |
| fixed step | the engine updates in 1/60 s steps from an accumulator (at most 5 per frame); rendering is not interpolated. |
| quarantine | what the engine does to an entity that throws three times in a row: freeze it (no update), keep it listed, report once. It is never removed for a fault. |
| instant rebuild | creating heroes from a snapshot directly in their lifecycle's place, with no warp-in; used on reload. |
| alcove, corridor | the two halves of a stage's room: the static campfire room (x 0-127) and the scrolling dungeon corridor (x 144-319), split by a door column ([ADR 0010](architecture/adr/0010-split-room-stage-layout.md)). |
| formation slot, seat | a hero's stable position index in the corridor (while working) and around the campfire (while idle). |
| engagement | the party rhythm that decides when the corridor scrolls (advance) and when working heroes attack (engage); timed in M4, enemy-driven from E1. |
| strip | a pre-rendered offscreen bitmap of a stage's static wall and floor (alcove 128x180, corridor segment 384x180). |
| light map | the 80x45 offscreen buffer that holds ambient plus light sources and is multiplied onto the environment. |
| `ArtSet` | the bundle of palettes, templates, and sprite data the engine is constructed with. |
| A0 | the first art batch: master palette, base hero, campfire, Stage 1 environment. |

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
