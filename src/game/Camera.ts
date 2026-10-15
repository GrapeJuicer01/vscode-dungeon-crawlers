// Corridor scroll and parallax offsets, always whole pixels. Nothing follows a hero.
import { CORRIDOR_SEGMENT_PX } from './layout';

function wrap(value: number, period: number): number {
  const m = Math.floor(value) % period;
  return m < 0 ? m + period : m;
}

export class Camera {
  #scrollX = 0;

  /** Moves the corridor by `scrollPxPerS` for `dtMs`. Non-finite or negative input is ignored. */
  advance(dtMs: number, scrollPxPerS: number): void {
    const delta = (scrollPxPerS * dtMs) / 1000;
    if (Number.isFinite(delta) && delta > 0) {
      this.#scrollX += delta;
      // Keep the number small and exact: every consumer wraps at a divisor of this period.
      if (this.#scrollX >= CORRIDOR_SEGMENT_PX * 1024) {
        this.#scrollX -= CORRIDOR_SEGMENT_PX * 1024;
      }
    }
  }

  get scrollX(): number {
    return this.#scrollX;
  }

  /** Whole pixels, scrollX mod the segment length. */
  corridorOffset(): number {
    return wrap(this.#scrollX, CORRIDOR_SEGMENT_PX);
  }

  /** Whole-pixel offset of a parallax layer moving at `factor` of the scroll, wrapped to `periodPx`. */
  parallaxOffset(factor: number, periodPx: number): number {
    return wrap(this.#scrollX * factor, periodPx);
  }
}
