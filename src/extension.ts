// Pixel Agents extension host entry point. M1: registers the bottom-panel webview view only.
// No message channel, monitor, commands, or status bar yet (see the M1 plan section 3.1).
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { buildWebviewHtml } from './webview/index.html';

export const VIEW_TYPE = 'pixelAgents.view';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PixelAgentsViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider, {
      // The webview is never a source of truth; it is rebuilt on every show (ADR 0001).
      webviewOptions: { retainContextWhenHidden: false },
    }),
  );
}

export function deactivate(): void {
  // Nothing to do: all disposables are owned by context.subscriptions.
}

export class PixelAgentsViewProvider implements vscode.WebviewViewProvider {
  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    const webview = webviewView.webview;
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
    webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      enableForms: false,
      localResourceRoots: [distUri],
    };
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js')).toString();
    webview.html = buildWebviewHtml({ nonce: createNonce(), scriptUri });
  }
}

/** 16 random bytes from node:crypto randomBytes, base64. New value per HTML load. */
function createNonce(): string {
  return randomBytes(16).toString('base64');
}
