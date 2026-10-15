// In-memory fakes for the monitor core (M3 plan section 7): a virtual clock with manually
// advanced timers, an in-memory read-only file system with symlinks, per-path error injection, a
// call log and a pause gate, a recording logger, and a fake terminal port. None of them touch the
// real disk, the real clock, or the real home directory.
import path from 'node:path';
import type {
  Clock,
  DirEntry,
  EntryKind,
  EntryStat,
  FileIdentity,
  MonitorDisposable,
  MonitorLogger,
  ReadOnlyFileSystem,
  TerminalPort,
  TerminalRef,
  TimerPort,
} from '../../src/monitor/ports';

/** Lets every already-resolved promise chain run to completion (microtasks, then one macrotask). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

interface PendingTimer {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

/** A virtual clock and timer port in one: `advance` runs due timers in order, settling between. */
export class FakeTime implements Clock, TimerPort {
  #now: number;
  #nextId = 1;
  readonly #timers = new Map<number, PendingTimer>();
  /** Every timer ever scheduled (for assertions about scheduling). */
  scheduled = 0;

  constructor(start = 1_700_000_000_000) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  setTimeout(callback: () => void, delayMs: number): () => void {
    const id = this.#nextId;
    this.#nextId += 1;
    this.scheduled += 1;
    this.#timers.set(id, { id, at: this.#now + Math.max(0, delayMs), callback });
    return () => {
      this.#timers.delete(id);
    };
  }

  get pendingTimers(): number {
    return this.#timers.size;
  }

  /** Sets the clock without running timers (for clock-skew cases). */
  set(now: number): void {
    this.#now = now;
  }

  async advance(ms: number): Promise<void> {
    const target = this.#now + ms;
    for (;;) {
      await settle();
      let next: PendingTimer | undefined;
      for (const timer of this.#timers.values()) {
        if (timer.at <= target && (next === undefined || timer.at < next.at)) {
          next = timer;
        }
      }
      if (next === undefined) {
        break;
      }
      this.#timers.delete(next.id);
      this.#now = Math.max(this.#now, next.at);
      next.callback();
    }
    this.#now = target;
    await settle();
  }
}

export interface LoggedCall {
  readonly level: 'trace' | 'error';
  readonly message: string;
}

/** Records every call at both levels. */
export class RecordingLogger implements MonitorLogger {
  readonly calls: LoggedCall[] = [];
  /** When true, every call throws (a broken output channel). */
  throws = false;

  trace(message: string): void {
    this.calls.push({ level: 'trace', message });
    if (this.throws) {
      throw new Error('logger trace failed');
    }
  }

  error(message: string): void {
    this.calls.push({ level: 'error', message });
    if (this.throws) {
      throw new Error('logger error failed');
    }
  }

  messages(level?: 'trace' | 'error'): string[] {
    return this.calls.filter((c) => level === undefined || c.level === level).map((c) => c.message);
  }

  text(): string {
    return this.calls.map((c) => c.message).join('\n');
  }
}

// ---------------------------------------------------------------------------------------------
// FakeFileSystem

type Node =
  | { kind: 'file'; data: Uint8Array; mtimeMs: number; ino: number; dev: number }
  | { kind: 'directory'; mtimeMs: number; ino: number; dev: number }
  | { kind: 'symlink'; target: string; mtimeMs: number; ino: number; dev: number };

export type FsOp = 'realpath' | 'lstat' | 'readdir' | 'readRange';

export interface FsCall {
  readonly op: FsOp;
  readonly path: string;
  readonly position?: number;
  readonly length?: number;
}

export interface FileOptions {
  readonly mtimeMs?: number;
  readonly ino?: number;
  readonly dev?: number;
}

interface Injection {
  readonly op: FsOp;
  readonly match: (target: string) => boolean;
  readonly code: string | undefined;
  readonly message: string;
  remaining: number;
}

export class FsError extends Error {
  code?: string;
}

const encoder = new TextEncoder();

/** A read-only view of a tree held in memory. The test side has the mutators; the port has none. */
export class FakeFileSystem implements ReadOnlyFileSystem {
  readonly #nodes = new Map<string, Node>([
    ['/', { kind: 'directory', mtimeMs: 0, ino: 1, dev: 1 }],
  ]);
  readonly #injections: Injection[] = [];
  readonly #clock: () => number;
  #nextIno = 100;
  #gate: Promise<void> | null = null;
  #release: (() => void) | null = null;
  #inFlight = 0;
  #maxInFlight = 0;
  readonly calls: FsCall[] = [];
  home = '/home/tester';

  constructor(clock: () => number) {
    this.#clock = clock;
  }

  // ---- Test-side mutators (not part of ReadOnlyFileSystem) ----

  addDir(target: string, mtimeMs?: number): void {
    const normalized = path.posix.normalize(target);
    let current = '/';
    for (const segment of normalized.split('/').filter((s) => s.length > 0)) {
      current = path.posix.join(current, segment);
      if (!this.#nodes.has(current)) {
        this.#nodes.set(current, {
          kind: 'directory',
          mtimeMs: mtimeMs ?? this.#clock(),
          ino: this.#nextIno++,
          dev: 1,
        });
        this.#touchParent(current, mtimeMs);
      }
    }
  }

  addFile(target: string, content: string | Uint8Array = '', options: FileOptions = {}): void {
    this.addDir(path.posix.dirname(target));
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const mtimeMs = options.mtimeMs ?? this.#clock();
    this.#nodes.set(target, {
      kind: 'file',
      data,
      mtimeMs,
      ino: options.ino ?? this.#nextIno++,
      dev: options.dev ?? 1,
    });
    this.#touchParent(target, mtimeMs);
  }

  addSymlink(target: string, destination: string): void {
    this.addDir(path.posix.dirname(target));
    this.#nodes.set(target, {
      kind: 'symlink',
      target: destination,
      mtimeMs: this.#clock(),
      ino: this.#nextIno++,
      dev: 1,
    });
    this.#touchParent(target);
  }

  append(target: string, content: string | Uint8Array, mtimeMs?: number): void {
    const node = this.#nodes.get(target);
    if (node?.kind !== 'file') {
      throw new Error(`append: no file at ${target}`);
    }
    const extra = typeof content === 'string' ? encoder.encode(content) : content;
    const merged = new Uint8Array(node.data.length + extra.length);
    merged.set(node.data, 0);
    merged.set(extra, node.data.length);
    node.data = merged;
    node.mtimeMs = mtimeMs ?? this.#clock();
  }

  /** Replaces a file's bytes, optionally with a new inode (rotation) and mtime. */
  replace(target: string, content: string | Uint8Array, options: FileOptions = {}): void {
    const node = this.#nodes.get(target);
    if (node?.kind !== 'file') {
      throw new Error(`replace: no file at ${target}`);
    }
    node.data = typeof content === 'string' ? encoder.encode(content) : content;
    node.mtimeMs = options.mtimeMs ?? this.#clock();
    if (options.ino !== undefined) {
      node.ino = options.ino;
    }
  }

  touch(target: string, mtimeMs: number): void {
    const node = this.#nodes.get(target);
    if (node === undefined) {
      throw new Error(`touch: nothing at ${target}`);
    }
    node.mtimeMs = mtimeMs;
  }

  /** Test-side deletion (the monitor port has no such method). */
  remove(target: string): void {
    this.#nodes.delete(target);
    this.#touchParent(target);
  }

  size(target: string): number {
    const node = this.#nodes.get(target);
    return node?.kind === 'file' ? node.data.length : -1;
  }

  /** Fails matching calls. `code` undefined throws an error without a code. */
  inject(
    op: FsOp,
    match: string | ((target: string) => boolean),
    failure: { code?: string; message: string; times?: number },
  ): void {
    this.#injections.push({
      op,
      match: typeof match === 'string' ? (target) => target === match : match,
      code: failure.code,
      message: failure.message,
      remaining: failure.times ?? Number.POSITIVE_INFINITY,
    });
  }

  clearInjections(): void {
    this.#injections.length = 0;
  }

  /** Subsequent port calls wait until `resume()`. */
  pause(): void {
    if (this.#gate === null) {
      this.#gate = new Promise<void>((resolve) => {
        this.#release = resolve;
      });
    }
  }

  resume(): void {
    this.#release?.();
    this.#gate = null;
    this.#release = null;
  }

  get maxConcurrentCalls(): number {
    return this.#maxInFlight;
  }

  callsTo(op: FsOp): FsCall[] {
    return this.calls.filter((call) => call.op === op);
  }

  callsUnder(prefix: string): FsCall[] {
    return this.calls.filter((call) => call.path === prefix || call.path.startsWith(prefix + '/'));
  }

  // ---- ReadOnlyFileSystem ----

  homedir(): string {
    return this.home;
  }

  async realpath(target: string): Promise<string> {
    return this.#run('realpath', target, undefined, undefined, () => this.#resolve(target, true));
  }

  async lstat(target: string): Promise<EntryStat> {
    return this.#run('lstat', target, undefined, undefined, () => {
      const real = this.#resolve(target, false);
      const node = this.#nodes.get(real);
      if (node === undefined) {
        throw fsError('ENOENT');
      }
      return this.#statOf(node);
    });
  }

  async readdir(directory: string): Promise<readonly DirEntry[]> {
    return this.#run('readdir', directory, undefined, undefined, () => {
      const real = this.#resolve(directory, true);
      const node = this.#nodes.get(real);
      if (node?.kind !== 'directory') {
        throw fsError('ENOTDIR');
      }
      const entries: DirEntry[] = [];
      for (const [child, childNode] of this.#nodes) {
        if (child !== real && path.posix.dirname(child) === real) {
          entries.push({ name: path.posix.basename(child), kind: kindOf(childNode) });
        }
      }
      return entries;
    });
  }

  async readRange(
    file: string,
    position: number,
    length: number,
    expected: FileIdentity,
  ): Promise<Uint8Array> {
    return this.#run('readRange', file, position, length, () => {
      // O_NOFOLLOW: a final symlink is ELOOP; intermediate links are resolved.
      const real = this.#resolve(file, false);
      const node = this.#nodes.get(real);
      if (node === undefined) {
        throw fsError('ENOENT');
      }
      if (node.kind === 'symlink') {
        throw fsError('ELOOP');
      }
      if (
        node.kind !== 'file' ||
        (expected.ino !== 0 && node.ino !== 0 && expected.ino !== node.ino) ||
        (expected.dev !== 0 && node.dev !== 0 && expected.dev !== node.dev)
      ) {
        throw fsError('EIDENTITY');
      }
      return node.data.slice(position, position + length);
    });
  }

  // ---- internals ----

  async #run<T>(
    op: FsOp,
    target: string,
    position: number | undefined,
    length: number | undefined,
    body: () => T,
  ): Promise<T> {
    this.calls.push({ op, path: target, position, length } as FsCall);
    this.#inFlight += 1;
    this.#maxInFlight = Math.max(this.#maxInFlight, this.#inFlight);
    try {
      if (this.#gate !== null) {
        await this.#gate;
      }
      for (const injection of this.#injections) {
        if (injection.op === op && injection.remaining > 0 && injection.match(target)) {
          injection.remaining -= 1;
          const error = new FsError(injection.message);
          if (injection.code !== undefined) {
            error.code = injection.code;
          }
          throw error;
        }
      }
      return body();
    } finally {
      this.#inFlight -= 1;
    }
  }

  #statOf(node: Node): EntryStat {
    return {
      kind: kindOf(node),
      size: node.kind === 'file' ? node.data.length : 0,
      mtimeMs: node.mtimeMs,
      ino: node.ino,
      dev: node.dev,
    };
  }

  #touchParent(child: string, mtimeMs?: number): void {
    const parent = this.#nodes.get(path.posix.dirname(child));
    if (parent !== undefined && child !== '/') {
      parent.mtimeMs = mtimeMs ?? this.#clock();
    }
  }

  #resolve(target: string, followLast: boolean): string {
    let queue = path.posix
      .normalize(target)
      .split('/')
      .filter((s) => s.length > 0);
    let current = '/';
    let hops = 0;
    while (queue.length > 0) {
      const segment = queue.shift() as string;
      const next = path.posix.join(current, segment);
      const node = this.#nodes.get(next);
      if (node === undefined) {
        throw fsError('ENOENT');
      }
      if (node.kind === 'symlink' && (queue.length > 0 || followLast)) {
        hops += 1;
        if (hops > 40) {
          throw fsError('ELOOP');
        }
        const destination = node.target.startsWith('/')
          ? node.target
          : path.posix.join(current, node.target);
        queue = [
          ...path.posix
            .normalize(destination)
            .split('/')
            .filter((s) => s.length > 0),
          ...queue,
        ];
        current = '/';
        continue;
      }
      current = next;
    }
    return current;
  }
}

function kindOf(node: Node): EntryKind {
  return node.kind;
}

function fsError(code: string): FsError {
  const error = new FsError(`${code}: fake file system error`);
  error.code = code;
  return error;
}

// ---------------------------------------------------------------------------------------------
// FakeTerminalPort

export class FakeTerminalPort implements TerminalPort {
  active: TerminalRef | null = null;
  readonly open = new Set<number>();
  readonly shows: number[] = [];
  #openListeners = new Set<(terminal: TerminalRef) => void>();
  #closeListeners = new Set<(terminal: TerminalRef) => void>();
  disposed = false;
  /** When true, show() throws. */
  showThrows = false;

  activeTerminal(): TerminalRef | null {
    return this.active;
  }

  onDidOpenTerminal(listener: (terminal: TerminalRef) => void): MonitorDisposable {
    this.#openListeners.add(listener);
    return { dispose: () => this.#openListeners.delete(listener) };
  }

  onDidCloseTerminal(listener: (terminal: TerminalRef) => void): MonitorDisposable {
    this.#closeListeners.add(listener);
    return { dispose: () => this.#closeListeners.delete(listener) };
  }

  show(terminal: TerminalRef): boolean {
    if (this.showThrows) {
      throw new Error('show failed');
    }
    if (!this.open.has(terminal.key)) {
      return false;
    }
    this.shows.push(terminal.key);
    return true;
  }

  dispose(): void {
    this.disposed = true;
  }

  get listenerCount(): number {
    return this.#openListeners.size + this.#closeListeners.size;
  }

  openTerminal(key: number, makeActive = false): void {
    this.open.add(key);
    if (makeActive) {
      this.active = { key };
    }
    for (const listener of [...this.#openListeners]) {
      listener({ key });
    }
  }

  closeTerminal(key: number): void {
    this.open.delete(key);
    if (this.active?.key === key) {
      this.active = null;
    }
    for (const listener of [...this.#closeListeners]) {
      listener({ key });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Synthetic transcript lines. All text is invented; no real transcript is ever copied.

export const SESSION_A = '11111111-1111-4111-8111-111111111111';
export const SESSION_B = '22222222-2222-4222-8222-222222222222';
export const SESSION_C = '33333333-3333-4333-8333-333333333333';
export const MARKER = 'PIXEL_MARKER_9f2c';

export function userLine(text = 'synthetic prompt'): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
}

export function toolUseLine(name: string, input: unknown = { note: 'synthetic' }): string {
  return (
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] },
    }) + '\n'
  );
}

export function toolResultLine(body = 'synthetic result'): string {
  return (
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', content: body }] },
    }) + '\n'
  );
}

export function assistantTextLine(text = 'synthetic reply'): string {
  return (
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text }] },
    }) + '\n'
  );
}

export function turnEndLine(text = 'done'): string {
  return (
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] },
    }) + '\n'
  );
}
