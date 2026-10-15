// Runtime read-only check on a real disk (M3 plan test note 11). A temp tree of synthetic
// fixtures is watched by an AgentMonitor with the real Node adapters while the test appends to
// one file. Afterwards nothing may be created, removed, resized, re-timed, or re-moded except by
// the test's own appends, and nothing outside the transcript root may have been opened.
import assert from 'node:assert/strict';
import {
  appendFileSync,
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createNodeFileSystem } from '../../src/monitor/adapters/nodeFileSystem';
import { NODE_CLOCK, NODE_PATH, NODE_TIMERS } from '../../src/monitor/adapters/nodeRuntime';
import { AgentMonitor } from '../../src/monitor/AgentMonitor';
import type { ReadOnlyFileSystem } from '../../src/monitor/ports';
import type { AgentInfo } from '../../src/shared/protocol';
import { SESSION_A, SESSION_B, SESSION_C, toolUseLine, userLine } from '../support/monitorFakes';
import { testConfig } from '../support/monitorRig';

const SESSION_D = '44444444-4444-4444-8444-444444444444';
const SESSION_E = '55555555-5555-4555-8555-555555555555';

interface Entry {
  readonly kind: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly mode: number;
}

function snapshotTree(root: string): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const stats = lstatSync(full);
      out.set(path.relative(root, full), {
        kind: stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        mode: stats.mode,
      });
      if (stats.isDirectory()) {
        visit(full);
      }
    }
  };
  visit(root);
  return out;
}

async function until(predicate: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

void describe('real disk: the monitor changes nothing', () => {
  let temp = '';
  let tree = '';
  let outside = '';

  before(() => {
    // Under the OS temp dir, never the real home directory.
    temp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pa-readonly-')));
    tree = path.join(temp, 'projects');
    outside = path.join(temp, 'outside');
    mkdirSync(path.join(tree, '-proj-one'), { recursive: true });
    mkdirSync(path.join(tree, '-proj-two'), { recursive: true });
    mkdirSync(outside);
    mkdirSync(path.join(outside, 'linked-dir'));
    const live = path.join(tree, '-proj-one', `${SESSION_A}.jsonl`);
    writeFileSync(live, userLine() + toolUseLine('Read'));
    const stale = path.join(tree, '-proj-two', `${SESSION_B}.jsonl`);
    writeFileSync(stale, userLine());
    const old = new Date(Date.now() - 3 * 3600_000);
    utimesSync(stale, old, old);
    writeFileSync(
      path.join(tree, '-proj-two', `${SESSION_C}.jsonl`),
      userLine() + toolUseLine('Grep'),
    );
    writeFileSync(path.join(tree, '-proj-two', 'agent-1a2b.jsonl'), userLine());
    writeFileSync(path.join(outside, 'secret.jsonl'), userLine('OUTSIDE_SECRET'));
    writeFileSync(path.join(outside, 'linked-dir', `${SESSION_E}.jsonl`), userLine());
    symlinkSync(
      path.join(outside, 'secret.jsonl'),
      path.join(tree, '-proj-one', `${SESSION_D}.jsonl`),
    );
    symlinkSync(path.join(outside, 'linked-dir'), path.join(tree, '-proj-link'));
    chmodSync(path.join(tree, '-proj-two', `${SESSION_C}.jsonl`), 0o640);
  });

  after(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  void it('creates, removes, resizes, re-times, and re-modes nothing; never opens a path outside the root', async () => {
    const live = path.join(tree, '-proj-one', `${SESSION_A}.jsonl`);
    const before = snapshotTree(temp);

    const real = createNodeFileSystem();
    const opened: string[] = [];
    const spyFs: ReadOnlyFileSystem = {
      homedir: () => path.join(temp, 'fake-home'), // never the real home directory
      realpath: (target) => real.realpath(target),
      lstat: (target) => real.lstat(target),
      readdir: (target) => real.readdir(target),
      readRange: (file, position, length, expected) => {
        opened.push(file);
        return real.readRange(file, position, length, expected);
      },
    };
    const changes: AgentInfo[] = [];
    const monitor = new AgentMonitor(
      {
        fs: spyFs,
        path: NODE_PATH,
        clock: NODE_CLOCK,
        timers: NODE_TIMERS,
        terminals: null,
        logger: { trace: () => undefined, error: () => undefined },
        caseInsensitive: process.platform === 'win32' || process.platform === 'darwin',
        simulatorSeed: 1,
      },
      testConfig({
        projectScope: 'all',
        transcriptPath: tree,
        pollIntervalMs: 250,
        debounceMs: 0,
      }),
      [],
    );
    monitor.onDidChangeAgent((agent) => changes.push(agent));
    monitor.start();
    await until(() => changes.some((c) => c.id === SESSION_A), 'the live session');
    await until(() => changes.some((c) => c.id === SESSION_C), 'the second live session');

    appendFileSync(live, toolUseLine('Bash'));
    await until(() => changes.some((c) => c.toolName === 'Bash'), 'the appended tool call');
    monitor.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 600));

    const after = snapshotTree(temp);
    const liveRel = path.relative(temp, live);
    assert.deepEqual(
      [...after.keys()].sort(),
      [...before.keys()].sort(),
      'no entry created or removed',
    );
    for (const [rel, entry] of before) {
      if (rel === liveRel) {
        continue; // the test's own append
      }
      const now = after.get(rel);
      assert.deepEqual(now, entry, `${rel} is unchanged`);
    }
    assert.ok(
      (after.get(liveRel)?.size ?? 0) > (before.get(liveRel)?.size ?? 0),
      'only the test appended',
    );

    assert.deepEqual(
      [...new Set(opened)].sort(),
      [live, path.join(tree, '-proj-two', `${SESSION_C}.jsonl`)].sort(),
      'only the two live regular files were opened',
    );
    assert.ok(opened.every((file) => file.startsWith(tree + path.sep)));
    assert.ok(
      !changes.some((c) => c.id === SESSION_D || c.id === SESSION_E),
      'links are never followed',
    );
    assert.ok(!changes.some((c) => c.id === SESSION_B), 'the stale file is not an agent');
  });

  void it('after dispose the files can be deleted at once (no handle is held) and no further reads happen', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pa-handles-'));
    try {
      const root = path.join(dir, 'projects');
      mkdirSync(path.join(root, '-p'), { recursive: true });
      const file = path.join(root, '-p', `${SESSION_A}.jsonl`);
      writeFileSync(file, userLine());
      const real = createNodeFileSystem();
      let reads = 0;
      const monitor = new AgentMonitor(
        {
          fs: { ...real, readRange: (...args) => ((reads += 1), real.readRange(...args)) },
          path: NODE_PATH,
          clock: NODE_CLOCK,
          timers: NODE_TIMERS,
          terminals: null,
          logger: { trace: () => undefined, error: () => undefined },
          caseInsensitive: false,
          simulatorSeed: 1,
        },
        testConfig({ projectScope: 'all', transcriptPath: root, pollIntervalMs: 250 }),
        [],
      );
      monitor.start();
      await until(() => reads > 0, 'the first read');
      monitor.dispose();
      const readsAtDispose = reads;
      rmSync(root, { recursive: true });
      await new Promise<void>((resolve) => setTimeout(resolve, 700));
      assert.equal(reads, readsAtDispose);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  void it('readRange refuses a symbolic link (O_NOFOLLOW) and a file whose identity changed', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pa-nofollow-'));
    try {
      const target = path.join(dir, 'target.jsonl');
      writeFileSync(target, 'hello\n');
      const link = path.join(dir, 'link.jsonl');
      symlinkSync(target, link);
      const real = createNodeFileSystem();
      const stats = await real.lstat(target);
      if (process.platform !== 'win32') {
        await assert.rejects(real.readRange(link, 0, 10, stats), (error: NodeJS.ErrnoException) => {
          assert.equal(error.code, 'ELOOP');
          return true;
        });
      }
      await assert.rejects(
        real.readRange(target, 0, 10, { ino: stats.ino + 1, dev: stats.dev }),
        (error: NodeJS.ErrnoException) => {
          assert.equal(error.code, 'EIDENTITY');
          return true;
        },
      );
      const bytes = await real.readRange(target, 0, 100, stats);
      assert.equal(new TextDecoder().decode(bytes), 'hello\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
