// Transcript privacy (Core invariant 7, M3 plan test note 9). A marker string is planted in
// every place transcript text or an error message could leak from: message text, tool input,
// tool results, summaries, malformed lines, an invalid tool name, and the message of every file
// system error. A full AgentMonitor drives a real WebviewBridge, and the marker must appear in no
// log line at any level, no posted message, no snapshot, and no change payload.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentRegistry } from '../../src/monitor/AgentRegistry';
import { safeErrorCode } from '../../src/monitor/monitorLog';
import { AGENT_INFO_KEYS } from '../../src/shared/protocol';
import {
  MARKER,
  SESSION_A,
  SESSION_B,
  SESSION_C,
  assistantTextLine,
  toolResultLine,
  toolUseLine,
  turnEndLine,
  userLine,
  FakeTime,
  RecordingLogger,
} from '../support/monitorFakes';
import { ROOT, monitorRig, sessionFile } from '../support/monitorRig';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MARKER_ERROR = `ENOTSUP: operation failed at /secret/${MARKER}/file`;

const MARKER_LINES = [
  userLine(`prompt ${MARKER}`),
  toolUseLine('Bash', { command: `echo ${MARKER}` }),
  toolResultLine(`output ${MARKER}`),
  assistantTextLine(`reply ${MARKER}`),
  `{"type":"summary","summary":"${MARKER}"}\n`,
  `{"type":"user","message":"${MARKER}\n`, // malformed: unterminated, so SyntaxError would quote it
  toolUseLine(`${MARKER} tool`), // invalid tool name: becomes null
  turnEndLine(`done ${MARKER}`),
];

void describe('transcript privacy: the marker reaches no output', () => {
  void it('a full monitor and bridge never log, post, snapshot, or emit the marker, even through fs errors', async () => {
    const rig = monitorRig({
      config: { projectScope: 'all', simulator: 'off', debounceMs: 0, idleTimeoutMs: 10_000 },
    });
    // Healthy sessions with marker content.
    rig.fs.addFile(sessionFile(SESSION_A, '-ok'), MARKER_LINES.join(''));
    // Failures whose Error.message carries the marker, with and without a code.
    rig.fs.addFile(sessionFile(SESSION_B, '-bad-read'), userLine());
    rig.fs.addFile(`${ROOT}/-bad-list/${SESSION_C}.jsonl`, userLine());
    rig.fs.addFile(`${ROOT}/-bad-lstat/55555555-5555-4555-8555-555555555555.jsonl`, userLine());
    rig.fs.addFile(`${ROOT}/-bad-real/66666666-6666-4666-8666-666666666666.jsonl`, userLine());
    rig.fs.addFile(`${ROOT}/-bad-uncoded/77777777-7777-4777-8777-777777777777.jsonl`, userLine());
    rig.fs.inject('readRange', sessionFile(SESSION_B, '-bad-read'), {
      code: 'EIO',
      message: MARKER_ERROR,
    });
    rig.fs.inject('readdir', `${ROOT}/-bad-list`, { code: 'EACCES', message: MARKER_ERROR });
    rig.fs.inject('lstat', `${ROOT}/-bad-lstat/55555555-5555-4555-8555-555555555555.jsonl`, {
      message: MARKER_ERROR,
    });
    rig.fs.inject('realpath', `${ROOT}/-bad-real/66666666-6666-4666-8666-666666666666.jsonl`, {
      message: MARKER_ERROR,
    });
    rig.fs.inject('readdir', `${ROOT}/-bad-uncoded`, { message: MARKER_ERROR });
    rig.fs.inject('realpath', ROOT, { code: 'EACCES', message: MARKER_ERROR, times: 1 });

    await rig.time.advance(5 * SECOND);
    // Activity after startup, including the malformed marker line and a bad tool name.
    for (const line of MARKER_LINES) {
      rig.fs.append(sessionFile(SESSION_A, '-ok'), line);
      await rig.time.advance(2 * SECOND);
    }
    await rig.time.advance(3 * MINUTE);
    rig.ready();
    await rig.time.advance(MINUTE);

    // Not vacuous: the error paths and the agent really ran.
    assert.ok(rig.logger.text().includes('EACCES'), 'the coded fs errors were exercised');
    assert.ok(rig.logger.text().includes('unreadable'), 'a reason line was logged');
    assert.ok(
      rig.changes.some((c) => c.id === SESSION_A),
      'the marker session was tracked',
    );
    assert.ok(rig.changes.some((c) => c.toolName === 'Bash'));
    assert.ok(rig.posts.some((p) => p.type === 'agentState'));

    assert.ok(!rig.logger.text().includes(MARKER), `logs: ${rig.logger.text()}`);
    assert.ok(!JSON.stringify(rig.posts).includes(MARKER), 'posts');
    assert.ok(!JSON.stringify(rig.monitor.getAgents()).includes(MARKER), 'snapshot');
    assert.ok(!JSON.stringify(rig.changes).includes(MARKER), 'change payloads');
    assert.ok(!rig.logger.text().includes('/secret'), 'no error path text either');
  });

  void it('emitted records hold only id, name, state, toolName, and timestamp', async () => {
    const rig = monitorRig({ config: { debounceMs: 0 } });
    rig.fs.addFile(sessionFile(SESSION_A), MARKER_LINES.join(''));
    await rig.time.advance(5 * SECOND);
    rig.fs.append(sessionFile(SESSION_A), toolUseLine('Edit', { file: MARKER }));
    await rig.time.advance(3 * SECOND);
    assert.ok(rig.changes.length >= 2);
    const allowed = [...AGENT_INFO_KEYS].sort();
    for (const change of [...rig.changes, ...rig.monitor.getAgents()]) {
      assert.deepEqual(Object.keys(change).sort(), allowed);
      assert.equal(typeof change.timestamp, 'number');
      assert.ok(change.toolName === null || /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/.test(change.toolName));
      assert.equal(change.name, `My Repo ${SESSION_A.slice(0, 4)}`);
    }
    for (const post of rig.posts) {
      if (post.type === 'agentState') {
        assert.deepEqual(Object.keys(post.agent).sort(), allowed);
      }
    }
  });

  void it('an invalid tool name carrying the marker yields no tool name at all', async () => {
    const rig = monitorRig({ config: { debounceMs: 0 } });
    rig.fs.addFile(sessionFile(SESSION_A), userLine() + toolUseLine(`${MARKER} tool`));
    await rig.time.advance(3 * SECOND);
    assert.equal(rig.monitor.getAgents()[0]?.toolName, null);
  });

  void it('a malformed marker line is skipped with a fixed reason line only', async () => {
    const rig = monitorRig({ config: { debounceMs: 0 } });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(2 * SECOND);
    rig.fs.append(sessionFile(SESSION_A), `{"type":"user","message":"${MARKER}\n`);
    await rig.time.advance(3 * SECOND);
    assert.ok(
      rig.logger
        .messages('trace')
        .some((m) => m === 'monitor: transcript line skipped (unparseable)'),
    );
    assert.ok(!rig.logger.text().includes(MARKER));
  });

  void it('line text is not retained between polls: a partial marker line is re-read, not stored', async () => {
    const rig = monitorRig({ config: { debounceMs: 0 } });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(2 * SECOND);
    rig.fs.append(sessionFile(SESSION_A), `{"type":"user","message":"${MARKER}`);
    await rig.time.advance(3 * SECOND);
    const reads = rig.fs.callsTo('readRange');
    const partialOffset = userLine().length;
    assert.ok(
      reads.filter((c) => c.position === partialOffset).length >= 2,
      'the partial line is re-read',
    );
    assert.ok(!rig.logger.text().includes(MARKER));
  });
});

void describe('safeErrorCode never reads message or stack', () => {
  void it('returns the code, else the name, else unknown', () => {
    const coded = Object.assign(new Error(MARKER), { code: 'EACCES' });
    assert.equal(safeErrorCode(coded), 'EACCES');
    assert.equal(safeErrorCode(new SyntaxError(MARKER)), 'SyntaxError');
    assert.equal(safeErrorCode(new Error(MARKER)), 'Error');
  });

  void it('rejects a code or name that could carry text', () => {
    assert.equal(safeErrorCode(Object.assign(new Error('x'), { code: MARKER })), 'Error');
    assert.equal(safeErrorCode({ code: `E${MARKER} ${MARKER}`, name: `${MARKER}!` }), 'unknown');
    assert.equal(safeErrorCode({ name: 'x'.repeat(41) }), 'unknown');
  });

  void it('non-errors and hostile objects give unknown and never throw', () => {
    for (const value of [null, undefined, 42, MARKER, true, Symbol('s')]) {
      assert.equal(safeErrorCode(value), 'unknown');
    }
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error(MARKER);
        },
      },
    );
    assert.equal(safeErrorCode(hostile), 'unknown');
  });

  void it('never touches message or stack (getters that throw are not reached)', () => {
    const error = {
      code: 'EFOO',
      get message(): string {
        throw new Error('message read');
      },
      get stack(): string {
        throw new Error('stack read');
      },
    };
    assert.equal(safeErrorCode(error), 'EFOO');
  });
});

void describe('AgentRegistry holds no transcript text', () => {
  void it('upsert of a hostile name or tool is refused or normalized before it can be emitted', () => {
    const time = new FakeTime();
    const logger = new RecordingLogger();
    const registry = new AgentRegistry({ clock: time, timers: time, logger }, 0);
    const seen: string[] = [];
    registry.onDidChange((agent) => seen.push(JSON.stringify(agent)));
    registry.upsert('a', 'transcript', `Agent ${MARKER}\u0000`, 'working', `${MARKER} tool`);
    assert.equal(seen.length, 0, 'a name with a control character is refused');
    registry.upsert('a', 'transcript', 'Agent a', 'working', `${MARKER} tool`);
    assert.ok(seen.every((line) => !line.includes(MARKER)));
    assert.ok(!logger.text().includes(MARKER));
  });
});
