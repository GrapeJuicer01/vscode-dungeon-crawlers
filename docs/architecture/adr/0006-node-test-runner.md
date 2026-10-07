# ADR 0006: Test with Node's built-in node:test, compiled by esbuild

Purpose: records the choice of test runner, why it adds no dependency, and how TypeScript tests are compiled and run.
Related: [ADR 0004 esbuild two bundles](0004-esbuild-two-bundles.md), [coding standards](../../engineering/coding-standards.md#11-dependencies), [testing strategy](../../engineering/testing-strategy.md), [M1 plan](../plans/m1-scaffold.md), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

Core invariant 6 allows only esbuild and `@types/vscode` at build time plus dev-only tooling, and asks the human before anything else. The tester needs unit tests from M1, fake timers for monitor debouncing and idle timeouts (M3), and structural repo checks (no assets, empty `dependencies`, hero-invariant greps). Most code under test is pure TypeScript that never touches `vscode` or the DOM: `index.html.ts`, `src/shared/`, data tables, validators, the hero state machine.

Options considered:

- **Vitest or Jest**: capable, but each pulls in dozens of transitive packages and a second TypeScript transform that can drift from the production one.
- **Mocha + ts-node or tsx**: two or more devDependencies, plus a loader.
- **Node type stripping (`node --test` on `.ts` directly)**: needs explicit `.ts` import extensions and erasable-only syntax, which conflicts with `moduleResolution: Bundler` and extensionless imports.
- **`@vscode/test-electron`**: runs tests inside a real extension host. Useful for host integration tests later, but it downloads VS Code, is slow, and is not on the allowed list.
- **`node:test` + esbuild**: built into Node 22 (describe/it, `mock.timers`, `assert/strict`, a spec reporter, a programmatic `run()` API); esbuild is already a devDependency.

## Decision

- Tests use `node:test` and `node:assert/strict`. No test-runner package is installed.
- Test files are `test/**/*.test.ts`. A tester-owned script, `test/run.mjs`, bundles each test file with esbuild (platform `node`, format `cjs`) into `out/test/` and runs them through `node:test`'s `run()` with the spec reporter, exiting non-zero on failure. `npm run test` calls it.
- Code that imports `vscode` is kept thin so the logic worth testing lives in modules that do not import it. Host integration tests inside VS Code are out of scope until the human approves `@vscode/test-electron`.
- Node 22 (`.nvmrc`) is the development and CI runtime.

## Consequences

- Zero new dependencies; the tests use the same esbuild transform as the shipped bundles, so there is no second TypeScript pipeline.
- `node:test` has a smaller ecosystem than Jest or Vitest (no snapshot helpers, simpler mocking). Tests stay behavioral and explicit.
- Modules under test must avoid importing `vscode` directly; this pushes host logic into pure functions, which also helps review.
- `out/` is git-ignored and excluded from the package.
- If extension-host integration tests become necessary, a new ADR records the added devDependency after human approval.

## Amendment (M1 review): extension-host integration tests

This amendment records the human approval the decision above was waiting for. It does not change the unit-test decision: `node:test` compiled by esbuild stays the runner for all unit, structural, and bundle tests. It takes the place of the separate ADR mentioned in the last consequence, because it adds a test launcher, not a second runner.

- **Approved devDependency.** The human approved `@vscode/test-electron` as a dev-only devDependency, pinned to an exact version (3.1.0 at the time of writing; `package.json` is authoritative). It is on the allow-list in [coding standards section 11](../../engineering/coding-standards.md#11-dependencies). It never ships: `dependencies` stays empty, and `vsce package --no-dependencies` plus `.vscodeignore` keep it out of the `.vsix`.
- **What it runs.** `npm run test:integration` (tester-owned script) downloads a VS Code build into `.vscode-test/` and launches the extension in it as an Extension Development Host. The launch always passes `--disable-extensions`, so only Pixel Agents loads (other installed extensions, including any with the same display name, cannot interfere). It is meant to automate most of the M1 F5 checklist (for example view contribution, lazy activation, and the webview HTML and CSP as served); the tester decides the exact coverage, and anything that stays manual is listed in the [testing strategy](../../engineering/testing-strategy.md).
- **Ignored paths.** `.vscode-test/` is ignored by git, `.vscodeignore`, Prettier, ESLint, and markdownlint.
- **CI.** The `ci.yml` gates job runs the integration tests after the unit tests under `xvfb-run -a`, because Electron needs a display on the headless Ubuntu runner. The first run downloads VS Code, so it is slower and needs network access.
- **Boundaries unchanged.** Integration tests observe the extension only. They follow Core invariant 3 like everything else: no test drives a real Claude Code session or sends input to a terminal.
