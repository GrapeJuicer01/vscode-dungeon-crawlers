// Unit tests for src/extension.ts against the fake vscode module (test/support/fakeVscode.ts).
// M1 plan section 3.1: one webview view provider, locked-down webview options, HTML with a fresh
// nonce. M2 plan section 3.4 and test note 10: a "Pixel Agents" LogOutputChannel, three
// subscriptions, and the view wired to the WebviewBridge (listener before html, ready answered
// with config then agentList, hide and dispose handled, old view listeners dropped on re-resolve).
// E1 (ADR 0012): ready is also answered with the stored progress, saveProgress reaches only the
// extension's own globalState (coalesced, validated, flushed on dispose), and a settings change
// re-posts the config to a ready view.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type * as vscode from 'vscode';
import * as extension from '../../src/extension';
import { activate, deactivate, PixelAgentsViewProvider, VIEW_TYPE } from '../../src/extension';
import { WebviewBridge } from '../../src/host/webviewBridge';
import { PROGRESS_KEY } from '../../src/host/progressStore';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';
import { parseHostMessage, PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { AgentInfo, ConfigSnapshot } from '../../src/shared/protocol';
import {
  changeConfiguration,
  FakeLogOutputChannel,
  FakeMemento,
  FakeWebview,
  FakeWebviewView,
  recorded,
  resetFakeVscode,
  Uri,
} from '../support/fakeVscode';
import { asRecord, readJson } from '../support/repo';

const EXTENSION_URI = Uri.file('/ext');
const NONCE_PATTERN = /^[A-Za-z0-9+/]{22,}={0,2}$/;
const READY = { type: 'ready' } as const;
const DEFAULT_GAME_CONFIG: ConfigSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  enemiesEnabled: true,
  killsPerStage: 30,
  maxEnemies: 6,
};
const EXPECTED_ANSWER = [
  { type: 'config', config: DEFAULT_GAME_CONFIG },
  { type: 'agentList', agents: [] },
  { type: 'progress', progress: DEFAULT_PROGRESS },
];
const STORED: Progress = {
  schemaVersion: 1,
  stageIndex: 2,
  killsInStage: 11,
  totalKills: 71,
  bossesDefeated: 1,
  cycle: 0,
};

const SIM_AGENT: AgentInfo = {
  id: 'sim-1',
  name: 'Sim one',
  state: 'working',
  toolName: 'Bash',
  timestamp: 1_700_000_000_000,
};

interface FakeContext {
  readonly extensionUri: Uri;
  subscriptions: { dispose(): void }[];
  readonly globalState: FakeMemento;
}

/** Every context handed out, so afterEach can dispose what activate registered (stops monitor timers). */
const contexts: FakeContext[] = [];

function fakeContext(): FakeContext {
  const context: FakeContext = {
    extensionUri: EXTENSION_URI,
    subscriptions: [],
    globalState: new FakeMemento(),
  };
  contexts.push(context);
  return context;
}

/** M3: activate also builds the monitor; the simulator is off so these tests see no agents. */
function resetWithQuietMonitor(): void {
  resetFakeVscode();
  recorded.config.simulator = 'off';
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    for (const disposable of [...context.subscriptions].reverse()) {
      disposable.dispose();
    }
  }
});

function resolve(provider: PixelAgentsViewProvider, view: FakeWebviewView): void {
  provider.resolveWebviewView(
    view as unknown as vscode.WebviewView,
    {} as vscode.WebviewViewResolveContext,
    {} as vscode.CancellationToken,
  );
}

/** A provider with its own bridge and a recording logger, for wiring tests. */
function standaloneProvider(agents: readonly AgentInfo[] = []): {
  provider: PixelAgentsViewProvider;
  bridge: WebviewBridge;
  log: FakeLogOutputChannel;
} {
  const log = new FakeLogOutputChannel('test');
  const bridge = new WebviewBridge({
    getAgents: () => agents,
    getConfig: () => DEFAULT_GAME_CONFIG,
    getFallbackConfig: () => DEFAULT_GAME_CONFIG,
    getProgress: () => DEFAULT_PROGRESS,
    saveProgress: () => undefined,
    revealAgentTerminal: null,
    logger: log,
  });
  const provider = new PixelAgentsViewProvider(EXTENSION_URI as unknown as vscode.Uri, bridge);
  return { provider, bridge, log };
}

function resolveInto(webview: FakeWebview): void {
  resolve(standaloneProvider().provider, new FakeWebviewView(webview));
}

/** Activates with a fake context and returns the registered provider and the output channel. */
function activated(): {
  context: FakeContext;
  provider: PixelAgentsViewProvider;
  log: FakeLogOutputChannel;
} {
  const context = fakeContext();
  activate(context as unknown as vscode.ExtensionContext);
  const provider = recorded.registrations[0]?.provider;
  assert.ok(provider instanceof PixelAgentsViewProvider, 'activate registers the provider');
  const log = recorded.outputChannels[0]?.channel;
  assert.ok(log !== undefined, 'activate creates the output channel');
  return { context, provider, log };
}

/** Structured clone, as the real webview.postMessage applies, so deep equality is realm-free. */
function posted(webview: FakeWebview): unknown[] {
  return webview.postedMessages.map((message) => structuredClone(message));
}

function nonceOf(doc: string): string {
  const match = /<script nonce="([^"]*)"/.exec(doc);
  assert.ok(match?.[1] !== undefined, 'script tag with a nonce expected');
  return match[1];
}

void describe('activate', () => {
  beforeEach(resetWithQuietMonitor);

  void it('registers exactly one provider for the contributed view id', () => {
    activated();
    assert.equal(recorded.registrations.length, 1);
    const registration = recorded.registrations[0];
    assert.equal(registration?.viewType, VIEW_TYPE);
    assert.ok(registration?.provider instanceof PixelAgentsViewProvider);

    const manifest = asRecord(readJson('package.json'), 'package.json');
    const views = asRecord(asRecord(manifest.contributes, 'contributes').views, 'views');
    const ids = (views.pixelAgents as { id: string }[]).map((view) => view.id);
    assert.ok(ids.includes(VIEW_TYPE), `${VIEW_TYPE} must be a contributed view id`);
  });

  void it('does not retain the webview context when hidden', () => {
    activated();
    assert.deepEqual(recorded.registrations[0]?.options, {
      webviewOptions: { retainContextWhenHidden: false },
    });
  });

  void it('creates exactly one "Pixel Agents" log output channel', () => {
    activated();
    assert.equal(recorded.outputChannels.length, 1);
    assert.equal(recorded.outputChannels[0]?.name, 'Pixel Agents');
    assert.deepEqual(recorded.outputChannels[0]?.options, { log: true });
  });

  void it('hands exactly ten disposables to context.subscriptions: channel, terminal port, monitor, three monitor listeners, progress store, game-settings listener, provider, registration (M3, E1)', () => {
    const { context, provider, log } = activated();
    assert.equal(context.subscriptions.length, 10);
    const expected = [log, provider, recorded.registrations[0]?.disposable];
    for (const disposable of expected) {
      assert.ok(context.subscriptions.includes(disposable as { dispose(): void }));
    }
  });

  void it('touches only the read-only window API it needs (no status bar, no createTerminal, no commands)', () => {
    activated();
    const allowed = new Set([
      'createOutputChannel',
      'registerWebviewViewProvider',
      // M3 TerminalPort adapter: read terminals and subscribe to open and close.
      'terminals',
      'onDidOpenTerminal',
      'onDidCloseTerminal',
      'activeTerminal',
    ]);
    const used = [...new Set(recorded.windowAccesses)];
    assert.deepEqual(
      used.filter((member) => !allowed.has(member)),
      [],
    );
    for (const required of ['createOutputChannel', 'registerWebviewViewProvider']) {
      assert.ok(used.includes(required), `${required} expected`);
    }
  });

  void it('logs nothing on activation', () => {
    const { log } = activated();
    assert.deepEqual(log.calls, []);
  });

  void it('returns nothing (no exported test API) and exports only the planned names', () => {
    const result: unknown = activate(fakeContext() as unknown as vscode.ExtensionContext);
    assert.equal(result, undefined);
    assert.deepEqual(
      Object.keys(extension).sort(),
      ['PixelAgentsViewProvider', 'VIEW_TYPE', 'activate', 'deactivate'].sort(),
    );
  });

  void it('deactivate does not throw', () => {
    assert.doesNotThrow(() => deactivate());
  });
});

void describe('PixelAgentsViewProvider.resolveWebviewView: options and HTML (M1)', () => {
  beforeEach(resetWithQuietMonitor);

  void it('locks webview options to scripts only, rooted at dist/', () => {
    const webview = new FakeWebview();
    resolveInto(webview);
    assert.deepEqual(webview.options, {
      enableScripts: true,
      enableCommandUris: false,
      enableForms: false,
      localResourceRoots: [Uri.joinPath(EXTENSION_URI, 'dist')],
    });
  });

  void it('loads dist/webview.js through asWebviewUri', () => {
    const webview = new FakeWebview();
    resolveInto(webview);
    assert.deepEqual(
      webview.asWebviewUriCalls.map((uri) => uri.path),
      ['/ext/dist/webview.js'],
    );
    assert.ok(webview.html.includes('src="https://webview.test/ext/dist/webview.js"'));
  });

  void it('sets HTML with a valid CSP nonce shared by the CSP, script, and style', () => {
    const webview = new FakeWebview();
    resolveInto(webview);
    const nonce = nonceOf(webview.html);
    assert.match(nonce, NONCE_PATTERN);
    assert.ok(webview.html.includes(`script-src 'nonce-${nonce}'`));
    assert.ok(webview.html.includes(`<style nonce="${nonce}">`));
  });

  void it('uses a fresh nonce for every HTML load', () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const webview = new FakeWebview();
      resolveInto(webview);
      nonces.add(nonceOf(webview.html));
    }
    assert.equal(nonces.size, 20);
  });
});

void describe('PixelAgentsViewProvider.resolveWebviewView: message channel (M2)', () => {
  beforeEach(resetWithQuietMonitor);

  void it('registers exactly one message listener, before html is assigned (the first ready cannot be missed)', () => {
    const webview = new FakeWebview();
    resolveInto(webview);
    assert.equal(webview.messages.listenerCount, 1);
    assert.deepEqual(webview.messageListenersAtHtml, [1], 'html assigned once, after the listener');
  });

  void it('subscribes once each to visibility and dispose on the view', () => {
    const view = new FakeWebviewView();
    resolve(standaloneProvider().provider, view);
    assert.equal(view.visibilityEvents.listenerCount, 1);
    assert.equal(view.disposeEvents.listenerCount, 1);
  });

  void it('posts nothing until a message arrives', () => {
    const view = new FakeWebviewView();
    resolve(activated().provider, view);
    assert.deepEqual(view.webview.postedMessages, []);
  });

  void it('answers ready with exactly config, an empty agentList, then progress (no sessions, simulator off)', () => {
    const view = new FakeWebviewView();
    const { provider, log } = activated();
    resolve(provider, view);
    view.webview.deliver(READY);
    assert.deepEqual(posted(view.webview), EXPECTED_ANSWER);
    for (const message of view.webview.postedMessages) {
      assert.notEqual(parseHostMessage(message), undefined, 'every post passes parseHostMessage');
    }
    assert.deepEqual(log.messages('error'), []);
    assert.deepEqual(log.messages('trace'), [], 'a valid ready is not reported as dropped');
  });

  void it('answers every ready (idempotent, covers Reload Webviews)', () => {
    const view = new FakeWebviewView();
    resolve(activated().provider, view);
    view.webview.deliver(READY);
    view.webview.deliver(READY);
    assert.deepEqual(posted(view.webview), [...EXPECTED_ANSWER, ...EXPECTED_ANSWER]);
  });

  void it('drops controlling or garbage messages without posting or throwing, and traces them to the channel', () => {
    const view = new FakeWebviewView();
    const { provider, log } = activated();
    resolve(provider, view);
    const garbage: unknown[] = [
      { type: 'stopAgent', agentId: 'sim-1' },
      { type: 'sendText', text: 'rm -rf SECRET-PAYLOAD' },
      { type: 'ready', extra: 'SECRET-PAYLOAD' },
      null,
      undefined,
      'ready',
      42,
      [],
    ];
    for (const message of garbage) {
      assert.doesNotThrow(() => view.webview.deliver(message));
    }
    assert.deepEqual(view.webview.postedMessages, []);
    assert.equal(log.messages('trace').length, garbage.length, 'one trace per dropped message');
    assert.ok(log.calls.every((call) => !call.message.includes('SECRET-PAYLOAD')));
  });

  void it('drops focusAgent for an agent the monitor does not list: nothing posted, nothing thrown', () => {
    const view = new FakeWebviewView();
    const { provider, log } = activated();
    resolve(provider, view);
    view.webview.deliver(READY);
    const before = view.webview.postedMessages.length;
    assert.doesNotThrow(() => view.webview.deliver({ type: 'focusAgent', agentId: 'sim-1' }));
    assert.equal(view.webview.postedMessages.length, before);
    assert.deepEqual(log.messages('trace'), ['dropped focusAgent: unknown agent']);
  });

  void it('a hidden view drops pushes until the next ready, which re-posts the snapshot', () => {
    const view = new FakeWebviewView();
    const { provider, bridge } = standaloneProvider();
    resolve(provider, view);
    view.webview.deliver(READY);
    assert.equal(bridge.state, 'ready');
    view.setVisible(false);
    assert.equal(bridge.state, 'loading');
    bridge.postAgentState(SIM_AGENT);
    assert.equal(view.webview.postedMessages.length, 3, 'no agentState while hidden');
    view.setVisible(true);
    assert.equal(bridge.state, 'loading', 'showing alone does not mark ready; the new ready does');
    view.webview.deliver(READY);
    assert.equal(bridge.state, 'ready');
    assert.deepEqual(posted(view.webview), [...EXPECTED_ANSWER, ...EXPECTED_ANSWER]);
  });

  void it('after the view is disposed, a ready posts nothing and every listener is gone', () => {
    const view = new FakeWebviewView();
    const { provider, bridge } = standaloneProvider();
    resolve(provider, view);
    view.fireDispose();
    assert.equal(bridge.state, 'detached');
    assert.equal(view.liveListenerCount, 0);
    assert.doesNotThrow(() => view.webview.deliver(READY));
    assert.deepEqual(view.webview.postedMessages, []);
  });

  void it('resolving a second view disposes the first view’s three listeners', () => {
    const first = new FakeWebviewView();
    const second = new FakeWebviewView();
    const { provider } = standaloneProvider();
    resolve(provider, first);
    assert.equal(first.liveListenerCount, 3);
    resolve(provider, second);
    assert.equal(first.liveListenerCount, 0);
    assert.equal(second.liveListenerCount, 3);
  });

  void it('after a re-resolve, the first view’s messages, visibility, and dispose no longer affect the bridge', () => {
    const first = new FakeWebviewView();
    const second = new FakeWebviewView();
    const { provider, bridge } = standaloneProvider();
    resolve(provider, first);
    resolve(provider, second);
    second.webview.deliver(READY);
    assert.equal(bridge.state, 'ready');

    first.webview.deliver(READY);
    first.setVisible(false);
    first.fireDispose();
    assert.equal(bridge.state, 'ready', 'stale view events must not hide or detach the bridge');
    assert.deepEqual(first.webview.postedMessages, [], 'nothing is posted to the stale view');

    bridge.postAgentState(SIM_AGENT);
    assert.deepEqual(posted(second.webview), [
      ...EXPECTED_ANSWER,
      { type: 'agentState', agent: SIM_AGENT },
    ]);
  });

  void it('provider.dispose() leaves no listener registered and detaches the bridge', () => {
    const view = new FakeWebviewView();
    const { provider, bridge } = standaloneProvider();
    resolve(provider, view);
    provider.dispose();
    assert.equal(view.liveListenerCount, 0);
    assert.equal(bridge.state, 'detached');
    view.webview.deliver(READY);
    assert.deepEqual(view.webview.postedMessages, []);
  });

  void it('a rejected webview.postMessage is absorbed (no throw, no unhandled rejection)', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const view = new FakeWebviewView();
      const { provider, log } = standaloneProvider();
      resolve(provider, view);
      view.webview.postBehavior = 'reject';
      assert.doesNotThrow(() => view.webview.deliver(READY));
      await new Promise<void>((done) => setImmediate(done));
      await new Promise<void>((done) => setImmediate(done));
      assert.deepEqual(unhandled, []);
      assert.deepEqual(log.messages('trace'), [
        'post failed: view gone',
        'post failed: view gone',
        'post failed: view gone',
      ]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

/** Resolves a view on an activated extension and answers its ready; returns the pieces. */
function readyView(seed?: unknown): {
  context: FakeContext;
  view: FakeWebviewView;
  log: FakeLogOutputChannel;
} {
  const context = fakeContext();
  if (seed !== undefined) {
    context.globalState.store.set(PROGRESS_KEY, seed);
  }
  activate(context as unknown as vscode.ExtensionContext);
  const provider = recorded.registrations[0]?.provider;
  assert.ok(provider instanceof PixelAgentsViewProvider);
  const log = recorded.outputChannels[0]?.channel;
  assert.ok(log !== undefined);
  const view = new FakeWebviewView();
  resolve(provider, view);
  return { context, view, log };
}

function disposeAll(context: FakeContext): void {
  for (const disposable of [...context.subscriptions].reverse()) {
    disposable.dispose();
  }
}

void describe('extension glue: persisted progress (E1, ADR 0012)', () => {
  beforeEach(resetWithQuietMonitor);

  void it('a fresh install answers ready with the default progress and writes nothing', () => {
    const { context, view } = readyView();
    view.webview.deliver(READY);
    assert.deepEqual(posted(view.webview)[2], { type: 'progress', progress: DEFAULT_PROGRESS });
    assert.deepEqual(context.globalState.updates, []);
    assert.deepEqual(context.globalState.gets, [PROGRESS_KEY]);
  });

  void it('returns the stored progress on every ready, reading storage only once', () => {
    const { context, view } = readyView(STORED);
    view.webview.deliver(READY);
    view.webview.deliver(READY);
    const progress = posted(view.webview).filter(
      (m) => (m as { type: string }).type === 'progress',
    );
    assert.deepEqual(progress, [
      { type: 'progress', progress: STORED },
      { type: 'progress', progress: STORED },
    ]);
    assert.equal(context.globalState.gets.length, 1, 'the store caches its first load');
  });

  void it('a second ready (hide and show, or Reload Webviews) returns the progress saved since the first', () => {
    const { view } = readyView(STORED);
    view.webview.deliver(READY);
    const later: Progress = { ...STORED, totalKills: 90, killsInStage: 30 };
    view.webview.deliver({ type: 'saveProgress', progress: later });
    view.webview.deliver(READY);
    const progress = posted(view.webview).filter(
      (m) => (m as { type: string }).type === 'progress',
    );
    assert.deepEqual(progress, [
      { type: 'progress', progress: STORED },
      { type: 'progress', progress: later },
    ]);
  });

  void it('a valid saveProgress is coalesced and flushed to globalState on dispose', () => {
    const { context, view } = readyView();
    view.webview.deliver(READY);
    view.webview.deliver({ type: 'saveProgress', progress: STORED });
    view.webview.deliver({ type: 'saveProgress', progress: { ...STORED, totalKills: 72 } });
    const writes = (): readonly { readonly key: string; readonly value: unknown }[] =>
      context.globalState.updates;
    assert.deepEqual(writes(), [], 'not written yet: writes are coalesced');
    disposeAll(context);
    assert.equal(writes().length, 1, 'one write for two saves');
    assert.equal(writes()[0]?.key, PROGRESS_KEY);
    assert.deepEqual(writes()[0]?.value, { ...STORED, totalKills: 72 });
  });

  void it('an invalid or controlling save writes nothing', () => {
    const { context, view } = readyView();
    view.webview.deliver(READY);
    for (const message of [
      { type: 'saveProgress', progress: { ...STORED, stageIndex: 0 } },
      { type: 'saveProgress', progress: { ...STORED, agentId: 'sim-1' } },
      { type: 'saveProgress', progress: STORED, command: 'kill' },
      { type: 'saveProgress' },
    ]) {
      view.webview.deliver(message);
    }
    disposeAll(context);
    assert.deepEqual(context.globalState.updates, []);
  });

  void it('a stored value from a newer version is returned as defaults and never overwritten', () => {
    const future = { ...STORED, schemaVersion: 99 };
    const { context, view, log } = readyView(future);
    view.webview.deliver(READY);
    assert.deepEqual(posted(view.webview)[2], { type: 'progress', progress: DEFAULT_PROGRESS });
    view.webview.deliver({ type: 'saveProgress', progress: { ...STORED, totalKills: 500 } });
    disposeAll(context);
    assert.deepEqual(context.globalState.updates, []);
    assert.deepEqual(context.globalState.store.get(PROGRESS_KEY), future, 'left untouched');
    assert.deepEqual(log.messages('error'), [
      'progress: stored value is from a newer version, read-only',
    ]);
  });

  void it('a lower totalKills than stored is ignored (a stale second window cannot rewind)', () => {
    const { context, view } = readyView(STORED);
    view.webview.deliver(READY);
    view.webview.deliver({ type: 'saveProgress', progress: { ...STORED, totalKills: 3 } });
    disposeAll(context);
    assert.deepEqual(context.globalState.updates, []);
  });

  void it('a throwing or rejecting storage never breaks ready, and logs only fixed lines', async () => {
    const context = fakeContext();
    context.globalState.getThrows = new Error('SECRET-STORE-TEXT');
    activate(context as unknown as vscode.ExtensionContext);
    const provider = recorded.registrations[0]?.provider as PixelAgentsViewProvider;
    const log = recorded.outputChannels[0]?.channel as FakeLogOutputChannel;
    const view = new FakeWebviewView();
    resolve(provider, view);
    assert.doesNotThrow(() => view.webview.deliver(READY));
    assert.deepEqual(posted(view.webview), EXPECTED_ANSWER, 'plays on defaults');
    context.globalState.updateBehavior = 'reject';
    view.webview.deliver({ type: 'saveProgress', progress: STORED });
    assert.doesNotThrow(() => disposeAll(context));
    await new Promise<void>((done) => setImmediate(done));
    assert.ok(log.messages('error').length >= 1);
    assert.ok(!log.calls.some((c) => c.message.includes('SECRET-STORE-TEXT')));
    assert.ok(!log.calls.some((c) => c.message.includes('update rejected')));
  });

  void it('does not register keys for Settings Sync and touches no other context member', () => {
    const { context, view } = readyView();
    view.webview.deliver(READY);
    view.webview.deliver({ type: 'saveProgress', progress: STORED });
    disposeAll(context);
    assert.equal(context.globalState.syncKeyCalls, 0);
    assert.deepEqual(context.globalState.keys(), [PROGRESS_KEY]);
  });

  void it('stores nothing but the progress key, and the value has only the six numeric keys', () => {
    const { context, view } = readyView();
    view.webview.deliver(READY);
    view.webview.deliver({
      type: 'saveProgress',
      progress: { ...STORED, name: 'SECRET-NAME' } as unknown as Progress,
    });
    view.webview.deliver({ type: 'saveProgress', progress: STORED });
    disposeAll(context);
    const value = context.globalState.store.get(PROGRESS_KEY) as Record<string, unknown>;
    assert.deepEqual(Object.keys(value), [
      'schemaVersion',
      'stageIndex',
      'killsInStage',
      'totalKills',
      'bossesDefeated',
      'cycle',
    ]);
    assert.ok(Object.values(value).every((v) => typeof v === 'number'));
    assert.ok(!JSON.stringify(context.globalState.updates).includes('SECRET'));
  });
});

void describe('extension glue: game settings (E1)', () => {
  beforeEach(resetWithQuietMonitor);

  void it('config carries the three settings with their defaults', () => {
    const { view } = readyView();
    view.webview.deliver(READY);
    assert.deepEqual((posted(view.webview)[0] as { config: unknown }).config, DEFAULT_GAME_CONFIG);
  });

  void it('reads configured values, clamps out-of-range values, and ignores wrong types', () => {
    recorded.config.enemies = false;
    recorded.config.killsPerStage = 99_999;
    recorded.config.maxEnemies = 'lots';
    const { view } = readyView();
    view.webview.deliver(READY);
    assert.deepEqual((posted(view.webview)[0] as { config: unknown }).config, {
      protocolVersion: PROTOCOL_VERSION,
      enemiesEnabled: false,
      killsPerStage: 500,
      maxEnemies: 6,
    });
  });

  void it('a pixelAgents settings change re-posts config to a ready view; another section does not', () => {
    const { view } = readyView();
    view.webview.deliver(READY);
    const before = view.webview.postedMessages.length;
    changeConfiguration({ enemies: false }, ['editor']);
    assert.equal(view.webview.postedMessages.length, before);
    changeConfiguration({ enemies: false, killsPerStage: 12 });
    assert.equal(view.webview.postedMessages.length, before + 1);
    assert.deepEqual(posted(view.webview).at(-1), {
      type: 'config',
      config: { ...DEFAULT_GAME_CONFIG, enemiesEnabled: false, killsPerStage: 12 },
    });
  });

  void it('a settings change before the view says ready posts nothing', () => {
    const { view } = readyView();
    changeConfiguration({ enemies: false });
    assert.deepEqual(view.webview.postedMessages, []);
  });

  void it('a throwing getConfiguration during a change is contained and logged once', () => {
    const { view, log } = readyView();
    view.webview.deliver(READY);
    recorded.configThrows = new Error('SECRET_SETTINGS_TEXT');
    assert.doesNotThrow(() => changeConfiguration({ enemies: false }));
    // Two listeners react to a pixelAgents change and each logs once: the monitor's settings reader
    // and the bridge's postConfig (E1). Neither throws out of the event handler.
    const errors = log.messages('error');
    assert.equal(errors.length, 2, 'one logged error per listener');
    assert.ok(errors.some((m) => m.startsWith('monitor: configuration update failed')));
    assert.ok(errors.some((m) => m.startsWith('webview bridge error')));
  });
});
