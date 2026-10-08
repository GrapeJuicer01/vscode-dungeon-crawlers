// TranscriptSource over the in-memory file system (M3 plan test note 7): discovery and scope,
// containment, incremental reads, lifecycle (debounce, idle timeout, despawn on session end),
// error handling, polling discipline, and disposal. Virtual time only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReadOnlyFileSystem } from '../../src/monitor/ports';
import { MAX_READ_BYTES_PER_POLL } from '../../src/monitor/transcriptFiles';
import { STALE_RECHECK_BATCH, STALE_RECHECK_MS } from '../../src/monitor/staleFiles';
import { isAgentId } from '../../src/shared/protocol';
import {
  SESSION_A,
  SESSION_B,
  SESSION_C,
  assistantTextLine,
  toolResultLine,
  toolUseLine,
  turnEndLine,
  userLine,
} from '../support/monitorFakes';
import { FOLDER, PROJECT_DIR, ROOT, sessionFile, sourceRig } from '../support/monitorRig';
import type { SourceRig } from '../support/monitorRig';
import { settle } from '../support/monitorFakes';

const MINUTE = 60_000;

/** Starts the source and lets the first scan finish. */
async function startAndScan(rig: SourceRig): Promise<void> {
  rig.source.start();
  await settle();
}

function statesOf(rig: SourceRig, id: string): string[] {
  return rig.events.filter((e) => e.id === id).map((e) => e.state);
}

void describe('discovery and scope', () => {
  void it('workspace scope reads only the encoded folder directory, never the root listing or a sibling', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.addFile(sessionFile(SESSION_B, `${PROJECT_DIR}-old`), userLine());
    await startAndScan(rig);
    await rig.time.advance(3000);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
    const readdirs = rig.fs.callsTo('readdir').map((call) => call.path);
    assert.ok(readdirs.length > 0);
    assert.ok(
      readdirs.every((p) => p === `${ROOT}/${PROJECT_DIR}`),
      readdirs.join(),
    );
    assert.deepEqual(rig.fs.callsUnder(`${ROOT}/${PROJECT_DIR}-old`), []);
    assert.deepEqual(
      rig.fs.calls.filter((c) => c.op === 'readdir' && c.path === ROOT),
      [],
    );
  });

  void it('workspace scope also reads the realpath-encoded directory of a linked folder', async () => {
    const rig = sourceRig({}, [{ name: 'linked', fsPath: '/work/link' }]);
    rig.fs.addDir('/real/place');
    rig.fs.addSymlink('/work/link', '/real/place');
    rig.fs.addFile(sessionFile(SESSION_A, '-real-place'), userLine());
    await startAndScan(rig);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
    assert.equal(rig.registry.snapshot()[0]?.name, 'linked 1111');
  });

  void it('workspace scope with no folders reads nothing: zero fs calls', async () => {
    const rig = sourceRig({}, []);
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    await rig.time.advance(5000);
    assert.deepEqual(rig.fs.calls, []);
    assert.deepEqual(rig.registry.ids('transcript'), []);
  });

  void it('all scope lists the root and finds every project; ignores agent-*, non-UUID files, subdirectories, and links', async () => {
    const rig = sourceRig({ projectScope: 'all' });
    rig.fs.addFile(sessionFile(SESSION_A, '-proj-one'), userLine());
    rig.fs.addFile(sessionFile(SESSION_B, '-proj-two'), userLine());
    rig.fs.addFile(`${ROOT}/-proj-one/agent-1a2b.jsonl`, userLine());
    rig.fs.addFile(`${ROOT}/-proj-one/notes.jsonl`, userLine());
    rig.fs.addFile(`${ROOT}/-proj-one/${SESSION_C}.jsonl.bak`, userLine());
    rig.fs.addDir(`${ROOT}/-proj-one/22222222-2222-4222-8222-aaaaaaaaaaaa.jsonl`);
    // A symlinked file named like a session, and a symlinked project directory.
    rig.fs.addFile('/outside/secret.jsonl', userLine());
    rig.fs.addSymlink(
      `${ROOT}/-proj-one/44444444-4444-4444-8444-444444444444.jsonl`,
      '/outside/secret.jsonl',
    );
    rig.fs.addDir('/outside/dir');
    rig.fs.addFile(`/outside/dir/${SESSION_C}.jsonl`, userLine());
    rig.fs.addSymlink(`${ROOT}/-proj-link`, '/outside/dir');
    await startAndScan(rig);
    assert.deepEqual([...rig.registry.ids('transcript')].sort(), [SESSION_A, SESSION_B].sort());
    assert.deepEqual(rig.fs.callsUnder('/outside'), [], 'nothing outside the root is touched');
    assert.ok(rig.fs.callsTo('readdir').some((c) => c.path === ROOT));
  });

  void it('a file whose realpath leaves the root is never passed to readRange', async () => {
    const swapped = `${ROOT}/${PROJECT_DIR}/${SESSION_B}.jsonl`;
    const rig = sourceRig({}, [FOLDER], (fs): ReadOnlyFileSystem => ({
      homedir: () => fs.homedir(),
      realpath: (target) =>
        target === swapped ? Promise.resolve('/etc/elsewhere.jsonl') : fs.realpath(target),
      lstat: (target) => fs.lstat(target),
      readdir: (target) => fs.readdir(target),
      readRange: (file, position, length, expected) =>
        fs.readRange(file, position, length, expected),
    }));
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.addFile(swapped, userLine());
    await startAndScan(rig);
    await rig.time.advance(3000);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
    assert.deepEqual(
      rig.fs.callsTo('readRange').filter((c) => c.path === swapped),
      [],
    );
    assert.ok(rig.logger.text().includes('outside root'));
  });

  void it('a transcript root that is itself a symlink works', async () => {
    const rig = sourceRig({ transcriptPath: '/link/projects' });
    rig.fs.addDir('/data/projects');
    rig.fs.addSymlink('/link/projects', '/data/projects');
    rig.fs.addFile(`/data/projects/${PROJECT_DIR}/${SESSION_A}.jsonl`, userLine());
    await startAndScan(rig);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
  });

  void it('a relative transcriptPath reads nothing and logs one error', async () => {
    const rig = sourceRig({ transcriptPath: 'relative/dir' });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    await rig.time.advance(5000);
    assert.deepEqual(rig.fs.calls, []);
    assert.equal(rig.logger.messages('error').length, 1);
    assert.equal(rig.source.status, 'off');
  });

  void it('a symlinked project directory is skipped in workspace scope too', async () => {
    const rig = sourceRig();
    rig.fs.addDir('/outside/dir');
    rig.fs.addFile(`/outside/dir/${SESSION_A}.jsonl`, userLine());
    rig.fs.addDir(ROOT);
    rig.fs.addSymlink(`${ROOT}/${PROJECT_DIR}`, '/outside/dir');
    await startAndScan(rig);
    assert.deepEqual(rig.registry.ids('transcript'), []);
    assert.deepEqual(rig.fs.callsTo('readRange'), []);
  });
});

void describe('startup discovery', () => {
  void it('reads only the last 64 KiB of a big fresh file', async () => {
    const rig = sourceRig();
    const line = userLine('x'.repeat(200));
    const content = line.repeat(Math.ceil((200 * 1024) / line.length)) + toolUseLine('Grep');
    rig.fs.addFile(sessionFile(SESSION_A), content);
    await startAndScan(rig);
    const reads = rig.fs.callsTo('readRange');
    assert.equal(reads.length, 1);
    assert.equal(reads[0]?.position, content.length - 64 * 1024);
    assert.equal(reads[0]?.length, 64 * 1024);
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'Grep');
  });

  void it('stale files are not discovered and are re-checked at most every 10 s', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine(), { mtimeMs: rig.time.now() - 31 * MINUTE });
    await startAndScan(rig);
    const lstatsOnFile = (): number =>
      rig.fs.callsTo('lstat').filter((c) => c.path === sessionFile(SESSION_A)).length;
    assert.equal(lstatsOnFile(), 1);
    await rig.time.advance(STALE_RECHECK_MS - 1000);
    assert.equal(lstatsOnFile(), 1, 'no re-check before 10 s');
    await rig.time.advance(2000);
    assert.equal(lstatsOnFile(), 2, 're-checked once after 10 s');
    assert.deepEqual(rig.registry.ids('transcript'), []);
    assert.deepEqual(rig.fs.callsTo('readRange'), []);
  });

  void it('a stale file that is written again is discovered at the next re-check', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine(), { mtimeMs: rig.time.now() - 31 * MINUTE });
    await startAndScan(rig);
    rig.fs.append(sessionFile(SESSION_A), userLine());
    await rig.time.advance(STALE_RECHECK_MS + 1000);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
  });

  void it('re-checks at most STALE_RECHECK_BATCH stale files per scan', async () => {
    const rig = sourceRig({ projectScope: 'all' });
    const old = rig.time.now() - 40 * MINUTE;
    const total = STALE_RECHECK_BATCH + 100;
    for (let i = 0; i < total; i += 1) {
      const id = `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`;
      rig.fs.addFile(`${ROOT}/-p/${id}.jsonl`, userLine(), { mtimeMs: old });
    }
    await startAndScan(rig);
    assert.equal(rig.fs.callsTo('lstat').filter((c) => c.path.endsWith('.jsonl')).length, total);
    const before = rig.fs.callsTo('lstat').length;
    await rig.time.advance(STALE_RECHECK_MS);
    const during = rig.fs
      .callsTo('lstat')
      .slice(before)
      .filter((c) => c.path.endsWith('.jsonl'));
    assert.equal(
      during.length,
      STALE_RECHECK_BATCH,
      'exactly one bounded batch at the first due scan',
    );
  });

  void it('startup files do not fire onDidDiscoverNewSession; a file that appears later does', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    const discovered: string[] = [];
    rig.source.onDidDiscoverNewSession((id) => discovered.push(id));
    await startAndScan(rig);
    assert.deepEqual(discovered, []);
    rig.fs.addFile(sessionFile(SESSION_B), userLine());
    await rig.time.advance(2000);
    assert.deepEqual(discovered, [SESSION_B]);
  });

  void it('onDidFinishFirstScan fires once, also when the root is missing', async () => {
    for (const withRoot of [true, false]) {
      const rig = sourceRig();
      if (withRoot) {
        rig.fs.addFile(sessionFile(SESSION_A), userLine());
      }
      let fired = 0;
      rig.source.onDidFinishFirstScan(() => (fired += 1));
      await startAndScan(rig);
      await rig.time.advance(5000);
      assert.equal(fired, 1);
    }
  });

  void it('ids and names are protocol-valid (isAgentId, no path text)', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A.toUpperCase().replace(/-/g, '-')), userLine());
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    for (const agent of rig.registry.snapshot()) {
      assert.ok(isAgentId(agent.id));
      assert.equal(agent.name, 'My Repo 1111');
    }
  });
});

void describe('lifecycle from transcript activity', () => {
  void it('spawned immediately, working after the debounce, with the tool name from activity', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    assert.deepEqual(statesOf(rig, SESSION_A), ['spawned']);
    await rig.time.advance(2000);
    assert.deepEqual(statesOf(rig, SESSION_A), ['spawned', 'working']);
    rig.fs.append(sessionFile(SESSION_A), toolUseLine('Bash'));
    await rig.time.advance(2000);
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'Bash');
    assert.equal(rig.registry.snapshot()[0]?.state, 'working');
  });

  void it('appended lines are processed in order (tool changes arrive as written)', async () => {
    const rig = sourceRig({ debounceMs: 0 });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    await rig.time.advance(1000);
    for (const tool of ['Read', 'Edit']) {
      rig.fs.append(sessionFile(SESSION_A), toolUseLine(tool) + toolResultLine());
      await rig.time.advance(1000);
    }
    const tools = rig.events.filter((e) => e.toolName !== null).map((e) => e.toolName);
    assert.deepEqual(tools, ['Read', 'Edit']);
  });

  void it('goes idle after idleTimeout of silence (default 60 s), not before', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine() + assistantTextLine());
    await startAndScan(rig);
    await rig.time.advance(55_000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'working');
    await rig.time.advance(10_000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
    assert.deepEqual(statesOf(rig, SESSION_A), ['spawned', 'working', 'idle']);
  });

  void it('a pending tool keeps the agent working past idleTimeout until toolTimeout', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine() + toolUseLine('Bash'));
    await startAndScan(rig);
    await rig.time.advance(120_000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'working');
    await rig.time.advance(200_000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
  });

  void it('a turn end goes idle quickly (after the debounce), then new activity resumes working', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    await rig.time.advance(2000);
    rig.fs.append(sessionFile(SESSION_A), turnEndLine());
    await rig.time.advance(3000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
    rig.fs.append(sessionFile(SESSION_A), userLine());
    await rig.time.advance(2000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'working');
  });

  void it('idle is never despawned before sessionEndTimeout; despawned fires once at the end of the window', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine() + assistantTextLine());
    await startAndScan(rig);
    await rig.time.advance(29 * MINUTE);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
    assert.ok(!statesOf(rig, SESSION_A).includes('despawned'));
    await rig.time.advance(2 * MINUTE);
    assert.equal(statesOf(rig, SESSION_A).filter((s) => s === 'despawned').length, 1);
    assert.deepEqual(rig.registry.snapshot(), []);
    await rig.time.advance(10 * MINUTE);
    assert.equal(statesOf(rig, SESSION_A).filter((s) => s === 'despawned').length, 1);
  });

  void it('a session that went silent long enough to despawn comes back as a new spawn when written again', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    await rig.time.advance(32 * MINUTE);
    assert.equal(rig.registry.count('transcript'), 0);
    rig.fs.append(sessionFile(SESSION_A), userLine());
    await rig.time.advance(STALE_RECHECK_MS + 2000);
    assert.deepEqual(statesOf(rig, SESSION_A).slice(-3), ['despawned', 'spawned', 'working']);
  });

  void it('a removed file gives despawned', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    rig.fs.remove(sessionFile(SESSION_A));
    await rig.time.advance(2000);
    assert.equal(statesOf(rig, SESSION_A).at(-1), 'despawned');
  });

  void it('ELOOP on read (file swapped for a link) gives despawned', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    rig.fs.inject('readRange', sessionFile(SESSION_A), { code: 'ELOOP', message: 'ELOOP: loop' });
    rig.fs.append(sessionFile(SESSION_A), userLine());
    await rig.time.advance(2000);
    assert.equal(statesOf(rig, SESSION_A).at(-1), 'despawned');
  });

  void it('truncation resets the offset without despawning', async () => {
    const rig = sourceRig();
    const big = userLine('a'.repeat(300)) + userLine('b'.repeat(300));
    rig.fs.addFile(sessionFile(SESSION_A), big);
    await startAndScan(rig);
    await rig.time.advance(2000);
    rig.fs.replace(sessionFile(SESSION_A), toolUseLine('Edit'));
    await rig.time.advance(3000);
    assert.ok(!statesOf(rig, SESSION_A).includes('despawned'));
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'Edit');
  });

  void it('an inode change (rotation) re-reads from the tail without despawning', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine(), { ino: 500 });
    await startAndScan(rig);
    await rig.time.advance(2000);
    rig.fs.replace(sessionFile(SESSION_A), userLine() + toolUseLine('Glob') + userLine(), {
      ino: 501,
    });
    await rig.time.advance(3000);
    assert.ok(!statesOf(rig, SESSION_A).includes('despawned'));
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'Glob');
    const reads = rig.fs.callsTo('readRange');
    assert.equal(reads.at(-1)?.position, 0, 'restarted from the tail start');
  });

  void it('an EIDENTITY rejection is handled as rotation: no despawn, read resumes', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    rig.fs.inject('readRange', sessionFile(SESSION_A), {
      code: 'EIDENTITY',
      message: 'changed',
      times: 1,
    });
    rig.fs.append(sessionFile(SESSION_A), toolUseLine('WebFetch'));
    await rig.time.advance(4000);
    assert.ok(!statesOf(rig, SESSION_A).includes('despawned'));
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'WebFetch');
  });

  void it('ino 0 disables the identity check (no EIDENTITY-style reset on a changed inode)', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine(), { ino: 0, dev: 0 });
    await startAndScan(rig);
    await rig.time.advance(2000);
    const before = rig.fs.callsTo('readRange').length;
    rig.fs.append(sessionFile(SESSION_A), toolUseLine('Task'));
    await rig.time.advance(2000);
    const reads = rig.fs.callsTo('readRange').slice(before);
    assert.ok(reads.length >= 1);
    assert.ok((reads[0]?.position ?? 0) > 0, 'continued at the old offset, no reset');
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'Task');
  });
});

void describe('incremental reads', () => {
  void it('a partial line is not parsed until completed, and is re-read from its own offset', async () => {
    const rig = sourceRig({ debounceMs: 0 });
    const first = userLine();
    rig.fs.addFile(sessionFile(SESSION_A), first);
    await startAndScan(rig);
    await rig.time.advance(1000);
    const full = toolUseLine('Bash');
    const half = full.slice(0, 40);
    rig.fs.append(sessionFile(SESSION_A), half);
    await rig.time.advance(2000);
    assert.equal(rig.registry.snapshot()[0]?.toolName, null, 'half a line changes nothing');
    rig.fs.append(sessionFile(SESSION_A), full.slice(40));
    await rig.time.advance(2000);
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'Bash');
    const positions = rig.fs.callsTo('readRange').map((c) => c.position);
    assert.ok(
      positions.filter((p) => p === first.length).length >= 2,
      `the partial line is re-read from offset ${first.length}: ${positions.join()}`,
    );
  });

  void it('no single read exceeds 1 MiB', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    await rig.time.advance(1000);
    const chunk = userLine('q'.repeat(1000)).repeat(3500); // about 3.5 MB
    rig.fs.append(sessionFile(SESSION_A), chunk);
    await rig.time.advance(10_000);
    for (const call of rig.fs.callsTo('readRange')) {
      assert.ok((call.length ?? 0) <= MAX_READ_BYTES_PER_POLL, `${call.length}`);
    }
    assert.ok(rig.fs.callsTo('readRange').length >= 4, 'the append took several polls');
  });

  void it('an oversized line is skipped across polls and counts as activity once', async () => {
    const rig = sourceRig({ debounceMs: 0 });
    rig.fs.addFile(sessionFile(SESSION_A), userLine() + assistantTextLine());
    await startAndScan(rig);
    await rig.time.advance(61_000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
    const mark = rig.time.now();
    rig.fs.append(sessionFile(SESSION_A), 'x'.repeat(300 * 1024)); // partial, over the limit
    await rig.time.advance(2000);
    assert.equal(
      rig.registry.snapshot()[0]?.state,
      'working',
      'the oversized line counts as activity',
    );
    rig.fs.append(sessionFile(SESSION_A), 'y'.repeat(1000)); // still inside the same line
    await rig.time.advance(30_000);
    rig.fs.append(sessionFile(SESSION_A), 'z'.repeat(1000));
    await rig.time.advance(30_000 - 2000 + 1500);
    // Activity was counted once at `mark`: idle again one idleTimeout later despite later bytes.
    assert.equal(rig.time.now() - mark >= 61_000, true);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
    rig.fs.append(sessionFile(SESSION_A), '\n' + toolUseLine('Read'));
    await rig.time.advance(3000);
    assert.equal(
      rig.registry.snapshot()[0]?.toolName,
      'Read',
      'parsing resumes after the line ends',
    );
    assert.equal(rig.registry.snapshot()[0]?.state, 'working');
  });

  void it('malformed lines are skipped and the next valid line still counts', async () => {
    const rig = sourceRig({ debounceMs: 0 });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    await rig.time.advance(1000);
    rig.fs.append(sessionFile(SESSION_A), '{"type":"user","message":"\n' + toolUseLine('Edit'));
    await rig.time.advance(2000);
    assert.equal(rig.registry.snapshot()[0]?.toolName, 'Edit');
  });
});

void describe('errors', () => {
  void it('EACCES on one file skips only that file and logs one rate-limited error with the code only', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.addFile(sessionFile(SESSION_B), userLine());
    rig.fs.inject('readRange', sessionFile(SESSION_B), {
      code: 'EACCES',
      message: `EACCES: permission denied, open '${sessionFile(SESSION_B)}'`,
    });
    await startAndScan(rig);
    await rig.time.advance(20_000);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
    const errors = rig.logger.messages('error');
    assert.deepEqual(errors, ['monitor: transcript unreadable (EACCES)']);
    assert.ok(!rig.logger.text().includes(SESSION_B));
    assert.ok(!rig.logger.text().includes('/home/tester'));
  });

  void it('EACCES on the root sets status unavailable and logs once', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.inject('realpath', ROOT, { code: 'EACCES', message: 'EACCES: denied' });
    await startAndScan(rig);
    await rig.time.advance(10_000);
    assert.equal(rig.source.status, 'unavailable');
    assert.equal(rig.logger.messages('error').length, 1);
    assert.match(rig.logger.messages('error')[0] ?? '', /EACCES/);
  });

  void it('ENOENT on the root traces once, keeps rescanning, and discovers the tree once it exists', async () => {
    const rig = sourceRig();
    await startAndScan(rig);
    await rig.time.advance(10_000);
    assert.equal(rig.source.status, 'unavailable');
    assert.equal(
      rig.logger.messages('trace').filter((m) => m.includes('root not found')).length,
      1,
    );
    assert.deepEqual(rig.logger.messages('error'), []);
    assert.ok(rig.fs.callsTo('realpath').length >= 8, 'still polling');
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await rig.time.advance(3000);
    assert.equal(rig.source.status, 'active');
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
  });

  void it('sessions despawn when the root disappears', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    rig.fs.remove(sessionFile(SESSION_A));
    rig.fs.remove(`${ROOT}/${PROJECT_DIR}`);
    rig.fs.remove(ROOT);
    await rig.time.advance(3000);
    assert.equal(statesOf(rig, SESSION_A).at(-1), 'despawned');
  });

  void it('a throwing logger never breaks polling', async () => {
    const rig = sourceRig();
    rig.logger.throws = true;
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
  });
});

void describe('polling discipline', () => {
  void it('polls never overlap; the next poll is scheduled only after the previous one finishes', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.pause();
    rig.source.start();
    await rig.time.advance(10_000);
    assert.equal(rig.fs.maxConcurrentCalls, 1);
    assert.equal(rig.fs.callsTo('realpath').length, 1, 'only the first poll started');
    assert.equal(rig.time.pendingTimers, 0, 'no next poll scheduled while one is in flight');
    rig.fs.resume();
    await settle();
    assert.equal(rig.time.pendingTimers, 1, 'exactly one next poll after it finishes');
    assert.equal(rig.fs.maxConcurrentCalls, 1);
  });

  void it('start() twice does not start two loops', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.source.start();
    rig.source.start();
    await settle();
    assert.equal(rig.time.pendingTimers, 1);
    assert.equal(rig.fs.maxConcurrentCalls, 1);
  });
});

void describe('update()', () => {
  void it('a new root rescans immediately and despawns sessions of the old root', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.addDir('/other/root');
    await startAndScan(rig);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
    rig.source.update({ ...rig.config, transcriptPath: '/other/root' }, [FOLDER]);
    await rig.time.advance(0); // the immediate rescan is a zero-delay timer
    assert.equal(statesOf(rig, SESSION_A).at(-1), 'despawned');
    assert.equal(rig.registry.count('transcript'), 0);
  });

  void it('changing the folders despawns sessions that leave the scope', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    rig.source.update(rig.config, [{ name: 'Other', fsPath: '/somewhere/else' }]);
    await rig.time.advance(1500);
    assert.equal(statesOf(rig, SESSION_A).at(-1), 'despawned');
  });

  void it('scope all to workspace despawns sessions of other projects, keeps this folder', async () => {
    const rig = sourceRig({ projectScope: 'all' });
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.addFile(sessionFile(SESSION_B, '-other-proj'), userLine());
    await startAndScan(rig);
    assert.equal(rig.registry.count('transcript'), 2);
    rig.source.update({ ...rig.config, projectScope: 'workspace' }, [FOLDER]);
    await rig.time.advance(1500);
    assert.deepEqual(rig.registry.ids('transcript'), [SESSION_A]);
  });

  void it('new thresholds apply on the next tick', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine() + assistantTextLine());
    await startAndScan(rig);
    await rig.time.advance(2000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'working');
    rig.source.update({ ...rig.config, idleTimeoutMs: 5000, toolTimeoutMs: 5000 }, [FOLDER]);
    await rig.time.advance(4000);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
  });
});

void describe('disposal', () => {
  void it('dispose() during an in-flight poll: no emission, no further fs calls, no pending timers', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    rig.fs.pause();
    rig.source.start();
    await settle();
    const calls = rig.fs.calls.length;
    rig.source.dispose();
    rig.fs.resume();
    await rig.time.advance(60_000);
    assert.equal(rig.fs.calls.length, calls);
    assert.equal(rig.time.pendingTimers, 0);
    assert.deepEqual(rig.events, []);
    assert.equal(rig.source.status, 'off');
  });

  void it('dispose() after sessions are tracked stops all polling and emits nothing', async () => {
    const rig = sourceRig();
    rig.fs.addFile(sessionFile(SESSION_A), userLine());
    await startAndScan(rig);
    const emitted = rig.events.length;
    const calls = rig.fs.calls.length;
    rig.source.dispose();
    rig.fs.append(sessionFile(SESSION_A), toolUseLine('Bash'));
    await rig.time.advance(3600_000);
    assert.equal(rig.fs.calls.length, calls);
    assert.equal(rig.events.length, emitted);
    assert.equal(rig.time.pendingTimers, 0, 'no source timers');
    assert.doesNotThrow(() => rig.source.dispose());
  });
});
