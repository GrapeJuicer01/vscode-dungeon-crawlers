// The cosmetic effect pool (H1): projectiles and bursts that class heroes play while attacking.
// An effect is a picture that flies and fades. It has no target, no owner, and no gameplay
// number: nothing here can reach a hero (Core invariants 1 and 2). Struct-of-arrays with a free
// list, like Particles; nothing is allocated in spawn, update, or draw. A spawn into a full pool
// is dropped silently. Drawing uses bitmaps only, so no number or bar can appear.
import { loopFrameIndex } from './data/animations';
import { EFFECT_IDS } from './data/effects';
import type { EffectId } from './data/effects';
import { EFFECT_CULL_MARGIN_PX, EFFECT_FRAME_MS } from './data/tuning';
import { INTERNAL_WIDTH } from './layout';
import type { Particles } from './Particles';
import type { Surface } from './ports';
import type { SpriteCache } from './sprites/spriteFactory';

/** Spark offsets in px/s for the end-of-flight puff (fixed: effects own no random source). */
const SPARK_VX = 14;
const SPARK_VY = -22;
const SPARK_LIFE_MS = 260;

export class EffectPool {
  readonly #capacity: number;
  readonly #kind: Uint8Array;
  readonly #x: Float32Array;
  readonly #y: Float32Array;
  readonly #vx: Float32Array;
  readonly #vy: Float32Array;
  readonly #age: Float32Array;
  readonly #life: Float32Array;
  readonly #flip: Uint8Array;
  readonly #alive: Uint8Array;
  readonly #free: Int32Array;
  #freeCount: number;
  #count = 0;

  constructor(capacity: number) {
    this.#capacity = capacity;
    this.#kind = new Uint8Array(capacity);
    this.#x = new Float32Array(capacity);
    this.#y = new Float32Array(capacity);
    this.#vx = new Float32Array(capacity);
    this.#vy = new Float32Array(capacity);
    this.#age = new Float32Array(capacity);
    this.#life = new Float32Array(capacity);
    this.#flip = new Uint8Array(capacity);
    this.#alive = new Uint8Array(capacity);
    this.#free = new Int32Array(capacity);
    this.#freeCount = capacity;
    for (let i = 0; i < capacity; i++) {
      this.#free[i] = capacity - 1 - i;
    }
  }

  get count(): number {
    return this.#count;
  }

  /**
   * Velocities are px/s, life is ms; (x, y) is the effect's anchor (its centre). Returns false
   * when the pool is full or the effect is unknown; never throws.
   */
  spawn(
    effect: EffectId,
    x: number,
    y: number,
    vx: number,
    vy: number,
    lifeMs: number,
    flipX: boolean,
  ): boolean {
    const kind = EFFECT_IDS.indexOf(effect);
    if (this.#freeCount === 0 || kind < 0 || !(lifeMs > 0)) {
      return false;
    }
    this.#freeCount--;
    const i = this.#free[this.#freeCount] ?? 0;
    this.#kind[i] = kind;
    this.#x[i] = x;
    this.#y[i] = y;
    this.#vx[i] = vx;
    this.#vy[i] = vy;
    this.#age[i] = 0;
    this.#life[i] = lifeMs;
    this.#flip[i] = flipX ? 1 : 0;
    this.#alive[i] = 1;
    this.#count++;
    return true;
  }

  /** Moves and ages effects; expired or off-screen ones free their slot. Projectiles end in sparks. */
  update(dtMs: number, particles: Particles): void {
    if (!(dtMs > 0)) {
      return;
    }
    const dt = dtMs / 1000;
    const minX = -EFFECT_CULL_MARGIN_PX;
    const maxX = INTERNAL_WIDTH + EFFECT_CULL_MARGIN_PX;
    for (let i = 0; i < this.#capacity; i++) {
      if (this.#alive[i] !== 1) {
        continue;
      }
      const age = (this.#age[i] ?? 0) + dtMs;
      const moving = (this.#vx[i] ?? 0) !== 0 || (this.#vy[i] ?? 0) !== 0;
      const x = (this.#x[i] ?? 0) + (this.#vx[i] ?? 0) * dt;
      const y = (this.#y[i] ?? 0) + (this.#vy[i] ?? 0) * dt;
      const expired = age >= (this.#life[i] ?? 0);
      if (expired || x < minX || x > maxX) {
        if (expired && moving) {
          // A projectile ends in a small spark puff, like a swing at nothing.
          particles.emit('spark', x, y, -SPARK_VX, SPARK_VY, SPARK_LIFE_MS);
          particles.emit('spark', x, y, SPARK_VX, SPARK_VY, SPARK_LIFE_MS);
        }
        this.#release(i);
        continue;
      }
      this.#age[i] = age;
      this.#x[i] = x;
      this.#y[i] = y;
    }
  }

  /** Bitmap draws only. An effect whose art is missing is skipped. */
  draw(surface: Surface, cache: SpriteCache): void {
    for (let i = 0; i < this.#capacity; i++) {
      if (this.#alive[i] !== 1) {
        continue;
      }
      const id = EFFECT_IDS[this.#kind[i] ?? 0];
      if (id === undefined) {
        continue;
      }
      const set = cache.effect(id);
      if (set === null) {
        continue;
      }
      const moving = (this.#vx[i] ?? 0) !== 0 || (this.#vy[i] ?? 0) !== 0;
      const elapsed = this.#age[i] ?? 0;
      // Moving effects loop (pulse, spin); stationary ones play once and hold the last frame.
      const index = moving
        ? loopFrameIndex(EFFECT_FRAME_MS, elapsed, set.frames.length)
        : Math.min(set.frames.length - 1, Math.floor(elapsed / EFFECT_FRAME_MS));
      const frame = set.frames[index];
      if (frame === undefined) {
        continue;
      }
      const flip = this.#flip[i] === 1;
      const x = Math.floor(this.#x[i] ?? 0);
      const y = Math.floor(this.#y[i] ?? 0);
      const dx = flip ? x - (set.w - 1 - set.anchor.x) : x - set.anchor.x;
      surface.drawBitmap(frame, dx, y - set.anchor.y, flip);
    }
  }

  clear(): void {
    this.#alive.fill(0);
    this.#count = 0;
    this.#freeCount = this.#capacity;
    for (let i = 0; i < this.#capacity; i++) {
      this.#free[i] = this.#capacity - 1 - i;
    }
  }

  #release(i: number): void {
    this.#alive[i] = 0;
    this.#free[this.#freeCount] = i;
    this.#freeCount++;
    this.#count--;
  }
}
