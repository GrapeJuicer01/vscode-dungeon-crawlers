// The cosmetic summon pool (H2 plan test note 4, ADR 0011): one summon per slot, raise and renew
// semantics, the lease, the fixed capacity, bad input, allocation-free updates, and a faulting
// summon being freed. The pool is driven alone against a hand-built World.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SUMMON_RISE_TOTAL_MS, SUMMON_SINK_TOTAL_MS } from '../../src/game/data/animations';
import { FAULT_LIMIT, STEP_MS, SUMMON_CAPACITY, SUMMON_LEASE_MS } from '../../src/game/data/tuning';
import type { Summon, SummonPhase } from '../../src/game/entities/Summon';
import { SummonPool } from '../../src/game/Summons';
import { makeWorld } from '../support/classRig';
import { patchSummon } from '../support/summonRig';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

const { world } = makeWorld();
const only = (pool: SummonPool): Summon => {
  const first = pool.entities()[0];
  assert.ok(first, 'one summon is live');
  return first;
};
const phasesOf = (pool: SummonPool): (SummonPhase | 'none')[] =>
  pool.count === 0 ? ['none'] : pool.entities().map((s) => s.phase);

/** Steps the pool for `ms`, renewing slot 0 on every step when `renewSlot` is given. */
function advance(pool: SummonPool, ms: number, renewSlot: number | null = null): void {
  for (let t = 0; t < ms; t += STEP_MS) {
    if (renewSlot !== null) {
      pool.renew(renewSlot, 50, 100, true, 'attack');
    }
    pool.update(STEP_MS, world);
  }
}

void describe('constants', () => {
  void it('the lease is 250 ms, rise 440 ms, sink 300 ms, and the pool holds 8', () => {
    assert.equal(SUMMON_LEASE_MS, 250);
    assert.equal(SUMMON_RISE_TOTAL_MS, 440);
    assert.equal(SUMMON_SINK_TOTAL_MS, 300);
    assert.equal(SUMMON_CAPACITY, 8);
  });
});

void describe('raise', () => {
  void it('raises one summon at the given place, rising, facing as asked', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    assert.equal(pool.count, 0);
    pool.raise(3, 'skeleton', 70.9, 120.2, false);
    assert.equal(pool.count, 1);
    const s = only(pool);
    assert.equal(s.slot, 3);
    assert.equal(s.kind, 'skeleton');
    assert.equal(s.phase, 'rise');
    assert.equal(s.x, 70.9);
    assert.equal(s.sortY, 120);
    assert.ok(s.inUse);
  });

  void it('is one summon per slot: raising again while rising or active is a no-op', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    advance(pool, 100, 0);
    pool.raise(0, 'skeleton', 99, 140, false);
    assert.equal(pool.count, 1);
    assert.equal(
      only(pool).x,
      50,
      'a rising summon is left alone (50 is where advance() renewed it)',
    );
    assert.equal(only(pool).phase, 'rise');
    advance(pool, SUMMON_RISE_TOTAL_MS, 0);
    assert.equal(only(pool).phase, 'active');
    pool.raise(0, 'skeleton', 99, 140, false);
    assert.equal(pool.count, 1);
    assert.equal(only(pool).phase, 'active', 'an active summon is not restarted');
  });

  void it('raising a sinking slot restarts it at rise, still one summon', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    advance(pool, SUMMON_LEASE_MS + STEP_MS * 3);
    assert.equal(only(pool).phase, 'sink');
    pool.raise(0, 'skeleton', 30, 110, true);
    assert.equal(pool.count, 1);
    assert.equal(only(pool).phase, 'rise');
    assert.equal(only(pool).x, 30);
    advance(pool, SUMMON_RISE_TOTAL_MS + STEP_MS, 0);
    assert.equal(only(pool).phase, 'active');
  });

  void it('different slots hold different summons', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    for (let slot = 0; slot < 5; slot++) {
      pool.raise(slot, 'skeleton', slot * 10, 100, true);
    }
    assert.equal(pool.count, 5);
    assert.deepEqual(
      pool.entities().map((s) => s.slot),
      [0, 1, 2, 3, 4],
    );
  });

  void it('a full pool drops the raise silently and never evicts', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    for (let slot = 0; slot < SUMMON_CAPACITY; slot++) {
      pool.raise(slot, 'skeleton', slot, 100, true);
    }
    assert.equal(pool.count, SUMMON_CAPACITY);
    assert.doesNotThrow(() => pool.raise(99, 'skeleton', 1, 1, true));
    assert.equal(pool.count, SUMMON_CAPACITY);
    assert.ok(!pool.entities().some((s) => s.slot === 99));
    assert.deepEqual(
      pool.entities().map((s) => s.slot),
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
  });

  void it('ignores NaN, infinite, and unknown input', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(NaN, 'skeleton', 1, 1, true);
    pool.raise(Infinity, 'skeleton', 1, 1, true);
    pool.raise(0, 'skeleton', NaN, 1, true);
    pool.raise(0, 'skeleton', 1, -Infinity, true);
    pool.raise(0, 'dragon' as never, 1, 1, true);
    pool.raise(0, '__proto__' as never, 1, 1, true);
    assert.equal(pool.count, 0);
    assert.doesNotThrow(() => pool.update(STEP_MS, world));
  });
});

void describe('renew and the lease', () => {
  void it('renew places the summon and sets its pose; a pose change restarts the clock only', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    pool.renew(0, 22.5, 133.7, false, 'walk');
    const s = only(pool);
    assert.equal(s.x, 22.5);
    assert.equal(s.sortY, 133);
    assert.equal(s.pose, 'walk');
    pool.renew(0, 22.5, 133.7, false, 'attack');
    assert.equal(s.pose, 'attack');
    assert.equal(pool.count, 1);
  });

  void it('renew on a missing slot or a sinking summon does nothing', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.renew(5, 1, 1, true, 'walk');
    assert.equal(pool.count, 0, 'renew never creates a summon');
    pool.raise(0, 'skeleton', 10, 100, true);
    advance(pool, SUMMON_LEASE_MS + STEP_MS * 3);
    const s = only(pool);
    assert.equal(s.phase, 'sink');
    pool.renew(0, 99, 99, false, 'walk');
    assert.equal(s.phase, 'sink', 'a sinking summon is not revived by a renewal');
    assert.equal(s.x, 10);
    assert.equal(s.pose, 'attack');
  });

  void it('renew ignores NaN and infinite input', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    pool.renew(NaN, 5, 5, true, 'walk');
    pool.renew(0, NaN, 5, true, 'walk');
    pool.renew(0, 5, Infinity, true, 'walk');
    assert.equal(only(pool).x, 10);
    assert.equal(only(pool).pose, 'attack');
  });

  void it('without renewals a summon sinks after the 250 ms lease, even before it finished rising', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    advance(pool, SUMMON_LEASE_MS - STEP_MS * 2);
    assert.equal(only(pool).phase, 'rise');
    advance(pool, STEP_MS * 4);
    assert.equal(only(pool).phase, 'sink');
  });

  void it('with a renewal every step, rise becomes active after 440 ms and stays active', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    advance(pool, SUMMON_RISE_TOTAL_MS - STEP_MS * 2, 0);
    assert.deepEqual(phasesOf(pool), ['rise']);
    advance(pool, STEP_MS * 4, 0);
    assert.deepEqual(phasesOf(pool), ['active']);
    advance(pool, 60_000, 0);
    assert.deepEqual(phasesOf(pool), ['active']);
    assert.equal(pool.count, 1);
  });

  void it('after the last renewal the summon is gone within the lease plus the sink total, at most 700 ms', () => {
    for (const waitMs of [0, 100, 450, 3000]) {
      const pool = new SummonPool(SUMMON_CAPACITY);
      pool.raise(0, 'skeleton', 10, 100, true);
      advance(pool, waitMs, 0);
      let elapsed = 0;
      const seen = new Set<string>();
      while (pool.count > 0 && elapsed < 2000) {
        pool.update(STEP_MS, world);
        elapsed += STEP_MS;
        seen.add(phasesOf(pool)[0] ?? '');
      }
      assert.equal(pool.count, 0, `freed after ${waitMs}`);
      assert.ok(elapsed <= 700, `${elapsed} ms after the last renewal (wait ${waitMs})`);
      assert.ok(elapsed >= SUMMON_SINK_TOTAL_MS, 'the sink is played, not skipped');
      assert.ok(seen.has('sink'));
    }
  });

  void it('a freed slot can be raised again, and reuses a pooled object', () => {
    const pool = new SummonPool(2);
    const used = new Set<Summon>();
    for (let cycle = 0; cycle < 50; cycle++) {
      pool.raise(cycle % 2, 'skeleton', 10, 100, true);
      for (const s of pool.entities()) {
        used.add(s);
      }
      advance(pool, 800);
      assert.equal(pool.count, 0);
    }
    assert.ok(used.size <= 2, `${used.size} distinct Summon objects across 50 cycles`);
  });
});

void describe('update', () => {
  void it('ignores a zero, negative, or NaN step', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    for (const dt of [0, -16, NaN]) {
      pool.update(dt, world);
    }
    assert.equal(only(pool).phase, 'rise');
    assert.equal(pool.count, 1);
  });

  void it('allocates nothing per update: the entities array and the Summon objects are stable', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    const list = pool.entities();
    pool.raise(0, 'skeleton', 10, 100, true);
    pool.raise(1, 'skeleton', 30, 100, true);
    const objects = [...pool.entities()];
    for (let i = 0; i < 5000; i++) {
      pool.renew(0, 10, 100, true, i % 2 === 0 ? 'walk' : 'attack');
      pool.renew(1, 30, 100, true, 'attack');
      pool.update(STEP_MS, world);
    }
    assert.equal(pool.entities(), list, 'the same array every time');
    assert.deepEqual([...pool.entities()], objects);
  });

  void it('heap use stays flat over 200,000 updates (soft check)', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    for (let slot = 0; slot < SUMMON_CAPACITY; slot++) {
      pool.raise(slot, 'skeleton', slot * 8, 100, true);
    }
    const run = (n: number): void => {
      for (let i = 0; i < n; i++) {
        for (let slot = 0; slot < SUMMON_CAPACITY; slot++) {
          pool.renew(slot, slot * 8, 100, true, 'attack');
        }
        pool.update(STEP_MS, world);
      }
    };
    run(20_000);
    const before = process.memoryUsage().heapUsed;
    run(200_000);
    const grown = process.memoryUsage().heapUsed - before;
    // 1.6 million renew calls plus 200,000 updates; per-call garbage would be many MB.
    assert.ok(grown < 8 * 1024 * 1024, `heap grew by ${grown} bytes`);
  });

  void it('clear empties the pool and frees every slot', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    for (let slot = 0; slot < 4; slot++) {
      pool.raise(slot, 'skeleton', slot, 100, true);
    }
    pool.clear();
    assert.equal(pool.count, 0);
    assert.equal(pool.entities().length, 0);
    pool.raise(2, 'skeleton', 5, 100, true);
    assert.equal(pool.count, 1);
    assert.equal(only(pool).phase, 'rise');
  });

  void it('is deterministic: two pools given the same calls agree at every step', () => {
    const a = new SummonPool(SUMMON_CAPACITY);
    const b = new SummonPool(SUMMON_CAPACITY);
    const trace = (p: SummonPool): string =>
      JSON.stringify(p.entities().map((s) => [s.slot, s.phase, s.pose, s.x, s.sortY]));
    for (let i = 0; i < 3000; i++) {
      for (const p of [a, b]) {
        if (i % 400 === 0) {
          p.raise((i / 400) % 3, 'skeleton', i % 97, 100 + (i % 13), i % 2 === 0);
        }
        if (i % 7 !== 0) {
          p.renew((i / 400) | 0, i % 89, 100, true, i % 3 === 0 ? 'walk' : 'attack');
        }
        p.update(STEP_MS, world);
      }
      assert.equal(trace(a), trace(b), `step ${i}`);
    }
  });
});

void describe('a faulting summon', () => {
  void it('is freed after FAULT_LIMIT throwing updates; the pool keeps working and nothing escapes', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    pool.raise(1, 'skeleton', 30, 100, true);
    restores.push(
      patchSummon('update', function (this: Summon) {
        if (this.slot === 0) {
          throw new Error('summon update fault');
        }
      }),
    );
    for (let i = 0; i < FAULT_LIMIT - 1; i++) {
      assert.doesNotThrow(() => {
        pool.renew(0, 10, 100, true, 'attack');
        pool.renew(1, 30, 100, true, 'attack');
        pool.update(STEP_MS, world);
      });
      assert.equal(pool.count, 2, `still live after ${i + 1} faults`);
    }
    pool.renew(0, 10, 100, true, 'attack');
    pool.renew(1, 30, 100, true, 'attack');
    pool.update(STEP_MS, world);
    assert.equal(FAULT_LIMIT, 3);
    assert.equal(pool.count, 1, 'the third fault frees the summon');
    assert.equal(only(pool).slot, 1, 'the healthy summon is untouched');
    restores.pop()?.();
    pool.raise(0, 'skeleton', 10, 100, true);
    assert.equal(pool.count, 2, 'the freed slot can be raised again');
    advance(pool, 100);
    assert.equal(pool.count, 2);
  });

  void it('three throwing updates in a row on a lone summon empty the pool', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    restores.push(
      patchSummon('update', () => {
        throw new Error('always');
      }),
    );
    for (let i = 0; i < 3; i++) {
      pool.renew(0, 10, 100, true, 'attack');
      pool.update(STEP_MS, world);
    }
    assert.equal(pool.count, 0);
  });

  void it('a recovered raise starts with a clean fault count', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 10, 100, true);
    let fail = true;
    restores.push(
      patchSummon('update', () => {
        if (fail) {
          throw new Error('twice');
        }
      }),
    );
    pool.update(STEP_MS, world);
    pool.update(STEP_MS, world);
    fail = false;
    pool.update(STEP_MS, world);
    assert.equal(only(pool).faults, 0, 'a clean update resets the count');
    assert.ok(!only(pool).frozen);
  });
});
