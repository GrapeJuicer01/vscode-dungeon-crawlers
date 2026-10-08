// The campfire: logs, a four-frame flame in two sizes, embers, and a flickering warm light. Its
// only input is the number of resting heroes, which is cosmetic (a bigger fire). It holds no
// state a hero can read, and it draws only bitmaps; the renderer draws its shadow and light.
import { FLAME_FRAME_MS, loopFrameIndex } from '../data/animations';
import {
  EMBER_BASE_PER_S,
  EMBER_PER_RESTING_PER_S,
  FIRE_FLICKER_MS,
  FIRE_LIGHT_BASE_PX,
  FIRE_LIGHT_INTENSITY,
  FIRE_LIGHT_MAX_PX,
  FIRE_LIGHT_PER_RESTING_PX,
  FIRE_SHADOW_WIDTH_PX,
  FLAME_LARGE_AT_RESTING,
  LIGHT_RADIUS_STEP_PX,
} from '../data/tuning';
import { CAMPFIRE_FOOT_Y, CAMPFIRE_X } from '../layout';
import type { FrameSet } from '../sprites/spriteFactory';
import { GuardedEntity } from './Entity';
import type { DrawContext, World } from './Entity';

export interface CampfireSheets {
  readonly logs: FrameSet;
  readonly flameSmall: FrameSet;
  readonly flameLarge: FrameSet;
}

export class Campfire extends GuardedEntity {
  readonly sortY = CAMPFIRE_FOOT_Y;
  readonly shadowWidth = FIRE_SHADOW_WIDTH_PX;
  readonly x = CAMPFIRE_X;
  readonly #sheets: CampfireSheets;
  #resting = 0;
  #clockMs = 0;
  #emberDebt = 0;
  #flickerMs = 0;
  #flicker = 0;

  constructor(sheets: CampfireSheets) {
    super();
    this.#sheets = sheets;
  }

  /** Cosmetic only: the number of heroes resting at the fire. */
  setRestingCount(count: number): void {
    this.#resting = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }

  get restingCount(): number {
    return this.#resting;
  }

  /** Light radius in px, with a flicker of at most one radius step. */
  get lightRadius(): number {
    const base = Math.min(
      FIRE_LIGHT_MAX_PX,
      FIRE_LIGHT_BASE_PX + FIRE_LIGHT_PER_RESTING_PX * this.#resting,
    );
    return base + this.#flicker * (LIGHT_RADIUS_STEP_PX / 2);
  }

  get lightIntensity(): number {
    return FIRE_LIGHT_INTENSITY;
  }

  /** Where the light is centred (the flame), in screen px. */
  get lightY(): number {
    return CAMPFIRE_FOOT_Y - 8;
  }

  update(dtMs: number, world: World): void {
    this.#clockMs += dtMs;
    this.#flickerMs += dtMs;
    if (this.#flickerMs >= FIRE_FLICKER_MS) {
      this.#flickerMs = 0;
      this.#flicker = Math.floor(world.rng() * 3) - 1;
    }
    this.#emberDebt += ((EMBER_BASE_PER_S + EMBER_PER_RESTING_PER_S * this.#resting) * dtMs) / 1000;
    while (this.#emberDebt >= 1) {
      this.#emberDebt -= 1;
      world.particles.emit(
        'ember',
        this.x + (world.rng() - 0.5) * 8,
        CAMPFIRE_FOOT_Y - 12,
        (world.rng() - 0.5) * 12,
        -(18 + world.rng() * 22),
        600 + world.rng() * 700,
      );
    }
  }

  draw(ctx: DrawContext): void {
    const s = this.#sheets;
    const logs = s.logs.frames[0];
    if (logs !== undefined) {
      ctx.surface.drawBitmap(
        logs,
        this.x - s.logs.anchor.x,
        CAMPFIRE_FOOT_Y - s.logs.anchor.y,
        false,
      );
    }
    const flame = this.#resting >= FLAME_LARGE_AT_RESTING ? s.flameLarge : s.flameSmall;
    const frame = flame.frames[loopFrameIndex(FLAME_FRAME_MS, this.#clockMs, flame.frames.length)];
    if (frame !== undefined) {
      ctx.surface.drawBitmap(
        frame,
        this.x - flame.anchor.x,
        CAMPFIRE_FOOT_Y - 4 - flame.anchor.y,
        false,
      );
    }
  }
}
