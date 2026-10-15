// Owns the live stage runtime and swaps it behind a dark fade (E1 plan section 3.4.6). Runtimes
// are built lazily and cached by stage id (strips, nav grid, and lights take a few milliseconds,
// hidden behind the black fade). Heroes keep their formation, seats, and paths because the room
// geometry is shared by every stage; the director never sees a hero. The fade is dark, slow, and
// never white: Renderer draws it as a full-screen rect in the stage's clear colour.
import { STAGE_FADE_MS } from './data/tuning';
import type { StageDef } from './data/stages';
import type { StageRuntime } from './Stage';

type FadePhase = 'idle' | 'out' | 'in';

export class StageDirector {
  readonly #build: (def: StageDef) => StageRuntime;
  readonly #stages: readonly StageDef[];
  readonly #onSwap: ((def: StageDef) => void) | null;
  readonly #runtimes = new Map<string, StageRuntime>();
  #current: StageRuntime;
  #phase: FadePhase = 'idle';
  #elapsedMs = 0;
  #target = 1;

  /** `stages` must not be empty. `onSwap` fires at the fade midpoint, after the swap. */
  constructor(
    build: (def: StageDef) => StageRuntime,
    stages: readonly StageDef[],
    onSwap: ((def: StageDef) => void) | null = null,
  ) {
    const first = stages[0];
    if (first === undefined) {
      throw new RangeError('No stages are defined');
    }
    this.#build = build;
    this.#stages = stages;
    this.#onSwap = onSwap;
    this.#current = this.#runtimeFor(first);
  }

  /** What `world.stage` returns. */
  get runtime(): StageRuntime {
    return this.#current;
  }

  /** 0..1: 0 to 1 over STAGE_FADE_MS, the swap at 1, then 1 to 0 over STAGE_FADE_MS. */
  get fadeAlpha(): number {
    if (this.#phase === 'out') {
      return Math.min(1, this.#elapsedMs / STAGE_FADE_MS);
    }
    if (this.#phase === 'in') {
      return Math.max(0, 1 - this.#elapsedMs / STAGE_FADE_MS);
    }
    return 0;
  }

  get transitioning(): boolean {
    return this.#phase !== 'idle';
  }

  /** Instant swap (progress load, tests). Cancels any fade. */
  show(index: number): void {
    this.#phase = 'idle';
    this.#elapsedMs = 0;
    this.#current = this.#runtimeFor(this.#defFor(index));
  }

  /** Starts a fade out, swaps to `index`, fades back in. Ignored while a fade is running. */
  begin(index: number): void {
    if (this.#phase !== 'idle') {
      return;
    }
    this.#target = index;
    this.#phase = 'out';
    this.#elapsedMs = 0;
  }

  update(dtMs: number): void {
    if (this.#phase === 'idle' || !(dtMs > 0)) {
      return;
    }
    this.#elapsedMs += dtMs;
    if (this.#phase === 'out' && this.#elapsedMs >= STAGE_FADE_MS) {
      const def = this.#defFor(this.#target);
      this.#current = this.#runtimeFor(def);
      this.#phase = 'in';
      this.#elapsedMs = 0;
      this.#onSwap?.(def);
    } else if (this.#phase === 'in' && this.#elapsedMs >= STAGE_FADE_MS) {
      this.#phase = 'idle';
      this.#elapsedMs = 0;
    }
  }

  /** 1-based; an index past the delivered stages wraps. */
  #defFor(index: number): StageDef {
    const n = this.#stages.length;
    const i = (((Math.floor(index) - 1) % n) + n) % n;
    const def = this.#stages[i];
    if (def === undefined) {
      throw new RangeError('Unknown stage');
    }
    return def;
  }

  #runtimeFor(def: StageDef): StageRuntime {
    let runtime = this.#runtimes.get(def.id);
    if (runtime === undefined) {
      runtime = this.#build(def);
      this.#runtimes.set(def.id, runtime);
    }
    return runtime;
  }
}
