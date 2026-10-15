// A cosmetic ally (H2, ADR 0011): a picture that stands beside its owner while the owner fights.
// It has no health, no target, no gauge, and no reference to any hero; it is not a Hero and is
// never in the roster. The pool (Summons.ts) owns its placement and phase timers by plain
// arithmetic; update only advances the animation clock, so a fault here strands nothing. It is
// drawn with bitmaps only, and missing art is skipped, never thrown.
import { onceFrameIndex, summonFrameIndex } from '../data/animations';
import type { SummonId } from '../data/summons';
import { SUMMON_SHADOW_PX } from '../data/tuning';
import { assertNever } from '../../shared/assertNever';
import { GuardedEntity } from './Entity';
import type { DrawContext, World } from './Entity';

export type SummonPhase = 'rise' | 'active' | 'sink';
export type SummonPose = 'walk' | 'attack';

export class Summon extends GuardedEntity {
  #inUse = false;
  #done = false;
  #slot = -1;
  #kind: SummonId | null = null;
  #phase: SummonPhase = 'rise';
  #pose: SummonPose = 'attack';
  #x = 0;
  #y = 0;
  #faceRight = true;
  #leaseMs = 0;
  #phaseMs = 0;
  #animMs = 0;

  /** Shadow bar width for the current kind (the skeleton's while idle). */
  get shadowWidth(): number {
    return SUMMON_SHADOW_PX[this.#kind ?? 'skeleton'];
  }

  get x(): number {
    return this.#x;
  }

  get sortY(): number {
    return Math.floor(this.#y);
  }

  get phase(): SummonPhase {
    return this.#phase;
  }

  get kind(): SummonId | null {
    return this.#kind;
  }

  get pose(): SummonPose {
    return this.#pose;
  }

  get slot(): number {
    return this.#slot;
  }

  get inUse(): boolean {
    return this.#inUse;
  }

  /** True once the sink animation has played out; the pool then frees the summon. */
  get finished(): boolean {
    return this.#inUse && this.#done;
  }

  /** Advances the animation clock only. */
  update(dtMs: number, _world: World): void {
    this.#animMs += dtMs;
  }

  draw(ctx: DrawContext): void {
    if (!this.#inUse || this.#kind === null) {
      return;
    }
    const sprites = ctx.world.cache.summon(this.#kind);
    if (sprites === null) {
      return;
    }
    let name: string;
    switch (this.#phase) {
      case 'rise':
        name = 'rise';
        break;
      case 'sink':
        name = 'sink';
        break;
      case 'active':
        name = this.#pose;
        break;
      default:
        return assertNever(this.#phase);
    }
    const set = sprites[name];
    if (set === undefined) {
      return;
    }
    const index =
      this.#phase === 'active'
        ? summonFrameIndex(name, this.#animMs, set.frames.length)
        : onceFrameIndex(name, this.#phaseMs, set.frames.length);
    const frame = set.frames[index];
    if (frame === undefined) {
      return;
    }
    const x = Math.floor(this.#x);
    const y = Math.floor(this.#y);
    const flip = !this.#faceRight;
    const dx = flip ? x - (set.w - 1 - set.anchor.x) : x - set.anchor.x;
    ctx.surface.drawBitmap(frame, dx, y - set.anchor.y, flip);
  }

  // ---- pool-only mutators: plain numbers in, nothing returned ----

  /** Starts (or restarts) the summon at `rise`. */
  begin(
    slot: number,
    kind: SummonId,
    x: number,
    y: number,
    faceRight: boolean,
    leaseMs: number,
  ): void {
    this.#inUse = true;
    this.#done = false;
    this.#slot = slot;
    this.#kind = kind;
    this.#phase = 'rise';
    this.#pose = 'attack';
    this.#x = x;
    this.#y = y;
    this.#faceRight = faceRight;
    this.#leaseMs = leaseMs;
    this.#phaseMs = 0;
    this.#animMs = 0;
    this.clearFaults();
  }

  place(x: number, y: number, faceRight: boolean, pose: SummonPose, leaseMs: number): void {
    this.#x = x;
    this.#y = y;
    this.#faceRight = faceRight;
    this.#leaseMs = leaseMs;
    if (pose !== this.#pose) {
      this.#pose = pose;
      this.#animMs = 0;
    }
  }

  /**
   * Phase and lease arithmetic. rise -> active after riseMs; a rise or active summon whose
   * lease runs out enters sink; a sink is finished after sinkMs.
   */
  step(dtMs: number, riseMs: number, sinkMs: number): void {
    if (!this.#inUse) {
      return;
    }
    this.#phaseMs += dtMs;
    if (this.#phase !== 'sink') {
      this.#leaseMs -= dtMs;
      if (this.#leaseMs <= 0) {
        this.#phase = 'sink';
        this.#phaseMs = 0;
        this.#leaseMs = 0;
      } else if (this.#phase === 'rise' && this.#phaseMs >= riseMs) {
        this.#phase = 'active';
        this.#phaseMs = 0;
        this.#animMs = 0;
      }
    }
    if (this.#phase === 'sink' && this.#phaseMs >= sinkMs) {
      this.#done = true;
    }
  }

  release(): void {
    this.#inUse = false;
    this.#done = false;
    this.#slot = -1;
    this.#kind = null;
    this.#phaseMs = 0;
    this.#leaseMs = 0;
    this.clearFaults();
  }
}
