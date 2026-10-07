# Coding standards

Purpose: the rules every line of Pixel Agents code follows: TypeScript settings, bundle boundaries, error handling, logging, performance, data tables, config, formatting, and commits. The linters enforce what they can; the reviewer checks the rest.
Related: [CLAUDE.md](../../CLAUDE.md), [team workflow](team-workflow.md), [roadmap](roadmap.md), [testing strategy](testing-strategy.md), [architecture overview](../architecture/overview.md), [ADR 0004 esbuild two bundles](../architecture/adr/0004-esbuild-two-bundles.md), [ADR 0006 test runner](../architecture/adr/0006-node-test-runner.md), [M1 plan](../architecture/plans/m1-scaffold.md), [sprite spec](../design/sprite-spec.md).

## 1. Precedence

The Core invariants in `CLAUDE.md` win over everything here. If a rule below would force an invariant break, stop and escalate (see [team workflow](team-workflow.md#5-when-to-escalate-to-the-human)).

## 2. TypeScript

- Base options live in `tsconfig.base.json` and are shared by every tsconfig: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `isolatedModules`, `verbatimModuleSyntax`, `forceConsistentCasingInFileNames`, `skipLibCheck: false`, `noEmit: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`.
- No `any`. If one is truly unavoidable, write `// any: <reason>` on the line above. Prefer `unknown` plus a type guard.
- No non-null assertions (`!`) except where a preceding check makes the value provably present and a comment says so.
- Use `import type` for type-only imports (required by `verbatimModuleSyntax`).
- Discriminated unions for messages, states, and events. Every `switch` over a union ends with an exhaustiveness check:

  ```ts
  function assertNever(x: never): never; // lives in src/shared/ from M2
  ```

- `readonly` on data-table rows and protocol message fields. Data tables are `as const satisfies` their row type.
- Prefer `const` and pure functions. Classes are fine for entities and stateful engine parts.
- No placeholders: no `TODO: implement`, `TBD`, `throw new Error('not implemented')`, or elided code.

## 3. Bundle boundaries

Two bundles, three typecheck projects ([ADR 0004](../architecture/adr/0004-esbuild-two-bundles.md)).

| Area | Bundle | May import | Must not import |
|---|---|---|---|
| `src/shared/**` | both | nothing outside `src/shared/` | `vscode`, Node built-ins, any other `src/` folder |
| `src/extension.ts`, `src/monitor/**` | host | `vscode`, `node:*`, `src/shared/**`, `src/webview/index.html.ts` | `src/game/**`, webview runtime files |
| `src/webview/index.html.ts` | host | nothing (pure string builder) | `vscode`, `node:*`, DOM APIs |
| `src/webview/**` (other files), `src/game/**` | webview | `src/shared/**`, each other | `vscode`, `node:*`, `src/monitor/**`, `src/extension.ts` |

ESLint `no-restricted-imports` encodes this table. Typed linting lists `tsconfig.json`, `tsconfig.webview.json`, and `tsconfig.tools.json` explicitly in `parserOptions.project` (not `projectService`, which would map every file to the host project). The tsconfig `lib` and `types` settings back it up: the webview project has no Node or `vscode` types; the host project has no DOM.

## 4. Naming and files

- Files: `PascalCase.ts` for a file whose main export is a class (`Game.ts`, `Hero.ts`), `camelCase.ts` otherwise (`protocol.ts`, `classMap.ts`). `index.html.ts` keeps its CLAUDE.md name.
- Types and classes `PascalCase`; functions and variables `camelCase`; module-level constants `UPPER_SNAKE_CASE`; ids in data tables `kebab-case` strings.
- Named exports only. No default exports (they hide renames from search).
- One concept per file; keep files under about 400 lines (sprite template data is exempt).
- Setting keys: `pixelAgents.<camelCase>`. Command ids: `pixelAgents.<camelCase>`. View ids: `pixelAgents.view`, container `pixelAgents`.

## 5. Errors and crash isolation

- The webview update and render loop runs inside try/catch (from M4). A caught error is logged once per distinct message per session and the next frame proceeds. Errors never change hero state (Core invariants 2 and 4).
- Host message handlers validate input first and return early on anything invalid. They never throw across the `onDidReceiveMessage` boundary.
- Every `Promise` is awaited or explicitly marked with `void` and a `.catch`. Lint enforces `no-floating-promises` and `no-misused-promises`.
- Catch variables are `unknown`; narrow before use.

## 6. Logging and privacy

- Host logs go to one `LogOutputChannel` named "Pixel Agents" (introduced when first needed). No `console.log` in host code. In the webview, `console.error` is allowed only in the crash handler.
- Never log, store, or post transcript content. Allowed in logs: session id, name, state, tool name, timestamp, file counts, error class and message from our own code (Core invariant 7).
- Never log absolute user paths beyond the configured transcript directory name.

## 7. Lifecycle and disposal

- Everything with a `dispose()` (watchers, listeners, timers wrapped as disposables, the view provider registration) is pushed to `context.subscriptions` or to a parent's disposable list.
- `deactivate()` leaves no timer, watcher, or listener running.
- The webview cancels its animation frame and listeners on `pagehide`.

## 8. Performance (webview)

- Target: 60fps with 8+ heroes and 30+ enemies at 320x180 internal resolution.
- No allocations in per-frame hot paths: reuse arrays and objects; particles and floating text come from pools.
- Sprites are rasterized once by `spriteFactory` and cached.
- Fixed-step update, render on `requestAnimationFrame`, loop paused when the view is hidden.

## 9. Data tables and configuration

- Game content lives in typed tables under `src/game/data/`. Enemies come from a compact row table plus per-stage scaling formulas, validated at startup.
- Persisted progress carries `schemaVersion` and a migration for every prior version.
- Every tunable threshold is a `pixelAgents.*` setting with a default, a description, and min/max where numeric.
- Ambiguity: choose a sensible default and record it in a code comment starting `Assumption:` or in the relevant doc.

## 10. Formatting and linting

- Prettier formats TypeScript, JavaScript, JSON, and YAML: `printWidth: 100`, `singleQuote: true`, `trailingComma: 'all'`, `semi: true`. Markdown is excluded from Prettier and checked by markdownlint instead.
- ESLint flat config with `typescript-eslint` type-checked recommended rules, plus: `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/no-floating-promises: error`, `@typescript-eslint/switch-exhaustiveness-check: error`, `@typescript-eslint/consistent-type-imports: error`, `@typescript-eslint/no-unused-vars: error` with `_`-prefixed arguments, variables, and caught errors ignored (`argsIgnorePattern`, `varsIgnorePattern`, `caughtErrorsIgnorePattern` all `^_`; interface-shaped signatures such as `resolveWebviewView` keep unused parameters as `_name`, matching `noUnusedParameters`), `eqeqeq: error`, `no-console` (allow `error` in webview only), and the boundary rules in section 3.
- markdownlint-cli2 checks all Markdown except `node_modules/`, `dist/`, `out/`, `.vscode-test/` (downloaded VS Code builds), and `.claude/` (agent definitions are human-owned). Any disabled rule carries a comment in the config saying why.
- Autofix only paths you own: run `prettier --write` or `eslint --fix` only with explicit file arguments that you own, never repo-wide. Never run `markdownlint-cli2 --fix`: the config's `**/*.md` glob makes it rewrite every Markdown file even when given one file (see [team workflow section 4](team-workflow.md#4-ownership-rules)).
- `.editorconfig` sets UTF-8, LF, 2-space indent, final newline; `.gitattributes` normalizes line endings to LF.
- `npm run lint` runs ESLint, `prettier --check`, and markdownlint; it must pass with zero warnings (`--max-warnings 0`).

## 11. Dependencies

- `dependencies` in `package.json` stays empty (Core invariant 6).
- Allowed devDependencies, the complete list: `esbuild`, `@types/vscode`, `@types/node`, `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `markdownlint-cli2`, `@vscode/vsce`, and `@vscode/test-electron` (approved by the human after the M1 review; exact-pinned, currently `3.1.0`, `package.json` is authoritative). Anything else needs human approval before install.
- The test runner is Node's built-in `node:test`, so it needs no package ([ADR 0006](../architecture/adr/0006-node-test-runner.md)). `@vscode/test-electron` is only a launcher: it downloads VS Code into `.vscode-test/` (git- and package-ignored) and runs the integration tests there with `--disable-extensions` ([ADR 0006 amendment](../architecture/adr/0006-node-test-runner.md#amendment-m1-review-extension-host-integration-tests)).
- `@types/node` tracks the extension host's Node major (20.x for `engines.vscode ^1.90.0`), not the development Node (22, from `.nvmrc`).
- Install with exact versions (`npm install -D --save-exact`). Commit `package-lock.json`.
- `@types/vscode` matches the minimum `engines.vscode` version, never newer.

## 12. Docs and commits

- Every doc starts with a purpose line and a related-links line, uses relative links, Mermaid for diagrams, and text wireframes instead of screenshots.
- A change to the protocol, data tables, classes, art conventions, or configuration updates its doc in the same commit, with a `CHANGELOG.md` entry (Keep a Changelog).
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`), one commit per milestone or batch, on a `feat/*`, `fix/*`, or `docs/*` branch (see [team workflow](team-workflow.md#2-milestone-loop)).
