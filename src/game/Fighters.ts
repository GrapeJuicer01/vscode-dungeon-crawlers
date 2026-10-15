// The only way hero positions reach the enemy side (ADR 0013): a preallocated buffer of plain
// numbers. Roster refills it each step for heroes whose cosmetic phase is advance, attack, or
// ability; the enemy side reads it and never writes back. It holds slot numbers, never ids, and it
// imports nothing.

export class FighterBuffer {
  readonly slot: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Monotonic counters bumped by the hero when a strike or an ability releases. */
  readonly strikeSerial: Int32Array;
  readonly abilitySerial: Int32Array;
  count = 0;
  readonly #capacity: number;

  constructor(capacity: number) {
    this.#capacity = capacity;
    this.slot = new Int32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.strikeSerial = new Int32Array(capacity);
    this.abilitySerial = new Int32Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }

  /** Silently drops entries past capacity. */
  push(slot: number, x: number, y: number, strikeSerial: number, abilitySerial: number): void {
    const i = this.count;
    if (i >= this.#capacity) {
      return;
    }
    this.slot[i] = slot;
    this.x[i] = x;
    this.y[i] = y;
    this.strikeSerial[i] = strikeSerial;
    this.abilitySerial[i] = abilitySerial;
    this.count = i + 1;
  }
}
