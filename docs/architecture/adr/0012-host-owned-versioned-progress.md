# ADR 0012: Game progress is host-owned, versioned, and migrated forward only

Purpose: records how Pixel Agents persists the only data it keeps (stage progress) so that it can never contain agent data, never corrupt on upgrade or downgrade, and can grow (achievements in M7, New Game+ in E5) without losing a player's progress.
Related: [E1 plan](../plans/e1-enemies.md), [data model section 7](../data-model.md#7-persisted-progress-e1), [host-webview protocol](../host-webview-protocol.md), [security and safety](../security-and-safety.md), [ADR 0007 allow-list protocol](0007-allow-list-protocol-pull-handshake.md), [ADR 0001 bottom-panel webview](0001-bottom-panel-webview.md), [roadmap A10](../../engineering/roadmap.md#7-assumptions-and-defaults), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

E1 introduces the first persisted data: how far the party has progressed through the stages. The webview has `retainContextWhenHidden: false` and no `getState`/`setState` ([ADR 0001](0001-bottom-panel-webview.md)), so it cannot keep anything itself, and it is "never a source of truth". Persisted data outlives the code that wrote it: the next extension version, M7's achievements, and E5's New Game+ will all read what E1 writes, so the shape, the migration rule, and the failure behavior are costly to change after release. The privacy invariant (7) and the lifecycle invariant (2) constrain what may be stored: no session ids, names, tool names, transcript text, class, or hero state may ever reach disk.

## Decision

- **The host owns storage.** Progress lives in the extension's `globalState` under one key, `pixelAgents.progress`, written only by `src/host/progressStore.ts`, a vscode-free module over a two-method `KeyValueStore` port (`get`, `update`). The webview owns nothing: it receives progress in a `progress` message after `ready` and sends changes in `saveProgress` messages ([protocol](../host-webview-protocol.md)). The key is not registered for Settings Sync.
- **A closed, numeric shape.** Version 1 holds exactly `schemaVersion`, `stageIndex`, `killsInStage`, `totalKills`, `bossesDefeated`, `cycle`: integers only, bounded. There is no string field, so no agent or transcript data can be stored by construction. Hero state, class, agent ids, and enemy ids are never persisted; heroes are always rebuilt from the host's agent list (invariants 2 and 4).
- **Versioned, forward-only migrations.** The stored value carries `schemaVersion`. `migrateProgress(raw)` applies an ordered list of pure steps (`MIGRATIONS[i]` upgrades version `i+1` to `i+2`) until the current version, then validates with the exact-key validator. It never throws. The list is empty in E1 (version 1 is the first), but the runner, its tests, and a fake two-step chain exist from day one so M7's version 2 is a one-line addition, not a first use.
- **Failure behavior.** Not an object, wrong keys, out-of-range numbers, or a bad `schemaVersion` fall back to a fresh default in memory and are logged as one fixed line (`progress: stored value invalid, using defaults`). A stored version **newer** than the code understands (a downgrade) is treated as read-only: the store plays with an in-memory default, logs one fixed line, and **never overwrites** the newer data. A fresh install writes nothing until the first real save.
- **Saves are validated, monotonic, and coalesced.** The host applies the same exact-key validator to every `saveProgress`, ignores a save whose `totalKills` is lower than the stored value (a stale second window cannot rewind progress), and writes at most once per `PROGRESS_WRITE_COALESCE_MS` through an injected timer port, flushing on dispose. A write failure is swallowed and logged as a fixed string.
- **Fail closed in the webview.** The webview sends no `saveProgress` until it has applied a `progress` message in the current document, so a failed or missing load can never overwrite stored data with defaults.
- **Not a control channel.** `saveProgress` reaches only `globalState`. It cannot name an agent, a terminal, or a command, and the bridge's only outward capabilities remain reveal-only `focusAgent` and the progress store.

## Consequences

- Core invariant 3 is unchanged in substance (no message controls a session), but the "exactly two webview messages" wording in the docs and tests becomes "three messages, only one of which, `focusAgent`, leaves the host's own storage and window, and it only reveals". The tester replaces the exact-type-list assertions; they are not loosened.
- Progress from before an upgrade survives it; a user who downgrades loses nothing (the newer data is left in place and ignored). The cost is a small amount of dead path (read-only mode) that must stay tested.
- Two VS Code windows share `globalState`. Last-write-wins is softened by the monotonic rule, but two windows playing at once still interleave; accepted (progress is a cosmetic score).
- A reset (M7 command) is a host-side write of the default value, never a webview request.
- Rejected alternatives (see also the as-built notes below): webview-side storage (it would make the webview a source of truth, and a non-retained webview document gives no durability guarantee); storing progress in a file (a write path outside the extension's own storage, against the spirit of invariant 3); persisting the in-progress fight or the party (would store per-agent data, violating invariants 2 and 7); schemaless storage with feature checks (no safe upgrade path).

## As built (E1 clarifications; the decision above is unchanged)

Checked against the E1 tree before commit; details in [E1 plan section 13](../plans/e1-enemies.md#13-as-built-drift-checked-against-the-e1-working-tree).

- **Late `progress` is still applied.** "Fail closed" means no save without a load, not "ignore a slow load". If the `progress` message arrives after the engine's 1.5 s boot gate, `Game.applyProgress` applies it once (restoring the stored stage), and only then does `ProgressSaver` open. Counters earned on defaults before that are discarded and never saved, so a slow load cannot overwrite stored data. A document that never receives `progress` never saves.
- **The monotonic rule also looks at the pending value.** `ProgressStore.save` drops a save whose `totalKills` is below the stored floor or below a higher value already waiting for the coalesced write.
- **Both sides build the wire object from a copy.** The host uses `createProgressMessage`; the webview uses `createSaveProgressMessage`; both copy the six keys through `toProgress` and return `undefined` for an invalid value.
- **Ranges.** The three game settings' bounds (`MIN_KILLS_PER_STAGE` 5, `MAX_KILLS_PER_STAGE` 500, `MIN_MAX_ENEMIES` 1, `MAX_MAX_ENEMIES` 12) are exported from `src/shared/protocol.ts` and mirrored in `package.json`; `readGameSettings` clamps to them.
- **The `ready` answer** posts `config`, `agentList`, then `progress`; the `progress` step has its own try/catch so a failing store never suppresses the first two.
