// Unit tests for src/extension.ts against the fake vscode module (test/support/fakeVscode.ts).
// M1 plan section 3.1: register one webview view provider, lock down webview options, and set
// HTML with a fresh nonce. No message channel, commands, or status bar in M1.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type * as vscode from 'vscode';
import { activate, deactivate, PixelAgentsViewProvider, VIEW_TYPE } from '../../src/extension';
import { FakeWebview, recorded, resetFakeVscode, Uri } from '../support/fakeVscode';
import { readJson, asRecord } from '../support/repo';

const EXTENSION_URI = Uri.file('/ext');
const NONCE_PATTERN = /^[A-Za-z0-9+/]{22,}={0,2}$/;

function fakeContext(): { subscriptions: { dispose(): void }[] } {
  return { subscriptions: [] };
}

function resolveInto(webview: FakeWebview): void {
  const provider = new PixelAgentsViewProvider(EXTENSION_URI as unknown as vscode.Uri);
  provider.resolveWebviewView(
    { webview } as unknown as vscode.WebviewView,
    {} as vscode.WebviewViewResolveContext,
    {} as vscode.CancellationToken,
  );
}

function nonceOf(doc: string): string {
  const match = /<script nonce="([^"]*)"/.exec(doc);
  assert.ok(match?.[1] !== undefined, 'script tag with a nonce expected');
  return match[1];
}

void describe('activate', () => {
  beforeEach(resetFakeVscode);

  void it('registers exactly one provider for the contributed view id', () => {
    const context = fakeContext();
    activate(context as unknown as vscode.ExtensionContext);

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
    activate(fakeContext() as unknown as vscode.ExtensionContext);
    assert.deepEqual(recorded.registrations[0]?.options, {
      webviewOptions: { retainContextWhenHidden: false },
    });
  });

  void it('hands the registration to context.subscriptions', () => {
    const context = fakeContext();
    activate(context as unknown as vscode.ExtensionContext);
    assert.equal(context.subscriptions.length, 1);
    assert.equal(context.subscriptions[0], recorded.registrations[0]?.disposable);
  });

  void it('touches no window API other than registerWebviewViewProvider (no status bar, terminals)', () => {
    activate(fakeContext() as unknown as vscode.ExtensionContext);
    assert.deepEqual([...new Set(recorded.windowAccesses)], ['registerWebviewViewProvider']);
  });

  void it('deactivate does not throw', () => {
    assert.doesNotThrow(() => deactivate());
  });
});

void describe('PixelAgentsViewProvider.resolveWebviewView', () => {
  beforeEach(resetFakeVscode);

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

  void it('opens no message channel in M1 (no listener, no posted message)', () => {
    const webview = new FakeWebview();
    resolveInto(webview);
    assert.equal(webview.messageListeners.length, 0);
    assert.equal(webview.postedMessages.length, 0);
  });
});
