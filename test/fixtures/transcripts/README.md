# Transcript fixtures

Purpose: hand-written, synthetic Claude Code transcript lines for the monitor tests. See [testing strategy](../../../docs/engineering/testing-strategy.md).

Every line here is invented. A real transcript is never copied into this folder, because transcripts hold prompts, code, and tool output (Core invariant 7). Fixture text is deliberately bland and contains no names, paths, or secrets.

| File | Used by | Content |
|---|---|---|
| `basic-session.jsonl` | `test/monitor/transcriptParsing.test.ts`, `test/monitor/fixtureReplay.test.ts` | A summary line, a prompt, an assistant reply, two tool calls with results, a turn end. |
| `edge-cases.jsonl` | `test/monitor/transcriptParsing.test.ts` | A truncated line, an unknown type, a tool call with an invalid name, an `mcp__` tool call, a bare array, a prompt. |
