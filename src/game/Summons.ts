// The cosmetic summon pool (H2, ADR 0011). A summon is a picture of an ally that stands beside
// its owner while the owner fights. The pool is keyed by a plain slot integer and takes only
// numbers: it holds no hero, roster, or id, and nothing here can reach a hero's state (Core
// invariants 1 and 2). Phase and lease timers are plain arithmetic done here, so a quarantined
// entity cannot strand a phase. Summon objects are preallocated; nothing allocates per step.
import { SUMMON_IDS } from './data/summons';
import type { SummonId } from './data/summons';
import { SUMMON_RISE_TOTAL_MS, SUMMON_SINK_TOTAL_MS } from './data/animations';
import { SUMMON_LEASE_MS } from './data/tuning';
import { Summon } from './entities/Summon';
import type { SummonPose } from './entities/Summon';
import { guarded } from './entities/Entity';
import type { World } from './entities/Entity';

export class SummonPool {
  readonly #items: Summon[] = [];
  readonly #live: Summon[] = [];
  #current: Summon | null = null;
  #world: World | null = null;
  #dtMs = 0;
  readonly #runUpdate = (): void => {
    if (this.#current !== null && this.#world !== null) {
      this.#current.update(this.#dtMs, this.#world);
    }
  };
  // The pool has no error channel of its own. A summon is freed as soon as `summon.frozen` is
  // set, which guarded() does after FAULT_LIMIT consecutive faults; the fault is silently
  // swallowed here with no report, because it is cosmetic.
  readonly #ignore = (): void => undefined;

  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) {
      this.#items.push(new Summon());
    }
  }

  get count(): number {
    return this.#live.length;
  }

  /** The live summons (a reused array; the renderer y-sorts and draws them). */
  entities(): readonly Summon[] {
    return this.#live;
  }

  /**
   * The owner raises its summon. A bad number, an unknown kind, or a full pool is a silent no-op.
   * A summon of the same kind already rising or active for the slot is left alone; a sinking
   * one, or one of a different kind, restarts as the requested kind.
   */
  raise(slot: number, kind: SummonId, x: number, y: number, faceRight: boolean): void {
    if (
      !Number.isFinite(slot) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !(SUMMON_IDS as readonly string[]).includes(kind)
    ) {
      return;
    }
    // One summon per slot. A slot reused by a hero of another class never keeps the old kind
    // (H3-7): a sinking summon or one of a different kind restarts as the requested kind.
    const existing = this.#find(slot);
    if (existing !== null) {
      if (existing.phase === 'sink' || existing.kind !== kind) {
        existing.begin(slot, kind, x, y, faceRight, SUMMON_LEASE_MS);
      }
      return;
    }
    for (const item of this.#items) {
      if (!item.inUse) {
        item.begin(slot, kind, x, y, faceRight, SUMMON_LEASE_MS);
        this.#live.push(item);
        return;
      }
    }
  }

  /**
   * Extends the lease and places the summon. Does nothing for a missing or sinking summon, or one
   * of a different kind (it then sinks when its lease runs out).
   */
  renew(
    slot: number,
    kind: SummonId,
    x: number,
    y: number,
    faceRight: boolean,
    pose: SummonPose,
  ): void {
    if (!Number.isFinite(slot) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const summon = this.#find(slot);
    if (summon === null || summon.phase === 'sink' || summon.kind !== kind) {
      return;
    }
    summon.place(x, y, faceRight, pose, SUMMON_LEASE_MS);
  }

  update(dtMs: number, world: World): void {
    if (!(dtMs > 0)) {
      return;
    }
    this.#world = world;
    this.#dtMs = dtMs;
    const live = this.#live;
    let write = 0;
    for (let i = 0; i < live.length; i++) {
      const summon = live[i];
      if (summon === undefined) {
        continue;
      }
      summon.step(dtMs, SUMMON_RISE_TOTAL_MS, SUMMON_SINK_TOTAL_MS);
      this.#current = summon;
      guarded(summon, 'update', this.#runUpdate, this.#ignore);
      this.#current = null;
      if (summon.finished || summon.frozen) {
        summon.release();
        continue;
      }
      live[write++] = summon;
    }
    live.length = write;
    this.#world = null;
  }

  clear(): void {
    for (const summon of this.#live) {
      summon.release();
    }
    this.#live.length = 0;
  }

  #find(slot: number): Summon | null {
    for (const summon of this.#live) {
      if (summon.slot === slot) {
        return summon;
      }
    }
    return null;
  }
}
