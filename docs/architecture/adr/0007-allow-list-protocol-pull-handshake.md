# ADR 0007: Allow-list protocol with exact-key validation and a pull handshake

Purpose: records how host and webview messages are shaped, validated, and sequenced, so that every future message inherits the same privacy and reveal-only guarantees.
Related: [host-webview protocol](../host-webview-protocol.md), [security and safety](../security-and-safety.md), [M2 plan](../plans/m2-protocol.md), [ADR 0001 bottom-panel webview](0001-bottom-panel-webview.md), [ADR 0004 esbuild two bundles](0004-esbuild-two-bundles.md), [ADR 0006 test runner](0006-node-test-runner.md), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

The host and the webview exchange messages through `postMessage`, which carries arbitrary structured-cloned data. Three Core invariants depend on this channel: hero state comes only from host agent events (2), no message may control a session (3), and transcript content never leaves the monitor (7). The webview is destroyed whenever the panel is hidden ([ADR 0001](0001-bottom-panel-webview.md)), so the host must rebuild it on demand, and messages posted before the webview's listener exists can be lost.

Options considered:

- **Schema library (zod, io-ts, ajv)**: concise, but a runtime dependency (forbidden by invariant 6).
- **TypeScript types only, no runtime checks**: types vanish at runtime; a webview bug or extra field would pass straight through.
- **Lenient runtime validation (check required fields, ignore extras)**: extra keys could carry transcript text or unreviewed commands through unnoticed.
- **Hand-written exact-key validators in `src/shared/`, plus host-side creators that copy only allow-listed keys**: no dependency, total and testable, and an extra field anywhere is a rejected message.
- **Host pushes on resolve** versus **webview pulls with `ready`**: pushing races the webview's listener; pulling is deterministic.

## Decision

- All message types, `AgentState`, `AgentInfo`, limits, validators, and creators live in `src/shared/protocol.ts`. Both directions are discriminated unions on `type`, with `readonly` fields and no optional properties.
- `AgentInfo` has exactly `id`, `name`, `state`, `toolName`, `timestamp`. Compile-time proofs tie the key list and the message-type lists to the unions.
- Every receiver validates with total parsers: plain object, exactly the expected own keys, known `type`, bounded and pattern-checked strings, returning a freshly built object or `undefined`. Parsers never throw.
- The host builds outgoing messages only through creators that copy allow-listed keys.
- The webview-to-host union is exactly `ready` and `focusAgent`. `focusAgent` is handled by a vscode-free `WebviewBridge` whose only outward capability is a reveal callback, invoked only for a live agent in the host's own list.
- Handshake is pull-based: the webview registers its listener, then sends `ready`; the host answers every `ready` with `config` then `agentList`, and pushes `agentState` only while in the `ready` state. Snapshots, not pushes, are the source of correctness.

## Consequences

- No dependency is added; validators are ordinary code covered by unit and fuzz tests.
- Adding a field is deliberate work: the type, the key list, the parser, the creator, the docs, and the tests change together. This friction is intended.
- Strict exact-key validation means a host and webview built from different commits reject each other's changed messages; both ship in one `.vsix`, so this only affects development, and `PROTOCOL_VERSION` makes it explicit.
- Host-side routing lives in a new vscode-free folder, `src/host/`, so it is testable under `node:test` without a `vscode` stub ([ADR 0006](0006-node-test-runner.md)). `extension.ts` stays thin glue. Later host logic (E1 progress store) follows the same pattern.
- Pushes can be dropped while the view is hidden or loading; consumers must treat `agentList` as authoritative and tolerate an `agentState` for an unknown id.
- Any future webview-to-host message (for example E1 progress save) needs a plan that checks it against invariant 3 and extends the "no controlling message types" test.
