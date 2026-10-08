// The party rhythm: when the corridor scrolls (the party advances) and when working heroes
// attack. M4 is a timer; E1 replaces it with enemy presence behind the same interface.
// Engagement is cosmetic: it can never change a hero's lifecycle (ADR 0009).
import { ADVANCE_MS, ENGAGE_MS, SCROLL_EASE_MS, SCROLL_PX_PER_S } from './data/tuning';

export interface Engagement {
  /** `workingHeroes` counts heroes that are in the corridor and working. */
  update(dtMs: number, workingHeroes: number): void;
  readonly scrollPxPerS: number;
  readonly isEngaged: boolean;
}

export class TimedEngagement implements Engagement {
  #engaged = false;
  #phaseMs = 0;
  #scroll = 0;

  update(dtMs: number, workingHeroes: number): void {
    if (!(dtMs > 0)) {
      return;
    }
    if (workingHeroes <= 0) {
      // Nobody is fighting: restart the cycle and let the scroll ease to a stop.
      this.#engaged = false;
      this.#phaseMs = 0;
      this.#approach(0, dtMs);
      return;
    }
    this.#phaseMs += dtMs;
    if (this.#engaged) {
      if (this.#phaseMs >= ENGAGE_MS) {
        this.#engaged = false;
        this.#phaseMs = 0;
      }
    } else if (this.#phaseMs >= ADVANCE_MS) {
      this.#engaged = true;
      this.#phaseMs = 0;
    }
    this.#approach(this.#engaged ? 0 : SCROLL_PX_PER_S, dtMs);
  }

  #approach(target: number, dtMs: number): void {
    const maxStep = (SCROLL_PX_PER_S * dtMs) / SCROLL_EASE_MS;
    const diff = target - this.#scroll;
    this.#scroll += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
  }

  get scrollPxPerS(): number {
    return this.#scroll;
  }

  get isEngaged(): boolean {
    return this.#engaged;
  }
}
