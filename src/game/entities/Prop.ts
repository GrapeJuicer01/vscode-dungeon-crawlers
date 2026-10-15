// A solid floor prop (barrel, crate) that sorts with heroes by foot y. Static, never animated.
import type { FrameSet } from '../sprites/spriteFactory';
import { GuardedEntity } from './Entity';
import type { DrawContext, World } from './Entity';

export class Prop extends GuardedEntity {
  readonly sortY: number;
  readonly x: number;
  readonly shadowWidth = 0;
  readonly #sheet: FrameSet;
  readonly #left: number;

  /** `x` is the left edge and `footY` the foot row, both in screen px. */
  constructor(sheet: FrameSet, x: number, footY: number) {
    super();
    this.#sheet = sheet;
    this.#left = x;
    this.x = x + sheet.w / 2;
    this.sortY = footY;
  }

  update(_dtMs: number, _world: World): void {
    // Static.
  }

  draw(ctx: DrawContext): void {
    const frame = this.#sheet.frames[0];
    if (frame !== undefined) {
      ctx.surface.drawBitmap(frame, this.#left, this.sortY - this.#sheet.anchor.y, false);
    }
  }
}
