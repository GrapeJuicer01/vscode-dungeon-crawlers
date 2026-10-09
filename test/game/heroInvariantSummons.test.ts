// THE HERO-INVARIANT TEST, summon extension (Core invariants 1, 2, and 4; H2 plan test notes 5, 6,
// and 9; ADR 0011). Summon stimuli (raising, renewing, exhausting the pool, a throwing
// Summon.update, a throwing Summon.draw, a throwing SummonPool.update, missing summon art) run for
// 10 simulated minutes with 1, 8, 32, and 64 heroes of all eight classes; heroSnapshot() must equal
// the pre-stimulus snapshot. Then each of the four host events is applied while a summon is
// rising, active, and sinking: the hero's lifecycle follows the event exactly as before.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SUMMON_CAPACITY, STEP_MS, SUMMON_LEASE_MS } from '../../src/game/data/tuning';
import { createHero } from '../../src/game/entities/ClassHero';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import type { AgentInfo, AgentState } from '../../src/shared/protocol';
import { idsOfClass, mixedIds } from '../support/classRig';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';
import { patchPoolUpdate, patchSummon, spyOnPools } from '../support/summonRig';
import type { PoolSpy } from '../support/summonRig';

const SCALES = [1, 8, 32, 64];
const TEN_MINUTES = 10 * 60 * 1000;
const STATES: readonly AgentState[] = ['working', 'spawned', 'idle'];

const restores: (() => void)[] = [];
let spy: PoolSpy | null = null;
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
  spy?.restore();
  spy = null;
});

function party(n: number): AgentInfo[] {
  return mixedIds(n).map((id, i) => agent(id, STATES[i % 3] ?? 'idle', null, 1));
}

function scene(n: number, options: Parameters<typeof gameRig>[0] = {}): GameRig {
  const rig = gameRig(options);
  for (const a of party(n)) {
    feed(rig, a);
  }
  steps(rig, 30_000);
  return rig;
}

const pool = (): NonNullable<PoolSpy['pools'][number]> => {
  const p = spy?.pools[0];
  assert.ok(p, 'the Game built a SummonPool');
  return p;
};

function unchanged(
  name: string,
  stimulus: (rig: GameRig, n: number) => void,
  options: Parameters<typeof gameRig>[0] = {},
  scales = SCALES,
): void {
  for (const n of scales) {
    void it(`${name} (${n} heroes, 10 simulated minutes)`, () => {
      spy = spyOnPools();
      const rig = scene(n, options);
      const before = JSON.stringify(rig.game.heroSnapshot());
      assert.equal(rig.game.heroSnapshot().length, n);
      stimulus(rig, n);
      assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
      assert.ok(rig.game.heroSnapshot().every((h) => !h.exiting));
    });
  }
}

/** Raises and renews a skeleton in every slot each simulated second, for ten minutes. */
function hammerPool(rig: GameRig, perSecond: (second: number) => void): void {
  for (let second = 0; second < TEN_MINUTES / 1000; second++) {
    perSecond(second);
    steps(rig, 1000, 250);
  }
}

void describe('summon stimuli never change a hero or remove one', () => {
  unchanged('natural Bone Call summons (the Necromancers really fight)', (rig, n) => {
    steps(rig, TEN_MINUTES);
    assert.ok((spy?.calls.raise ?? 0) > 0 || n < 8, 'a Necromancer raised a skeleton');
    assert.deepEqual(rig.errors, []);
  });

  unchanged('raising and renewing in every slot, every second', (rig, n) => {
    const p = pool();
    hammerPool(rig, (second) => {
      for (let slot = 0; slot < Math.min(n, 64); slot++) {
        p.raise(slot, 'skeleton', 50 + (slot % 20) * 10, 100 + (slot % 5) * 8, second % 2 === 0);
        p.renew(slot, 50, 100, true, second % 2 === 0 ? 'walk' : 'attack');
      }
    });
    assert.ok(p.count <= SUMMON_CAPACITY);
    assert.deepEqual(rig.errors, []);
  });

  unchanged('pool exhaustion (64 slots asked for 8 places, repeated)', (rig) => {
    const p = pool();
    hammerPool(rig, () => {
      for (let round = 0; round < 5; round++) {
        for (let slot = 0; slot < 64; slot++) {
          p.raise(slot, 'skeleton', 30 + slot, 100, true);
        }
      }
      assert.ok(p.count <= SUMMON_CAPACITY);
    });
  });

  unchanged('a throwing Summon.update (every summon is freed after three faults)', (rig, n) => {
    const p = pool();
    restores.push(
      patchSummon('update', () => {
        throw new Error('summon update fault');
      }),
    );
    hammerPool(rig, () => {
      for (let slot = 0; slot < Math.min(n, 16); slot++) {
        p.raise(slot, 'skeleton', 60 + slot, 100, true);
      }
    });
    assert.equal(p.count <= SUMMON_CAPACITY, true);
  });

  unchanged('a throwing Summon.draw (quarantined, reported, never fatal)', (rig, n) => {
    const p = pool();
    restores.push(
      patchSummon('draw', () => {
        throw new Error('summon draw fault');
      }),
    );
    hammerPool(rig, () => {
      for (let slot = 0; slot < Math.min(n, 8); slot++) {
        p.raise(slot, 'skeleton', 60 + slot, 100, true);
        p.renew(slot, 60 + slot, 100, true, 'attack');
      }
    });
    assert.ok(
      rig.errors.some((e) => e.scope === 'draw'),
      JSON.stringify(rig.errors.map((e) => e.scope)),
    );
  });

  unchanged('a throwing SummonPool.update (Game reports it and clears the pool)', (rig) => {
    restores.push(
      patchPoolUpdate(() => {
        throw new Error('pool update fault');
      }),
    );
    steps(rig, TEN_MINUTES);
    assert.ok(rig.errors.filter((e) => e.scope === 'update').length >= 1);
  });

  unchanged(
    'missing summon art (the pool runs, nothing draws, nothing throws)',
    (rig, n) => {
      const p = pool();
      hammerPool(rig, () => {
        for (let slot = 0; slot < Math.min(n, 8); slot++) {
          p.raise(slot, 'skeleton', 60 + slot, 100, true);
          p.renew(slot, 60 + slot, 100, true, 'attack');
        }
      });
      assert.deepEqual(rig.errors, []);
    },
    { art: { ...SHIPPED_ART, summons: {} } },
  );
});

void describe('after a pool fault the heroes still advance and keep their classes', () => {
  void it('Game.step with a throwing SummonPool.update: phases keep changing, classIds are unchanged', () => {
    spy = spyOnPools();
    const log = heroLog(createHero);
    const rig = gameRig({ heroFactory: log.factory });
    const ids = mixedIds(8);
    for (const id of ids) {
      feed(rig, agent(id, 'working'));
    }
    run(rig, 3000);
    const classes = JSON.stringify(rig.game.heroSnapshot().map((h) => [h.id, h.classId]));
    restores.push(
      patchPoolUpdate(() => {
        throw new Error('pool update fault');
      }),
    );
    const phases = new Set<string>();
    for (let i = 0; i < 60_000 / STEP_MS; i++) {
      rig.game.frame(STEP_MS, rig.surface);
      for (const id of ids) {
        phases.add(log.byId(id).phase);
      }
    }
    assert.ok(phases.has('attack') && phases.has('ability'), [...phases].join());
    assert.equal(JSON.stringify(rig.game.heroSnapshot().map((h) => [h.id, h.classId])), classes);
    assert.ok(rig.game.heroSnapshot().every((h) => h.lifecycle === 'working'));
    assert.ok(rig.errors.some((e) => e.scope === 'update'));
    assert.equal(pool().count, 0, 'the faulting pool was cleared');
  });
});

void describe('the four host events while a summon is rising, active, and sinking', () => {
  const id = idsOfClass('necromancer', 1, 'hi-')[0] ?? 'x';
  type SummonPhaseName = 'rise' | 'active' | 'sink';

  /** A Necromancer in a Game, with its skeleton brought to the wanted phase. */
  function setup(phase: SummonPhaseName): { rig: GameRig; slot: number } {
    spy = spyOnPools();
    const log = heroLog(createHero);
    const rig = gameRig({ heroFactory: log.factory });
    if (phase === 'active') {
      feed(rig, agent(id, 'working'));
      let guard = 0;
      while (guard++ < 40_000 / STEP_MS) {
        rig.game.frame(STEP_MS, rig.surface);
        if (pool0()?.entities()[0]?.phase === 'active') {
          break;
        }
      }
    } else {
      // Rising and sinking are produced on the hero's slot while it rests (no renewals).
      feed(rig, agent(id, 'idle'));
      run(rig, 1500);
      assert.equal(pool0()?.count, 0, 'a resting Necromancer has never raised a skeleton');
    }
    return { rig, slot: 0 };
  }
  const pool0 = (): PoolSpy['pools'][number] | undefined => spy?.pools[0];

  for (const phase of ['rise', 'active', 'sink'] as const) {
    for (const event of ['spawned', 'working', 'idle', 'despawned'] as const) {
      void it(`${event} applied while the skeleton is ${phase}: the lifecycle follows the event exactly`, () => {
        const { rig, slot } = setup(phase);
        const p = pool0();
        assert.ok(p);
        if (phase === 'rise') {
          p.raise(slot, 'skeleton', 80, 120, true);
          assert.equal(p.entities()[0]?.phase, 'rise');
        } else if (phase === 'sink') {
          p.raise(slot, 'skeleton', 80, 120, true);
          for (let i = 0; i < (SUMMON_LEASE_MS + 60) / STEP_MS; i++) {
            rig.game.step();
          }
          assert.equal(p.entities()[0]?.phase, 'sink');
        } else {
          assert.equal(p.entities()[0]?.phase, 'active');
        }
        feed(rig, agent(id, event, null, 50));
        rig.game.step();
        const hero = rig.game.heroSnapshot().find((h) => h.id === id);
        assert.ok(hero, 'the hero is still in the scene for the step the event arrived');
        assert.equal(hero.lifecycle, event);
        assert.equal(hero.classId, 'necromancer');
        assert.equal(hero.exiting, event === 'despawned');
        run(rig, 30_000);
        const after = rig.game.heroSnapshot().find((h) => h.id === id);
        if (event === 'despawned') {
          assert.equal(after, undefined, 'removed after its warp-out, as always');
        } else {
          assert.equal(after?.lifecycle, event);
          assert.equal(after?.exiting, false);
          assert.equal(after?.classId, 'necromancer');
        }
        if (event === 'working') {
          assert.ok(p.count <= 1);
        } else {
          assert.equal(p.count, 0, 'the skeleton is gone once the hero is not fighting');
        }
      });
    }
  }

  void it('the pool is rebuilt empty with a new Game (webview reload) and no hero is affected', () => {
    spy = spyOnPools();
    const rig = gameRig();
    feed(rig, agent(id, 'working'));
    run(rig, 40_000);
    assert.equal(pool0()?.count, 1);
    const reloaded = gameRig();
    reloaded.game.enqueueSnapshot([agent(id, 'working')]);
    run(reloaded, 500);
    assert.equal(reloaded.game.heroSnapshot()[0]?.lifecycle, 'working');
    assert.equal(spy.pools.at(-1)?.count, 0);
  });
});
