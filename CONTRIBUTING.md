# Contributing to Pixel Agents

Purpose: how to propose and land changes in Pixel Agents: the rules you follow, where they are written down, and what "done" means.
Related: [README](README.md), [CLAUDE.md](CLAUDE.md), [team workflow](docs/engineering/team-workflow.md), [coding standards](docs/engineering/coding-standards.md), [testing strategy](docs/engineering/testing-strategy.md), [roadmap](docs/engineering/roadmap.md), [code of conduct](CODE_OF_CONDUCT.md).

## Before you start

- Read [CLAUDE.md](CLAUDE.md). Its **Core invariants** section is the set of rules no change may break (invulnerable heroes, lifecycle only from agent events, a read-only monitor, crash isolation, no image or audio files, no runtime dependencies, transcript privacy). They are not repeated here, and only the project owner may change them. If your change seems to need one of them relaxed, open an issue first.
- Read the [team workflow](docs/engineering/team-workflow.md) for how work is planned, reviewed, and handed off, and the [coding standards](docs/engineering/coding-standards.md) for TypeScript, bundle boundaries, logging, and linting rules.
- Read the [testing strategy](docs/engineering/testing-strategy.md) for how tests are organized and run.

## Setup

```sh
npm install
npm run build
```

Press F5 in VS Code to launch the Extension Development Host.

## Branches and commits

- `main` is the default branch. Work is trunk-based on short-lived branches named `feat/<topic>`, `fix/<topic>`, or `docs/<topic>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`. Keep the subject in the imperative mood, for example `feat: add campfire rest poses`.
- Do not rewrite shared history (no force-push to `main`).

## Before you open a pull request

Run every gate locally:

```sh
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:integration
```

`npm run test:integration` runs the extension inside a real VS Code. On first run it downloads a VS Code build into `.vscode-test/` (git-ignored and never packaged), so it needs network access once and takes longer; later runs reuse the download. On headless Linux, run it under `xvfb-run -a`.

Then check:

- The Core invariants in [CLAUDE.md](CLAUDE.md) still hold.
- No new runtime dependency, and no image, audio, or font file anywhere in the repo.
- Docs that describe what you changed (protocol, data tables, classes, configuration) are updated in the same change.
- `CHANGELOG.md` has an entry under `## [Unreleased]`.

The pull request template repeats this checklist.

## Reporting bugs

Use the bug report issue template. Never paste Claude Code transcript content into an issue: describe what you saw instead.
