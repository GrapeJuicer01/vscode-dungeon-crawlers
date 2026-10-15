// A pooled enemy (enemy side, ADR 0013). It has health and a bar; heroes have neither. The only
// health mutator is strike(). It imports no hero code and never sees a hero: Combat tells it where
// to stand and when to attack, and it only moves, animates, and draws itself. Its attack is
// cosmetic: Combat turns a landed attack frame into a reaction on the board, nothing more.
// Updates and draws allocate nothing.
import { ENEMY_ATTACK_TOTAL_MS, enemyFrameIndex, enemyOnceFrameIndex } from '../data/animations';
import {
  ENEMY_ATTACK_STRIKE_FRAME,
  ENEMY_BAR_SHOW_MS,
  ENEMY_DISSOLVE_FRAME_MS,
  ENEMY_DISSOLVE_FRAMES,
  ENEMY_FLASH_MS,
  ENEMY_RELEASE_X,
} from '../data/tuning';
import { TIER_SHADOW_PX, TIER_SPEED_PX_PER_S } from '../data/enemies';
import type { EnemyRow } from '../data/enemies';
import { GuardedEntity, assertNever } from './Entity';
import type { DrawContext, World } from './Entity';

export type EnemyPhase = 'approach' | 'engaged' | 'withdraw' | 'dissolve';

/** Attack sub-stages: none, the boss's wind-up, the attack animation. */
const ATTACK_NONE = 0;
const ATTACK_TELEGRAPH = 1;
const ATTACK_SWING = 2;

export class Enemy extends GuardedEntity {
  #row: EnemyRow | null = null;
  #inUse = false;
  #phase: EnemyPhase = 'approach';
  #x = 0;
  #footY = 0;
  #standX = 0;
  #health = 0;
  #maxHealth = 1;
  #animMs = 0;
  #flashMs = 0;
  #barMs = 0;
  #dissolveMs = 0;
  #introLeftMs = 0;
  #attackStage = ATTACK_NONE;
  #attackMs = 0;
  #attackFired = false;
  #attackPending = false;
  #attackInMs = 0;

  get x(): number {
    return this.#x;
  }

  get sortY(): number {
    return this.#footY;
  }

  get shadowWidth(): number {
    return this.#row === null || this.#phase === 'dissolve' ? 0 : TIER_SHADOW_PX[this.#row.tier];
  }

  get row(): EnemyRow | null {
    return this.#row;
  }

  get phase(): EnemyPhase {
    return this.#phase;
  }

  get inUse(): boolean {
    return this.#inUse;
  }

  /** The dissolve finished; Combat releases the enemy. */
  get finished(): boolean {
    return (
      this.#phase === 'dissolve' &&
      this.#dissolveMs >= ENEMY_DISSOLVE_FRAMES * ENEMY_DISSOLVE_FRAME_MS
    );
  }

  /** 0..1; drives the bar only. */
  get healthFraction(): number {
    return Math.max(0, Math.min(1, this.#health / this.#maxHealth));
  }

  /** Standing at its stand position and not dissolving. */
  get isEngaged(): boolean {
    return this.#phase === 'engaged';
  }

  /** Engaged, health above zero, and any intro finished. */
  get isTargetable(): boolean {
    return this.#phase === 'engaged' && this.#health > 0 && this.#introLeftMs <= 0;
  }

  /** Engaged, introduced, and not already attacking. */
  get canAttack(): boolean {
    return this.isTargetable && this.#attackStage === ATTACK_NONE;
  }

  get introLeftMs(): number {
    return this.#introLeftMs;
  }

  /** True while the boss's wind-up plays (always false for a regular enemy). */
  get isWindingUp(): boolean {
    return this.#attackStage === ATTACK_TELEGRAPH;
  }

  /** Multiplier on the attack interval (a boss's second phase attacks faster). */
  get attackIntervalFactor(): number {
    return 1;
  }

  /** Which palette phase the sprite uses (1 for a regular enemy). */
  get spritePhase(): number {
    return 1;
  }

  /** Length of the intro pose in ms (a boss overrides). */
  protected get introTotalMs(): number {
    return 0;
  }

  /** Length of the wind-up before each attack in ms (a boss overrides). */
  protected get telegraphTotalMs(): number {
    return 0;
  }

  /** Pool only: resets every field and starts approaching from `startX`. */
  begin(row: EnemyRow, health: number, startX: number, footY: number): void {
    this.#row = row;
    this.#inUse = true;
    this.#phase = 'approach';
    this.#x = startX;
    this.#footY = footY;
    this.#standX = startX;
    this.#maxHealth = Math.max(1, health);
    this.#health = this.#maxHealth;
    this.#animMs = 0;
    this.#flashMs = 0;
    this.#barMs = 0;
    this.#dissolveMs = 0;
    this.#introLeftMs = this.introTotalMs;
    this.#attackStage = ATTACK_NONE;
    this.#attackMs = 0;
    this.#attackFired = false;
    this.#attackPending = false;
    this.#attackInMs = 0;
    this.clearFaults();
  }

  /** Combat: where to stop (the front of the party plus a gap). */
  setStand(standX: number): void {
    this.#standX = standX;
  }

  /** The ONLY health mutator. Returns true exactly once: on the call that defeats it. */
  strike(power: number): boolean {
    if (!this.isTargetable || !(power > 0)) {
      return false;
    }
    this.#health -= power;
    this.#flashMs = ENEMY_FLASH_MS;
    this.#barMs = ENEMY_BAR_SHOW_MS;
    if (this.#health <= 0) {
      this.#health = 0;
      this.#phase = 'dissolve';
      this.#dissolveMs = 0;
      this.#attackStage = ATTACK_NONE;
      this.#attackPending = false;
      return true;
    }
    return false;
  }

  /** Walk off to the right and be released. No kill credit. */
  beginWithdraw(): void {
    if (this.#phase === 'approach' || this.#phase === 'engaged') {
      this.#phase = 'withdraw';
      this.#attackStage = ATTACK_NONE;
      this.#attackPending = false;
    }
  }

  /** Arms the countdown to the next attack. */
  armAttack(ms: number): void {
    this.#attackInMs = ms;
  }

  /** Counts down while it can attack; true exactly once when the countdown reaches zero. */
  tickAttack(dtMs: number): boolean {
    if (!this.canAttack) {
      return false;
    }
    this.#attackInMs -= dtMs;
    return this.#attackInMs <= 0;
  }

  /** Combat decides when; the entity plays the wind-up (boss) and the attack animation. */
  beginAttack(): void {
    if (!this.canAttack) {
      return;
    }
    this.#attackMs = 0;
    this.#attackFired = false;
    this.#attackStage = this.telegraphTotalMs > 0 ? ATTACK_TELEGRAPH : ATTACK_SWING;
    this.#animMs = 0;
  }

  /** True once per attack animation, on its strike frame. Combat polls it. */
  takeAttackFrame(): boolean {
    const pending = this.#attackPending;
    this.#attackPending = false;
    return pending;
  }

  release(): void {
    this.#inUse = false;
    this.#row = null;
    this.#attackStage = ATTACK_NONE;
    this.#attackPending = false;
  }

  update(dtMs: number, world: World): void {
    const row = this.#row;
    if (row === null || !this.#inUse) {
      return;
    }
    this.#animMs += dtMs;
    this.#flashMs = Math.max(0, this.#flashMs - dtMs);
    this.#barMs = Math.max(0, this.#barMs - dtMs);
    const speed = TIER_SPEED_PX_PER_S[row.tier] * row.pace;
    const scroll = Math.max(0, world.engagement.scrollPxPerS);
    switch (this.#phase) {
      case 'approach':
        this.#x -= ((speed + scroll) * dtMs) / 1000;
        if (this.#x <= this.#standX) {
          this.#x = this.#standX;
          this.#phase = 'engaged';
          this.#animMs = 0;
        }
        return;
      case 'engaged':
        this.#updateEngaged(dtMs);
        return;
      case 'withdraw':
        this.#x += ((2 * speed + scroll) * dtMs) / 1000;
        if (this.#x > ENEMY_RELEASE_X) {
          this.release();
        }
        return;
      case 'dissolve':
        this.#dissolveMs += dtMs;
        return;
      default:
        return assertNever(this.#phase);
    }
  }

  draw(ctx: DrawContext): void {
    const row = this.#row;
    if (row === null || !this.#inUse) {
      return;
    }
    const cache = ctx.world.cache;
    const surface = ctx.surface;
    const x = Math.floor(this.#x);
    if (this.#phase === 'dissolve') {
      const set = cache.enemyDissolve(row.id);
      const frame =
        set?.frames[
          Math.min(
            ENEMY_DISSOLVE_FRAMES - 1,
            Math.floor(this.#dissolveMs / ENEMY_DISSOLVE_FRAME_MS),
          )
        ];
      if (set !== null && frame !== undefined) {
        surface.drawBitmap(frame, x - set.anchor.x, this.#footY - set.anchor.y, false);
      }
      return;
    }
    const name = this.#animationName();
    const flash = this.#flashMs > 0 ? cache.enemyFlash(row.id) : null;
    const sprites = flash ?? cache.enemy(row.id, this.spritePhase);
    if (sprites === null) {
      return;
    }
    const set = sprites[name] ?? sprites['idle'];
    if (set === undefined) {
      return;
    }
    const frame = set.frames[this.#frameIndex(name, set.frames.length)];
    if (frame === undefined) {
      return;
    }
    const flip = this.#phase === 'withdraw';
    const dx = flip ? x - (set.w - 1 - set.anchor.x) : x - set.anchor.x;
    const dy = this.#footY - set.anchor.y + this.#gaitOffset(row);
    surface.drawBitmap(frame, dx, dy, flip);
    this.#drawBar(ctx, row, x, dy);
  }

  // ---- internals ----

  #updateEngaged(dtMs: number): void {
    if (this.#introLeftMs > 0) {
      this.#introLeftMs = Math.max(0, this.#introLeftMs - dtMs);
      if (this.#introLeftMs <= 0) {
        this.#animMs = 0;
      }
      return;
    }
    if (this.#attackStage === ATTACK_TELEGRAPH) {
      this.#attackMs += dtMs;
      if (this.#attackMs >= this.telegraphTotalMs) {
        this.#attackStage = ATTACK_SWING;
        this.#attackMs = 0;
        this.#animMs = 0;
      }
    } else if (this.#attackStage === ATTACK_SWING) {
      this.#attackMs += dtMs;
      const frame = enemyFrameIndex('attack', this.#attackMs, 3);
      if (!this.#attackFired && frame >= ENEMY_ATTACK_STRIKE_FRAME) {
        this.#attackFired = true;
        this.#attackPending = true;
      }
      if (this.#attackMs >= ENEMY_ATTACK_TOTAL_MS) {
        this.#attackStage = ATTACK_NONE;
        this.#animMs = 0;
      }
    }
  }

  #animationName(): string {
    switch (this.#phase) {
      case 'approach':
      case 'withdraw':
        return 'walk';
      case 'engaged':
        if (this.#introLeftMs > 0) {
          return 'intro';
        }
        if (this.#attackStage === ATTACK_TELEGRAPH) {
          return 'telegraph';
        }
        return this.#attackStage === ATTACK_SWING ? 'attack' : 'idle';
      case 'dissolve':
        return 'idle';
      default:
        return assertNever(this.#phase);
    }
  }

  #frameIndex(name: string, count: number): number {
    if (name === 'intro') {
      return enemyOnceFrameIndex(name, this.introTotalMs - this.#introLeftMs, count);
    }
    if (name === 'telegraph') {
      return enemyOnceFrameIndex(name, this.#attackMs, count);
    }
    if (name === 'attack') {
      return enemyFrameIndex(name, this.#attackMs, count);
    }
    return enemyFrameIndex(name, this.#animMs, count);
  }

  /** Cosmetic draw motion only (never changes where it stands or when it is struck). */
  #gaitOffset(row: EnemyRow): number {
    if (row.gait === 'float') {
      return -(4 + Math.round(Math.sin(this.#animMs / 240) * 2));
    }
    if (row.gait === 'hop' && this.#phase === 'approach') {
      return -Math.round(Math.abs(Math.sin(this.#animMs / 170)) * 3);
    }
    return 0;
  }

  /** The bar belongs to enemies only: after damage, or always for an engaged boss. */
  #drawBar(ctx: DrawContext, row: EnemyRow, x: number, spriteTop: number): void {
    const boss = row.tier === 'boss';
    const damaged = this.healthFraction < 1 && this.#barMs > 0;
    if (!(damaged || (boss && this.#phase === 'engaged'))) {
      return;
    }
    const cache = ctx.world.cache;
    const frame = cache.barFrame(boss);
    const bitmap = frame.frames[0];
    if (bitmap === undefined) {
      return;
    }
    const surface = ctx.surface;
    const bx = x - Math.floor(frame.w / 2);
    const by = spriteTop - frame.h - 1;
    const innerW = frame.w - 2;
    const innerH = frame.h - 2;
    const chars = cache.barChars;
    surface.fillRect(cache.css(chars.backChar), bx + 1, by + 1, innerW, innerH);
    const fillW = this.#health > 0 ? Math.max(1, Math.ceil(this.healthFraction * innerW)) : 0;
    if (fillW > 0) {
      surface.fillRect(cache.css(chars.fillChar), bx + 1, by + 1, fillW, innerH);
    }
    surface.drawBitmap(bitmap, bx, by, false);
  }
}
