# Changelog

Purpose: a human-readable record of notable changes to Pixel Agents, newest first.
Related: [README](README.md), [roadmap](docs/engineering/roadmap.md), [contributing](CONTRIBUTING.md).

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Typed host/webview protocol with validated messages, `ready` handshake, reveal-only `focusAgent`. Exact-key validators in both directions, host-side creators that copy only the five allow-listed agent fields, and a "Pixel Agents" log output channel for dropped messages and bridge errors (no payloads are logged).
- Extension scaffold: a "Pixel Agents" bottom-panel view container with one webview view (`pixelAgents.view`), activated only when the view is opened.
- Webview HTML builder with a strict Content-Security-Policy (`default-src 'none'`, a per-load script and style nonce, `base-uri 'none'`, `form-action 'none'`); webview resources limited to `dist/`, command URIs and forms disabled.
- Blank 320x180 canvas that stays integer-scaled and crisp across panel resizes and zoom levels, with crash-safe boot.
- esbuild build producing two bundles: `dist/extension.js` (Node, CommonJS) and `dist/webview.js` (browser, IIFE), with watch and production modes.
- Strict TypeScript configs for the host, webview, and tools projects; ESLint with bundle-boundary import rules, Prettier, and markdownlint.
- F5 launch configuration, `.vscodeignore` that ships only the manifest, docs, license, and the two bundles, and CI and release workflows.
- README, contributing guide, code of conduct, and MIT license.
- `@vscode/test-electron` (dev-only, exact-pinned) for integration tests that run the extension inside a downloaded VS Code; CI and release run them under `xvfb-run` against VS Code stable and 1.90.0 (the `engines.vscode` minimum). The download cache `.vscode-test/` is ignored by git, packaging, Prettier, ESLint, and markdownlint.
- Development webview builds use an inline sourcemap so DevTools works under the strict webview CSP; production builds have no sourcemaps.
