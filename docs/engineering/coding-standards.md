# Coding standards

Purpose: the rules every line of Pixel Agents code follows: TypeScript settings, bundle boundaries, error handling, logging, performance, data tables, config, formatting, and commits. The linters enforce what they can; the reviewer checks the rest.
Related: [CLAUDE.md](../../CLAUDE.md), [team workflow](team-workflow.md), [roadmap](roadmap.md), [testing strategy](testing-strategy.md), [architecture overview](../architecture/overview.md), [host-webview protocol](../architecture/host-webview-protocol.md), [security and safety](../architecture/security-and-safety.md), [ADR 0004 esbuild two bundles](../architecture/adr/0004-esbuild-two-bundles.md), [ADR 0006 test runner](../architecture/adr/0006-node-test-runner.md), [ADR 0007 allow-list protocol](../architecture/adr/0007-allow-list-protocol-pull-handshake.md), [ADR 0005 transcript watching](../architecture/adr/0005-transcript-watching.md), [agent detection](../architecture/agent-detection.md), [M1 plan](../architecture/plans/m1-scaffold.md), [M2 plan](../architecture/plans/m2-protocol.md), [M3 plan](../architecture/plans/m3-monitor.md), [sprite spec](../design/sprite-spec.md).

## 1. Precedence

The Core invariants in `CLAUDE.md` win over everything here. If a rule below would force an invariant break, stop and escalate (see [team workflow](team-workflow.md#5-when-to-escalate-to-the-human)).

## 2. TypeScript

- Base options live in `tsconfig.base.json` and are shared by every tsconfig: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `isolatedModules`, `verbatimModuleSyntax`, `forceConsistentCasingInFileNames`, `skipLibCheck: false`, `noEmit: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`.
- No `any`. If one is truly unavoidable, write `// any: <reason>` on the line above. Prefer `unknown` plus a type guard.
- No non-null assertions (`!`) except where a preceding check makes the value provably present and a comment says so.
- Use `import type` for type-only imports (required by `verbatimModuleSyntax`).
- Discriminated unions for messages, states, and events. Every `switch` over a union ends with an exhaustiveness check:

  ```ts
  // src/shared/assertNever.ts (from M2); the only definition, imported by both bundles
  export function assertNever(value: never): never;
  ```

  Import it from `src/shared/assertNever.ts`; never redefine it locally. It throws a `TypeError` whose message never includes the value (the value may be untrusted input). A `switch` over a raw, not-yet-validated string (for example inside a protocol parser) is the one exception: its `default` returns "invalid" instead, and exhaustiveness is proven by the protocol's compile-time proof types.
- `readonly` on data-table rows and protocol message fields. Data tables are `as const satisfies` their row type.
- **No optional properties in the protocol.** Messages, `AgentInfo`, and `ConfigSnapshot` in `src/shared/protocol.ts` have no `?:` properties; "absent" is `null` (for example `toolName: null`). This keeps exact-key validation and `exactOptionalPropertyTypes` simple ([host-webview protocol section 2](../architecture/host-webview-protocol.md#2-shared-types)).
- Prefer `const` and pure functions. Classes are fine for entities and stateful engine parts.
- No placeholders: no `TODO: implement`, `TBD`, `throw new Error('not implemented')`, or elided code.

## 3. Bundle boundaries

Two bundles, three typecheck projects ([ADR 0004](../architecture/adr/0004-esbuild-two-bundles.md)).

| Area | Bundle | May import | Must not import |
|---|---|---|---|
| `src/shared/**` | both | nothing outside `src/shared/` | `vscode`, Node built-ins, any other `src/` folder (including `src/host/**`) |
| `src/extension.ts` | host | `vscode`, `node:*`, `src/shared/**`, `src/host/**`, `src/monitor/**`, `src/webview/index.html.ts` | `src/game/**`, webview runtime files |
| `src/monitor/*.ts` (core, from M3) | host | `src/shared/**` and sibling core files only; Node and `vscode` capabilities arrive as ports (`ReadOnlyFileSystem`, `PathOps`, `Clock`, `TimerPort`, `TerminalPort`, `MonitorLogger`) built by `extension.ts` | `vscode`, Node built-ins, `src/monitor/adapters/**`, `src/host/**`, `src/game/**`, `src/webview/**`, `src/extension.ts` |
| `src/monitor/adapters/nodeFileSystem.ts`, `nodeRuntime.ts` (from M3) | host | `node:fs/promises` read functions (`open`, `lstat`, `readdir`, `realpath`), `node:fs` `constants`, `node:os` `homedir`, `node:path`; `src/monitor/ports.ts` types | `vscode`, every other Node built-in, any write or watch API |
| `src/monitor/adapters/vscodeTerminals.ts` (from M3) | host | `vscode` (type-only; `vscode.window` is passed in), `src/monitor/ports.ts` types | Node built-ins; any terminal member other than the events, `terminals`, `activeTerminal`, `exitStatus`, and `show()` |
| `src/host/**` (from M2) | host | `src/shared/**` only; `vscode` objects arrive as narrow interfaces (for example `WebviewPort`, `BridgeLogger`) passed in by `extension.ts` | `vscode`, Node built-ins, `src/monitor/**`, `src/game/**`, `src/webview/**`, `src/extension.ts` |
| `src/webview/index.html.ts` | host | nothing (pure string builder) | `vscode`, `node:*`, DOM APIs |
| `src/webview/**` (other files), `src/game/**` | webview | `src/shared/**`, each other | `vscode`, `node:*`, `src/monitor/**`, `src/host/**`, `src/extension.ts` |

The monitor core follows the same pattern as `src/host/` (from M3): logic in vscode- and Node-free files, capabilities through narrow ports, adapters as the only files that touch `node:fs` or `vscode` ([agent detection section 2](../architecture/agent-detection.md#2-components)). `src/host/` exists so host logic can be unit tested under `node:test` without a `vscode` stub ([ADR 0007](../architecture/adr/0007-allow-list-protocol-pull-handshake.md) consequences). `extension.ts` stays thin glue: it adapts `vscode` objects to the `src/host/` interfaces and wires events; decisions live in `src/host/`. Inside the webview bundle, modules that tests import (for example `hostChannel.ts`, `hostMessages.ts`, `hostState.ts`) stay DOM-free; only `main.ts` touches `window`, `document`, and `acquireVsCodeApi`.

ESLint `no-restricted-imports` encodes this table. Typed linting lists `tsconfig.json`, `tsconfig.webview.json`, and `tsconfig.tools.json` explicitly in `parserOptions.project` (not `projectService`, which would map every file to the host project). The tsconfig `lib` and `types` settings back it up: the webview project has no Node or `vscode` types; the host project has no DOM.

**Untrusted text in the webview.** Agent names and tool names come from the host but originate in user-controlled session data. Webview code renders any host-provided string only as canvas text (`fillText`) or through `textContent`; `innerHTML`, `outerHTML`, `insertAdjacentHTML`, and `document.write` are not used anywhere in `src/webview/**` or `src/game/**` ([security and safety T9](../architecture/security-and-safety.md#3-threats-and-controls); structural check from M7).

## 4. Naming and files

- Files: `PascalCase.ts` for a file whose main export is a class (`Game.ts`, `Hero.ts`), `camelCase.ts` otherwise (`protocol.ts`, `classMap.ts`). `index.html.ts` keeps its CLAUDE.md name.
- Types and classes `PascalCase`; functions and variables `camelCase`; module-level constants `UPPER_SNAKE_CASE`; ids in data tables `kebab-case` strings.
- Named exports only. No default exports (they hide renames from search).
- One concept per file; keep files under about 400 lines (sprite template data is exempt).
- Setting keys: `pixelAgents.<camelCase>`. Command ids: `pixelAgents.<camelCase>`. View ids: `pixelAgents.view`, container `pixelAgents`.

## 5. Errors and crash isolation

- The webview update and render loop runs inside try/catch (from M4). A caught error is logged once per distinct message per session and the next frame proceeds. Errors never change hero state (Core invariants 2 and 4).
- Host message handlers validate input first and return early on anything invalid. They never throw across the `onDidReceiveMessage` boundary: the whole dispatch (`WebviewBridge.handleMessage`, and every other entry point the host exposes to events, such as `postAgentState`) runs inside one `try/catch` that logs `error.name: error.message` and does not rethrow. Validators are total and never throw on their own; the `try/catch` covers dependencies and `assertNever`. The logging call inside a catch block, and inside a promise rejection handler, is itself wrapped in `try/catch` and a throwing logger is swallowed, so nothing escapes (as in `WebviewBridge`).
- The webview's `message` listener body runs inside `try/catch` (from M2), like boot and the resize handler (M1). Every webview catch block reports through the single crash reporter in `main.ts` (`reportError`), which prints at most once per distinct message per page load and never prints `event.data` or a thrown non-Error value. Error detection is cross-realm (`instanceof Error`, or the built-in tag `[object Error]` with a string `message`); anything else prints the fixed `non-error thrown`.
- Listeners before triggers: register `onDidReceiveMessage` before assigning `webview.html` (host) and the `message` listener before sending `ready` (webview), so no message can be missed.
- Every `Promise` is awaited or explicitly marked with `void` and a `.catch` (for a `PromiseLike`/`Thenable`, which has no `.catch`, use `.then(undefined, onRejected)`; the handler must not throw). Lint enforces `no-floating-promises` and `no-misused-promises`.
- Catch variables are `unknown`; narrow before use.

## 6. Logging and privacy

- Host logs go to one `LogOutputChannel` named "Pixel Agents", created once in `activate` with `vscode.window.createOutputChannel('Pixel Agents', { log: true })` (from M2) and pushed to `context.subscriptions`. Modules in `src/host/` and `src/monitor/` receive it as a narrow logger interface (for example `BridgeLogger` with `trace` and `error`), never the `vscode` object. Levels: `trace` for expected drops (invalid message, unknown agent, view gone), `error` for caught exceptions from our own code; no `info` noise on the normal path. Log messages are fixed reason strings plus, for errors, `error.name: error.message`; never a message payload. No `console.log` in host code. In the webview, `console.error` is allowed only in the crash handler.
- Never log, store, or post transcript content. Allowed in logs: session id, name, state, tool name, timestamp, file counts, error class and message from our own code (Core invariant 7).
- **Monitor errors (from M3).** Code under `src/monitor/**` describes an error only with `safeErrorCode(error)` (`error.code` such as `EACCES`, else `error.name` such as `SyntaxError`), never `error.message` or `error.stack`, never `String(error)`, `JSON.stringify`, or template interpolation of a caught value: V8 `JSON.parse` messages quote transcript text and Node fs messages embed paths. Transcript records are read with bracket access (`record['message']`), so a grep for `.message` in `src/monitor/**` stays empty. `extension.ts` uses `safeErrorCode` for monitor failures too. Repeated reason lines go through the rate-limited logger.
- Never log absolute user paths, including the transcript root (log `default` or `custom` instead).

## 7. Lifecycle and disposal

- Everything with a `dispose()` (watchers, listeners, timers wrapped as disposables, the view provider registration) is pushed to `context.subscriptions` or to a parent's disposable list.
- Only disposables the extension itself created are ever disposed (listeners, registrations, the output channel, watchers, timers; for example the provider's per-view listener list). Never dispose, close, or hide a terminal or anything owned by an agent session (Core invariant 3, [security and safety section 5](../architecture/security-and-safety.md#5-read-only-and-reveal-only-guarantees)).
- `deactivate()` leaves no timer, watcher, or listener running.
- Host timers go through `TimerPort`; the Node implementation `unref()`s them so a missed dispose in a test cannot keep a process alive. Async monitor work checks a disposed flag after every `await` and emits nothing after `dispose()`.
- **Grep-trap names.** The read-only structural tests match the words `unlink` and `terminal*.dispose(` anywhere in `src/`. Do not name a method `unlink` (the monitor uses `dropLink`) and never call `dispose()` on an identifier starting with `terminal`; the terminal adapter keeps its own event subscriptions in an array named `subscriptions`, and the terminal port is disposed only through `context.subscriptions`.
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
- Setting keys carry their unit when numeric (`idleTimeoutSeconds`, `sessionEndTimeoutMinutes`, `debounceMs`); code converts to milliseconds once, in the config reader. Each setting has a row in a typed settings table in code (`MONITOR_SETTINGS` from M3) that a test compares with `contributes.configuration`. The config reader is total: wrong types and out-of-range values fall back or clamp, never throw.
- Settings that widen what the extension reads (`pixelAgents.projectScope`, `pixelAgents.transcriptPath`) are `machine`-scoped, so a workspace's `.vscode/settings.json` cannot change them.
- Safety bounds (protocol limits, monitor read and line limits, agent caps) are constants, not settings.
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
