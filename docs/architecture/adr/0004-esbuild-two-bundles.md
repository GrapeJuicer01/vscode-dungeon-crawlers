# ADR 0004: Build with esbuild into two bundles (host CJS, webview IIFE)

Purpose: records the build tool, the two-bundle split, and the import rules that keep the extension host and the webview from depending on each other.
Related: [architecture overview](../overview.md), [coding standards](../../engineering/coding-standards.md#3-bundle-boundaries), [ADR 0001 bottom-panel webview](0001-bottom-panel-webview.md), [ADR 0003 procedural sprites](0003-procedural-sprites.md), [host-webview protocol](../host-webview-protocol.md), [M1 plan](../plans/m1-scaffold.md).

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
