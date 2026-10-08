// Pixel Agents extension host entry point. M3: registers the bottom-panel webview view, creates
// the "Pixel Agents" log channel, builds the read-only AgentMonitor (src/monitor/) from its
// adapters, and wires it into the vscode-free WebviewBridge (src/host/webviewBridge.ts):
// getAgents is the monitor's list, every monitor change is posted with postAgentState, and
// focusAgent reveals the agent's linked terminal (Terminal.show() only). No commands or status
// bar yet (M7). Thin glue only (coding-standards.md section 3).
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { WebviewBridge } from './host/webviewBridge';
import { createNodeFileSystem } from './monitor/adapters/nodeFileSystem';
import {
  CASE_INSENSITIVE_FS,
  NODE_CLOCK,
  NODE_PATH,
  NODE_TIMERS,
} from './monitor/adapters/nodeRuntime';
import { createVscodeTerminalPort } from './monitor/adapters/vscodeTerminals';
import { AgentMonitor } from './monitor/AgentMonitor';
import { readMonitorConfig, SETTINGS_SECTION } from './monitor/monitorConfig';
import type { MonitorConfig } from './monitor/monitorConfig';
import { safeErrorCode } from './monitor/monitorLog';
import type { WorkspaceFolderRef } from './monitor/ports';
import { DEFAULT_SIMULATOR_SEED } from './monitor/SimulatorSource';
import { PROTOCOL_VERSION } from './shared/protocol';
import type { AgentInfo } from './shared/protocol';
import { buildWebviewHtml } from './webview/index.html';

export const VIEW_TYPE = 'pixelAgents.view';

/** Fallback when the monitor could not start: the snapshot is empty. */
const NO_AGENTS: readonly AgentInfo[] = [];

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Pixel Agents', { log: true });
  context.subscriptions.push(log);
  const monitor = createMonitor(context, log);
  const bridge = new WebviewBridge({
    getAgents: monitor === null ? () => NO_AGENTS : () => monitor.getAgents(),
    getConfig: () => ({ protocolVersion: PROTOCOL_VERSION }),
    // Reveal only: bridge -> AgentMonitor -> TerminalSource -> TerminalPort -> Terminal.show().
    revealAgentTerminal:
      monitor === null ? null : (agentId) => monitor.revealAgentTerminal(agentId),
    logger: log,
  });
  if (monitor !== null) {
    context.subscriptions.push(
      monitor.onDidChangeAgent((agent) => bridge.postAgentState(agent)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        try {
          if (event.affectsConfiguration(SETTINGS_SECTION)) {
            monitor.updateConfig(readConfig());
          }
        } catch (error: unknown) {
          logMonitorError(log, 'monitor: configuration update failed', error);
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        try {
          monitor.updateWorkspaceFolders(workspaceFolderRefs());
        } catch (error: unknown) {
          logMonitorError(log, 'monitor: workspace update failed', error);
        }
      }),
    );
    try {
      monitor.start();
    } catch (error: unknown) {
      logMonitorError(log, 'monitor failed to start', error);
    }
  }
  const provider = new PixelAgentsViewProvider(context.extensionUri, bridge);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider, {
      // The webview is never a source of truth; it is rebuilt on every show (ADR 0001).
      webviewOptions: { retainContextWhenHidden: false },
    }),
  );
}

/**
 * Builds the monitor and its adapters inside one try/catch. On any failure the extension keeps
 * the M2 behaviour (empty list, no reveal) and logs only an error code (Core invariant 4, T5).
 */
function createMonitor(
  context: vscode.ExtensionContext,
  log: vscode.LogOutputChannel,
): AgentMonitor | null {
  try {
    const terminalPort = createVscodeTerminalPort(vscode.window);
    context.subscriptions.push(terminalPort);
    const monitor = new AgentMonitor(
      {
        fs: createNodeFileSystem(),
        path: NODE_PATH,
        clock: NODE_CLOCK,
        timers: NODE_TIMERS,
        terminals: terminalPort,
        logger: log,
        caseInsensitive: CASE_INSENSITIVE_FS,
        simulatorSeed: DEFAULT_SIMULATOR_SEED,
      },
      readConfig(),
      workspaceFolderRefs(),
    );
    context.subscriptions.push(monitor);
    return monitor;
  } catch (error: unknown) {
    logMonitorError(log, 'monitor failed to start', error);
    return null;
  }
}

function readConfig(): MonitorConfig {
  const section = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  return readMonitorConfig((key) => section.get<unknown>(key));
}

/** Local `file:` workspace folders only; other schemes have no transcript directory. */
function workspaceFolderRefs(): readonly WorkspaceFolderRef[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => ({ name: folder.name, fsPath: folder.uri.fsPath }));
}

/** Logs a fixed reason plus safeErrorCode only; a throwing logger is swallowed. */
function logMonitorError(log: vscode.LogOutputChannel, reason: string, error: unknown): void {
  try {
    log.error(reason + ' (' + safeErrorCode(error) + ')');
  } catch {
    // Nowhere left to report; nothing may escape.
  }
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
