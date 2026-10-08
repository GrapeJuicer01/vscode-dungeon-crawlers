// The entity contract, the world an entity sees, and the per-entity crash guard
// (docs/architecture/game-engine.md section 4, ADR 0009).
import type { Camera } from '../Camera';
import type { EffectPool } from '../Effects';
import type { Engagement } from '../Engagement';
import type { ErrorSink, Surface } from '../ports';
import type { Particles } from '../Particles';
import type { Rng } from '../rng';
import type { SpriteCache } from '../sprites/spriteFactory';
import type { StageRuntime } from '../Stage';
import type { Campfire } from './Campfire';
import { FAULT_LIMIT } from '../data/tuning';

export interface World {
  readonly stage: StageRuntime;
  readonly campfire: Campfire;
  readonly particles: Particles;
  readonly effects: EffectPool;
  readonly engagement: Engagement;
  readonly rng: Rng;
  readonly cache: SpriteCache;
}

export interface DrawContext {
  readonly surface: Surface;
  readonly camera: Camera;
  readonly world: World;
}

/** Fault bookkeeping the guard reads and writes. */
export interface Guardable {
  faults: number;
  drawFaults: number;
  frozen: boolean;
  reported: Set<string> | null;
}

export interface Entity extends Guardable {
  /** Centre x in whole or fractional px (the renderer places the shadow and beam here). */
  readonly x: number;
  /** Foot y in whole pixels; the renderer draws in ascending order. */
  readonly sortY: number;
  /** Width of the flat shadow the renderer draws under the entity; 0 for none. */
  readonly shadowWidth: number;
  update(dtMs: number, world: World): void;
  draw(ctx: DrawContext): void;
}

/** Base for entities: owns the fault bookkeeping. Faults never touch hero lifecycle. */
export abstract class GuardedEntity implements Guardable, Entity {
  faults = 0;
  drawFaults = 0;
  frozen = false;
  reported: Set<string> | null = null;
  abstract readonly x: number;
  abstract readonly sortY: number;
  abstract readonly shadowWidth: number;
  abstract update(dtMs: number, world: World): void;
  abstract draw(ctx: DrawContext): void;

  /** A host lifecycle event clears quarantine so a recovered entity gets another chance. */
  clearFaults(): void {
    this.faults = 0;
    this.drawFaults = 0;
    this.frozen = false;
  }
}

/** A message safe to compare and report: only Error messages, never other thrown values. */
export function errorKey(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'non-error thrown';
}

/**
 * Runs fn under the quarantine rules. Never throws, even if onError throws.
 * - update: skipped while frozen; after FAULT_LIMIT consecutive faults the entity is frozen.
 * - draw: still attempted while frozen (a frozen entity usually still draws); after FAULT_LIMIT
 *   consecutive draw faults it is hidden until a lifecycle event clears it.
 * - a clean call resets the count; each distinct message is reported once per entity.
 */
export function guarded(
  entity: Guardable,
  scope: 'update' | 'draw',
  fn: () => void,
  onError: ErrorSink,
): void {
  if (scope === 'update' && entity.frozen) {
    return;
  }
  if (scope === 'draw' && entity.drawFaults >= FAULT_LIMIT) {
    return;
  }
  try {
    fn();
    if (scope === 'update') {
      entity.faults = 0;
    } else {
      entity.drawFaults = 0;
    }
  } catch (error: unknown) {
    if (scope === 'update') {
      entity.faults++;
      if (entity.faults >= FAULT_LIMIT) {
        entity.frozen = true;
      }
    } else {
      entity.drawFaults++;
    }
    try {
      const key = errorKey(error);
      entity.reported ??= new Set<string>();
      if (!entity.reported.has(key)) {
        entity.reported.add(key);
        onError(error, scope);
      }
    } catch {
      // A failing reporter must never escape the guard (Core invariant 4).
    }
  }
}
