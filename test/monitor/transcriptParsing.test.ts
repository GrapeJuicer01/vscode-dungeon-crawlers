// Line scanning and record classification (M3 plan test notes 2 and 3). Fixtures are synthetic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { MAX_CONTENT_BLOCKS, classifyTranscriptLine } from '../../src/monitor/transcriptRecord';
import { MAX_LINE_BYTES, scanLines } from '../../src/monitor/transcriptLines';
import { MAX_TOOL_NAME_LENGTH } from '../../src/shared/protocol';
import { repoPath } from '../support/repo';
import {
  MARKER,
  assistantTextLine,
  toolResultLine,
  toolUseLine,
  turnEndLine,
  userLine,
} from '../support/monitorFakes';

const enc = new TextEncoder();
const bytes = (text: string): Uint8Array => enc.encode(text);

void describe('scanLines', () => {
  void it('splits complete lines and consumes them all', () => {
    const scan = scanLines(bytes('a\nb\nc\n'), false, 100);
    assert.deepEqual(scan.lines, ['a', 'b', 'c']);
    assert.equal(scan.consumedBytes, 6);
    assert.equal(scan.skipRemainder, false);
  });

  void it('strips a trailing CR (CRLF files)', () => {
    assert.deepEqual(scanLines(bytes('a\r\nb\r\n'), false, 100).lines, ['a', 'b']);
  });

  void it('does not consume a trailing partial line', () => {
    const scan = scanLines(bytes('a\nbc'), false, 100);
    assert.deepEqual(scan.lines, ['a']);
    assert.equal(scan.consumedBytes, 2);
  });

  void it('skipLeadingPartial drops bytes up to and including the first newline', () => {
    const scan = scanLines(bytes('tail-of-line\nfull\n'), true, 100);
    assert.deepEqual(scan.lines, ['full']);
    assert.equal(scan.consumedBytes, 18);
  });

  void it('skipLeadingPartial with no newline consumes everything and stays in skip mode', () => {
    const scan = scanLines(bytes('no newline here'), true, 100);
    assert.deepEqual(scan.lines, []);
    assert.equal(scan.consumedBytes, 15);
    assert.equal(scan.skipRemainder, true);
  });

  void it('keeps a line of exactly maxLineBytes and drops one byte more, counting it', () => {
    const exact = 'x'.repeat(10);
    const over = 'y'.repeat(11);
    const scan = scanLines(bytes(`${exact}\n${over}\nok\n`), false, 10);
    assert.deepEqual(scan.lines, [exact, 'ok']);
    assert.equal(scan.oversizedLines, 1);
  });

  void it('line length is measured without the CR', () => {
    const scan = scanLines(bytes(`${'x'.repeat(10)}\r\n`), false, 10);
    assert.equal(scan.lines.length, 1);
    assert.equal(scan.oversizedLines, 0);
  });

  void it('a partial tail over the limit sets skipRemainder and consumes everything', () => {
    const scan = scanLines(bytes(`ok\n${'z'.repeat(11)}`), false, 10);
    assert.deepEqual(scan.lines, ['ok']);
    assert.equal(scan.skipRemainder, true);
    assert.equal(scan.consumedBytes, 3 + 11);
  });

  void it('a multi-byte character split across reads is never decoded half: the partial line is not consumed', () => {
    const full = bytes('é\n'); // 0xC3 0xA9 0x0A
    const first = scanLines(full.subarray(0, 1), false, 100);
    assert.deepEqual(first.lines, []);
    assert.equal(first.consumedBytes, 0);
    const second = scanLines(full, false, 100);
    assert.deepEqual(second.lines, ['é']);
  });

  void it('an empty buffer yields nothing', () => {
    const scan = scanLines(new Uint8Array(0), false, 100);
    assert.deepEqual(scan, {
      lines: [],
      consumedBytes: 0,
      oversizedLines: 0,
      skipRemainder: false,
    });
  });

  void it('MAX_LINE_BYTES is 256 KiB', () => {
    assert.equal(MAX_LINE_BYTES, 256 * 1024);
  });
});

void describe('classifyTranscriptLine', () => {
  const trim = (line: string): string => line.trimEnd();

  void it('tool_use gives toolUse with the tool name', () => {
    assert.deepEqual(classifyTranscriptLine(trim(toolUseLine('Bash', { command: MARKER }))), {
      kind: 'toolUse',
      toolName: 'Bash',
    });
  });

  void it('two tool_use blocks give the last name', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Read' },
          { type: 'text', text: 'x' },
          { type: 'tool_use', name: 'Edit' },
        ],
      },
    });
    assert.deepEqual(classifyTranscriptLine(line), { kind: 'toolUse', toolName: 'Edit' });
  });

  void it('invalid names give a toolUse with a null name; mcp__ names are accepted', () => {
    for (const name of ['Bash tool', '', 'x'.repeat(MAX_TOOL_NAME_LENGTH + 1), 5, null]) {
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name }] },
      });
      assert.deepEqual(classifyTranscriptLine(line), { kind: 'toolUse', toolName: null });
    }
    assert.equal(classifyTranscriptLine(trim(toolUseLine('mcp__x__y'))).toolName, 'mcp__x__y');
  });

  void it('end_turn without a tool gives turnEnd; plain assistant text gives assistant', () => {
    assert.equal(classifyTranscriptLine(trim(turnEndLine())).kind, 'turnEnd');
    assert.equal(classifyTranscriptLine(trim(assistantTextLine())).kind, 'assistant');
  });

  void it('stop_reason end_turn with a tool_use is still toolUse', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { stop_reason: 'end_turn', content: [{ type: 'tool_use', name: 'Bash' }] },
    });
    assert.equal(classifyTranscriptLine(line).kind, 'toolUse');
  });

  void it('user tool_result gives toolResult; user text gives prompt', () => {
    assert.equal(classifyTranscriptLine(trim(toolResultLine())).kind, 'toolResult');
    assert.equal(classifyTranscriptLine(trim(userLine())).kind, 'prompt');
  });

  void it('summary, system, snapshot, unknown types, and non-objects are ignored', () => {
    const ignored = [
      '{"type":"summary","summary":"s"}',
      '{"type":"system"}',
      '{"type":"file-history-snapshot"}',
      '{"type":"mystery"}',
      '{}',
      '[]',
      '[{"type":"assistant"}]',
      '42',
      'null',
      '"assistant"',
      'true',
    ];
    for (const line of ignored) {
      assert.deepEqual(classifyTranscriptLine(line), { kind: 'ignored', toolName: null }, line);
    }
  });

  void it('truncated or non-JSON lines are unparseable', () => {
    for (const line of ['{"type":"user","message":"', '', 'not json', '{']) {
      assert.deepEqual(classifyTranscriptLine(line), { kind: 'unparseable', toolName: null });
    }
  });

  void it('a __proto__ key is never trusted and Object.prototype is untouched', () => {
    const before = Object.keys(Object.prototype).length;
    assert.equal(classifyTranscriptLine('{"__proto__":{"type":"assistant"}}').kind, 'ignored');
    assert.equal(
      classifyTranscriptLine(
        '{"type":"user","message":{"__proto__":{"content":[{"type":"tool_result"}]}}}',
      ).kind,
      'prompt',
    );
    assert.equal(Object.keys(Object.prototype).length, before);
    assert.equal(({} as Record<string, unknown>).type, undefined);
  });

  void it('deeply nested input does not throw', () => {
    const deep = '['.repeat(10_000) + ']'.repeat(10_000);
    assert.doesNotThrow(() => classifyTranscriptLine(deep));
    const nested = '{"a":'.repeat(5_000) + '1' + '}'.repeat(5_000);
    assert.doesNotThrow(() => classifyTranscriptLine(nested));
  });

  void it('scans at most MAX_CONTENT_BLOCKS blocks', () => {
    const blocks = Array.from({ length: MAX_CONTENT_BLOCKS + 5 }, () => ({ type: 'text' }));
    blocks[MAX_CONTENT_BLOCKS + 2] = { type: 'tool_use' };
    const line = JSON.stringify({ type: 'assistant', message: { content: blocks } });
    assert.equal(classifyTranscriptLine(line).kind, 'assistant');
  });

  void it('every result has exactly the keys kind and toolName and no fixture text but the tool name', () => {
    const lines = [
      toolUseLine('Bash', { command: MARKER }),
      userLine(MARKER),
      toolResultLine(MARKER),
      assistantTextLine(MARKER),
      `{"type":"user","message":"${MARKER}`,
      `{"type":"summary","summary":"${MARKER}"}`,
      toolUseLine(`${MARKER} tool`),
    ].map(trim);
    for (const line of lines) {
      const result = classifyTranscriptLine(line);
      assert.deepEqual(Object.keys(result).sort(), ['kind', 'toolName']);
      assert.ok(!JSON.stringify(result).includes(MARKER), line);
    }
  });
});

void describe('synthetic fixture files', () => {
  const read = (name: string): string[] =>
    readFileSync(repoPath(`test/fixtures/transcripts/${name}`), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0);

  void it('basic-session.jsonl classifies to the documented sequence', () => {
    const kinds = read('basic-session.jsonl').map((line) => classifyTranscriptLine(line).kind);
    assert.deepEqual(kinds, [
      'ignored',
      'prompt',
      'assistant',
      'toolUse',
      'toolResult',
      'toolUse',
      'toolResult',
      'turnEnd',
    ]);
  });

  void it('edge-cases.jsonl has one line per documented edge and never throws', () => {
    const results = read('edge-cases.jsonl').map((line) => classifyTranscriptLine(line));
    assert.deepEqual(
      results.map((result) => result.kind),
      ['unparseable', 'ignored', 'toolUse', 'toolUse', 'ignored', 'prompt'],
    );
    assert.deepEqual(
      results.map((result) => result.toolName),
      [null, null, null, 'mcp__files__read', null, null],
    );
  });

  void it('the fixture README states that fixtures are synthetic and real transcripts are never copied', () => {
    const readme = readFileSync(repoPath('test/fixtures/transcripts/README.md'), 'utf8');
    assert.match(readme, /synthetic/i);
    assert.match(readme, /never/i);
  });
});
