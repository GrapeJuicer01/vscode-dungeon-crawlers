// The cosmetic reaction board (ADR 0013). When an enemy attack lands, the enemy side calls
// flash(slot, ...) and nothing else: a short white silhouette and a 1 to 2 px slide that Hero.draw
// reads through two getters. The board is indexed by hero slot and has no kind, no amount, and no
// path back to a hero: it cannot change a hero's position, phase, or lifecycle. Photosensitivity:
// a slot flashes at most once per HERO_FLASH_GAP_MS. Allocation-free.
import {
  HERO_FLASH_GAP_MS,
  HERO_FLASH_MS,
  HERO_KNOCK_MS,
  HERO_KNOCK_PX,
  HERO_KNOCK_STRONG_PX,
} from './data/tuning';

export class HitReactions {
  readonly #slots: number;
  readonly #flashMs: Float32Array;
  readonly #gapMs: Float32Array;
  readonly #knockMs: Float32Array;
  readonly #push: Int8Array;
  readonly #amount: Uint8Array;

  constructor(slots: number) {
    this.#slots = Math.max(1, Math.floor(slots));
    this.#flashMs = new Float32Array(this.#slots);
    this.#gapMs = new Float32Array(this.#slots);
    this.#knockMs = new Float32Array(this.#slots);
    this.#push = new Int8Array(this.#slots);
    this.#amount = new Uint8Array(this.#slots);
  }

  #index(slot: number): number {
    const i = Number.isFinite(slot) ? Math.trunc(slot) % this.#slots : 0;
    return i < 0 ? i + this.#slots : i;
  }

  /** Called only by the enemy side. Ignored while the slot is inside its flash gap. */
  flash(slot: number, pushSign: 1 | -1, strong: boolean): void {
    const i = this.#index(slot);
    if ((this.#gapMs[i] ?? 0) > 0) {
      return;
    }
    this.#flashMs[i] = HERO_FLASH_MS;
    this.#gapMs[i] = HERO_FLASH_GAP_MS;
    this.#knockMs[i] = HERO_KNOCK_MS;
    this.#push[i] = pushSign;
    this.#amount[i] = strong ? HERO_KNOCK_STRONG_PX : HERO_KNOCK_PX;
  }

  /** Called only by Game, once per step. */
  update(dtMs: number): void {
    if (!(dtMs > 0)) {
      return;
    }
    for (let i = 0; i < this.#slots; i++) {
      this.#flashMs[i] = Math.max(0, (this.#flashMs[i] ?? 0) - dtMs);
      this.#gapMs[i] = Math.max(0, (this.#gapMs[i] ?? 0) - dtMs);
      this.#knockMs[i] = Math.max(0, (this.#knockMs[i] ?? 0) - dtMs);
    }
  }

  /** Read by Hero.draw only. */
  flashing(slot: number): boolean {
    return (this.#flashMs[this.#index(slot)] ?? 0) > 0;
  }

  /** Signed whole pixels (0, +-1, or up to +-2 when strong); decays to 0 over HERO_KNOCK_MS. */
  offsetPx(slot: number): number {
    const i = this.#index(slot);
    const left = this.#knockMs[i] ?? 0;
    if (!(left > 0)) {
      return 0;
    }
    const magnitude = Math.ceil((this.#amount[i] ?? 0) * Math.min(1, left / HERO_KNOCK_MS));
    return (this.#push[i] ?? 0) * magnitude;
  }

  clear(): void {
    this.#flashMs.fill(0);
    this.#gapMs.fill(0);
    this.#knockMs.fill(0);
    this.#push.fill(0);
    this.#amount.fill(0);
  }
}
