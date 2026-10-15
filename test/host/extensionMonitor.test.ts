// src/extension.ts glue for the M3 monitor (M3 plan test notes 9, 14, 15) against the fake
// vscode module. The extension builds the real Node adapters, so these tests use a real temp
// directory as the transcript root (via the fake pixelAgents.transcriptPath setting) and real
// (unref'd) timers with the shortest legal poll interval. They never read the real home directory:
// every test sets transcriptPath, and workspace scope with no folders reads nothing at all.
import assert from 'node:assert/strict';
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type * as vscode from 'vscode';
import { activate, PixelAgentsViewProvider } from '../../src/extension';
import { parseHostMessage, PROTOCOL_VERSION } from '../../src/shared/protocol';
import { readGameSettings } from '../../src/host/gameConfig';
import type { AgentInfo, HostToWebviewMessage } from '../../src/shared/protocol';
import { PROGRESS_KEY } from '../../src/host/progressStore';
import {
  FakeMemento,
  FakeWebviewView,
  Uri,
  changeConfiguration,
  closeFakeTerminal,
  liveEventListeners,
  openFakeTerminal,
  recorded,
  resetFakeVscode,
  setWorkspaceFolders,
} from '../support/fakeVscode';
import { MARKER, SESSION_A, SESSION_B, toolUseLine, userLine } from '../support/monitorFakes';

interface TrackedContext {
  readonly extensionUri: Uri;
  subscriptions: { dispose(): void }[];
  /** The only storage the extension may touch: the progress store (E1, ADR 0012). */
  readonly globalState: FakeMemento;
  /** Every other member access is recorded (nothing but globalState may be used). */
  readonly touched: string[];
}

function trackedContext(): vscode.ExtensionContext & TrackedContext {
  const touched: string[] = [];
  const base = {
    extensionUri: Uri.file('/ext'),
    subscriptions: [] as { dispose(): void }[],
    globalState: new FakeMemento(),
    touched,
  };
  return new Proxy(base, {
    get(target, property, receiver): unknown {
      if (!(property in target)) {
        touched.push(String(property));
        // A recording stand-in for workspaceState, secrets, storage URIs, and friends.
        return new Proxy(
          {},
          {
            get(_t, member): unknown {
              touched.push(`${String(property)}.${String(member)}`);
              return () => {
                throw new Error(`${String(property)}.${String(member)} must not be used`);
              };
            },
          },
        );
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  }) as unknown as vscode.ExtensionContext & TrackedContext;
}

const contexts: TrackedContext[] = [];
const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(dir);
  return dir;
}

async function until(predicate: () => boolean, what: string, timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Env {
  readonly root: string;
  readonly workspaceDir: string;
  readonly projectDir: string;
}

/** A temp transcript root plus a workspace folder whose project directory exists. */
function makeEnv(): Env {
  const base = tempDir('pa-ext-');
  const root = path.join(base, 'transcripts');
  const workspaceDir = path.join(base, 'ws');
  mkdirSync(root);
  mkdirSync(workspaceDir);
  const projectDir = path.join(root, workspaceDir.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(projectDir);
  return { root, workspaceDir, projectDir };
}

function baseConfig(env: Env, extra: Record<string, unknown> = {}): void {
  recorded.config = {
    transcriptPath: env.root,
    simulator: 'off',
    pollIntervalMs: 250,
    debounceMs: 0,
    idleTimeoutSeconds: 5,
    ...extra,
  };
}

function boot(): {
  context: TrackedContext & vscode.ExtensionContext;
  view: FakeWebviewView;
  log: (typeof recorded.outputChannels)[0]['channel'];
} {
  const context = trackedContext();
  contexts.push(context);
  activate(context);
  const provider = recorded.registrations[0]?.provider;
  assert.ok(provider instanceof PixelAgentsViewProvider);
  const view = new FakeWebviewView();
  provider.resolveWebviewView(
    view as unknown as vscode.WebviewView,
    {} as vscode.WebviewViewResolveContext,
    {} as vscode.CancellationToken,
  );
  const log = recorded.outputChannels[0]?.channel;
  assert.ok(log !== undefined);
  return { context, view, log };
}

function posts(view: FakeWebviewView): HostToWebviewMessage[] {
  return view.webview.postedMessages.map((m) => structuredClone(m) as HostToWebviewMessage);
}

function agentStates(view: FakeWebviewView): AgentInfo[] {
  return posts(view).flatMap((m) => (m.type === 'agentState' ? [m.agent] : []));
}

beforeEach(resetFakeVscode);

afterEach(() => {
  for (const context of contexts.splice(0)) {
    for (const disposable of [...context.subscriptions].reverse()) {
      disposable.dispose();
    }
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

void describe('extension glue: monitor wiring', () => {
  void it('activate still returns void and registers the view', () => {
    const env = makeEnv();
    baseConfig(env);
    const result: unknown = activate(trackedContext());
    assert.equal(result, undefined);
    assert.equal(recorded.registrations.length, 1);
  });

  void it('a ready answers with the monitor’s agents (simulator on)', async () => {
    const env = makeEnv();
    baseConfig(env, { simulator: 'on', simulatorAgentCount: 2 });
    const { view } = boot();
    await sleep(150);
    view.webview.deliver({ type: 'ready' });
    const answer = posts(view);
    assert.equal(answer[0]?.type, 'config');
    assert.equal(answer[2]?.type, 'progress');
    const list = answer[1];
    assert.equal(list?.type, 'agentList');
    assert.ok(list?.type === 'agentList' && list.agents.some((a) => a.id === 'sim-0-0'));
    for (const message of answer) {
      assert.notEqual(parseHostMessage(message), undefined);
    }
  });

  void it('a monitor change while ready posts one agentState per change', async () => {
    const env = makeEnv();
    baseConfig(env);
    const { view } = boot();
    view.webview.deliver({ type: 'ready' });
    writeFileSync(path.join(env.projectDir, `${SESSION_A}.jsonl`), userLine());
    setWorkspaceFolders([['ws', env.workspaceDir]]);
    recorded.events.workspaceFolders.fire();
    await until(() => agentStates(view).some((a) => a.id === SESSION_A), 'a spawned post');
    const states = agentStates(view).filter((a) => a.id === SESSION_A);
    assert.equal(states[0]?.state, 'spawned');
    assert.equal(states[0]?.name, `ws ${SESSION_A.slice(0, 4)}`);
  });

  void it('a pixelAgents configuration change applies; another section changes nothing', async () => {
    const env = makeEnv();
    baseConfig(env);
    const { view } = boot();
    view.webview.deliver({ type: 'ready' });
    changeConfiguration({ simulator: 'on', simulatorAgentCount: 1 }, ['editor']);
    await sleep(400);
    assert.deepEqual(agentStates(view), [], 'a change to another section is ignored');
    changeConfiguration({ simulator: 'on', simulatorAgentCount: 1 }, ['pixelAgents.simulator']);
    await until(() => agentStates(view).some((a) => a.id === 'sim-0-0'), 'a simulated spawn');
    changeConfiguration({ simulator: 'off' });
    await until(
      () => agentStates(view).some((a) => a.id === 'sim-0-0' && a.state === 'despawned'),
      'the simulated agent leaving',
    );
  });

  void it('workspace folder changes rescan', async () => {
    const env = makeEnv();
    baseConfig(env);
    writeFileSync(path.join(env.projectDir, `${SESSION_A}.jsonl`), userLine());
    const { view } = boot();
    view.webview.deliver({ type: 'ready' });
    await sleep(600);
    assert.deepEqual(agentStates(view), [], 'no folders open: workspace scope reads nothing');
    setWorkspaceFolders([['ws', env.workspaceDir]]);
    recorded.events.workspaceFolders.fire();
    await until(
      () => agentStates(view).some((a) => a.id === SESSION_A),
      'the session after the folder opened',
    );
    setWorkspaceFolders([]);
    recorded.events.workspaceFolders.fire();
    await until(
      () => agentStates(view).some((a) => a.id === SESSION_A && a.state === 'despawned'),
      'the session leaving the scope',
    );
  });

  void it('non-file workspace folders are ignored', async () => {
    const env = makeEnv();
    baseConfig(env);
    writeFileSync(path.join(env.projectDir, `${SESSION_A}.jsonl`), userLine());
    recorded.folders = [{ uri: Uri.of('vscode-remote', env.workspaceDir), name: 'ws', index: 0 }];
    const { view } = boot();
    view.webview.deliver({ type: 'ready' });
    await sleep(700);
    assert.deepEqual(agentStates(view), []);
  });

  void it('focusAgent reveals the linked terminal exactly once; simulated and unknown agents reveal nothing', async () => {
    const env = makeEnv();
    baseConfig(env);
    setWorkspaceFolders([['ws', env.workspaceDir]]);
    const { view } = boot();
    view.webview.deliver({ type: 'ready' });
    const terminal = openFakeTerminal(true);
    await sleep(700); // first scan done
    writeFileSync(path.join(env.projectDir, `${SESSION_A}.jsonl`), userLine());
    await until(() => agentStates(view).some((a) => a.id === SESSION_A), 'the new session');
    view.webview.deliver({ type: 'focusAgent', agentId: SESSION_A });
    assert.equal(terminal.shows, 1);
    view.webview.deliver({ type: 'focusAgent', agentId: 'sim-0-0' });
    view.webview.deliver({ type: 'focusAgent', agentId: 'unknown' });
    assert.equal(terminal.shows, 1);
    assert.deepEqual(terminal.forbiddenUse, []);
    // Closing the terminal changes no agent state and a later focus shows nothing.
    const before = agentStates(view).length;
    closeFakeTerminal(terminal);
    await sleep(500);
    assert.equal(agentStates(view).length, before);
    view.webview.deliver({ type: 'focusAgent', agentId: SESSION_A });
    assert.equal(terminal.shows, 1);
  });

  void it('if getConfiguration throws: the view is still registered, ready answers an empty list, focusAgent is dropped, a coded error is logged then one bridge error, config falls back to defaults', () => {
    recorded.configThrows = new TypeError('settings broke SECRET_SETTINGS_TEXT');
    const { view, log } = boot();
    assert.equal(recorded.registrations.length, 1);
    view.webview.deliver({ type: 'ready' });
    const answer = posts(view);
    const first = answer[0];
    assert.equal(first?.type, 'config');
    // The fallback is defaults-only: it is built without reading any setting.
    assert.deepEqual(first, {
      type: 'config',
      config: { protocolVersion: PROTOCOL_VERSION, ...readGameSettings(() => undefined) },
    });
    assert.deepEqual(answer[1], { type: 'agentList', agents: [] });
    assert.equal(answer[2]?.type, 'progress');
    view.webview.deliver({ type: 'focusAgent', agentId: SESSION_A });
    assert.equal(posts(view).length, 3, 'config, agentList, progress');
    // One coded monitor error, then one bridge error for the throwing getConfig on ready.
    assert.deepEqual(log.messages('error'), [
      'monitor failed to start (TypeError)',
      'webview bridge error: TypeError',
    ]);
    assert.ok(log.messages('trace').includes('dropped focusAgent: reveal unavailable'));
    assert.ok(
      !log.messages('error')[0]?.includes('SECRET_SETTINGS_TEXT'),
      'the coded monitor error carries no message text',
    );
    for (const level of ['error', 'trace'] as const) {
      for (const line of log.messages(level)) {
        assert.ok(!line.includes('SECRET_SETTINGS_TEXT'), `no secret in ${level} line: ${line}`);
      }
    }
  });

  void it('the monitor persists nothing: only the progress key is read, never written, and no other storage is touched', async () => {
    const env = makeEnv();
    baseConfig(env, { simulator: 'on' });
    const { context, view } = boot();
    view.webview.deliver({ type: 'ready' });
    await sleep(500);
    changeConfiguration({ simulator: 'off' });
    await sleep(200);
    assert.deepEqual(context.touched, [], 'no workspaceState, secrets, or storage URI');
    assert.deepEqual(context.globalState.gets, [PROGRESS_KEY]);
    assert.deepEqual(context.globalState.updates, [], 'agent activity never writes storage');
    assert.equal(context.globalState.syncKeyCalls, 0);
  });
});

void describe('extension glue: disposal (note 14)', () => {
  void it('disposing context.subscriptions leaves no live listener and no further posts', async () => {
    const env = makeEnv();
    baseConfig(env, { simulator: 'on', simulatorAgentCount: 2 });
    const { context, view } = boot();
    view.webview.deliver({ type: 'ready' });
    await sleep(300);
    assert.ok(liveEventListeners() >= 4, `listeners before: ${liveEventListeners()}`);
    for (const disposable of [...context.subscriptions].reverse()) {
      disposable.dispose();
    }
    assert.equal(liveEventListeners(), 0);
    assert.equal(view.liveListenerCount, 0);
    const count = view.webview.postedMessages.length;
    await sleep(1500);
    assert.equal(view.webview.postedMessages.length, count);
  });
});

void describe('extension glue: transcript privacy end to end (note 9)', () => {
  void it('the marker (in the root path, file contents, and fs error paths) reaches no log, post, or storage call', async () => {
    const base = tempDir('pa-priv-');
    const root = path.join(base, MARKER, 'transcripts');
    const workspaceDir = path.join(base, 'ws');
    mkdirSync(root, { recursive: true });
    mkdirSync(workspaceDir);
    const projectDir = path.join(root, workspaceDir.replace(/[^A-Za-z0-9]/g, '-'));
    mkdirSync(projectDir);
    const live = path.join(projectDir, `${SESSION_A}.jsonl`);
    writeFileSync(
      live,
      userLine(MARKER) +
        toolUseLine('Bash', { command: MARKER }) +
        `{"type":"user","message":"${MARKER}\n`,
    );
    const unreadable = path.join(projectDir, `${SESSION_B}.jsonl`);
    writeFileSync(unreadable, userLine(MARKER));
    chmodSync(unreadable, 0o000); // EACCES on read when not root; the path (with the marker) is in the error
    baseConfig({ root, workspaceDir, projectDir }, { transcriptPath: root });
    setWorkspaceFolders([['ws', workspaceDir]]);
    try {
      const { context, view, log } = boot();
      view.webview.deliver({ type: 'ready' });
      await until(() => agentStates(view).some((a) => a.id === SESSION_A), 'the marker session');
      appendFileSync(
        live,
        toolUseLine('Edit', { file: MARKER }) + `{"type":"summary","summary":"${MARKER}"}\n`,
      );
      await until(
        () => agentStates(view).some((a) => a.toolName === 'Edit'),
        'the appended tool call',
      );
      await sleep(800);
      if (process.platform !== 'win32' && process.getuid?.() !== 0) {
        assert.ok(
          log.messages('error').includes('monitor: transcript unreadable (EACCES)'),
          'the unreadable file was really hit, so the error path was exercised',
        );
      }
      assert.ok(!JSON.stringify(posts(view)).includes(MARKER), 'posts');
      assert.ok(
        !log.calls.some((c) => c.message.includes(MARKER)),
        `log: ${JSON.stringify(log.calls)}`,
      );
      assert.ok(!log.calls.some((c) => c.message.includes(base)), 'no temp path text in the log');
      assert.deepEqual(context.touched, [], 'no storage access');
      assert.deepEqual(context.globalState.updates, [], 'no write at all');
      assert.ok(!JSON.stringify(context.globalState.gets).includes(MARKER));
    } finally {
      chmodSync(unreadable, 0o600);
    }
  });
});
