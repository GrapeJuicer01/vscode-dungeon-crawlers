# CLAUDE.md: Pixel Agents

Purpose: orientation for Claude Code and its subagents. Read this first. `SPEC.md` (if present) is the original brief and may be outdated: if it disagrees with `docs/`, the docs win. The core invariants below always win.
Related: [team workflow](docs/engineering/team-workflow.md), [coding standards](docs/engineering/coding-standards.md), [testing strategy](docs/engineering/testing-strategy.md), [game engine](docs/architecture/game-engine.md), [docs index](docs/index.md).

## Project summary

A VS Code extension that adds a bottom-panel Webview tab, "Pixel Agents". It renders an animated 2D pixel-art dungeon crawler. Each active Claude Code agent session is a hero who fights through 10 biomes against 50 enemy types while the agent works, and rests at a campfire while it is idle.

## Core invariants (never violate; escalate to the human if a task seems to require it)

Only the human may edit this section. No agent adds, removes, or weakens an invariant.

1. **Heroes are invulnerable.** No HP, mana, damage intake, death, "downed", or "retreat when hurt" anywhere. No gauges on heroes. Enemy attacks are cosmetic only (flash, stagger, knockback). Only enemies have health.
2. **Hero lifecycle comes ONLY from host agent-state events** (`spawned`, `working`, `idle`, `despawned`). No combat, boss, stage, or game-loop event may change a hero's state or despawn it.
3. **The monitor is strictly read-only.** It never writes to, signals, kills, or sends input to any process or terminal. No protocol message may control, stop, or modify a real agent session. `focusAgent` only reveals a terminal.
4. **A game crash must never affect agents.** The update loop is wrapped in try/catch. On webview reload the scene is rebuilt from the host's agent list.
5. **No external image or audio files.** Sprites are procedural palette-indexed pixel maps in code. Audio is Web Audio.
6. **No runtime dependencies.** esbuild and @types/vscode only. Dev-only tooling (ESLint, Prettier, markdownlint, a test runner, vsce) is allowed. Ask the human before adding anything else.
7. **Transcript privacy.** The monitor reads transcripts only to extract session id, name, state, tool name, and timestamp. Transcript content is never stored, logged, or sent anywhere.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | install dependencies |
| `npm run build` | bundle host (Node, CommonJS) and webview (browser, IIFE) |
| `npm run watch` | rebuild on change |
| `npm run package` | produce the `.vsix` with `vsce` |
| `npm run lint` / `format` | ESLint / Prettier |
| `npm run typecheck` | strict `tsc -p` over `tsconfig.json`, `tsconfig.webview.json`, `tsconfig.tools.json` |
| `npm run test` | unit, structural, and bundle tests (`node:test`); run `build` first |
| `npm run test:integration` | run the extension in a downloaded VS Code (`@vscode/test-electron`, `--disable-extensions`); run `build` first; headless Linux needs `xvfb-run -a` |
| `npm run docs:tables` | regenerate enemy and class tables in docs from source data (from H1) |
| F5 | launch the Extension Development Host (`.vscode/launch.json`); for manual checks use `--disable-extensions` or a clean profile, since an unrelated marketplace extension is also named "Pixel Agents" |

## Directory map

```text
src/extension.ts            activation, view provider (thin vscode glue); output channel, bridge wiring (M2);
                            monitor adapters, settings and workspace listeners, reveal wiring (M3); commands, status bar (M7)
src/host/                   (M2) vscode-free host logic, imports only src/shared/: webviewBridge.ts (M2),
                            progress store (E1)
src/monitor/                (M3) vscode- and Node-free core, imports only src/shared/: AgentMonitor, AgentRegistry,
                            sessionMachine, Transcript/Terminal/Simulator sources, ports, config, paths, logging
src/monitor/adapters/       (M3) the only monitor files touching Node or vscode: nodeFileSystem (read-only fs),
                            nodeRuntime (clock, timers, path), vscodeTerminals (terminal events, show() only)
src/shared/                 (M2) both bundles, imports nothing outside src/shared/: protocol.ts (typed
                            host <-> webview messages, validators, creators), assertNever.ts
src/webview/                index.html.ts (host-side HTML + CSP builder), main.ts (boot; message pump M2; builds the
                            engine M4); hostChannel.ts, hostMessages.ts, hostState.ts (M2); sceneFeed.ts, gameHost.ts
                            (DOM-free), canvasSurface.ts (the only canvas adapter) (M4); ui.ts (M7), audio.ts (M8)
src/game/                   (M4) DOM-free, clock-free engine (ADR 0008): ports, layout, rng, Game, Roster, Engagement,
                            Renderer, Camera, Lighting, Pathfinding, Collision, Particles, Ambience, Stage; Effects (H1, cosmetic
                            effect pool); Combat (E1)
src/game/entities/          (M4) Entity (guard), Hero, Campfire, Prop; ClassHero + createHero (H1, data-driven: the
                            12 classes are rows, subclass files only where code is needed), Summon (H2), Enemy, Boss (E1)
src/game/data/              (M4) stages, animations, tuning; classes, classMap (classFor(id)), effects (H1); enemies,
                            drops (E1); achievements (M7)
src/game/sprites/           (M4) art (pixel-artist, A0): palettes, spriteTemplates (aggregator), spriteTypes,
                            spriteBuilder (Grid, seeded, staticTemplate, loopTemplate), heroTemplates,
                            campfireTemplates, stage1Templates; engine (developer): spriteFactory,
                            spriteValidator, artSet (SHIPPED_ART glue)
scripts/                    (H1) generate-doc-tables.ts + docs-tables.mjs (esbuild runner behind `npm run docs:tables`)
test/                       node:test suites (*.test.ts) + run.mjs (esbuild-compiles to out/test); game/ engine suites
                            incl. the hero-invariant test (M4);
                            support/ helpers and fakes (fakeVscode, fakeDom; monitor fakes from M3; engine fakes M4);
                            fixtures/transcripts/ synthetic JSONL only, never real transcripts (M3)
test/integration/           extension-host suites (*.itest.ts) + run.mjs (@vscode/test-electron,
                            --disable-extensions); support/ in-host harness and providerSpy
tools/                      (optional, none yet) dev-only sprite preview (never shipped)
docs/                       architecture/ (incl. adr/, plans/) design/ engineering/ + index, glossary; development/ (M9)
.claude/agents/             architect, developer, tester, reviewer, pixel-artist
.github/                    workflows (ci, release), issue templates, PR template, CODEOWNERS
.vscode/                    launch.json (F5), tasks.json, extensions.json, settings.json
(root)                      package.json, esbuild.mjs, tsconfig.base/json/webview/tools, eslint.config.mjs,
                            .prettierrc.json, .markdownlint-cli2.jsonc, .vscodeignore, .nvmrc, .editorconfig
dist/, out/                 build and test output (git-ignored; only dist/*.js ships)
.vscode-test/               VS Code downloaded by @vscode/test-electron (git-, package-, and lint-ignored)
```

## Code conventions

- TypeScript strict. No `any` without a comment saying why. No placeholders, "TODO: implement", "TBD", or elided code.
- Game content lives in typed data tables. The 50 enemies come from a compact table plus per-stage scaling formulas, not 50 hand-written objects. The enemy table is validated at startup (50 unique ids, 5 per stage, exactly one boss per stage).
- Persisted progress (`globalState`) carries a schema version and migrations.
- Every threshold is configurable under `contributes.configuration` (`pixelAgents.*`).
- Ambiguity: pick a sensible default, state the assumption in a code comment or the relevant doc, continue.
- Git: `main` default, trunk-based, short-lived `feat/*`, `fix/*`, `docs/*` branches, Conventional Commits.
- Docs: Markdown in `docs/`. Every doc starts with a purpose line and links to related docs. Relative links, Mermaid for diagrams, text/ASCII wireframes instead of screenshots.

## Who owns what

| Agent | Writes | Never writes |
|---|---|---|
| architect | `docs/architecture/**` (incl. ADRs), `docs/index.md`, `docs/glossary.md`, `docs/engineering/{coding-standards,team-workflow,roadmap}.md`, and this file (except the Core invariants section) | source code, tests |
| pixel-artist | in `src/game/sprites/`: `palettes.ts`, `spriteTemplates.ts`, `spriteTypes.ts`, `spriteBuilder.ts`, `heroTemplates.ts`, `campfireTemplates.ts`, `stage1Templates.ts` (and later per-subject template files), `docs/design/art-style-guide.md`, `docs/design/sprite-spec.md`, optional preview under `tools/` | engine code |
| developer | all other `src/**`, `scripts/`, repo config, `.github/`, README, CONTRIBUTING, CHANGELOG, remaining docs, and **all git operations** | tests, architect- and artist-owned files |
| tester | `test/**`, `docs/engineering/testing-strategy.md`, the `test` and `test:integration` scripts (runner is built-in `node:test`, ADR 0006, so no runner devDependency; `@vscode/test-electron` is a launcher whose pin the developer owns) | production code |
| reviewer | nothing (read-only) | everything |

Agent definitions in `.claude/agents/` are owned by the human.

## Definition of done

- `npm run lint`, `typecheck`, `test`, and `build` pass; `npm run docs:tables` leaves no diff (from H1).
- Invariants intact; the hero-invariant test passes.
- Matching docs updated in the same change (protocol, data tables, classes, config), plus a `CHANGELOG.md` entry.
- This file's directory map, commands, and ownership table still match the repo; the milestone is ticked off in `docs/engineering/roadmap.md` after its commit.
- Reviewer verdict is Approve, with no open Critical findings.
- Committed with a Conventional Commit message on a branch.

## Handoffs

Every agent ends its reply with a **Handoff** block: what was done, files touched, gate results, open issues, and who goes next.
