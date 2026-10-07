// In-memory stand-in for the `vscode` module. test/run.mjs aliases `vscode` to this file, so
// host code such as src/extension.ts can be unit tested without an extension host (ADR 0006).
//
// It implements only what M1 host code needs. Any other `vscode.window` member is recorded as
// an access and returns undefined, so a test can assert that host code touches nothing else.
// Tests import it directly to inspect what host code did and call `resetFakeVscode()` first.

export interface Disposable {
  dispose(): void;
}

export class Uri {
  readonly scheme: string;
  readonly path: string;

  private constructor(scheme: string, uriPath: string) {
    this.scheme = scheme;
    this.path = uriPath;
  }

  static file(fsPath: string): Uri {
    return new Uri('file', fsPath);
  }

  /** Test-only constructor for non-file URIs. */
  static of(scheme: string, uriPath: string): Uri {
    return new Uri(scheme, uriPath);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path, ...segments].join('/'));
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export interface ProviderRegistration {
  readonly viewType: string;
  readonly provider: unknown;
  readonly options: unknown;
  readonly disposable: Disposable;
}

export const recorded: {
  registrations: ProviderRegistration[];
  windowAccesses: string[];
} = {
  registrations: [],
  windowAccesses: [],
};

export function resetFakeVscode(): void {
  recorded.registrations = [];
  recorded.windowAccesses = [];
}

const windowImpl = {
  registerWebviewViewProvider(viewType: string, provider: unknown, options?: unknown): Disposable {
    const disposable: Disposable = { dispose: () => undefined };
    recorded.registrations.push({ viewType, provider, options, disposable });
    return disposable;
  },
};

export const window: typeof windowImpl = new Proxy(windowImpl, {
  get(target, property, receiver): unknown {
    recorded.windowAccesses.push(String(property));
    return Reflect.get(target, property, receiver) as unknown;
  },
});

/** A fake webview that records everything host code does to it. */
export class FakeWebview {
  options: unknown = undefined;
  html = '';
  readonly asWebviewUriCalls: Uri[] = [];
  readonly messageListeners: unknown[] = [];
  readonly postedMessages: unknown[] = [];

  asWebviewUri(uri: Uri): Uri {
    this.asWebviewUriCalls.push(uri);
    return Uri.of('https', `webview.test${uri.path}`);
  }

  onDidReceiveMessage(listener: unknown): Disposable {
    this.messageListeners.push(listener);
    return { dispose: () => undefined };
  }

  postMessage(message: unknown): Promise<boolean> {
    this.postedMessages.push(message);
    return Promise.resolve(true);
  }
}
