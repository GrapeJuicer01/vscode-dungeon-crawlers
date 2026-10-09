// Extension-host checks for persisted progress (E1 plan test note 14, ADR 0012), observed only
// through public API: a fake webview view handed to the real provider records every post and
// delivers messages, exactly as the M2 positive control and the monitor suite do. There is no
// production hook: a "webview message" is a synthetic event on the public onDidReceiveMessage
// listener, and persistence is observed through what the next `ready` is answered with.
//
// The host starts with a clean globalState (test/integration/run.mjs gives it a fresh temp
// user-data-dir). Runs last: it re-resolves the provider with its own fake view.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { parseHostMessage } from '../../../src/shared/protocol';
import { delay, describe, it } from '../support/harness';
import { observed } from '../support/providerSpy';

const VIEW_ID = 'pixelAgents.view';
/** The store coalesces writes for 2 s (PROGRESS_WRITE_COALESCE_MS); wait a little longer. */
const COALESCE_WAIT_MS = 2_600;

const DEFAULT = {
  schemaVersion: 1,
  stageIndex: 1,
  killsInStage: 0,
  totalKills: 0,
  bossesDefeated: 0,
  cycle: 0,
};
const SAVED = {
  schemaVersion: 1,
  stageIndex: 2,
  killsInStage: 11,
  totalKills: 71,
  bossesDefeated: 1,
  cycle: 0,
};

const posts: unknown[] = [];
const listeners: ((message: unknown) => void)[] = [];

async function attachFakeView(): Promise<void> {
  const provider = observed.providers[0];
  assert.ok(provider !== undefined, 'the real provider was captured at registration');
  const disposable = { dispose: (): void => undefined };
  const fakeWebview = {
    options: {},
    html: '',
    cspSource: 'vscode-webview://test',
    asWebviewUri: (uri: vscode.Uri): vscode.Uri => uri,
    onDidReceiveMessage: (listener: (message: unknown) => void): vscode.Disposable => {
      listeners.push(listener);
      return disposable;
    },
    postMessage: (message: unknown): Thenable<boolean> => {
      posts.push(structuredClone(message));
      return Promise.resolve(true);
    },
  };
  const fakeView = {
    viewType: VIEW_ID,
    webview: fakeWebview,
    visible: true,
    onDidChangeVisibility: (): vscode.Disposable => disposable,
    onDidDispose: (): vscode.Disposable => disposable,
    show: (): void => undefined,
  };
  const source = new vscode.CancellationTokenSource();
  await provider.resolveWebviewView(fakeView, { state: undefined }, source.token);
  source.dispose();
}

function send(message: unknown): void {
  const listener = listeners.at(-1);
  assert.ok(listener !== undefined, 'the fake view is attached');
  listener(message);
}

/** The progress object of the most recent `progress` post. */
function lastProgress(): unknown {
  for (let i = posts.length - 1; i >= 0; i--) {
    const post = posts[i] as { type?: string; progress?: unknown };
    if (post.type === 'progress') {
      return post.progress;
    }
  }
  return undefined;
}

function ourLogText(): string {
  const userDataDir = process.env.PIXEL_AGENTS_IT_USER_DATA_DIR;
  assert.ok(userDataDir !== undefined, 'run.mjs must pass PIXEL_AGENTS_IT_USER_DATA_DIR');
  const logs = path.join(userDataDir, 'logs');
  if (!existsSync(logs)) {
    return '';
  }
  return readdirSync(logs, { recursive: true, encoding: 'utf8' })
    .map((relative) => path.join(logs, relative))
    .filter((file) => file.includes('pixel-agents.pixel-agents') && file.endsWith('.log'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

describe('progress: persisted stage counters in the real extension host (E1, ADR 0012)', () => {
  it('first open on a clean globalState: ready is answered with config, agentList, then the default progress, all valid', async () => {
    await attachFakeView();
    send({ type: 'ready' });
    await delay(300);
    assert.deepEqual(
      posts.map((p) => (p as { type: string }).type),
      ['config', 'agentList', 'progress'],
    );
    for (const post of posts) {
      assert.notEqual(parseHostMessage(post), undefined);
    }
    assert.deepEqual(lastProgress(), DEFAULT);
  });

  it('an invalid or controlling saveProgress is dropped: nothing is written and the next ready still returns the default', async () => {
    for (const message of [
      { type: 'saveProgress', progress: { ...SAVED, stageIndex: 0 } },
      {
        type: 'saveProgress',
        progress: { ...SAVED, agentId: 'a1b2c3d4-0000-4000-8000-0000000000aa' },
      },
      { type: 'saveProgress', progress: SAVED, command: 'kill' },
      { type: 'saveProgress' },
      { type: 'stopAgent', agentId: 'x' },
    ]) {
      send(message);
    }
    await delay(COALESCE_WAIT_MS);
    posts.length = 0;
    send({ type: 'ready' });
    await delay(300);
    assert.deepEqual(lastProgress(), DEFAULT);
    assert.ok(ourLogText().includes('dropped webview message: invalid'));
    assert.ok(!ourLogText().includes('0000000000aa'), 'the payload is never logged');
  });

  it('a valid saveProgress is persisted: after the coalesce window a second ready returns it', async () => {
    send({ type: 'saveProgress', progress: SAVED });
    await delay(COALESCE_WAIT_MS);
    posts.length = 0;
    send({ type: 'ready' });
    await delay(300);
    assert.deepEqual(
      posts.map((p) => (p as { type: string }).type),
      ['config', 'agentList', 'progress'],
    );
    assert.deepEqual(lastProgress(), SAVED);
  });

  it('a lower totalKills never rewinds the stored progress', async () => {
    send({ type: 'saveProgress', progress: { ...SAVED, totalKills: 5, killsInStage: 5 } });
    await delay(COALESCE_WAIT_MS);
    posts.length = 0;
    send({ type: 'ready' });
    await delay(300);
    assert.deepEqual(lastProgress(), SAVED);
  });

  it('saving changes no agent and posts nothing by itself (a save is not answered)', async () => {
    posts.length = 0;
    send({ type: 'saveProgress', progress: { ...SAVED, totalKills: 80, killsInStage: 20 } });
    await delay(COALESCE_WAIT_MS);
    assert.deepEqual(posts, []);
    assert.equal(vscode.window.terminals.filter((t) => t.name.startsWith('pixel')).length, 0);
  });

  it('the log has no error line and no progress payload after all of this', () => {
    const text = ourLogText();
    const bad = text
      .split('\n')
      .filter((line) => /\[error\]/i.test(line) && /progress/i.test(line));
    assert.deepEqual(bad, []);
    assert.ok(!/"totalKills"|totalKills:/.test(text), 'no counters in the log');
  });
});
