# ADR 0005: Detect agents by polling Claude Code transcripts read-only

Purpose: records how the monitor learns that a Claude Code session exists and what it is doing, and why it polls transcript files instead of using hooks, watchers, processes, or terminal output.
Related: [agent detection](../agent-detection.md), [M3 plan](../plans/m3-monitor.md), [security and safety](../security-and-safety.md), [host-webview protocol](../host-webview-protocol.md), [ADR 0002 no hero health](0002-no-hero-health.md), [ADR 0004 esbuild two bundles](0004-esbuild-two-bundles.md), [ADR 0007 allow-list protocol](0007-allow-list-protocol-pull-handshake.md), [coding standards](../../engineering/coding-standards.md), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

Every hero's lifecycle comes from the host's agent-state events (Core invariant 2), so the extension must detect Claude Code sessions and tell whether each is working or idle. The constraints:

- The monitor is strictly read-only (Core invariant 3): it never writes to, signals, or sends input to a process, a terminal, or a file.
- Only session id, name, state, tool name, and timestamp may be extracted; transcript content is never stored, logged, or sent (Core invariant 7).
- No runtime dependencies (Core invariant 6): only Node built-ins and the `vscode` API.
- A broken transcript or watcher must never crash the extension host (Core invariant 4).
- It must work on macOS, Linux, and Windows, including in remote windows, where the extension runs next to Claude Code.
- An unrelated extension on the human's machine, `pablodelucca.pixel-agents`, installs hooks into `~/.claude`. Pixel Agents must neither depend on nor interfere with it.

Claude Code appends one JSON object per line (JSONL) to a transcript file per session under `~/.claude/projects/<encoded cwd>/<session uuid>.jsonl`, where the encoded cwd is the session's working directory with every character outside `[A-Za-z0-9]` replaced by `-`. Assistant lines name the tools they call; user lines carry prompts and tool results. There is no explicit end-of-session record.

Options considered:

- **Claude Code hooks** (`SessionStart`, `PreToolUse`, `Stop`, `SessionEnd`): precise, but installing them means writing to `~/.claude/settings.json` (forbidden by invariant 3), they run shell commands on the user's behalf, and they would collide with the other extension's hooks.
- **Process inspection** (`ps`, `/proc`, `tasklist`): needs `child_process` or platform-specific reads, says nothing about tools, and is the kind of process access invariant 3 rules out.
- **Terminal output** (shell integration, `onDidWriteTerminalData`): proposed or partial APIs, and terminal output is transcript-grade content we must not read.
- **IDE integration lock files under `~/.claude/ide/`**: owned by Claude Code's own IDE extension; reading them couples us to its private protocol, and participating would require writing.
- **`fs.watch` on the transcript tree**: event delivery differs per platform (recursive watching on Linux only since Node 20, unreliable on network and WSL-mounted drives, coalesced or duplicated events, rename versus change ambiguity), and each watcher holds an OS handle.
- **Polling the transcript tree with read-only `stat`, `readdir`, and positional reads**: one code path on every platform, deterministic under fake clocks, bounded cost, no handles held between polls.

## Decision

- **Source of truth is the transcript files, read-only, by polling.** The monitor never installs, reads, or depends on hooks, never reads `~/.claude/settings.json` or any file other than `<root>/<project dir>/<uuid>.jsonl`, and never uses `fs.watch` or `fs.watchFile`. A single `setTimeout` chain polls every `pixelAgents.pollIntervalMs` (default 1000 ms); polls never overlap.
- **Root and scope.** The root is `pixelAgents.transcriptPath`, or `<home>/.claude/projects` when empty. By default only the project directories that correspond to the window's workspace folders are read (`pixelAgents.projectScope: "workspace"`); `"all"` reads every project directory under the root. Both settings are machine-scoped so a repository's `.vscode/settings.json` cannot widen what is read.
- **Containment.** The root is resolved once per scan with `realpath`; below it, symbolic links are never followed (entries are `lstat`ed and skipped if they are links), each tracked file's `realpath` must stay inside the resolved root, and files are opened `O_RDONLY | O_NOFOLLOW` (where the platform has it), checked with `fstat` against the identity seen by `lstat`, read, and closed in the same call. No handle is held between polls, so the monitor never blocks Claude Code from writing, rotating, or deleting a file (relevant on Windows).
- **Incremental, bounded reads.** Each tracked file keeps only a byte offset and its identity. A newly discovered file is read from at most 64 KiB before its end; afterwards only appended bytes are read, at most 1 MiB per file per poll. Only complete lines are parsed; a trailing partial line is not consumed and is re-read on the next poll, so no transcript text is kept between polls. A line longer than 256 KiB is skipped (counted as activity, never parsed). Truncation or an identity change resets the offset without ending the session.
- **Five fields, discarded immediately.** Each complete line is parsed with `JSON.parse` in a try/catch and classified into a fixed signal (`prompt`, `assistant`, `toolUse` with a tool name, `toolResult`, `turnEnd`, `ignored`, `unparseable`). Only `type`, `message.content[].type`, `message.content[].name`, and `message.stop_reason` are read; the tool name is kept only if it matches the protocol's `TOOL_NAME_PATTERN`. The parsed value never leaves the classifier. The session id is the file's base name; the name is derived from the workspace folder or project directory name plus a short id, never from transcript text. Timestamps are the monitor's clock at each state change.
- **State from activity and silence.** A per-session state machine turns signals and elapsed silence into `spawned`, `working`, `idle`, and `despawned`, with every threshold a `pixelAgents.*` setting ([agent detection](../agent-detection.md#4-session-state-machine)). Because transcripts have no end marker, "session end" means the file was removed, it left the configured scope, or it was silent for `pixelAgents.sessionEndTimeoutMinutes`.
- **Errors never carry content.** Monitor code logs only fixed reason strings plus a sanitized error code (`error.code` such as `EACCES`, else `error.name` such as `SyntaxError`), never `error.message` or `error.stack`, because V8's `JSON.parse` errors quote their input and Node's fs errors embed paths.

## Consequences

- No hook, setting, or file is ever written, so the monitor coexists with `pablodelucca.pixel-agents` and any other tool that uses Claude Code hooks; their presence or absence changes nothing for us.
- Detection depends on Claude Code's transcript layout (directory encoding, JSONL record shapes). If Claude Code changes it, workspace-scoped discovery or tool names may silently stop working; the classifier and path encoder are small pure functions with fixture tests, and `projectScope: "all"` plus `transcriptPath` are the user-side fallbacks. Users who relocate Claude Code's config directory (for example with `CLAUDE_CONFIG_DIR`) set `pixelAgents.transcriptPath`; the extension reads no environment variables.
- State is inferred, not reported: a long silent generation can show `idle` early, a permission prompt can show `working` until `toolTimeoutSeconds`, and a session closed without deleting its file despawns only after `sessionEndTimeoutMinutes`. The defaults favour a calm display over instant reaction.
- Polling costs a few `lstat` calls and at most a bounded read per active session per second, in the extension host, off the webview's frame budget. It runs while the view is hidden, so the next `ready` snapshot is current.
- The read path is testable without a disk (a read-only file-system port with an in-memory fake) and with one (temp directories of synthetic fixtures; never real transcripts).
- Subagent transcripts (`agent-*.jsonl`) and non-UUID files are ignored; subagent activity inside a session's own file counts as that session's work.
- Moving to hooks or a watcher later would be a new ADR superseding this one.
