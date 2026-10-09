// Stage ambient effects (M4: dripping water). Purely cosmetic: it only emits particles.
import { assertNever } from '../shared/assertNever';
import type { Camera } from './Camera';
import {
  DRIP_FALL_HEIGHT_PX,
  DRIP_GRAVITY_PX_PER_S2,
  MOTE_LIFE_MAX_MS,
  MOTE_LIFE_MIN_MS,
  MOTE_MAX_Y,
  MOTE_MIN_Y,
} from './data/tuning';
import type { World } from './entities/Entity';
import { CORRIDOR_SEGMENT_PX, CORRIDOR_X, DOOR_X, INTERNAL_WIDTH } from './layout';

/** Time for a drip to fall DRIP_FALL_HEIGHT_PX under the drip gravity. */
const DRIP_FALL_MS = Math.sqrt((2 * DRIP_FALL_HEIGHT_PX) / DRIP_GRAVITY_PX_PER_S2) * 1000;

export class Ambience {
  #debt = 0;

  update(dtMs: number, world: World, camera: Camera): void {
    const effect = world.stage.def.ambient;
    switch (effect.kind) {
      case 'drip':
        this.#drip(dtMs, effect.perSecond, world, camera);
        return;
      case 'dust':
        this.#dust(dtMs, effect.perSecond, world);
        return;
      default:
        assertNever(effect);
    }
  }

  /** Slow motes anywhere in the corridor view; they drift on their own and are not scrolled. */
  #dust(dtMs: number, perSecond: number, world: World): void {
    this.#debt += (perSecond * dtMs) / 1000;
    while (this.#debt >= 1) {
      this.#debt -= 1;
      world.particles.emit(
        'mote',
        CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
        MOTE_MIN_Y + world.rng() * (MOTE_MAX_Y - MOTE_MIN_Y),
        -6 + (world.rng() - 0.5) * 8,
        (world.rng() - 0.5) * 6,
        MOTE_LIFE_MIN_MS + world.rng() * (MOTE_LIFE_MAX_MS - MOTE_LIFE_MIN_MS),
      );
    }
  }

  #drip(dtMs: number, perSecond: number, world: World, camera: Camera): void {
    const points = world.stage.dripPoints;
    if (points.length === 0) {
      return;
    }
    this.#debt += (perSecond * dtMs) / 1000;
    while (this.#debt >= 1) {
      this.#debt -= 1;
      const point = points[Math.floor(world.rng() * points.length)];
      if (point === undefined) {
        continue;
      }
      let x = point.x;
      if (point.zone === 'door') {
        x += DOOR_X;
      } else if (point.zone === 'corridor') {
        x = CORRIDOR_X + point.x - camera.corridorOffset();
        if (x < CORRIDOR_X) {
          x += CORRIDOR_SEGMENT_PX;
        }
        if (x >= INTERNAL_WIDTH) {
          continue;
        }
      }
      world.particles.emit('drip', x, point.y - DRIP_FALL_HEIGHT_PX, 0, 0, DRIP_FALL_MS);
    }
  }
}
