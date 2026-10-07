# ADR 0001: Render the game in a bottom-panel webview view

Purpose: records why Pixel Agents is a `WebviewView` in its own bottom-panel container rather than an editor tab, a sidebar view, or a separate window.
Related: [architecture overview](../overview.md), [ADR 0004 esbuild two bundles](0004-esbuild-two-bundles.md), [security and safety](../security-and-safety.md), [roadmap M1](../../engineering/roadmap.md#m1-scaffold).

## Status

Accepted

## Context

Pixel Agents is ambient: the user glances at it while Claude Code agents work in terminals. It must sit next to the terminals without taking editor space, survive editor layout changes, and be cheap when nobody is looking at it.

Options considered:

- **Editor `WebviewPanel` (a tab)**: competes with source files for editor space and is closed by "close all editors".
- **Sidebar `WebviewView`**: tall and narrow, a poor fit for a 16:9 side-view scene (320x180 internal buffer).
- **Bottom-panel `WebviewView`**: wide and short, shares the panel with the Terminal tab where agents run, and can be dragged elsewhere by the user if they prefer.
- **Status bar only or a native tree view**: cannot render animation.

## Decision

- Contribute a panel view container `pixelAgents` (title "Pixel Agents") under `contributes.viewsContainers.panel`, holding one webview view `pixelAgents.view` registered with `registerWebviewViewProvider`.
- Activation is implicit from the view contribution (VS Code 1.74+); no `*` or `onStartupFinished` activation.
- `retainContextWhenHidden` is **false**. When the view is hidden the webview is destroyed, and when it is shown again the scene is rebuilt from the host's agent list (invariant 4). This keeps memory and CPU at zero while hidden.
- Webview options: `enableScripts: true`, `localResourceRoots` limited to the extension's `dist/` folder, command URIs disabled. The HTML uses a strict CSP with a per-load nonce (details in [ADR 0004](0004-esbuild-two-bundles.md) and the [overview](../overview.md#6-security-boundary)).
- The view container icon must not be an image file (invariant 5). It uses a built-in codicon reference. If VS Code or `vsce` rejects a codicon for a panel container, the developer escalates to the human instead of adding an image file.

## Consequences

- The game is visible next to the terminals it mirrors, and users can move it with standard VS Code view drag-and-drop.
- Because context is not retained, every show is a cold start: the host must be able to send a full agent snapshot on demand (M2 handshake), and the webview must never be the source of truth for anything.
- Game progress cannot live only in webview memory; persisted progress goes to host `globalState` (E1).
- The panel is short. Layout and UI (M7) must fit a small height; integer scaling of the 320x180 buffer may leave letterboxing.
- Panel container icons are rarely displayed, so the codicon choice is low-stakes, but the no-image-file rule is checked by gate G4.

## Implementation notes (M1)

These notes make the decision concrete; they do not change it. Details are in the [M1 plan](../plans/m1-scaffold.md).

- Manifest: `contributes.viewsContainers.panel` entry `{ id: "pixelAgents", title: "Pixel Agents", icon: "$(flame)" }`; `contributes.views.pixelAgents` entry `{ type: "webview", id: "pixelAgents.view", name: "Pixel Agents" }`; `activationEvents: []`; no top-level marketplace `icon` (it would have to be a PNG).
- `engines.vscode` is `^1.90.0` (above the 1.74 floor for implicit activation; its extension host runs Node 20, matching the esbuild host target). `@types/vscode` is pinned to `1.90.0`.
- Webview options also set `enableForms: false`, alongside `enableCommandUris: false`.
- The CSP adds `base-uri 'none'; form-action 'none';` because those directives do not fall back to `default-src` (see the [overview](../overview.md#6-security-boundary)).
