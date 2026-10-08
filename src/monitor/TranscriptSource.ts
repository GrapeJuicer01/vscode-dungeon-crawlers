// Transcript source (agent-detection.md section 3.1, ADR 0005): finds Claude Code sessions by
// polling `<root>/<project dir>/<uuid>.jsonl` read-only, reads appended bytes incrementally
// (transcriptFiles.ts), and drives one sessionMachine per file into the AgentRegistry.
//
// Core invariant 3: only the ReadOnlyFileSystem port is used; nothing is created, written, or
// locked, and no handle outlives a call. Below the realpath'd root no symbolic link is followed:
// project directories and files must lstat as a directory or file, and a file's realpath must
// stay inside the root before it is ever read.
// Core invariant 7: no line text is kept past the poll that read it.
// Core invariant 4: every await is followed by a disposed check, every step catches its own
// errors, and polls chain through one timer so they never overlap.
import { assertNever } from '../shared/assertNever';
import { buildAgentName } from './agentNames';
import { MAX_TRANSCRIPT_AGENTS } from './AgentRegistry';
import type { AgentRegistry } from './AgentRegistry';
import type { MonitorConfig } from './monitorConfig';
import {
  createSafeLogger,
  LOG_RATE_LIMIT_MS,
  RateLimitedLogger,
  safeErrorCode,
} from './monitorLog';
import type {
  Clock,
  MonitorDisposable,
  MonitorLogger,
  PathOps,
  ReadOnlyFileSystem,
  TimerPort,
  WorkspaceFolderRef,
} from './ports';
import { isContained, projectLabel, resolveTranscriptRoot } from './projectPaths';
import { createSession, nextSession } from './sessionMachine';
import type { EndReason, SessionSnapshot, SessionTimings } from './sessionMachine';
import { RETRY_MTIME } from './staleFiles';
import { SessionDiscovery } from './transcriptDiscovery';
import type { Candidate } from './transcriptDiscovery';
import {
  consumeBytes,
  isGoneCode,
  readTrackedFile,
  summarizeTail,
  tailStart,
} from './transcriptFiles';
import type { TrackedFile } from './transcriptFiles';
import { ScopeResolver } from './transcriptScope';
import type { FolderLabel } from './transcriptScope';

export interface TranscriptSourceDeps {
  readonly fs: ReadOnlyFileSystem;
  readonly path: PathOps;
  readonly clock: Clock;
  readonly timers: TimerPort;
  readonly logger: MonitorLogger;
  readonly registry: AgentRegistry;
  readonly caseInsensitive: boolean;
}

export type TranscriptStatus = 'starting' | 'active' | 'unavailable' | 'off';

type RootCondition = 'none' | 'ok' | 'invalid' | 'noFolders' | 'missing' | 'unreadable';

export class TranscriptSource implements MonitorDisposable {
  readonly #fs: ReadOnlyFileSystem;
  readonly #path: PathOps;
  readonly #clock: Clock;
  readonly #timers: TimerPort;
  readonly #log: MonitorLogger;
  readonly #limited: RateLimitedLogger;
  readonly #registry: AgentRegistry;
  readonly #caseInsensitive: boolean;
  readonly #scope: ScopeResolver;
  #config: MonitorConfig;

  /** Tracked sessions by agent id. */
  readonly #tracked = new Map<string, TrackedFile>();
  readonly #discovery: SessionDiscovery;
  #root: string | null = null;
  #condition: RootCondition = 'none';
  #status: TranscriptStatus = 'starting';

  readonly #firstScanListeners = new Set<() => void>();
  readonly #newSessionListeners = new Set<(agentId: string) => void>();
  #firstScanDone = false;
  #started = false;
  #disposed = false;
  #inFlight = false;
  #rescanRequested = false;
  #cancelTimer: (() => void) | null = null;
  readonly #isLive = (): boolean => !this.#disposed;

  constructor(
    deps: TranscriptSourceDeps,
    config: MonitorConfig,
    folders: readonly WorkspaceFolderRef[],
  ) {
    this.#fs = deps.fs;
    this.#path = deps.path;
    this.#clock = deps.clock;
    this.#timers = deps.timers;
    this.#log = createSafeLogger(deps.logger);
    this.#limited = new RateLimitedLogger(deps.logger, deps.clock, LOG_RATE_LIMIT_MS);
    this.#registry = deps.registry;
    this.#caseInsensitive = deps.caseInsensitive;
    this.#scope = new ScopeResolver(deps.fs, deps.caseInsensitive, this.#limited, folders);
    this.#discovery = new SessionDiscovery({
      fs: deps.fs,
      path: deps.path,
      clock: deps.clock,
      limited: this.#limited,
      key: (dirName) => this.#scope.key(dirName),
    });
    this.#config = config;
  }

  start(): void {
    if (this.#started || this.#disposed) {
      return;
    }
    this.#started = true;
    void this.#poll();
  }

  get status(): TranscriptStatus {
    return this.#status;
  }

  /** Fires once, after the first scan completes or fails. */
  onDidFinishFirstScan(listener: () => void): MonitorDisposable {
    const entry = (): void => listener();
    this.#firstScanListeners.add(entry);
    return { dispose: () => this.#firstScanListeners.delete(entry) };
  }

  /** A session whose file appeared after the first scan (used for terminal linking). */
  onDidDiscoverNewSession(listener: (agentId: string) => void): MonitorDisposable {
    const entry = (agentId: string): void => listener(agentId);
    this.#newSessionListeners.add(entry);
    return { dispose: () => this.#newSessionListeners.delete(entry) };
  }

  /** Applies thresholds now; rescans immediately if root or scope changed, ending out-of-scope sessions. */
  update(config: MonitorConfig, folders: readonly WorkspaceFolderRef[]): void {
    if (this.#disposed) {
      return;
    }
    const rootChanged =
      config.transcriptPath !== this.#config.transcriptPath ||
      config.projectScope !== this.#config.projectScope;
    this.#config = config;
    const foldersChanged = this.#scope.setFolders(folders);
    if (rootChanged || foldersChanged) {
      this.#scope.invalidate();
      this.#discovery.relistAll();
      this.#requestRescan();
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#status = 'off';
    this.#cancelScheduled();
    this.#firstScanListeners.clear();
    this.#newSessionListeners.clear();
    this.#tracked.clear();
    this.#discovery.reset();
  }

  // ---- Poll loop ----

  #timings(): SessionTimings {
    const config = this.#config;
    return {
      debounceMs: config.debounceMs,
      idleTimeoutMs: config.idleTimeoutMs,
      toolTimeoutMs: config.toolTimeoutMs,
      sessionEndTimeoutMs: config.sessionEndTimeoutMs,
    };
  }

  async #poll(): Promise<void> {
    if (this.#disposed || this.#inFlight) {
      return;
    }
    this.#inFlight = true;
    try {
      await this.#pollOnce();
    } catch (error: unknown) {
      this.#limited.error('monitor: transcript poll failed (' + safeErrorCode(error) + ')');
    } finally {
      this.#inFlight = false;
      this.#finishFirstScan();
      this.#scheduleNext();
    }
  }

  #scheduleNext(): void {
    if (this.#disposed) {
      return;
    }
    const delay = this.#rescanRequested ? 0 : this.#config.pollIntervalMs;
    this.#rescanRequested = false;
    this.#cancelScheduled();
    this.#cancelTimer = this.#timers.setTimeout(() => {
      this.#cancelTimer = null;
      void this.#poll();
    }, delay);
  }

  #requestRescan(): void {
    if (!this.#started || this.#disposed) {
      return;
    }
    this.#rescanRequested = true;
    if (!this.#inFlight) {
      this.#scheduleNext();
    }
  }

  #cancelScheduled(): void {
    const cancel = this.#cancelTimer;
    this.#cancelTimer = null;
    if (cancel !== null) {
      cancel();
    }
  }

  #finishFirstScan(): void {
    if (this.#firstScanDone || this.#disposed) {
      return;
    }
    this.#firstScanDone = true;
    for (const listener of [...this.#firstScanListeners]) {
      try {
        listener();
      } catch (error: unknown) {
        this.#log.error('monitor: first-scan listener failed (' + safeErrorCode(error) + ')');
      }
    }
    this.#firstScanListeners.clear();
  }

  async #pollOnce(): Promise<void> {
    const config = this.#config;
    if (config.projectScope === 'workspace' && !this.#scope.hasFolders) {
      // An empty window reads nothing at all, not even the root.
      this.#setCondition('noFolders', 'off', null);
      this.#endAll('outOfScope');
      return;
    }
    const target = resolveTranscriptRoot(config.transcriptPath, this.#fs.homedir(), this.#path);
    if (!target.ok) {
      this.#setCondition('invalid', 'off', () =>
        this.#log.error('monitor: transcriptPath invalid (not absolute)'),
      );
      this.#endAll('outOfScope');
      return;
    }
    // Never log the root itself (coding-standards.md section 6): only whether it is custom.
    const which = target.custom ? 'custom' : 'default';
    let root: string;
    try {
      root = await this.#fs.realpath(target.root);
    } catch (error: unknown) {
      if (!this.#disposed) {
        this.#rootFailed(safeErrorCode(error), which);
      }
      return;
    }
    if (this.#disposed) {
      return;
    }
    if (root !== this.#root) {
      this.#endAll('outOfScope');
      this.#root = root;
    }
    this.#setCondition('ok', 'active', null);

    const dirs = await this.#scope.projectDirs(
      root,
      config.projectScope,
      this.#clock.now(),
      this.#isLive,
    );
    if (this.#disposed) {
      return;
    }
    this.#endOutOfScope(dirs);

    for (const file of [...this.#tracked.values()]) {
      await this.#pollFile(file);
      if (this.#disposed) {
        return;
      }
    }

    const candidates = await this.#discovery.findCandidates({
      root,
      dirs,
      scope: config.projectScope,
      sessionEndTimeoutMs: this.#config.sessionEndTimeoutMs,
      isTracked: (id) => this.#tracked.has(id),
      isLive: this.#isLive,
    });
    if (this.#disposed) {
      return;
    }
    await this.#discoverAll(root, candidates);
    if (this.#disposed) {
      return;
    }
    this.#tickAll();
  }

  /** Records the root condition; `report` runs only when the condition changes (log once). */
  #setCondition(
    condition: RootCondition,
    status: TranscriptStatus,
    report: (() => void) | null,
  ): void {
    this.#status = status;
    if (condition === this.#condition) {
      return;
    }
    this.#condition = condition;
    if (report !== null) {
      report();
    }
  }

  #rootFailed(code: string, which: string): void {
    const missing = code === 'ENOENT' || code === 'ENOTDIR';
    this.#endAll(missing ? 'fileRemoved' : 'outOfScope');
    this.#root = null;
    if (missing) {
      this.#setCondition('missing', 'unavailable', () =>
        this.#log.trace('monitor: transcript root not found (' + which + ')'),
      );
      return;
    }
    this.#setCondition('unreadable', 'unavailable', () =>
      this.#log.error('monitor: transcript root unreadable (' + which + ', ' + code + ')'),
    );
  }

  // ---- Discovery ----

  #endOutOfScope(dirs: readonly string[]): void {
    const inScope = new Set(dirs.map((dirName) => this.#scope.key(dirName)));
    for (const file of [...this.#tracked.values()]) {
      if (!inScope.has(this.#scope.key(file.dirName))) {
        this.#end(file, 'outOfScope');
      }
    }
    this.#discovery.retainDirs(dirs);
  }

  #setAside(id: string, dirName: string, filePath: string, mtimeMs: number): void {
    this.#discovery.setAside(id, dirName, filePath, mtimeMs);
  }

  async #discoverAll(root: string, candidates: readonly Candidate[]): Promise<void> {
    if (candidates.length === 0) {
      return;
    }
    // Candidates come most recently active first, so the cap keeps the liveliest sessions.
    const labels = await this.#scope.folderLabels(this.#isLive);
    for (const candidate of candidates) {
      if (this.#disposed) {
        return;
      }
      if (this.#tracked.has(candidate.id)) {
        continue;
      }
      if (this.#registry.count('transcript') >= MAX_TRANSCRIPT_AGENTS) {
        this.#limited.trace('monitor: agent cap reached (transcript)');
        this.#setAside(candidate.id, candidate.dirName, candidate.filePath, RETRY_MTIME);
        continue;
      }
      await this.#discover(root, candidate, labels);
    }
  }

  /** Containment check, bounded tail read, then a new tracked session ('spawned'). */
  async #discover(
    root: string,
    candidate: Candidate,
    labels: readonly FolderLabel[],
  ): Promise<void> {
    const { id, dirName, filePath, stat } = candidate;
    const start = tailStart(stat.size);
    let bytes: Uint8Array;
    try {
      const real = await this.#fs.realpath(filePath);
      if (this.#disposed) {
        return;
      }
      if (!isContained(root, real, this.#path)) {
        this.#limited.trace('monitor: transcript skipped (outside root)');
        this.#setAside(id, dirName, filePath, stat.mtimeMs);
        return;
      }
      bytes = await this.#fs.readRange(filePath, start, stat.size - start, stat);
    } catch (error: unknown) {
      if (this.#disposed) {
        return;
      }
      const code = safeErrorCode(error);
      if (!isGoneCode(code)) {
        if (code !== 'EIDENTITY') {
          this.#limited.error('monitor: transcript unreadable (' + code + ')');
        }
        this.#setAside(id, dirName, filePath, RETRY_MTIME);
      }
      return;
    }
    if (this.#disposed) {
      return;
    }
    const tail = summarizeTail(bytes, start);
    const session = createSession(
      {
        type: 'discover',
        now: this.#clock.now(),
        lastActivityAt: stat.mtimeMs,
        toolName: tail.toolName,
        toolPending: tail.toolPending,
        turnEnded: tail.turnEnded,
      },
      this.#timings(),
    );
    if (session === null) {
      this.#setAside(id, dirName, filePath, stat.mtimeMs);
      return;
    }
    const name = buildAgentName(projectLabel(dirName, labels, this.#caseInsensitive), id);
    if (!this.#registry.upsert(id, 'transcript', name, session.state, session.toolName)) {
      this.#setAside(id, dirName, filePath, RETRY_MTIME);
      return;
    }
    this.#tracked.set(id, {
      id,
      dirName,
      filePath,
      name,
      ino: stat.ino,
      dev: stat.dev,
      offset: tail.offset,
      skipping: tail.skipping,
      rotated: false,
      mtimeMs: stat.mtimeMs,
      session,
    });
    if (this.#firstScanDone) {
      for (const listener of [...this.#newSessionListeners]) {
        try {
          listener(id);
        } catch (error: unknown) {
          this.#log.error('monitor: new-session listener failed (' + safeErrorCode(error) + ')');
        }
      }
    }
  }

  // ---- Tracked files ----

  async #pollFile(file: TrackedFile): Promise<void> {
    const isCurrent = (): boolean => !this.#disposed && this.#tracked.get(file.id) === file;
    const result = await readTrackedFile(this.#fs, file, isCurrent);
    if (!isCurrent()) {
      return;
    }
    switch (result.kind) {
      case 'unchanged':
        return;
      case 'removed':
        this.#end(file, 'fileRemoved');
        return;
      case 'failed':
        this.#limited.error('monitor: transcript unreadable (' + result.code + ')');
        return;
      case 'read': {
        const consumed = consumeBytes(file, result.bytes, this.#clock.now(), this.#timings());
        if (consumed.unparseableLines > 0) {
          this.#limited.trace('monitor: transcript line skipped (unparseable)');
        }
        if (consumed.oversized) {
          this.#limited.trace('monitor: transcript line skipped (oversized)');
        }
        this.#apply(file, consumed.session);
        return;
      }
      default:
        assertNever(result);
    }
  }

  #tickAll(): void {
    const now = this.#clock.now();
    const timings = this.#timings();
    for (const file of [...this.#tracked.values()]) {
      this.#apply(file, nextSession(file.session, { type: 'tick', now }, timings));
    }
  }

  #apply(file: TrackedFile, session: SessionSnapshot): void {
    const previous = file.session;
    if (session === previous) {
      return;
    }
    file.session = session;
    if (session.state === 'despawned') {
      // Silent for the session-end window: set aside until the file changes again.
      this.#tracked.delete(file.id);
      this.#setAside(file.id, file.dirName, file.filePath, file.mtimeMs);
      this.#registry.upsert(file.id, 'transcript', file.name, 'despawned', session.toolName);
      return;
    }
    if (session.state !== previous.state || session.toolName !== previous.toolName) {
      this.#registry.upsert(file.id, 'transcript', file.name, session.state, session.toolName);
    }
  }

  #end(file: TrackedFile, reason: EndReason): void {
    if (this.#tracked.get(file.id) !== file) {
      return;
    }
    const session = nextSession(
      file.session,
      { type: 'end', now: this.#clock.now(), reason },
      this.#timings(),
    );
    this.#tracked.delete(file.id);
    this.#discovery.forget(file.filePath);
    this.#registry.upsert(file.id, 'transcript', file.name, 'despawned', session.toolName);
  }

  #endAll(reason: EndReason): void {
    for (const file of [...this.#tracked.values()]) {
      this.#end(file, reason);
    }
    this.#discovery.reset();
    this.#scope.invalidate();
  }
}
