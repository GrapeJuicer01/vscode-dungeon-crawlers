// Cosmetic drops (enemy side, decision E1-12): a small keepsake pops out of a defeated enemy on a
// short arc, rests, and fades. Nothing collects it, it has no value, no inventory exists, and no
// hero field depends on it. Pooled at DROP_CAPACITY; spawn() past capacity is dropped. Updates and
// draws allocate nothing.
import { loopFrameIndex } from './data/animations';
import {
  DROP_ARC_HEIGHT_PX,
  DROP_ARC_MS,
  DROP_CAPACITY,
  DROP_FADE_MS,
  DROP_REST_MS,
} from './data/drops';
import type { DropKind } from './data/drops';
import type { Surface } from './ports';
import type { World } from './entities/Entity';

/** Milliseconds per frame of a drop's glint. */
const DROP_FRAME_MS = 500;
const TOTAL_MS = DROP_ARC_MS + DROP_REST_MS + DROP_FADE_MS;
const KINDS: readonly DropKind[] = ['coin', 'gem', 'ore', 'chest'];

export class Drops {
  readonly #x0 = new Float32Array(DROP_CAPACITY);
  readonly #x1 = new Float32Array(DROP_CAPACITY);
  readonly #y = new Float32Array(DROP_CAPACITY);
  readonly #age = new Float32Array(DROP_CAPACITY);
  readonly #kind = new Uint8Array(DROP_CAPACITY);
  readonly #alive = new Uint8Array(DROP_CAPACITY);
  #count = 0;

  get count(): number {
    return this.#count;
  }

  /** `dx` is how far the arc lands from `x`. Returns false when the pool is full. */
  spawn(kind: DropKind, x: number, footY: number, dx: number): boolean {
    for (let i = 0; i < DROP_CAPACITY; i++) {
      if (this.#alive[i] === 1) {
        continue;
      }
      this.#alive[i] = 1;
      this.#x0[i] = x;
      this.#x1[i] = x + dx;
      this.#y[i] = footY;
      this.#age[i] = 0;
      this.#kind[i] = Math.max(0, KINDS.indexOf(kind));
      this.#count++;
      return true;
    }
    return false;
  }

  update(dtMs: number): void {
    if (!(dtMs > 0)) {
      return;
    }
    for (let i = 0; i < DROP_CAPACITY; i++) {
      if (this.#alive[i] !== 1) {
        continue;
      }
      const age = (this.#age[i] ?? 0) + dtMs;
      if (age >= TOTAL_MS) {
        this.#alive[i] = 0;
        this.#count--;
      } else {
        this.#age[i] = age;
      }
    }
  }

  draw(surface: Surface, cache: World['cache']): void {
    for (let i = 0; i < DROP_CAPACITY; i++) {
      if (this.#alive[i] !== 1) {
        continue;
      }
      const set = cache.drop(KINDS[this.#kind[i] ?? 0] ?? 'coin');
      if (set === null) {
        continue;
      }
      const age = this.#age[i] ?? 0;
      const frame = set.frames[loopFrameIndex(DROP_FRAME_MS, age, set.frames.length)];
      if (frame === undefined) {
        continue;
      }
      const t = Math.min(1, age / DROP_ARC_MS);
      const x0 = this.#x0[i] ?? 0;
      const x = x0 + ((this.#x1[i] ?? 0) - x0) * t;
      const lift = 4 * t * (1 - t) * DROP_ARC_HEIGHT_PX;
      const fading = age > DROP_ARC_MS + DROP_REST_MS;
      if (fading) {
        surface.setAlpha(Math.max(0, 1 - (age - DROP_ARC_MS - DROP_REST_MS) / DROP_FADE_MS));
      }
      surface.drawBitmap(
        frame,
        Math.floor(x) - set.anchor.x,
        Math.floor((this.#y[i] ?? 0) - lift) - set.anchor.y,
        false,
      );
      if (fading) {
        surface.setAlpha(1);
      }
    }
  }

  clear(): void {
    this.#alive.fill(0);
    this.#count = 0;
  }
}
