// Extension-host checks for the M1 F5 checklist (testing-strategy.md section 7): the clean
// environment, the panel view contribution, lazy activation, the served HTML and CSP, and
// hide/show cycles. Tests run in order; the activation tests rely on running first.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { buildCsp } from '../../../src/webview/index.html';
import { delay, describe, it, waitFor } from '../support/harness';
import { observed, type Resolution } from '../support/providerSpy';

const EXTENSION_ID = 'pixel-agents.pixel-agents';
/** The unrelated marketplace extension with the same display name (M1 plan section 9). */
const NAMESAKE_ID = 'pablodelucca.pixel-agents';
const VIEW_ID = 'pixelAgents.view';
const CONTAINER_ID = 'pixelAgents';
const FOCUS_COMMAND = `${VIEW_ID}.focus`;

function ours(): vscode.Extension<unknown> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension !== undefined, `${EXTENSION_ID} must be loaded as the development extension`);
  return extension;
}

function latestResolution(): Resolution {
  const resolution = observed.resolutions.at(-1);
  assert.ok(resolution !== undefined, 'resolveWebviewView has not been called');
  return resolution;
}

/** Every registered command id that belongs to the Pixel Agents namespace. */
async function pixelAgentsCommands(): Promise<string[]> {
  const all = await vscode.commands.getCommands(false);
  return all.filter((id) => id.startsWith('pixelAgents.')).sort();
}

function isBuiltin(extension: vscode.Extension<unknown>): boolean {
  const relative = path.relative(vscode.env.appRoot, extension.extensionPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Hides the panel and waits until our view reports hidden. */
async function closePanel(resolution: Resolution): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await waitFor(() => !resolution.view.visible, 'view hidden after closing the panel');
}

async function focusView(): Promise<void> {
  await vscode.commands.executeCommand(FOCUS_COMMAND);
  await waitFor(() => latestResolution().view.visible, 'view visible after focus');
}

let commandsBeforeActivation: string[] = [];

describe('environment (launched with --disable-extensions)', () => {
  it('loads Pixel Agents as the development extension', () => {
    const extension = ours();
    const manifest = extension.packageJSON as { displayName?: unknown };
    assert.equal(manifest.displayName, 'Pixel Agents');
    assert.ok(existsSync(path.join(extension.extensionPath, 'dist', 'extension.js')));
  });

  it(`does not load the namesake marketplace extension ${NAMESAKE_ID}`, () => {
    assert.equal(vscode.extensions.getExtension(NAMESAKE_ID), undefined);
  });

  it('loads no non-built-in extension other than Pixel Agents', () => {
    const others = vscode.extensions.all
      .filter((extension) => !isBuiltin(extension))
      .map((extension) => extension.id)
      .filter((id) => id !== EXTENSION_ID);
    assert.deepEqual(others, []);
  });
});

describe('lazy activation', () => {
  it('is not active before the view is opened', async () => {
    // Let startup activation (onStartupFinished, *) settle so a wrong event would have fired.
    await delay(2_000);
    assert.equal(ours().isActive, false, 'the extension must activate only when its view opens');
    assert.equal(observed.registrations.length, 0, 'no provider registered before activation');
    commandsBeforeActivation = await pixelAgentsCommands();
  });

  it('contributes the view: its focus command and its container command exist', async () => {
    const all = await vscode.commands.getCommands(false);
    assert.ok(all.includes(FOCUS_COMMAND), `${FOCUS_COMMAND} must exist`);
    assert.ok(
      all.includes(`workbench.view.extension.${CONTAINER_ID}`),
      'the pixelAgents view container must be contributed',
    );
    assert.equal(ours().isActive, false, 'listing commands must not activate the extension');
  });

  it('activates when the view is focused and resolves the view', async () => {
    await vscode.commands.executeCommand(FOCUS_COMMAND);
    await waitFor(() => ours().isActive, 'extension active after focusing the view');
    // Resolves with the exports; rejects if activate() threw.
    await ours().activate();
    await waitFor(() => observed.resolutions.length > 0, 'resolveWebviewView called');
    await waitFor(() => latestResolution().html.length > 0, 'HTML set by the provider');
    assert.equal(latestResolution().view.visible, true);
    assert.equal(latestResolution().view.viewType, VIEW_ID);
  });

  it('registers exactly one provider, for the contributed view, without retained context', () => {
    assert.equal(observed.registrations.length, 1);
    const [registration] = observed.registrations;
    assert.equal(registration?.viewType, VIEW_ID);
    assert.deepEqual(registration?.options, { webviewOptions: { retainContextWhenHidden: false } });
  });

  it('registers no command of its own on activation (M1 only)', async () => {
    assert.deepEqual(await pixelAgentsCommands(), commandsBeforeActivation);
  });

  it('creates no terminal (read-only, invariant 3)', () => {
    assert.equal(vscode.window.terminals.length, 0);
  });
});

describe('served webview', () => {
  it('sets the planned webview options', () => {
    const { view } = latestResolution();
    const options = view.webview.options;
    assert.equal(options.enableScripts, true);
    assert.equal(options.enableCommandUris, false);
    assert.equal(options.enableForms, false);
    const roots = (options.localResourceRoots ?? []).map((uri) => uri.fsPath);
    assert.deepEqual(roots, [path.join(ours().extensionPath, 'dist')]);
  });

  it(`serves a CSP with default-src 'none' that equals buildCsp for its nonce`, () => {
    const { html } = latestResolution();
    const metas = [
      ...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g),
    ];
    assert.equal(metas.length, 1, 'exactly one CSP meta tag');
    const csp = metas[0]?.[1] ?? '';
    assert.match(csp, /^default-src 'none';/);
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? '';
    assert.equal(csp, buildCsp(nonce));
  });

  it('loads dist/webview.js through asWebviewUri with the CSP nonce', () => {
    const { view, html } = latestResolution();
    const scripts = [...html.matchAll(/<script nonce="([^"]+)" src="([^"]+)"><\/script>/g)];
    assert.equal(scripts.length, 1, 'exactly one script tag');
    const [, nonce, src] = scripts[0] ?? [];
    assert.ok(html.includes(`'nonce-${nonce ?? ''}'`), 'the script nonce must be the CSP nonce');
    const scriptFile = vscode.Uri.joinPath(ours().extensionUri, 'dist', 'webview.js');
    assert.equal(src, view.webview.asWebviewUri(scriptFile).toString());
    assert.ok(existsSync(scriptFile.fsPath), 'dist/webview.js must exist (run npm run build)');
  });
});

describe('hide and re-show', () => {
  it('hides when the panel closes, which proves the view lives in the panel', async () => {
    const resolution = latestResolution();
    await closePanel(resolution);
    assert.equal(resolution.view.visible, false);
  });

  it('shows again on focus with valid HTML and the extension still active', async () => {
    await focusView();
    const resolution = latestResolution();
    assert.equal(resolution.disposed, false);
    assert.equal(ours().isActive, true);
    const csp = /content="([^"]*)"/.exec(resolution.html)?.[1] ?? '';
    assert.match(csp, /^default-src 'none';/);
  });

  it('hides when another panel view is shown, and shows again on focus', async () => {
    const resolution = latestResolution();
    await vscode.commands.executeCommand('workbench.actions.view.problems');
    await waitFor(() => !resolution.view.visible, 'view hidden behind the Problems view');
    await focusView();
  });

  it('survives five more close and focus cycles without errors', async () => {
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await closePanel(latestResolution());
      await focusView();
    }
    await ours().activate();
    assert.equal(ours().isActive, true);
    assert.equal(observed.registrations.length, 1, 'the provider is registered once');
    assert.ok(
      observed.resolutions.every((resolution) => !resolution.disposed),
      'hiding the panel must not dispose the view',
    );
  });

  it('reported each hide and show through onDidChangeVisibility', () => {
    const changes = observed.resolutions.flatMap((resolution) => resolution.visibilityChanges);
    assert.ok(
      changes.filter((visible) => !visible).length >= 7,
      `changes: ${JSON.stringify(changes)}`,
    );
    assert.ok(
      changes.filter((visible) => visible).length >= 7,
      `changes: ${JSON.stringify(changes)}`,
    );
  });

  it('every resolved HTML (if VS Code re-resolved) has its own valid nonce', () => {
    const nonces = observed.resolutions.map(
      (resolution) => /'nonce-([^']+)'/.exec(resolution.html)?.[1] ?? '',
    );
    for (const nonce of nonces) {
      assert.match(nonce, /^[A-Za-z0-9+/]{22,}={0,2}$/);
    }
    assert.equal(new Set(nonces).size, nonces.length, 'a nonce is never reused');
  });
});
