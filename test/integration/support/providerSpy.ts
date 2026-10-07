// Test-side observer for webview view registration and resolution. No production hook.
//
// The extension host hands out one `vscode` API object per extension, chosen by the path of the
// requiring file. This suite is compiled to out/integration/ inside the extension development
// path, so it receives the same API object as dist/extension.js. Wrapping
// `window.registerWebviewViewProvider` here, before the extension activates, therefore observes
// the extension's own registration and every resolveWebviewView call, without changing what the
// extension does: the wrapper forwards every call unchanged.
//
// M2 (plan test note 11): before forwarding resolveWebviewView, the spy subscribes to the view's
// public `webview.onDidReceiveMessage` (any number of subscribers is allowed) and, if the
// property is writable, wraps `webview.postMessage` with a recorder that forwards every call
// unchanged. Visibility changes go on the same timeline, so a test can check "exactly one ready
// per load, then config and agentList, nothing while hidden".
import * as vscode from 'vscode';

export interface Registration {
  readonly viewType: string;
  readonly options: unknown;
}

export type TimelineEntry =
  | { readonly kind: 'received'; readonly message: unknown; readonly visible: boolean }
  | { readonly kind: 'posted'; readonly message: unknown; readonly visible: boolean }
  | { readonly kind: 'visibility'; readonly visible: boolean };

export interface Resolution {
  readonly view: vscode.WebviewView;
  /** The HTML exactly as the provider set it, read right after resolveWebviewView returned. */
  html: string;
  readonly visibilityChanges: boolean[];
  disposed: boolean;
  /** Messages from the webview, in arrival order, as delivered to onDidReceiveMessage. */
  readonly received: unknown[];
  /** Received messages, host posts, and visibility changes, in the order the host saw them. */
  readonly timeline: TimelineEntry[];
  /** null if the postMessage recorder is installed; otherwise why it could not be. */
  postWrapperUnavailable: string | null;
}

export const observed: {
  registrations: Registration[];
  resolutions: Resolution[];
  /** The real providers, as registered by the extension (for a public-interface call). */
  providers: vscode.WebviewViewProvider[];
} = {
  registrations: [],
  resolutions: [],
  providers: [],
};

type Register = typeof vscode.window.registerWebviewViewProvider;
type PostMessage = (message: unknown) => Thenable<boolean>;

/** Count of `ready` messages received on a resolution. */
export function readyCount(resolution: Resolution): number {
  return resolution.received.filter(
    (message) =>
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === 'ready',
  ).length;
}

function installPostRecorder(view: vscode.WebviewView, record: Resolution): void {
  const webview = view.webview;
  const original = webview.postMessage.bind(webview) as PostMessage;
  const recorder: PostMessage = (message) => {
    record.timeline.push({ kind: 'posted', message, visible: view.visible });
    return original(message);
  };
  try {
    (webview as unknown as { postMessage: PostMessage }).postMessage = recorder;
  } catch (error: unknown) {
    record.postWrapperUnavailable = `assignment threw: ${String(error)}`;
    return;
  }
  record.postWrapperUnavailable =
    view.webview.postMessage === (recorder as unknown)
      ? null
      : 'webview.postMessage is not writable in this VS Code build';
}

export function installProviderSpy(): void {
  const windowApi = vscode.window as unknown as { registerWebviewViewProvider: Register };
  const original = windowApi.registerWebviewViewProvider.bind(vscode.window);
  const spy: Register = (viewType, provider, options) => {
    observed.registrations.push({ viewType, options });
    observed.providers.push(provider);
    const wrapped: vscode.WebviewViewProvider = {
      resolveWebviewView(view, context, token) {
        const record: Resolution = {
          view,
          html: '',
          visibilityChanges: [],
          disposed: false,
          received: [],
          timeline: [],
          postWrapperUnavailable: 'not installed',
        };
        // Subscribed before the real provider runs, so this listener sees every message first.
        view.webview.onDidReceiveMessage((message: unknown) => {
          record.received.push(message);
          record.timeline.push({ kind: 'received', message, visible: view.visible });
        });
        installPostRecorder(view, record);
        view.onDidChangeVisibility(() => {
          record.visibilityChanges.push(view.visible);
          record.timeline.push({ kind: 'visibility', visible: view.visible });
        });
        view.onDidDispose(() => {
          record.disposed = true;
        });
        observed.resolutions.push(record);
        const capture = (): void => {
          record.html = view.webview.html;
        };
        const result = provider.resolveWebviewView(view, context, token);
        if (result === undefined) {
          capture();
          return undefined;
        }
        return Promise.resolve(result).then(capture);
      },
    };
    return original(viewType, wrapped, options);
  };
  windowApi.registerWebviewViewProvider = spy;
  if (vscode.window.registerWebviewViewProvider !== spy) {
    throw new Error(
      'Could not install the provider spy: vscode.window is not writable in this VS Code build.',
    );
  }
}
