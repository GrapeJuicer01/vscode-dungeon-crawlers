// Pixel Agents extension host entry point. M2: registers the bottom-panel webview view, creates
// the "Pixel Agents" log channel, and wires the view to the vscode-free WebviewBridge
// (src/host/webviewBridge.ts), which decides everything that is received and posted.
// No monitor, commands, or status bar yet (M3, M7). Thin glue only (coding-standards.md section 3).
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { WebviewBridge } from './host/webviewBridge';
import { PROTOCOL_VERSION } from './shared/protocol';
import type { AgentInfo } from './shared/protocol';
import { buildWebviewHtml } from './webview/index.html';

export const VIEW_TYPE = 'pixelAgents.view';

/** Assumption: no monitor until M3; the snapshot is empty. */
const NO_AGENTS: readonly AgentInfo[] = [];

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Pixel Agents', { log: true });
  const bridge = new WebviewBridge({
    getAgents: () => NO_AGENTS,
    getConfig: () => ({ protocolVersion: PROTOCOL_VERSION }),
    // M3 wires TerminalSource reveal; until then focusAgent is dropped.
    revealAgentTerminal: null,
    logger: log,
  });
  const provider = new PixelAgentsViewProvider(context.extensionUri, bridge);
  context.subscriptions.push(
    log,
    provider,
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider, {
      // The webview is never a source of truth; it is rebuilt on every show (ADR 0001).
      webviewOptions: { retainContextWhenHidden: false },
    }),
  );
}

export function deactivate(): void {
  // Nothing to do: all disposables are owned by context.subscriptions.
}

export class PixelAgentsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly extensionUri: vscode.Uri;
  private readonly bridge: WebviewBridge;
  /** Listeners of the current view only (message, visibility, dispose). */
  private viewListeners: vscode.Disposable[] = [];

  constructor(extensionUri: vscode.Uri, bridge: WebviewBridge) {
    this.extensionUri = extensionUri;
    this.bridge = bridge;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    // VS Code may re-resolve (for example after the container moves): drop the old view's listeners.
    this.disposeViewListeners();

    const webview = webviewView.webview;
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
    webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      enableForms: false,
      localResourceRoots: [distUri],
    };

    // Listeners before html, so the first `ready` cannot be missed.
    const bridge = this.bridge;
    this.viewListeners = [
      webview.onDidReceiveMessage((raw: unknown) => bridge.handleMessage(raw)),
      webviewView.onDidChangeVisibility(() => {
        if (!webviewView.visible) {
          bridge.markHidden();
        }
      }),
      webviewView.onDidDispose(() => {
        bridge.detach();
        this.disposeViewListeners();
      }),
    ];
    // The only postMessage in the host glue: a port adapter. The bridge decides what is posted.
    bridge.attach({ postMessage: (message) => webviewView.webview.postMessage(message) });

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js')).toString();
    webview.html = buildWebviewHtml({ nonce: createNonce(), scriptUri });
  }

  dispose(): void {
    this.bridge.detach();
    this.disposeViewListeners();
  }

  private disposeViewListeners(): void {
    const listeners = this.viewListeners;
    this.viewListeners = [];
    for (const listener of listeners) {
      listener.dispose();
    }
  }
}

/** 16 random bytes from node:crypto randomBytes, base64. New value per HTML load. */
function createNonce(): string {
  return randomBytes(16).toString('base64');
}
