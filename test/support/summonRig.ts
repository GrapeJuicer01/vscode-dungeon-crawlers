// Helpers for the H2 summon suites: a captured SummonPool (the Game keeps its World private), a
// recording wrapper that counts raise and renew calls, and prototype patches that restore
// themselves. No DOM; shipped art on fake bitmaps.
import { SummonPool } from '../../src/game/Summons';
import { Summon } from '../../src/game/entities/Summon';

export interface PoolSpy {
  /** Every pool that ran update() since the spy was installed, in order of first use. */
  readonly pools: SummonPool[];
  readonly raises: number[];
  readonly renews: number[];
  /** Total calls of each method on any pool. */
  calls: { raise: number; renew: number };
  restore(): void;
}

/** Wraps SummonPool.prototype so a test can see the pool a Game built and count calls into it. */
export function spyOnPools(): PoolSpy {
  const proto = SummonPool.prototype;
  /* eslint-disable @typescript-eslint/unbound-method -- wrapped and applied with `this` */
  const update = proto.update;
  const raise = proto.raise;
  const renew = proto.renew;
  /* eslint-enable @typescript-eslint/unbound-method */
  const spy: PoolSpy = {
    pools: [],
    raises: [],
    renews: [],
    calls: { raise: 0, renew: 0 },
    restore(): void {
      proto.update = update;
      proto.raise = raise;
      proto.renew = renew;
    },
  };
  const remember = (pool: SummonPool): void => {
    if (!spy.pools.includes(pool)) {
      spy.pools.push(pool);
    }
  };
  proto.update = function (this: SummonPool, ...args: Parameters<SummonPool['update']>): void {
    remember(this);
    update.apply(this, args);
  };
  proto.raise = function (this: SummonPool, ...args: Parameters<SummonPool['raise']>): void {
    remember(this);
    spy.calls.raise++;
    spy.raises.push(args[0]);
    raise.apply(this, args);
  };
  proto.renew = function (this: SummonPool, ...args: Parameters<SummonPool['renew']>): void {
    remember(this);
    spy.calls.renew++;
    spy.renews.push(args[0]);
    renew.apply(this, args);
  };
  return spy;
}

/** Replaces one Summon.prototype method; returns the undo function. */
export function patchSummon<K extends 'update' | 'draw'>(key: K, value: Summon[K]): () => void {
  const original = Summon.prototype[key];
  Summon.prototype[key] = value;
  return () => {
    Summon.prototype[key] = original;
  };
}

/** Replaces SummonPool.prototype.update; returns the undo function. */
export function patchPoolUpdate(value: SummonPool['update']): () => void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored by assignment
  const original = SummonPool.prototype.update;
  SummonPool.prototype.update = value;
  return () => {
    SummonPool.prototype.update = original;
  };
}
