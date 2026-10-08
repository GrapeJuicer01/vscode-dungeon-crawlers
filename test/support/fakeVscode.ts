// In-memory stand-in for the `vscode` module. test/run.mjs aliases `vscode` to this file, so
// host code such as src/extension.ts can be unit tested without an extension host (ADR 0006).
//
// It implements only what host code needs (M2: webview view registration, a LogOutputChannel,
// and a WebviewView with message, visibility, and dispose events; M3: workspace configuration,
// workspace folders, and read-only terminal access with strict fake terminals). Any other `vscode.window`
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

  /** Like vscode.Uri.fsPath for the POSIX paths tests use. */
  get fsPath(): string {
    return this.path;
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

/**
 * A terminal that fails loudly if anything but show() (and the exitStatus read) is used:
 * every other member records its name in `forbiddenUse` and throws, so a test can assert both.
 */
export class FakeTerminal {
  exitStatus: { readonly code: number | undefined } | undefined = undefined;
  shows = 0;
  readonly forbiddenUse: string[] = [];

  show(): void {
    this.shows += 1;
  }

  #forbidden(member: string): never {
    this.forbiddenUse.push(member);
    throw new Error(`forbidden terminal member used: ${member}`);
  }

  sendText(): void {
    this.#forbidden('sendText');
  }

  sendSequence(): void {
    this.#forbidden('sendSequence');
  }

  hide(): void {
    this.#forbidden('hide');
  }

  dispose(): void {
    this.#forbidden('dispose');
  }

  get processId(): never {
    return this.#forbidden('processId');
  }

  get name(): never {
    return this.#forbidden('name');
  }

  get creationOptions(): never {
    return this.#forbidden('creationOptions');
  }

  get state(): never {
    return this.#forbidden('state');
  }
}

export interface FakeConfigurationChange {
  affectsConfiguration(section: string): boolean;
}

export interface FakeWorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}

interface FakeEvents {
  openTerminal: FakeEvent<FakeTerminal>;
  closeTerminal: FakeEvent<FakeTerminal>;
  configuration: FakeEvent<FakeConfigurationChange>;
  workspaceFolders: FakeEvent<void>;
}

function freshEvents(): FakeEvents {
  return {
    openTerminal: new FakeEvent<FakeTerminal>(),
    closeTerminal: new FakeEvent<FakeTerminal>(),
    configuration: new FakeEvent<FakeConfigurationChange>(),
    workspaceFolders: new FakeEvent<void>(),
  };
}

export const recorded: {
  registrations: ProviderRegistration[];
  outputChannels: OutputChannelCreation[];
  windowAccesses: string[];
  workspaceAccesses: string[];
  /** Values returned by workspace.getConfiguration('pixelAgents').get(key), by bare key. */
  config: Record<string, unknown>;
  /** When set, getConfiguration throws (the monitor must then fail soft). */
  configThrows: Error | null;
  terminals: FakeTerminal[];
  activeTerminal: FakeTerminal | undefined;
  folders: FakeWorkspaceFolder[] | undefined;
  events: FakeEvents;
} = {
  registrations: [],
  outputChannels: [],
  windowAccesses: [],
  workspaceAccesses: [],
  config: {},
  configThrows: null,
  terminals: [],
  activeTerminal: undefined,
  folders: undefined,
  events: freshEvents(),
};

export function resetFakeVscode(): void {
  recorded.registrations = [];
  recorded.outputChannels = [];
  recorded.windowAccesses = [];
  recorded.workspaceAccesses = [];
  recorded.config = {};
  recorded.configThrows = null;
  recorded.terminals = [];
  recorded.activeTerminal = undefined;
  recorded.folders = undefined;
  recorded.events = freshEvents();
}

/** Total live listeners across every fake event the extension can subscribe to. */
export function liveEventListeners(): number {
  const e = recorded.events;
  return (
    e.openTerminal.listenerCount +
    e.closeTerminal.listenerCount +
    e.configuration.listenerCount +
    e.workspaceFolders.listenerCount
  );
}

/** Sets workspace folders from [name, fsPath] pairs (file: scheme). */
export function setWorkspaceFolders(folders: readonly (readonly [string, string])[]): void {
  recorded.folders = folders.map(([name, fsPath], index) => ({
    uri: Uri.file(fsPath),
    name,
    index,
  }));
}

export function openFakeTerminal(makeActive = false): FakeTerminal {
  const terminal = new FakeTerminal();
  recorded.terminals.push(terminal);
  if (makeActive) {
    recorded.activeTerminal = terminal;
  }
  recorded.events.openTerminal.fire(terminal);
  return terminal;
}

export function closeFakeTerminal(terminal: FakeTerminal): void {
  recorded.terminals = recorded.terminals.filter((t) => t !== terminal);
  if (recorded.activeTerminal === terminal) {
    recorded.activeTerminal = undefined;
  }
  recorded.events.closeTerminal.fire(terminal);
}

/** Changes settings (bare keys) and fires onDidChangeConfiguration for the given sections. */
export function changeConfiguration(
  values: Record<string, unknown>,
  sections: readonly string[] = ['pixelAgents'],
): void {
  Object.assign(recorded.config, values);
  recorded.events.configuration.fire({
    affectsConfiguration: (section) =>
      sections.some((s) => section === s || s.startsWith(section + '.')),
  });
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
  get terminals(): readonly FakeTerminal[] {
    return [...recorded.terminals];
  },
  get activeTerminal(): FakeTerminal | undefined {
    return recorded.activeTerminal;
  },
  onDidOpenTerminal(listener: (terminal: FakeTerminal) => unknown): Disposable {
    return recorded.events.openTerminal.subscribe(listener);
  },
  onDidCloseTerminal(listener: (terminal: FakeTerminal) => unknown): Disposable {
    return recorded.events.closeTerminal.subscribe(listener);
  },
};

const workspaceImpl = {
  getConfiguration(section?: string): { get<T>(key: string): T | undefined } {
    if (recorded.configThrows !== null) {
      throw recorded.configThrows;
    }
    if (section !== 'pixelAgents') {
      throw new Error(`unexpected configuration section: ${String(section)}`);
    }
    return { get: <T>(key: string): T | undefined => recorded.config[key] as T | undefined };
  },
  get workspaceFolders(): readonly FakeWorkspaceFolder[] | undefined {
    return recorded.folders;
  },
  onDidChangeConfiguration(listener: (event: FakeConfigurationChange) => unknown): Disposable {
    return recorded.events.configuration.subscribe(listener);
  },
  onDidChangeWorkspaceFolders(listener: () => unknown): Disposable {
    return recorded.events.workspaceFolders.subscribe(listener);
  },
};

export const workspace: typeof workspaceImpl = new Proxy(workspaceImpl, {
  get(target, property, receiver): unknown {
    recorded.workspaceAccesses.push(String(property));
    return Reflect.get(target, property, receiver) as unknown;
  },
});

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
