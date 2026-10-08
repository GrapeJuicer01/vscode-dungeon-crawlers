# ADR 0004: Build with esbuild into two bundles (host CJS, webview IIFE)

Purpose: records the build tool, the two-bundle split, and the import rules that keep the extension host and the webview from depending on each other.
Related: [architecture overview](../overview.md), [coding standards](../../engineering/coding-standards.md#3-bundle-boundaries), [ADR 0001 bottom-panel webview](0001-bottom-panel-webview.md), [ADR 0003 procedural sprites](0003-procedural-sprites.md), [host-webview protocol](../host-webview-protocol.md), [ADR 0007 allow-list protocol](0007-allow-list-protocol-pull-handshake.md), [ADR 0005 transcript watching](0005-transcript-watching.md), [M1 plan](../plans/m1-scaffold.md), [M2 plan](../plans/m2-protocol.md), [M3 plan](../plans/m3-monitor.md).

## Status

Accepted

## Context

The extension runs code in two unrelated environments:

- the **extension host**: Node.js inside VS Code, with the `vscode` API, loaded with `require` (CommonJS);
- the **webview**: a sandboxed Chromium iframe with DOM and canvas, no Node, no `vscode` module, loaded by a single `<script nonce>` tag.

They share only message types (`src/shared/protocol.ts`). Core invariant 6 forbids runtime dependencies, so whatever we ship is our own code, bundled. We need fast rebuilds for F5 iteration and a strict typecheck, without a heavy toolchain.

Options considered: `tsc` only (no bundling, multiple files to load in the webview, CSP needs one nonce per script), webpack (slow, large config, many devDependencies), Rollup or Vite (more plugins and devDependencies than needed), esbuild (single devDependency, very fast, native TS stripping, CJS and IIFE output).

## Decision

- **esbuild** builds two bundles from one script, `esbuild.mjs`:
  - **host**: entry `src/extension.ts`, `platform: 'node'`, `format: 'cjs'`, `target: 'node20'`, `external: ['vscode']`, output `dist/extension.js` (the `main` in `package.json`).
  - **webview**: entry `src/webview/main.ts`, `platform: 'browser'`, `format: 'iife'`, `target: 'es2022'`, output `dist/webview.js`, loaded via `asWebviewUri`.
  - Flags: `--watch` (incremental, used by F5), `--production` (minify, no sourcemaps). Development builds emit sourcemaps.
- **esbuild does not typecheck.** `tsc --noEmit` runs separately (`npm run typecheck`) over three tsconfigs that share strict base options:
  - `tsconfig.json` (host): `src/extension.ts`, `src/monitor/**`, `src/shared/**`, `src/webview/index.html.ts`; `lib: ES2022`, types `node` and `vscode`, no DOM.
  - `tsconfig.webview.json` (webview): `src/webview/**` (except `index.html.ts`), `src/game/**`, `src/shared/**`; `lib: ES2022, DOM`, no Node or `vscode` types.
  - `tsconfig.tools.json`: `test/**`, `scripts/**`, root `*.mjs`/`*.ts` config files; Node types.
- **Boundary rules**, enforced by both tsconfig `lib`/`types` and ESLint `no-restricted-imports`:
  - `src/shared/**` imports nothing from `vscode`, Node built-ins, or other `src/` folders. It is pure types, constants, and validators.
  - Webview code (`src/webview/**` except `index.html.ts`, and `src/game/**`) never imports `vscode`, Node built-ins, `src/monitor/**`, or `src/extension.ts`.
  - Host code (`src/extension.ts`, `src/monitor/**`) never imports `src/game/**` or webview runtime files. It may import `src/webview/index.html.ts`, which is a pure host-side function that returns the HTML string.
- `npm run package` runs `vsce package --no-dependencies`; `vscode:prepublish` runs the production build.

## Consequences

- One devDependency does all bundling; full rebuilds take well under a second, so F5 with `npm run watch` stays fast.
- Because the `vscode` module exists only as types, an accidental webview import of `vscode` fails to bundle, a second guard on top of lint and typecheck.
- Two typecheck passes (three with tools) cost a little CI time; this is accepted for the type-level boundary.
- The webview is one IIFE file, so the CSP needs exactly one script nonce and no `unsafe-eval` or `unsafe-inline`.
- Tests compile with the same esbuild transform (see the tester's [testing strategy](../../engineering/testing-strategy.md)), so there is no second TypeScript pipeline to drift.
- `src/webview/index.html.ts` lives in the webview folder (CLAUDE.md layout) but belongs to the host bundle; this exception is named in the lint config and in [coding standards](../../engineering/coding-standards.md#3-bundle-boundaries).

## Implementation notes (M1)

These notes make the decision concrete; they do not change it. Details are in the [M1 plan](../plans/m1-scaffold.md).

- The shared strict options live in `tsconfig.base.json`; `tsconfig.json`, `tsconfig.webview.json`, and `tsconfig.tools.json` extend it. `tsconfig.tools.json` sets `allowJs` and `checkJs` so root `*.mjs` files and `test/run.mjs` are typechecked.
- A non-watch build deletes `dist/` first so stale sourcemaps never reach the package; `.vscodeignore` also excludes `**/*.map`.
- Development sourcemaps differ per bundle: the host bundle emits an external `dist/extension.js.map`; the webview bundle uses `sourcemap: 'inline'`. Under the webview CSP (`default-src 'none'`, no `connect-src`), DevTools fetching an external `dist/webview.js.map` is reported as a CSP connect violation; an inline map needs no fetch, so the CSP stays unchanged. Production builds emit no sourcemap for either bundle, so the inline map never ships.
- ESLint typed linting lists the three tsconfigs explicitly in `parserOptions.project`; `projectService` would resolve every file to the host `tsconfig.json`.
- The editor's TypeScript server only discovers `tsconfig.json`, so webview files get an inferred project in the editor. CI typecheck is authoritative.
- The test runner is `node:test` with esbuild-compiled tests ([ADR 0006](0006-node-test-runner.md)).
- `npm run package` is `vsce package --no-dependencies --allow-missing-repository --no-rewrite-relative-links` until a `repository` field exists; without one, `vsce` rejects the README's relative links. Both flags are removed once a repository URL exists.
- CI's package-contents check runs `npx vsce ls --no-dependencies`; `vsce ls` in vsce 4.0.0 does not accept `--allow-missing-repository` and does not prompt for a repository.

## Implementation notes (M2)

These notes apply the decision to the M2 folders; they do not change it. Details are in the [M2 plan](../plans/m2-protocol.md).

- **New host folder `src/host/`.** Vscode-free host logic (first file: `webviewBridge.ts`). It is host code in the sense of this ADR: bundled into `dist/extension.js` through `src/extension.ts`, added to `tsconfig.json` `include`, and never included by `tsconfig.webview.json`. It is stricter than other host code: it imports only `src/shared/**` (no `vscode`, no Node built-ins), so it typechecks and unit tests without a `vscode` stub ([ADR 0007](0007-allow-list-protocol-pull-handshake.md) consequences). ESLint gets a `src/host/**` boundary block, and `src/host/**` joins the ban lists of the `src/shared/**` block and the webview-and-game block.
- **`src/shared/` gains its first files**: `protocol.ts` and `assertNever.ts`. Both bundles import them, and each bundle gets its own copy at build time; that duplication is small and expected.
- **New webview modules** `hostChannel.ts`, `hostMessages.ts`, `hostState.ts` are webview-bundle files under the existing `src/webview/**` rule. They stay DOM-free so tests can import them; only `main.ts` touches the DOM and `acquireVsCodeApi`.
- **Bundle checks.** `dist/webview.js` must not contain host-only code (`WebviewBridge`, `onDidReceiveMessage`), and `dist/extension.js` must not contain `acquireVsCodeApi`; the tester's bundle suite asserts this on the development build, where names are not minified.
- **Unchanged**: entry points, formats, targets, externals, the CSP, and the sourcemap modes (external for the host, inline for the webview in development, none in production). The webview is still one IIFE loaded by one nonce-bearing script tag.

## Implementation notes (M3)

These notes apply the decision to the monitor; they do not change it. Details are in the [M3 plan](../plans/m3-monitor.md) and [agent detection](../agent-detection.md#2-components).

- **`src/monitor/` splits into a core and adapters.** Core files (`src/monitor/*.ts`) are host code that imports only `src/shared/**` and sibling core files: no `vscode`, no Node built-ins, no `src/host/**`, no adapters. Adapters (`src/monitor/adapters/`) are the only monitor files that import Node (`nodeFileSystem.ts`: `node:fs/promises`, `node:fs`, `node:os`; `nodeRuntime.ts`: `node:path`) or `vscode` (`vscodeTerminals.ts`, type-only). `extension.ts` builds the adapters and injects them, so the core is unit tested like `src/host/`. ESLint gets three blocks for these, placed after the host block because a later block's `no-restricted-imports` replaces an earlier one for the same file.
- **Still host-only.** Everything under `src/monitor/` is bundled into `dist/extension.js` (already in `tsconfig.json` `include`); `src/host/**`, `src/webview/**`, and `src/game/**` must not import it. The bundle suite asserts `dist/webview.js` contains no monitor code.
- **Unchanged**: entry points, formats, externals (the adapters use only Node built-ins and `vscode`), the CSP, and sourcemap modes.
