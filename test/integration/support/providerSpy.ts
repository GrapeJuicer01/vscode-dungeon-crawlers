// Test-side observer for webview view registration and resolution. No production hook.
//
// The extension host hands out one `vscode` API object per extension, chosen by the path of the
// requiring file. This suite is compiled to out/integration/ inside the extension development
// path, so it receives the same API object as dist/extension.js. Wrapping
// `window.registerWebviewViewProvider` here, before the extension activates, therefore observes
// the extension's own registration and every resolveWebviewView call, without changing what the
// extension does: the wrapper forwards every call unchanged.
import * as vscode from 'vscode';

export interface Registration {
  readonly viewType: string;
  readonly options: unknown;
}

export interface Resolution {
  readonly view: vscode.WebviewView;
  /** The HTML exactly as the provider set it, read right after resolveWebviewView returned. */
  html: string;
  readonly visibilityChanges: boolean[];
  disposed: boolean;
}

export const observed: { registrations: Registration[]; resolutions: Resolution[] } = {
  registrations: [],
  resolutions: [],
};

type Register = typeof vscode.window.registerWebviewViewProvider;

export function installProviderSpy(): void {
  const windowApi = vscode.window as unknown as { registerWebviewViewProvider: Register };
  const original = windowApi.registerWebviewViewProvider.bind(vscode.window);
  const spy: Register = (viewType, provider, options) => {
    observed.registrations.push({ viewType, options });
    const wrapped: vscode.WebviewViewProvider = {
      resolveWebviewView(view, context, token) {
        const result = provider.resolveWebviewView(view, context, token);
        const record: Resolution = { view, html: '', visibilityChanges: [], disposed: false };
        const capture = (): void => {
          record.html = view.webview.html;
        };
        view.onDidChangeVisibility(() => record.visibilityChanges.push(view.visible));
        view.onDidDispose(() => {
          record.disposed = true;
        });
        observed.resolutions.push(record);
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
