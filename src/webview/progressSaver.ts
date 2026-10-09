// Throttles the engine's progress callbacks into `saveProgress` sends (ADR 0012). DOM-free: the
// send function and the timers arrive as ports, so it is unit-testable. Fail closed: until
// markLoaded() is called (the host's `progress` message was applied in this document) nothing is
// sent, so a failed or missing load can never overwrite stored data with defaults.
import type { Progress } from '../shared/progress';

export interface SaverTimers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** At most one non-urgent send per interval. Assumption: 15 s loses little and keeps messages rare. */
export const PROGRESS_SAVE_INTERVAL_MS = 15000;

export class ProgressSaver {
  readonly #send: (progress: Progress) => void;
  readonly #timers: SaverTimers;
  #loaded = false;
  #pending: Progress | null = null;
  #timer: unknown = null;
  #hasTimer = false;

  constructor(send: (progress: Progress) => void, timers: SaverTimers) {
    this.#send = send;
    this.#timers = timers;
  }

  markLoaded(): void {
    this.#loaded = true;
  }

  /** `urgent` (a boss defeat) sends now; otherwise at most once per interval, latest wins. */
  submit(progress: Progress, urgent: boolean): void {
    if (!this.#loaded) {
      return;
    }
    this.#pending = progress;
    if (urgent) {
      this.#sendPending();
      return;
    }
    if (!this.#hasTimer) {
      this.#hasTimer = true;
      this.#timer = this.#timers.set(() => {
        this.#hasTimer = false;
        this.#timer = null;
        this.#sendPending();
      }, PROGRESS_SAVE_INTERVAL_MS);
    }
  }

  /** Best effort on pagehide: sends the pending value now. */
  flush(): void {
    if (this.#loaded) {
      this.#sendPending();
    }
    this.#cancelTimer();
  }

  dispose(): void {
    this.#cancelTimer();
    this.#pending = null;
  }

  #sendPending(): void {
    const progress = this.#pending;
    if (progress === null) {
      return;
    }
    this.#pending = null;
    this.#cancelTimer();
    this.#send(progress);
  }

  #cancelTimer(): void {
    if (this.#hasTimer) {
      this.#hasTimer = false;
      const handle = this.#timer;
      this.#timer = null;
      this.#timers.clear(handle);
    }
  }
}
