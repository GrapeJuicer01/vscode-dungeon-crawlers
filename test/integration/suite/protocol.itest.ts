// Extension-host checks for the M2 handshake (plan test note 11) and the automatable part of
// the F5 check (plan task 10), observed only through public API: the provider spy's
// onDidReceiveMessage subscription and postMessage recorder, and the "Pixel Agents" log
// channel's file in this run's temp user-data-dir (trace level, set by test/integration/run.mjs).
// Runs after view.itest.ts, whose hide/show cycles each wait for a ready.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { parseHostMessage, parseWebviewMessage } from '../../../src/shared/protocol';
import { delay, describe, it, waitFor } from '../support/harness';
import { observed, readyCount, type Resolution, type TimelineEntry } from '../support/providerSpy';

const VIEW_ID = 'pixelAgents.view';
const FOCUS_COMMAND = `${VIEW_ID}.focus`;
const RELOAD_WEBVIEWS = 'workbench.action.webview.reloadWebviewAction';
/** How long to watch for unexpected extra traffic after an expected event. */
const SETTLE_MS = 1_500;
/** E1 (ADR 0012): config with the three game settings (protocol version 2), the list, then progress. */
const EXPECTED_ANSWER = [
  {
    type: 'config',
    config: { protocolVersion: 2, enemiesEnabled: true, killsPerStage: 30, maxEnemies: 6 },
  },
  { type: 'agentList', agents: [] },
  {
    type: 'progress',
    progress: {
      schemaVersion: 1,
      stageIndex: 1,
      killsInStage: 0,
      totalKills: 0,
      bossesDefeated: 0,
      cycle: 0,
    },
  },
];

function resolutions(): Resolution[] {
  assert.ok(observed.resolutions.length > 0, 'resolveWebviewView has not been called');
  return observed.resolutions;
}

function latest(): Resolution {
  const resolution = observed.resolutions.at(-1);
  assert.ok(resolution !== undefined, 'resolveWebviewView has not been called');
  return resolution;
}

function postsOf(resolution: Resolution): TimelineEntry[] {
  return resolution.timeline.filter((entry) => entry.kind === 'posted');
}

function messageOf(entry: TimelineEntry | undefined): unknown {
  return entry !== undefined && entry.kind !== 'visibility' ? entry.message : undefined;
}

/** Structured clone, so deep equality ignores any extension-host proxying of the object. */
function plain(value: unknown): unknown {
  return value === undefined ? undefined : structuredClone(value);
}

/** Splits a timeline into load segments: a new segment starts at every visibility change. */
function segments(resolution: Resolution): { visible: boolean; entries: TimelineEntry[] }[] {
  const result = [{ visible: true, entries: [] as TimelineEntry[] }];
  for (const entry of resolution.timeline) {
    if (entry.kind === 'visibility') {
      result.push({ visible: entry.visible, entries: [] });
    } else {
      result.at(-1)?.entries.push(entry);
    }
  }
  return result;
}

function received(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return entries.filter((entry) => entry.kind === 'received');
}

async function show(): Promise<void> {
  const resolution = latest();
  const before = readyCount(resolution);
  await vscode.commands.executeCommand(FOCUS_COMMAND);
  await waitFor(() => resolution.view.visible, 'view visible after focus');
  await waitFor(() => readyCount(resolution) > before, 'a ready after showing the view');
}

async function hide(): Promise<void> {
  const resolution = latest();
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await waitFor(() => !resolution.view.visible, 'view hidden after closing the panel');
}

function postRecorderOrSkip(resolution: Resolution, what: string): boolean {
  if (resolution.postWrapperUnavailable === null) {
    return true;
  }
  console.log(`  # SKIPPED outgoing-message check (${what}): ${resolution.postWrapperUnavailable}`);
  return false;
}

/** Every log file of our extension in this run's user-data-dir (trace level, see run.mjs). */
function ourLogFiles(): string[] {
  const userDataDir = process.env.PIXEL_AGENTS_IT_USER_DATA_DIR;
  assert.ok(userDataDir !== undefined, 'run.mjs must pass PIXEL_AGENTS_IT_USER_DATA_DIR');
  const logs = path.join(userDataDir, 'logs');
  if (!existsSync(logs)) {
    return [];
  }
  return readdirSync(logs, { recursive: true, encoding: 'utf8' })
    .map((relative) => path.join(logs, relative))
    .filter((file) => file.includes('pixel-agents.pixel-agents') && file.endsWith('.log'));
}

function ourLogText(): string {
  return ourLogFiles()
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

describe('protocol: ready handshake in the real webview (M2)', () => {
  it('the first load sent exactly one message, { type: "ready" }, which passes parseWebviewMessage', () => {
    const [first] = segments(resolutions()[0] as Resolution);
    const messages = received(first?.entries ?? []).map((entry) => plain(messageOf(entry)));
    assert.deepEqual(messages, [{ type: 'ready' }]);
    assert.deepEqual(parseWebviewMessage(messages[0]), { type: 'ready' });
  });

  it('every message received so far is a valid ready (the webview sends saveProgress only after a kill)', () => {
    for (const resolution of resolutions()) {
      for (const message of resolution.received) {
        assert.deepEqual(parseWebviewMessage(plain(message)), { type: 'ready' });
      }
    }
  });

  it('exactly one ready per document load: 1 + the number of shows, none while hidden', () => {
    for (const resolution of resolutions()) {
      const shows = resolution.visibilityChanges.filter((visible) => visible).length;
      assert.ok(shows >= 7, `the M1 sequence showed the view ${shows} times`);
      assert.equal(readyCount(resolution), 1 + shows);
      for (const [index, segment] of segments(resolution).entries()) {
        const count = received(segment.entries).length;
        assert.equal(
          count,
          segment.visible ? 1 : 0,
          `segment ${index} (visible ${segment.visible})`,
        );
      }
    }
  });

  it('each ready is answered with exactly config, agentList, then progress (protocolVersion 2, agents [], default progress)', () => {
    for (const resolution of resolutions()) {
      if (!postRecorderOrSkip(resolution, 'ready answers')) {
        return;
      }
      const timeline = resolution.timeline;
      let readies = 0;
      for (const [index, entry] of timeline.entries()) {
        if (entry.kind !== 'received') {
          continue;
        }
        readies += 1;
        assert.equal(timeline[index + 1]?.kind, 'posted', `post after ready #${readies}`);
        assert.equal(timeline[index + 2]?.kind, 'posted', `second post after ready #${readies}`);
        assert.equal(timeline[index + 3]?.kind, 'posted', `third post after ready #${readies}`);
        const answer = [timeline[index + 1], timeline[index + 2], timeline[index + 3]].map((next) =>
          plain(messageOf(next)),
        );
        assert.deepEqual(answer, EXPECTED_ANSWER, `answer to ready #${readies}`);
        for (const message of answer) {
          assert.notEqual(
            parseHostMessage(message),
            undefined,
            'every post passes parseHostMessage',
          );
        }
      }
      assert.equal(postsOf(resolution).length, 3 * readies, 'nothing is posted except the answers');
    }
  });

  it('nothing is posted while the view is hidden', () => {
    for (const resolution of resolutions()) {
      if (!postRecorderOrSkip(resolution, 'posts while hidden')) {
        return;
      }
      for (const segment of segments(resolution).filter((candidate) => !candidate.visible)) {
        assert.deepEqual(segment.entries, []);
      }
      assert.ok(postsOf(resolution).every((entry) => entry.kind === 'posted' && entry.visible));
    }
  });

  it('an explicit hide receives and posts nothing; the next show sends exactly one ready', async () => {
    const resolution = latest();
    await hide();
    const hiddenAt = resolution.timeline.length;
    await delay(SETTLE_MS);
    assert.deepEqual(resolution.timeline.slice(hiddenAt), [], 'no traffic while hidden');

    const readiesBefore = readyCount(resolution);
    const postsBefore = postsOf(resolution).length;
    await show();
    await delay(SETTLE_MS);
    assert.equal(readyCount(resolution), readiesBefore + 1, 'exactly one ready for the new load');
    if (postRecorderOrSkip(resolution, 'answer after show')) {
      assert.equal(postsOf(resolution).length, postsBefore + 3);
    }
  });

  it('"Developer: Reload Webviews" produces exactly one more ready, answered the same way', async () => {
    const resolution = latest();
    assert.equal(resolution.view.visible, true);
    const all = await vscode.commands.getCommands(false);
    assert.ok(all.includes(RELOAD_WEBVIEWS), `${RELOAD_WEBVIEWS} must exist in this build`);
    const readiesBefore = readyCount(resolution);
    const postsBefore = postsOf(resolution).length;
    await vscode.commands.executeCommand(RELOAD_WEBVIEWS);
    await waitFor(() => readyCount(resolution) > readiesBefore, 'a ready after Reload Webviews');
    await delay(SETTLE_MS);
    assert.equal(readyCount(resolution), readiesBefore + 1);
    assert.equal(resolution.disposed, false, 'reload does not dispose the view');
    if (postRecorderOrSkip(resolution, 'answer after reload')) {
      const answer = postsOf(resolution)
        .slice(postsBefore)
        .map((entry) => plain(messageOf(entry)));
      assert.deepEqual(answer, EXPECTED_ANSWER);
    }
  });

  it('the view was resolved once and never re-resolved by hide, show, or reload', () => {
    assert.equal(observed.resolutions.length, 1);
  });

  it('still registers no command of its own and creates no terminal (invariant 3)', async () => {
    const ours = (await vscode.commands.getCommands(false)).filter((id) =>
      id.startsWith('pixelAgents.'),
    );
    // Only the commands VS Code generates for the contributed view (focus, reset location, ...).
    assert.deepEqual(
      ours.filter((id) => !id.startsWith(`${VIEW_ID}.`)),
      [],
    );
    assert.equal(vscode.window.terminals.length, 0);
  });
});

describe('protocol: the Pixel Agents log after open, hide/show, and reload (M2 task 10)', () => {
  it('has no error line and no dropped-message, invalid, or failed-post line', () => {
    const text = ourLogText();
    // An absent or empty file means nothing was logged, which is the expected outcome; the
    // positive control below proves this run's log is readable at trace level.
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    const bad = lines.filter((line) =>
      /\[error\]|dropped|invalid|post failed|bridge error/i.test(line),
    );
    assert.deepEqual(bad, [], `log files: ${JSON.stringify(ourLogFiles())}`);
  });

  // Destructive, so last: it re-resolves the real provider with a fake view (public provider
  // interface, no production hook), which detaches the real view from the bridge.
  it('positive control: a garbage message through the real provider is traced to that log, payload-free', async () => {
    const provider = observed.providers[0];
    assert.ok(provider !== undefined, 'the real provider was captured at registration');
    const listeners: ((message: unknown) => void)[] = [];
    const posts: unknown[] = [];
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
        posts.push(message);
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
    assert.equal(listeners.length, 1);
    listeners[0]?.({ type: 'stopAgent', agentId: 'SECRET-IT-PAYLOAD' });
    assert.deepEqual(posts, [], 'a garbage message is not answered');

    await waitFor(
      () => ourLogText().includes('dropped webview message: invalid'),
      `the trace line reaches the log file (files: ${JSON.stringify(ourLogFiles())})`,
      15_000,
    );
    assert.ok(!ourLogText().includes('SECRET-IT-PAYLOAD'), 'the payload is never logged');
  });
});
