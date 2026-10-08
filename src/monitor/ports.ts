// Narrow ports the monitor core depends on (agent-detection.md section 2, M3 plan section 3.1).
// Node and vscode capabilities reach the core only through these interfaces; the adapters in
// src/monitor/adapters/ implement them and extension.ts injects them. Types only.
//
// Core invariant 3: ReadOnlyFileSystem has no member that can create, modify, lock, or delete
// anything, and TerminalPort can only reveal a terminal. Core invariant 7: MonitorLogger
// receives fixed reason strings plus allow-listed fields only.

export interface MonitorDisposable {
  dispose(): void;
}

/** Subset of vscode.LogOutputChannel. Messages are fixed reasons plus allow-listed fields only. */
export interface MonitorLogger {
  trace(message: string): void;
  error(message: string): void;
}

export interface Clock {
  now(): number;
}

/** Returns a cancel function. Real implementations unref the timer. */
export interface TimerPort {
  setTimeout(callback: () => void, delayMs: number): () => void;
}

/** The part of node:path the core uses; node:path and path.win32 satisfy it. */
export interface PathOps {
  readonly sep: string;
  isAbsolute(target: string): boolean;
  resolve(...segments: string[]): string;
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
}

export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';

export interface FileIdentity {
  readonly ino: number;
  readonly dev: number;
}

export interface EntryStat extends FileIdentity {
  readonly kind: EntryKind;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface DirEntry {
  readonly name: string;
  readonly kind: EntryKind;
}

/** Read-only by construction: no member can create, modify, lock, or delete anything. */
export interface ReadOnlyFileSystem {
  homedir(): string;
  realpath(target: string): Promise<string>;
  lstat(target: string): Promise<EntryStat>;
  readdir(directory: string): Promise<readonly DirEntry[]>;
  /**
   * Opens `file` read-only (O_RDONLY | O_NOFOLLOW where defined), rejects with code 'EIDENTITY'
   * if fstat differs from `expected` or is not a regular file, reads up to `length` bytes at
   * `position`, and closes the handle before settling. Never holds a handle across calls.
   */
  readRange(
    file: string,
    position: number,
    length: number,
    expected: FileIdentity,
  ): Promise<Uint8Array>;
}

export interface TerminalRef {
  readonly key: number;
}

export interface TerminalPort extends MonitorDisposable {
  activeTerminal(): TerminalRef | null;
  onDidOpenTerminal(listener: (terminal: TerminalRef) => void): MonitorDisposable;
  onDidCloseTerminal(listener: (terminal: TerminalRef) => void): MonitorDisposable;
  /** Reveal only: Terminal.show(). False if closed or unknown. Never throws. */
  show(terminal: TerminalRef): boolean;
}

export interface WorkspaceFolderRef {
  readonly name: string;
  readonly fsPath: string;
}
