// The host-side owner of persisted progress (ADR 0012). vscode-free: the extension's globalState
// and timers arrive through the two ports below, so this module is unit-testable.
//
// Saves are validated (exact keys), monotonic (a lower totalKills than stored is ignored, so a
// stale second window cannot rewind progress), and coalesced (at most one write per
// PROGRESS_WRITE_COALESCE_MS, flushed on dispose). A stored value written by a newer version puts
// the store in read-only mode: it plays on defaults and never overwrites it. Core invariant 4:
// nothing here throws. Logs are fixed strings only (Core invariant 7): never a payload or an
// error message.
import { DEFAULT_PROGRESS, isProgress, toProgress } from '../shared/progress';
import type { Progress } from '../shared/progress';
import { migrateProgress } from './progressMigrations';
import type { LoadSource } from './progressMigrations';
import type { BridgeLogger } from './webviewBridge';

export const PROGRESS_KEY = 'pixelAgents.progress';
export const PROGRESS_WRITE_COALESCE_MS = 2000;

/** The two-method view of vscode.Memento. vscode's Thenable<void> is a PromiseLike<void>. */
export interface KeyValueStore {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface StoreTimers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface ProgressStoreDeps {
  readonly store: KeyValueStore;
  readonly timers: StoreTimers;
  readonly logger: BridgeLogger;
}

export class ProgressStore {
  readonly #deps: ProgressStoreDeps;
  #loaded: Progress | null = null;
  #source: LoadSource = 'fresh';
  /** The highest totalKills known to be stored (or pending); the monotonic floor. */
  #floor = 0;
  #pending: Progress | null = null;
  #timer: unknown = null;
  #hasTimer = false;

  constructor(deps: ProgressStoreDeps) {
    this.#deps = deps;
  }

  /** Runs migrateProgress once and remembers the outcome. Never throws. */
  load(): Progress {
    if (this.#loaded !== null) {
      // Latest accepted value: pending in the coalesce window, else last written, else loaded.
      return this.#pending ?? this.#loaded;
    }
    let outcomeProgress: Progress = DEFAULT_PROGRESS;
    let source: LoadSource = 'invalid';
    try {
      const outcome = migrateProgress(this.#deps.store.get(PROGRESS_KEY));
      outcomeProgress = outcome.progress;
      source = outcome.source;
    } catch {
      this.#log('progress: read failed, using defaults');
    }
    this.#source = source;
    this.#loaded = outcomeProgress;
    this.#floor = outcomeProgress.totalKills;
    if (source === 'invalid') {
      this.#log('progress: stored value invalid, using defaults');
    } else if (source === 'future') {
      this.#log('progress: stored value is from a newer version, read-only');
    }
    return outcomeProgress;
  }

  /** Validates, then schedules a coalesced write. Never throws. */
  save(next: Progress): void {
    try {
      this.load();
      if (this.#source === 'future') {
        return;
      }
      if (!isProgress(next)) {
        this.#log('progress: dropped invalid save');
        return;
      }
      if (next.totalKills < Math.max(this.#floor, this.#pending?.totalKills ?? 0)) {
        return;
      }
      const copy = toProgress(next);
      if (copy === undefined) {
        return;
      }
      this.#pending = copy;
      if (!this.#hasTimer) {
        this.#hasTimer = true;
        this.#timer = this.#deps.timers.set(() => this.#onTimer(), PROGRESS_WRITE_COALESCE_MS);
      }
    } catch {
      this.#log('progress: save failed');
    }
  }

  /** Writes the pending value now. Never throws. */
  flush(): void {
    try {
      this.#cancelTimer();
      this.#write();
    } catch {
      this.#log('progress: write failed');
    }
  }

  dispose(): void {
    this.flush();
  }

  #onTimer(): void {
    this.#hasTimer = false;
    this.#timer = null;
    try {
      this.#write();
    } catch {
      this.#log('progress: write failed');
    }
  }

  #cancelTimer(): void {
    if (this.#hasTimer) {
      const handle = this.#timer;
      this.#hasTimer = false;
      this.#timer = null;
      try {
        this.#deps.timers.clear(handle);
      } catch {
        // A failing clear must not stop the flush.
      }
    }
  }

  #write(): void {
    const value = this.#pending;
    if (value === null) {
      return;
    }
    this.#pending = null;
    this.#loaded = value;
    // The floor rises when the write is accepted for sending, so a lower save after it is dropped.
    this.#floor = Math.max(this.#floor, value.totalKills);
    let result: PromiseLike<void>;
    try {
      result = this.#deps.store.update(PROGRESS_KEY, value);
    } catch {
      this.#log('progress: write failed');
      return;
    }
    // PromiseLike has no .catch; the rejection handler goes in .then and must not throw.
    void result.then(undefined, () => {
      this.#log('progress: write failed');
    });
  }

  #log(message: string): void {
    try {
      this.#deps.logger.error(message);
    } catch {
      // The logger itself failed; nothing may escape.
    }
  }
}
