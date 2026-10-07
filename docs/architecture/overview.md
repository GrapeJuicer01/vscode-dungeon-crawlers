# Architecture overview

Purpose: the big picture of Pixel Agents: what it talks to, what runs where, how data flows, and which boundaries keep agents safe from the game. Start here before reading any other architecture doc.
Related: [CLAUDE.md](../../CLAUDE.md), [docs index](../index.md), [glossary](../glossary.md), [roadmap](../engineering/roadmap.md), [coding standards](../engineering/coding-standards.md), ADRs [0001](adr/0001-bottom-panel-webview.md), [0002](adr/0002-no-hero-health.md), [0003](adr/0003-procedural-sprites.md), [0004](adr/0004-esbuild-two-bundles.md), [0006](adr/0006-node-test-runner.md), [0007](adr/0007-allow-list-protocol-pull-handshake.md); plans: [M1 scaffold](plans/m1-scaffold.md), [M2 protocol](plans/m2-protocol.md); [host-webview protocol](host-webview-protocol.md), [security and safety](security-and-safety.md); planned: [agent detection](agent-detection.md) (M3), [game engine](game-engine.md) (M4), [data model](data-model.md) (M4).

## 1. What it is

A VS Code extension that adds a bottom-panel webview view, "Pixel Agents". Every active Claude Code session appears as a pixel-art hero. While the agent works, the hero fights through dungeon stages; while it is idle, the hero rests at a campfire; when the session ends, the hero warps out. The extension only **observes** agents. It never controls them.

## 2. System context

```mermaid
flowchart LR
  user([Developer using VS Code])
  subgraph vscode[VS Code]
    ext[Pixel Agents extension]
    term[Integrated terminals]
    state[(globalState)]
  end
  cc[Claude Code sessions]
  tx[(Claude Code transcript files on disk)]

  user -- watches panel, clicks hero --> ext
  cc -- run in --> term
  cc -- append to --> tx
  ext -. reads allow-listed fields only .-> tx
  ext -. observes presence, reveals on click .-> term
  ext -- saves game progress --> state
```

Dotted arrows are read-only observation. The extension never writes to transcripts, never sends input to a terminal, and never signals a process (Core invariant 3). The only terminal action is `focusAgent`, which reveals (shows) a terminal.

## 3. Containers

```mermaid
flowchart TB
  subgraph host[Extension host bundle: dist/extension.js, Node CJS]
    ext[extension.ts<br/>activation, view provider,<br/>commands, status bar]
    mon[monitor/<br/>AgentMonitor + Transcript, Terminal,<br/>Simulator sources]
    html[webview/index.html.ts<br/>HTML + CSP builder]
    store[progress store<br/>globalState, schema + migrations]
  end
  shared[[shared/protocol.ts<br/>message types + validators]]
  subgraph web[Webview bundle: dist/webview.js, browser IIFE]
    main[webview/main.ts<br/>boot, message pump]
    ui[webview/ui.ts<br/>overlay UI]
    audio[webview/audio.ts<br/>Web Audio synth]
    game[game/<br/>Game, Renderer, Camera, Lighting,<br/>Pathfinding, Collision, Particles, Combat]
    ent[game/entities/<br/>Hero + classes, Enemy, Boss,<br/>Campfire, Summon]
    data[game/data/<br/>typed tables]
    spr[game/sprites/<br/>palettes, templates, factory]
  end

  mon -- agent-state events --> ext
  ext -- builds HTML via --> html
  ext <-- postMessage --> main
  ext --> store
  ext -. imports types .-> shared
  main -. imports types .-> shared
  main --> game
  main --> ui
  main --> audio
  game --> ent
  game --> data
  ent --> spr
```

| Container | Runs in | Responsibility | Arrives in |
|---|---|---|---|
| `src/extension.ts` | host | activate, register the view provider, own disposables; later route messages, wire the monitor, status bar, commands | M1, grows in M2, M3, M7 |
| `src/webview/index.html.ts` | host | pure function: build the webview HTML and CSP from a nonce and the script URI | M1 |
| `src/shared/protocol.ts` | both | message unions, `AgentState`, `AgentInfo`, runtime validators; no imports from anywhere else | M2 |
| `src/monitor/` | host | read-only agent detection; emits `spawned`, `working`, `idle`, `despawned` | M3 |
| `src/webview/main.ts` | webview | boot the canvas, send `ready`, dispatch host messages to the game | M1 (blank canvas), M2, M4 |
| `src/game/**` | webview | the dungeon simulation and renderer | M4 onward |
| `src/webview/ui.ts`, `audio.ts` | webview | overlay UI; synthesized sound | M7, M8 |

## 4. Data flow

1. A source in the monitor observes a session change (transcript append, terminal open or close, or a simulator tick).
2. `AgentMonitor` debounces and normalizes it into an agent-state event holding only id, name, state, tool name, and timestamp (Core invariant 7).
3. `extension.ts` posts the event to the webview if the view is alive. If the view is hidden, nothing is sent; the snapshot on the next `ready` covers it.
4. `main.ts` validates the message shape and hands it to `Game`, which updates the matching hero. Only these events change hero state (Core invariant 2, [ADR 0002](adr/0002-no-hero-health.md)).
5. The webview may send `ready` (request a snapshot) and `focusAgent` (reveal a terminal). The host validates both and drops anything else.

## 5. Boundaries that protect agents

- **Read-only monitor.** No code path writes to, signals, kills, or sends input to a process or terminal. Enforced by review and, from M3, a grep test.
- **One-way state.** Hero state flows host to webview only. Nothing the game does can reach the monitor or a session.
- **Crash isolation.** The webview update loop is wrapped in try/catch (from M4). A webview crash or reload cannot affect the host; on reload the scene is rebuilt from the host's agent list (Core invariant 4).
- **Bundle boundary.** Host and webview never import each other's runtime code; they share only `src/shared/` ([ADR 0004](adr/0004-esbuild-two-bundles.md)).

## 6. Security boundary

- Webview CSP (built in `index.html.ts`, from M1):
  `default-src 'none'; script-src 'nonce-<N>'; style-src 'nonce-<N>'; base-uri 'none'; form-action 'none';`
  No `unsafe-inline`, no `unsafe-eval`, no `img-src`, `font-src`, `media-src`, or `connect-src`. `base-uri` and `form-action` are explicit because they do not fall back to `default-src`. The nonce alone authorizes the single bundle script loaded from `asWebviewUri`, so the webview's `cspSource` is not needed. The nonce is 16 or more random bytes from the host, base64-encoded, regenerated per HTML load. Styles set through the CSSOM from script (for example `canvas.style.width`) are not blocked by this policy; inline `style="..."` attributes in the HTML are not used.
- `localResourceRoots` is only the extension's `dist/` folder. All resources load through `asWebviewUri`. Webview options also disable command URIs and forms.
- No external images, fonts, or audio exist ([ADR 0003](adr/0003-procedural-sprites.md)), so the CSP needs no extra sources.
- Full threat model in [security and safety](security-and-safety.md).

## 7. Current state (M1)

After M1 the host bundle registers the view and serves the HTML; the webview bundle draws a blank, integer-scaled canvas. There is no protocol, monitor, or game yet, and no message channel in either direction: the webview does not call `acquireVsCodeApi` and the host registers no message handler. Tests run on Node's built-in `node:test` ([ADR 0006](adr/0006-node-test-runner.md)); integration tests run the extension in a downloaded VS Code via the dev-only `@vscode/test-electron` launcher with `--disable-extensions` (ADR 0006 amendment). In development builds the webview bundle carries an inline sourcemap so DevTools never fetches a `.map` under the CSP ([ADR 0004 implementation notes](adr/0004-esbuild-two-bundles.md#implementation-notes-m1)). Rows in the table above show when each container arrives; the task-level plan is [M1 scaffold](plans/m1-scaffold.md).
