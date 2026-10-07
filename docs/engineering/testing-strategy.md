# Testing strategy

Purpose: how Pixel Agents is tested: the unit runner and the extension-host integration runner, the folder layout, the test pyramid, what each suite covers and when it arrives, the hero-invariant and simulation integration tests, the manual QA checklist, and the performance benchmarks. Owned by the tester.
Related: [CLAUDE.md](../../CLAUDE.md), [ADR 0006 test runner](../architecture/adr/0006-node-test-runner.md), [ADR 0004 esbuild two bundles](../architecture/adr/0004-esbuild-two-bundles.md), [coding standards](coding-standards.md), [team workflow](team-workflow.md), [roadmap](roadmap.md), [M1 plan](../architecture/plans/m1-scaffold.md), [architecture overview](../architecture/overview.md), [security and safety](../architecture/security-and-safety.md), [docs index](../index.md).

## 1. Runner

Tests use Node's built-in `node:test` and `node:assert/strict`. No test-runner package is installed, so invariant 6 holds without an exception ([ADR 0006](../architecture/adr/0006-node-test-runner.md)). Node 22 (`.nvmrc`) is the runtime.

`npm run test` runs `node test/run.mjs`, which:

1. Finds every `test/**/*.test.ts`. Finding none is a failure.
2. Bundles each file with esbuild (`platform: 'node'`, `format: 'cjs'`, `target: 'node22'`, inline sourcemaps) into `out/test/`, mirroring the `test/` layout. This is the same transform that builds the shipped bundles, so there is no second TypeScript pipeline. A compile error fails the run.
3. Aliases the `vscode` module to the in-memory fake in `test/support/fakeVscode.ts`, so thin host code such as `src/extension.ts` is unit tested without an extension host.
4. Runs the bundles through `node:test`'s `run()` and prints them with the `spec` reporter.
5. Sets exit code 1 on any failed test, crashed file, or compile error.

Rules for test code:

- Tests read repo files relative to the repo root (`process.cwd()`), never absolute paths. Helpers live in `test/support/repo.ts`.
- `describe` and `it` return promises that the runner tracks. Top-level and nested calls are written `void describe(...)` and `void it(...)` to satisfy `@typescript-eslint/no-floating-promises`.
- Tests assert behavior and contracts, not implementation details. An assertion is never deleted, skipped, or loosened to get green; a failure is either a test bug (fixed by the tester) or a code bug (reported to the developer).
- Tests are type-checked by `tsconfig.tools.json` and linted like production code.

The bundle, package, and webview `main` suites read `dist/`, so run `npm run build` before `npm run test`. CI and every gate run do this. The bundle suite fails with an explicit message if `dist/` is missing or older than `src/`. The sourcemap suite never touches the repo's `dist/`: it runs `esbuild.mjs` in temp directories (whose `src` is a symlink to the repo's), so `dist/` stays the development build that F5 and the integration tests load.

### 1.1 Extension-host integration runner

The human approved `@vscode/test-electron` (exact-pinned, dev-only; [ADR 0006 amendment](../architecture/adr/0006-node-test-runner.md#amendment-m1-review-extension-host-integration-tests)). `npm run test:integration` runs `node test/integration/run.mjs`, which:

1. Fails unless `dist/extension.js` and `dist/webview.js` exist and are newer than `src/` (run `npm run build` first, exactly as F5 does).
2. Bundles `test/integration/suite/index.ts` with esbuild (`platform: 'node'`, `format: 'cjs'`, `vscode` external) into `out/integration/index.js`.
3. Downloads VS Code into `.vscode-test/` on the first run (network needed; later runs reuse the cache) and launches it with `--disable-extensions`, a fresh temp `--user-data-dir` and `--extensions-dir`, and an empty temp workspace. Only the development build of Pixel Agents loads; the unrelated marketplace extension `pablodelucca.pixel-agents` (also displayed as "Pixel Agents") cannot. The temp profile is deleted afterwards.
4. Exits 1 if the build is stale, the suite fails to compile, or any test fails.

Inside the Extension Development Host, `node:test`'s `run()` cannot work (it spawns `process.execPath`, which there is Electron without the `vscode` module). So the suite uses a minimal in-host harness, `test/integration/support/harness.ts`, with the same `describe` / `it` shape and `node:assert/strict`. It runs tests in registration order (the lazy-activation checks must run before anything opens the view), applies a per-test timeout, prints a TAP-style report, and rejects if any test failed or none ran. No mocha or other runner is installed.

Observation without production hooks: the extension host gives one `vscode` API object per extension, chosen by the requiring file's path. The suite is compiled into `out/integration/`, inside the extension development path, so it shares the extension's API object. `test/integration/support/providerSpy.ts` wraps `window.registerWebviewViewProvider` before activation and forwards every call unchanged, which lets the suite see the registration options, each `WebviewView`, the HTML as served, visibility changes, and disposal.

Options:

- `PIXEL_AGENTS_VSCODE_VERSION` selects the VS Code build (default `stable`; `1.90.0` tests the `engines.vscode` minimum).
- Electron needs a display. macOS and Windows need nothing; headless Linux (CI) runs `xvfb-run -a npm run test:integration`.
- If a VS Code terminal exported `ELECTRON_RUN_AS_NODE`, the launcher removes it so Electron does not start as plain Node.

In-host test files are named `*.itest.ts`, never `*.test.ts`, because `test/run.mjs` collects every `*.test.ts` and would run them against the fake `vscode` module.

## 2. Folder layout

```text
test/
  run.mjs                 runner (section 1)
  support/                shared helpers, not tests
    repo.ts               repo-relative file reading and walking
    fakeVscode.ts         in-memory `vscode` module for host unit tests
    fakeDom.ts            fake window/document/canvas; runs dist/webview.js in a node:vm context
  host/                   host code against the fake vscode module (mirrors src/extension.ts)
  webview/                unit tests mirroring src/webview/
  repo/                   structural and repo checks: manifest, assets, ignore files, source scans
  build/                  checks on dist/, on both build modes, and on the packaged file list
  integration/            extension-host tests (section 1.1), not run by `npm run test`
    run.mjs               launcher: build check, esbuild, @vscode/test-electron
    support/              in-host harness and the provider spy
    suite/                index.ts (entry VS Code calls) and *.itest.ts suites
```

Later areas mirror `src/`: `test/monitor/`, `test/shared/`, `test/game/`, `test/game/data/`, `test/game/entities/`, plus `test/simulation/` for the simulation-driven test (a `node:test` suite run by `npm run test`, not an extension-host test).

## 3. Test pyramid

```mermaid
flowchart TB
  M["Manual QA (short visual glance, section 7)"]
  E["Extension-host integration (npm run test:integration)"]
  I["Simulation integration (from M3)"]
  B["Bundle and package checks (dist/, both build modes, vsce ls)"]
  S["Structural and repo checks (manifest, assets, ignore files, source scans, invariant greps)"]
  U["Unit tests (pure modules: HTML/CSP, webview layout, protocol, data tables, state machines)"]
  M --- E --- I --- B --- S --- U
```

- **Unit** (largest): pure modules with no `vscode` and no DOM. The logic worth testing is kept out of `vscode`-importing files so it can be tested here.
- **Structural and repo**: read source and config as text or JSON and assert invariants that types cannot express (no assets, no runtime dependencies, no process-control APIs, no hero health fields).
- **Bundle and package**: inspect the esbuild output and the real `vsce ls` file list.
- **Simulation integration** (from M3): drives `SimulatorSource` end to end through the monitor, protocol, and scene.
- **Extension-host integration**: the real extension in a downloaded VS Code (section 1.1). Slow (seconds, plus a one-time download), so it holds only what needs a real workbench: contribution, activation, the served HTML, and view lifecycle.
- **Manual QA**: what automation cannot see (pixels on screen, motion, sound, theme).

## 4. Suites

### 4.1 Current suites (M1)

| File | Level | Covers |
|---|---|---|
| `test/webview/indexHtml.test.ts` | unit | `buildCsp` returns the exact planned policy, lists exactly five directives, and has no unsafe keyword, wildcard, scheme source, or resource directive. `buildCsp` and `buildWebviewHtml` both throw `RangeError` on every invalid nonce (empty, short, quotes, `;`, whitespace, `<>`, base64url, bad padding, injection). The HTML has the planned element order, one CSP meta tag, one nonce-bearing script with no inline body, one nonce-bearing style, one accessible canvas, no `on*=` or `style=` attributes, and no other external reference. The nonce appears only in the CSP, script, and style. The script URI is attribute-escaped and cannot break out of its tag. An empty script URI throws. Output is pure. |
| `test/webview/main.test.ts` | unit (fake DOM, shipped bundle) | Runs `dist/webview.js` in a `node:vm` context. The backing store is 320x180; the 2d context is opaque with smoothing off; one full-canvas clear with a dark colour (relative luminance under 0.02). Layout picks the largest integer device-pixel scale that fits, never below 1, with equal X and Y scale: exact cases plus a sweep over sizes and `devicePixelRatio` 1 to 3; a missing ratio counts as 1. Resize and zoom re-lay out without redrawing; `pagehide` removes both listeners. Errors in boot or resize are reported through `console.error` and never thrown (invariant 4); no canvas or no context does not throw. |
| `test/host/extension.test.ts` | unit (fake `vscode`) | `activate` registers exactly one provider for the contributed view id with `retainContextWhenHidden: false`, hands its disposable to `context.subscriptions`, and touches no other `window` API. `resolveWebviewView` sets exactly `enableScripts: true`, `enableCommandUris: false`, `enableForms: false`, `localResourceRoots: [dist/]`, loads `dist/webview.js` through `asWebviewUri`, uses a valid nonce that is fresh on every load, and opens no message channel (M1 only). |
| `test/repo/manifest.test.ts` | structural | No `dependencies`, `optionalDependencies`, `peerDependencies`, or bundled dependencies (invariant 6). devDependencies are on the allow-list and exact-pinned (including `@vscode/test-electron`); `@types/vscode` equals the `engines.vscode` minimum; `@types/node` is 20.x. `package-lock.json` matches and holds only dev packages. `main`, the `pixelAgents` panel container with a `$(codicon)` icon, the `pixelAgents.view` webview view, lazy activation, no top-level `icon`, no image references (invariant 5). The required scripts exist, `test` is `node test/run.mjs`, `test:integration` is `node test/integration/run.mjs`, `package` is `vsce package --no-dependencies` (other flags allowed), and `vscode:prepublish` is a production build. |
| `test/repo/vscodeignore.test.ts` | structural | The patterns `src/**`, `test/**`, `docs/**`, `tools/**`, `**/*.map` are listed; sample source, test, doc, tooling, sourcemap, CI, agent, config, integration output, and `.vscode-test/` paths are excluded; the manifest, README, CHANGELOG, LICENSE, and both bundles are kept. |
| `test/repo/ignores.test.ts` | structural | `.vscode-test/` is ignored by git (`.gitignore`), vsce (`.vscodeignore`), Prettier (`.prettierignore` and `prettier --file-info`), ESLint (`ESLint#isPathIgnored` with the repo config, with `src/extension.ts` as a not-ignored control), and markdownlint (`.markdownlint-cli2.jsonc` ignores). |
| `test/repo/noAssets.test.ts` | structural | No image, audio, or font file anywhere in the repo (dot-directories included; `node_modules`, `.git`, `dist`, `out`, `.vscode-test` skipped), and no asset data URI or asset file name in `src/` (invariant 5). |
| `test/repo/readOnly.test.ts` | structural | No `src/` file uses `child_process`, `kill`, `sendText`, `sendSequence`, file writes or deletes, network APIs, `eval`, or `new Function` (early guard for invariants 3 and 7; M3 extends it). M1 only: the webview has no `acquireVsCodeApi`, `postMessage`, or `requestAnimationFrame`, and the host has no `onDidReceiveMessage` or `postMessage`. `main.ts` wraps boot and the resize handler in try/catch and never rethrows (invariant 4). |
| `test/build/bundles.test.ts` | bundle | `dist/` exists and is newer than `src/`. `dist/webview.js` requires nothing: no `vscode`, no `node:*`, no CommonJS exports. `dist/extension.js` evaluates as CommonJS exporting `activate` and `deactivate`, and requires only `vscode` and `node:*` built-ins. |
| `test/build/sourcemaps.test.ts` | bundle (temp builds) | Development build: `webview.js` ends with an inline `data:application/json;base64` sourcemap that decodes to a v3 map of `src/webview/main.ts`, there is no `webview.js.map`, and `extension.js.map` exists, maps `src/extension.ts`, and is referenced by `extension.js`; `dist/` holds exactly those three files. Production build: no `.map` file, exactly the two bundles, and no `sourceMappingURL` in either. |
| `test/build/package.test.ts` | package | `vsce ls --no-dependencies` lists exactly `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `dist/extension.js`, `dist/webview.js`. |

| `test/integration/suite/view.itest.ts` | extension host | Environment: Pixel Agents is the development extension, `pablodelucca.pixel-agents` is not loaded, and no other non-built-in extension is. Lazy activation: inactive 2 s after startup with no provider registered; the `pixelAgents.view.focus` and `workbench.view.extension.pixelAgents` commands exist without activating it; focusing the view activates it (`activate()` resolves, so `activate` did not throw) and resolves a visible `pixelAgents.view`. Exactly one provider registration with `retainContextWhenHidden: false`; no `pixelAgents.*` command added on activation (M1 only); no terminal created. Served webview: the planned options and `localResourceRoots` of `dist/`; exactly one CSP meta tag, starting `default-src 'none'` and equal to `buildCsp(nonce)`; one script tag with that nonce whose `src` is `asWebviewUri(dist/webview.js)`. Hide and re-show: closing the panel hides the view (so it lives in the panel), focusing shows it again with valid HTML; showing the Problems view hides it; five more close/focus cycles leave it active, registered once, and never disposed; `onDidChangeVisibility` reports every hide and show; every resolved HTML has its own valid nonce. |

The M1-only checks (no message channel, no animation loop) are replaced in M2 and M4 by the protocol and engine suites. They are not loosened before then.

### 4.2 Required suites by milestone

| Suite | Arrives in | Asserts |
|---|---|---|
| Protocol types | M2 | Message unions are exhaustive (a `never` check per switch); no message type can control, stop, write to, or send input to a session; `focusAgent` only reveals; invalid or unknown webview messages are rejected without throwing; `AgentInfo` has exactly the allow-listed fields. |
| Monitor | M3 | State debouncing and idle timeout with `mock.timers`; `despawned` only on real session end; no write, kill, signal, or send-input call in `src/monitor/**` or the `focusAgent` path; transcript privacy (a line with message text yields only session id, name, state, tool, timestamp, and nothing is logged); `transcriptPath` cannot escape its directory or follow symlinks out; every watcher, timer, and listener is disposed on deactivate. |
| Simulation integration | M3 | Section 6. |
| Hero-invariant | M4 (extended in H1-H3, E1-E5) | Section 5. |
| Structural hero check | M4 (extended in H1-H3, M7) | `Hero`, every subclass, `Summon`, buffs, and `ui.ts` contain no `hp`, `health`, `mana`, `dead`, `downed`, or `retreat`, and no gauge is drawn on heroes. |
| Class mapping | H1 (extended in H2, H3) | Each tool and activity maps to the class in `classMap.ts`; assignment is sticky across working and idle cycles; fallback is deterministic; H3 adds exactly 12 unique class ids with complete template sets. |
| Enemy table validator | E1 (final form in E5) | Exactly 10 stages, 50 enemies, 50 unique ids, 5 per stage, exactly one boss per stage, all required fields present; crafted bad tables (6 in a stage, 2 bosses, duplicate id) fail. |
| Persistence | E1 (extended in M7) | `globalState` carries a schema version; fresh install and a migration from every prior version produce the current schema. |
| Generated docs | H1 | `npm run docs:tables` leaves no diff in the generated enemy and class tables. |

## 5. Hero-invariant test (from M4)

Purpose: prove invariants 1 and 2. Hero state changes only on host agent-state events, and nothing in the game can hurt, down, or despawn a hero.

Design:

1. Build a scene with heroes in each state (`working`, `idle`) and record a snapshot of every hero's lifecycle state and existence.
2. Apply each non-lifecycle event many times: enemy hits on every hero, boss phase changes, boss defeat, stage progression, the wrap after the last stage, New Game+ looping, class abilities with and without enemies, summons, buffs, and freeze-like effects.
3. Throw an error from an entity inside the update loop and step more frames.
4. Assert the snapshot is unchanged: same heroes, same states, nothing despawned, no message to the host. The next frame still renders.
5. Apply `spawned`, `working`, `idle`, `despawned` and assert each one changes state exactly as specified, including when applied during an effect (it takes effect on the next update).

Each new hero class, enemy batch, and effect adds its events to step 2. The test is never narrowed.

## 6. Simulation integration test (from M3)

Purpose: prove the scene follows host events only, end to end, with zero configuration.

Design: drive `SimulatorSource` with `mock.timers` through spawned, working (with tool changes), idle, and despawned for several agents. Assert the exact sequence of protocol messages the host posts. From M4, feed the same messages into the webview scene and assert the hero list and states after each message match the host's agent list, and that rebuilding the scene from the host list (webview reload) gives the same heroes.

## 7. Manual QA checklist

Items marked with a later milestone apply from that milestone on. Each M1 item is either automated (and named here with its suite) or left as a short manual glance.

Any manual or F5 run must load only our extension: launch the Extension Development Host with `--disable-extensions` (add it to the `args` of the launch configuration you use, or run `code --disable-extensions --extensionDevelopmentPath=<repo>`) or use a clean profile. Otherwise the Extension Development Host inherits installed extensions, and the unrelated marketplace `pablodelucca.pixel-agents`, also displayed as "Pixel Agents", appears next to ours ([M1 plan section 9](../architecture/plans/m1-scaffold.md#9-risks-assumptions-defaults)). The integration runner always passes `--disable-extensions`.

### 7.1 Automated (M1)

| Checklist item | Covered by |
|---|---|
| The bottom panel has a "Pixel Agents" view container and webview view | `view.itest.ts` (container and focus commands exist; closing the panel hides the view, so it lives in the panel); `manifest.test.ts` (contribution, `$(flame)`-style codicon) |
| Opening it shows a dark canvas | `main.test.ts` (opaque 320x180 canvas, one full clear in a dark colour); `view.itest.ts` (the served HTML loads `dist/webview.js` with the nonce) |
| Integer scaling at any panel size and zoom | `main.test.ts` (largest fitting integer device scale, sweep over sizes and `devicePixelRatio`; resize and zoom re-lay out) |
| No CSP violation for our script or style | `view.itest.ts` (served CSP equals `buildCsp`, starts `default-src 'none'`, script nonce matches); `indexHtml.test.ts` (exact policy, nonce only on our script and style); `sourcemaps.test.ts` (dev webview sourcemap is inline, so DevTools never fetches a `.map` that `default-src 'none'` would block) |
| Hiding and re-showing the tab works | `view.itest.ts` (close panel, switch to Problems, re-focus, five more cycles; stays active, never disposed, visibility events for every change) |
| Lazy activation | `view.itest.ts` (inactive until the view is focused, then active); `manifest.test.ts` (no `*` or `onStartupFinished`) |
| Only Pixel Agents loads in the test host | `view.itest.ts` (environment suite) |

Not observable from outside without a production hook, so not automated at M1: whether `main.ts` actually ran inside the real webview (no message channel until M2's ready handshake), real CSP violation reports, and the rendered pixels.

### 7.2 Manual (M1): a short visual glance

Build, then F5 with `--disable-extensions` (or a clean profile), open the Pixel Agents tab, and look:

- [ ] The canvas is dark and crisp (hard pixel edges, no blur) at three panel sizes (small, medium, tall) and at two zoom levels ("View: Zoom In" once, then "View: Reset Zoom").

### 7.3 Later milestones

- [ ] (M3) With no configuration and no Claude Code sessions, simulation mode shows heroes spawning, working, idling, and despawning.
- [ ] (M3) With a real session, heroes follow it, and the extension never types into, stops, or closes its terminal.
- [ ] (M7) Clicking a roster entry only reveals the agent's terminal.
- [ ] (M7) With the OS or VS Code reduce-motion setting on, screen shake, flashes, and large particle bursts are reduced or off.
- [ ] (M8) Sound is muted by default on a fresh install, and stays off until the user enables it.
- [ ] (M7) Switching between a dark, a light, and a high-contrast theme keeps the panel background and UI text readable.
- [ ] (M4) A forced error in the game (dev build) shows the error once, the next frame renders, and agents are unaffected.

From M2, the integration suite takes over what the protocol makes observable (for example the webview's ready message after each show), and these items move to 7.1 as they become automated.

## 8. Performance benchmarks

Not exercised in M1: the webview draws one solid frame and runs no loop, so it does no per-frame work. Benchmarks start with the engine loop.

| Benchmark | Arrives in | Target |
|---|---|---|
| Simulator with 8 heroes | M4 | 60 fps sustained on the reference machine |
| 8+ heroes and 30+ enemies on screen | E5 | 60 fps sustained; no frame over 33 ms in a 60 s run |

How to measure (finalized with the M4 engine, which adds the frame-time counters):

1. F5 with `--disable-extensions` (section 7), open the Pixel Agents tab, and enable simulation mode with the hero count set for the benchmark.
2. Wait 10 s for the scene to settle, then run "Developer: Open Webview Developer Tools", open the Performance panel, and record 60 s.
3. Pass when the frames track shows a steady 60 fps (16.7 ms per frame) and no long task over 33 ms during steady state.
4. Record the machine, OS, VS Code version, panel size, and result in the milestone handoff. The reference machine is the one named in the M4 plan.
