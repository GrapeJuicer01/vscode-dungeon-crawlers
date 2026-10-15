// The frame loop around Game (docs/architecture/game-engine.md section 4). DOM-free: the browser
// supplies a FrameScheduler (main.ts passes requestAnimationFrame). The callback schedules the
// next frame BEFORE doing any work, so even a bug in the engine or the host cannot stop the
// loop (Core invariant 4). The loop pauses while the document is hidden.
import type { Game } from '../game/Game';
import type { ErrorSink, Surface } from '../game/ports';

export interface FrameScheduler {
  request(cb: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

export interface GameHostDeps {
  readonly game: Game;
  readonly surface: Surface;
  readonly scheduler: FrameScheduler;
  readonly onError: ErrorSink;
  readonly isHidden: () => boolean;
}

export class GameHost {
  readonly #deps: GameHostDeps;
  #running = false;
  #hidden = false;
  #handle: number | null = null;
  #lastMs: number | null = null;
  readonly #onFrame = (nowMs: number): void => {
    this.#handle = null;
    if (!this.#running || this.#hidden) {
      return;
    }
    // Next frame first: nothing below can stop the loop.
    this.#schedule();
    const delta = this.#lastMs === null ? 0 : nowMs - this.#lastMs;
    this.#lastMs = nowMs;
    try {
      this.#deps.game.frame(delta, this.#deps.surface);
    } catch (error: unknown) {
      this.#report(error);
    }
  };

  constructor(deps: GameHostDeps) {
    this.#deps = deps;
  }

  /** Starts the loop (idempotent). Does not draw while the document is hidden. */
  start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#hidden = this.#safeIsHidden();
    this.#lastMs = null;
    if (!this.#hidden) {
      this.#schedule();
    }
  }

  /** visibilitychange: cancel when hidden; resume with the last timestamp cleared (delta 0). */
  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    if (hidden) {
      this.#cancel();
      this.#lastMs = null;
    } else if (this.#running && this.#handle === null) {
      this.#lastMs = null;
      this.#schedule();
    }
  }

  /** Cancels the pending frame (idempotent). */
  stop(): void {
    this.#running = false;
    this.#cancel();
    this.#lastMs = null;
  }

  #schedule(): void {
    try {
      this.#handle = this.#deps.scheduler.request(this.#onFrame);
    } catch (error: unknown) {
      this.#handle = null;
      this.#report(error);
    }
  }

  #cancel(): void {
    if (this.#handle !== null) {
      try {
        this.#deps.scheduler.cancel(this.#handle);
      } catch (error: unknown) {
        this.#report(error);
      }
      this.#handle = null;
    }
  }

  #safeIsHidden(): boolean {
    try {
      return this.#deps.isHidden();
    } catch (error: unknown) {
      this.#report(error);
      return false;
    }
  }

  #report(error: unknown): void {
    try {
      this.#deps.onError(error, 'host');
    } catch {
      // A failing reporter must never escape the loop.
    }
  }
}
