// Stage ambient effects (M4: dripping water). Purely cosmetic: it only emits particles.
import { assertNever } from '../shared/assertNever';
import type { Camera } from './Camera';
import {
  BUBBLE_LIFE_MAX_MS,
  BUBBLE_LIFE_MIN_MS,
  BUBBLE_MAX_Y,
  BUBBLE_MIN_Y,
  BUBBLE_RISE_MAX,
  BUBBLE_RISE_MIN,
  DRIP_FALL_HEIGHT_PX,
  DRIP_GRAVITY_PX_PER_S2,
  FIREFLY_DRIFT,
  FIREFLY_LIFE_MAX_MS,
  FIREFLY_LIFE_MIN_MS,
  FIREFLY_MAX_Y,
  FIREFLY_MIN_Y,
  FOG_DRIFT_MAX,
  FOG_DRIFT_MIN,
  FOG_LIFE_MAX_MS,
  FOG_LIFE_MIN_MS,
  FOG_MAX_Y,
  FOG_MIN_Y,
  MOTE_LIFE_MAX_MS,
  MOTE_LIFE_MIN_MS,
  MOTE_MAX_Y,
  MOTE_MIN_Y,
  MURK_DRIFT,
  MURK_LIFE_MAX_MS,
  MURK_LIFE_MIN_MS,
  MURK_MAX_Y,
  MURK_MIN_Y,
  MURK_RISE_MAX,
  MURK_RISE_MIN,
  SNOW_DRIFT,
  SNOW_FALL_MAX,
  SNOW_FALL_MIN,
  SNOW_LIFE_MAX_MS,
  SNOW_LIFE_MIN_MS,
  SNOW_MAX_Y,
  SNOW_MIN_Y,
  STAGE_EMBER_LIFE_MAX_MS,
  STAGE_EMBER_LIFE_MIN_MS,
  STAGE_EMBER_MAX_Y,
  STAGE_EMBER_MIN_Y,
  STAGE_EMBER_RISE_MAX,
  STAGE_EMBER_RISE_MIN,
} from './data/tuning';
import type { World } from './entities/Entity';
import { CORRIDOR_SEGMENT_PX, CORRIDOR_X, DOOR_X, INTERNAL_WIDTH } from './layout';

/** Time for a drip to fall DRIP_FALL_HEIGHT_PX under the drip gravity. */
const DRIP_FALL_MS = Math.sqrt((2 * DRIP_FALL_HEIGHT_PX) / DRIP_GRAVITY_PX_PER_S2) * 1000;

export class Ambience {
  #debt = 0;
  // Separate debts so the fog and fog-dust rates do not couple (E2).
  #bubbleDebt = 0;
  #fogDebt = 0;
  #fogDustDebt = 0;
  // Separate debts for the E3 ambients too.
  #fireflyDebt = 0;
  #emberDebt = 0;
  // And for the E4 ambients.
  #snowDebt = 0;
  #murkDebt = 0;

  update(dtMs: number, world: World, camera: Camera): void {
    const effect = world.stage.def.ambient;
    switch (effect.kind) {
      case 'drip':
        this.#drip(dtMs, effect.perSecond, world, camera);
        return;
      case 'dust':
        this.#dust(dtMs, effect.perSecond, world);
        return;
      case 'bubbles':
        this.#bubbles(dtMs, effect.perSecond, world);
        return;
      case 'fog':
        this.#fog(dtMs, effect.perSecond, effect.dustPerSecond, world);
        return;
      case 'fireflies':
        this.#fireflies(dtMs, effect.perSecond, world);
        return;
      case 'embers':
        this.#embers(dtMs, effect.perSecond, world);
        return;
      case 'snow':
        this.#snow(dtMs, effect.perSecond, world);
        return;
      case 'murk':
        this.#murk(dtMs, effect.perSecond, world);
        return;
      default:
        assertNever(effect);
    }
  }

  /** Adds elapsed emissions to a debt, capped at one second's worth (guards a stage switch). */
  static #accrue(debt: number, dtMs: number, perSecond: number): number {
    return Math.min(debt + (perSecond * dtMs) / 1000, Math.max(1, perSecond));
  }

  /** Snow falls slowly from the upper band across the corridor view; not scrolled. */
  #snow(dtMs: number, perSecond: number, world: World): void {
    this.#snowDebt = Ambience.#accrue(this.#snowDebt, dtMs, perSecond);
    while (this.#snowDebt >= 1) {
      this.#snowDebt -= 1;
      world.particles.emit(
        'snow',
        CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
        SNOW_MIN_Y + world.rng() * (SNOW_MAX_Y - SNOW_MIN_Y),
        (world.rng() - 0.5) * 2 * SNOW_DRIFT,
        SNOW_FALL_MIN + world.rng() * (SNOW_FALL_MAX - SNOW_FALL_MIN),
        SNOW_LIFE_MIN_MS + world.rng() * (SNOW_LIFE_MAX_MS - SNOW_LIFE_MIN_MS),
      );
    }
  }

  /** Dim murk motes rise slowly from the lower band of the corridor view; not scrolled. */
  #murk(dtMs: number, perSecond: number, world: World): void {
    this.#murkDebt = Ambience.#accrue(this.#murkDebt, dtMs, perSecond);
    while (this.#murkDebt >= 1) {
      this.#murkDebt -= 1;
      world.particles.emit(
        'murk',
        CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
        MURK_MIN_Y + world.rng() * (MURK_MAX_Y - MURK_MIN_Y),
        (world.rng() - 0.5) * 2 * MURK_DRIFT,
        -(MURK_RISE_MIN + world.rng() * (MURK_RISE_MAX - MURK_RISE_MIN)),
        MURK_LIFE_MIN_MS + world.rng() * (MURK_LIFE_MAX_MS - MURK_LIFE_MIN_MS),
      );
    }
  }

  /** Fireflies hover and wander in the corridor view; not scrolled. */
  #fireflies(dtMs: number, perSecond: number, world: World): void {
    this.#fireflyDebt = Ambience.#accrue(this.#fireflyDebt, dtMs, perSecond);
    while (this.#fireflyDebt >= 1) {
      this.#fireflyDebt -= 1;
      world.particles.emit(
        'firefly',
        CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
        FIREFLY_MIN_Y + world.rng() * (FIREFLY_MAX_Y - FIREFLY_MIN_Y),
        (world.rng() - 0.5) * 2 * FIREFLY_DRIFT,
        (world.rng() - 0.5) * 2 * FIREFLY_DRIFT,
        FIREFLY_LIFE_MIN_MS + world.rng() * (FIREFLY_LIFE_MAX_MS - FIREFLY_LIFE_MIN_MS),
      );
    }
  }

  /** Stage embers rise from the floor band using the existing ember kind; not scrolled. */
  #embers(dtMs: number, perSecond: number, world: World): void {
    this.#emberDebt = Ambience.#accrue(this.#emberDebt, dtMs, perSecond);
    while (this.#emberDebt >= 1) {
      this.#emberDebt -= 1;
      world.particles.emit(
        'ember',
        CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
        STAGE_EMBER_MIN_Y + world.rng() * (STAGE_EMBER_MAX_Y - STAGE_EMBER_MIN_Y),
        0,
        -(STAGE_EMBER_RISE_MIN + world.rng() * (STAGE_EMBER_RISE_MAX - STAGE_EMBER_RISE_MIN)),
        STAGE_EMBER_LIFE_MIN_MS + world.rng() * (STAGE_EMBER_LIFE_MAX_MS - STAGE_EMBER_LIFE_MIN_MS),
      );
    }
  }

  /** Bubbles rise from the floor band anywhere in the corridor view; not scrolled. */
  #bubbles(dtMs: number, perSecond: number, world: World): void {
    this.#bubbleDebt = Ambience.#accrue(this.#bubbleDebt, dtMs, perSecond);
    while (this.#bubbleDebt >= 1) {
      this.#bubbleDebt -= 1;
      world.particles.emit(
        'bubble',
        CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
        BUBBLE_MIN_Y + world.rng() * (BUBBLE_MAX_Y - BUBBLE_MIN_Y),
        0,
        -(BUBBLE_RISE_MIN + world.rng() * (BUBBLE_RISE_MAX - BUBBLE_RISE_MIN)),
        BUBBLE_LIFE_MIN_MS + world.rng() * (BUBBLE_LIFE_MAX_MS - BUBBLE_LIFE_MIN_MS),
      );
    }
  }

  /** Low fog wisps drifting left, plus a few dust motes with their own debt. */
  #fog(dtMs: number, perSecond: number, dustPerSecond: number, world: World): void {
    this.#fogDebt = Ambience.#accrue(this.#fogDebt, dtMs, perSecond);
    while (this.#fogDebt >= 1) {
      this.#fogDebt -= 1;
      world.particles.emit(
        'wisp',
        CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
        FOG_MIN_Y + world.rng() * (FOG_MAX_Y - FOG_MIN_Y),
        -(FOG_DRIFT_MIN + world.rng() * (FOG_DRIFT_MAX - FOG_DRIFT_MIN)),
        0,
        FOG_LIFE_MIN_MS + world.rng() * (FOG_LIFE_MAX_MS - FOG_LIFE_MIN_MS),
      );
    }
    this.#fogDustDebt = Ambience.#accrue(this.#fogDustDebt, dtMs, dustPerSecond);
    while (this.#fogDustDebt >= 1) {
      this.#fogDustDebt -= 1;
      this.#emitMote(world);
    }
  }

  #emitMote(world: World): void {
    world.particles.emit(
      'mote',
      CORRIDOR_X + world.rng() * (INTERNAL_WIDTH - CORRIDOR_X),
      MOTE_MIN_Y + world.rng() * (MOTE_MAX_Y - MOTE_MIN_Y),
      -6 + (world.rng() - 0.5) * 8,
      (world.rng() - 0.5) * 6,
      MOTE_LIFE_MIN_MS + world.rng() * (MOTE_LIFE_MAX_MS - MOTE_LIFE_MIN_MS),
    );
  }

  /** Slow motes anywhere in the corridor view; they drift on their own and are not scrolled. */
  #dust(dtMs: number, perSecond: number, world: World): void {
    this.#debt += (perSecond * dtMs) / 1000;
    while (this.#debt >= 1) {
      this.#debt -= 1;
      this.#emitMote(world);
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
