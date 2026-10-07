// In-memory stand-in for the `vscode` module. test/run.mjs aliases `vscode` to this file, so
// host code such as src/extension.ts can be unit tested without an extension host (ADR 0006).
//
// It implements only what host code needs (M2: webview view registration, a LogOutputChannel,
// and a WebviewView with message, visibility, and dispose events). Any other `vscode.window`
// member is recorded as an access and returns undefined, so a test can assert that host code
// touches nothing else. Tests import it directly to inspect what host code did and call
// `resetFakeVscode()` first.

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

/** A minimal vscode.Event: subscribing returns a Disposable that really unsubscribes. */
export class FakeEvent<T> {
  readonly #listeners = new Set<(event: T) => unknown>();
  /** Every subscription ever made, including disposed ones. */
  subscriptions = 0;

  subscribe(listener: (event: T) => unknown): Disposable {
    // A wrapper per subscription, so the same function subscribed twice counts twice.
    const entry = (event: T): unknown => listener(event);
    this.#listeners.add(entry);
    this.subscriptions += 1;
    return {
      dispose: () => {
        this.#listeners.delete(entry);
      },
    };
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  /** Calls every live listener; a listener that throws propagates, as VS Code would surface it. */
  fire(event: T): void {
    for (const listener of [...this.#listeners]) {
      listener(event);
    }
  }
}

export type LogLevelName = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'appendLine' | 'append';

export interface LogCall {
  readonly level: LogLevelName;
  readonly message: string;
}

/** Recording fake of vscode.LogOutputChannel. */
export class FakeLogOutputChannel {
  readonly name: string;
  readonly calls: LogCall[] = [];
  disposed = false;
  readonly logLevel = 1;

  constructor(name: string) {
    this.name = name;
  }

  #record(level: LogLevelName, message: unknown, args: readonly unknown[]): void {
    this.calls.push({ level, message: [message, ...args].map(String).join(' ') });
  }

  trace(message: string, ...args: unknown[]): void {
    this.#record('trace', message, args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.#record('debug', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.#record('info', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.#record('warn', message, args);
  }

  error(error: string | Error, ...args: unknown[]): void {
    this.#record('error', error, args);
  }

  append(value: string): void {
    this.#record('append', value, []);
  }

  appendLine(value: string): void {
    this.#record('appendLine', value, []);
  }

  messages(level: LogLevelName): string[] {
    return this.calls.filter((call) => call.level === level).map((call) => call.message);
  }

  dispose(): void {
    this.disposed = true;
  }
}

export interface ProviderRegistration {
  readonly viewType: string;
  readonly provider: unknown;
  readonly options: unknown;
  readonly disposable: Disposable;
}

export interface OutputChannelCreation {
  readonly name: string;
  readonly options: unknown;
  readonly channel: FakeLogOutputChannel;
}

export const recorded: {
  registrations: ProviderRegistration[];
  outputChannels: OutputChannelCreation[];
  windowAccesses: string[];
} = {
  registrations: [],
  outputChannels: [],
  windowAccesses: [],
};

export function resetFakeVscode(): void {
  recorded.registrations = [];
  recorded.outputChannels = [];
  recorded.windowAccesses = [];
}

const windowImpl = {
  registerWebviewViewProvider(viewType: string, provider: unknown, options?: unknown): Disposable {
    const disposable: Disposable = { dispose: () => undefined };
    recorded.registrations.push({ viewType, provider, options, disposable });
    return disposable;
  },
  createOutputChannel(name: string, options?: unknown): FakeLogOutputChannel {
    const channel = new FakeLogOutputChannel(name);
    recorded.outputChannels.push({ name, options, channel });
    return channel;
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
  #html = '';
  /** How many message listeners were live at each `html` assignment, in order. */
  readonly messageListenersAtHtml: number[] = [];
  readonly asWebviewUriCalls: Uri[] = [];
  readonly messages = new FakeEvent<unknown>();
  readonly postedMessages: unknown[] = [];
  /** 'reject' makes postMessage return a rejected promise (the view went away). */
  postBehavior: 'resolve' | 'reject' = 'resolve';

  get html(): string {
    return this.#html;
  }

  set html(value: string) {
    this.messageListenersAtHtml.push(this.messages.listenerCount);
    this.#html = value;
  }

  asWebviewUri(uri: Uri): Uri {
    this.asWebviewUriCalls.push(uri);
    return Uri.of('https', `webview.test${uri.path}`);
  }

  onDidReceiveMessage(listener: (message: unknown) => unknown): Disposable {
    return this.messages.subscribe(listener);
  }

  /** Delivers a message from the webview to every host listener, as VS Code does. */
  deliver(message: unknown): void {
    this.messages.fire(message);
  }

  postMessage(message: unknown): Promise<boolean> {
    this.postedMessages.push(message);
    return this.postBehavior === 'resolve'
      ? Promise.resolve(true)
      : Promise.reject(new Error('webview disposed'));
  }
}

/** A fake vscode.WebviewView with visibility and dispose events. */
export class FakeWebviewView {
  readonly viewType = 'pixelAgents.view';
  readonly webview: FakeWebview;
  visible = true;
  readonly visibilityEvents = new FakeEvent<void>();
  readonly disposeEvents = new FakeEvent<void>();

  constructor(webview: FakeWebview = new FakeWebview()) {
    this.webview = webview;
  }

  onDidChangeVisibility(listener: () => unknown): Disposable {
    return this.visibilityEvents.subscribe(listener);
  }

  onDidDispose(listener: () => unknown): Disposable {
    return this.disposeEvents.subscribe(listener);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibilityEvents.fire();
  }

  /** Simulates VS Code disposing the view. */
  fireDispose(): void {
    this.disposeEvents.fire();
  }

  /** Live listeners across message, visibility, and dispose events. */
  get liveListenerCount(): number {
    return (
      this.webview.messages.listenerCount +
      this.visibilityEvents.listenerCount +
      this.disposeEvents.listenerCount
    );
  }
}
