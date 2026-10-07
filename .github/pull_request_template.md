<!-- markdownlint-disable-next-line MD041 -- a PR description starts at section level; GitHub supplies the title. -->
## Summary

## Core invariants (CLAUDE.md)

- [ ] 1. Heroes are invulnerable: no HP, mana, damage intake, death, downed, or retreat; no gauges on heroes; enemy attacks are cosmetic only.
- [ ] 2. Hero lifecycle changes only from host agent-state events (`spawned`, `working`, `idle`, `despawned`).
- [ ] 3. The monitor is read-only: nothing writes to, signals, kills, or sends input to a process or terminal; `focusAgent` only reveals.
- [ ] 4. A game crash cannot affect agents: the update loop is wrapped in try/catch; the scene rebuilds from the host's agent list.
- [ ] 5. No external image or audio files.
- [ ] 6. No runtime dependencies; no unapproved devDependencies.
- [ ] 7. Transcript privacy: only session id, name, state, tool name, and timestamp are read; nothing else is stored, logged, or sent.

## Gates

- [ ] G1 `npm run build`, `lint`, `typecheck`, and `test` pass.
- [ ] G2 `npm run docs:tables` leaves no diff (from H1 onward).
- [ ] G3 All seven Core invariants intact; the hero-invariant test passes (from M4 onward).
- [ ] G4 `dependencies` is empty; no image, audio, or font files in the repo.
- [ ] G5 Matching docs updated (protocol, data tables, classes, config, art).
- [ ] G6 `CLAUDE.md` directory map, commands, and ownership table match the repo.
- [ ] G7 Reviewer verdict is Approve with no open Critical findings; Conventional Commit on a `feat/*`, `fix/*`, or `docs/*` branch.

## Housekeeping

- [ ] Docs updated in this change.
- [ ] `CHANGELOG.md` entry under `## [Unreleased]`.
- [ ] Roadmap status updated in `docs/engineering/roadmap.md` (after the milestone commit).
