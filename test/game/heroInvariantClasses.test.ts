// THE HERO-INVARIANT TEST, class extension (Core invariants 1 and 2; H1 plan test note 9).
// New stimuli: continuous attack and ability casting, effect-pool exhaustion, missing class art,
// missing effect art, throwing hooks, throwing effect update and draw. Each runs for 10 simulated
// minutes with 1, 8, 32, and 64 heroes of all four classes in spawned, working, and idle. After
// each, heroSnapshot() (including classId) equals the pre-stimulus snapshot. Then each of the
// four host events is checked on class heroes, including events applied during `ability`.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { classFor } from '../../src/game/data/classMap';
import { CLASS_IDS, classDef } from '../../src/game/data/classes';
import { EFFECT_IDS } from '../../src/game/data/effects';
import { EXIT_FAILSAFE_MS, STEP_MS, VICTORY_MS, WARP_OUT_MS } from '../../src/game/data/tuning';
import { EffectPool } from '../../src/game/Effects';
import { ClassHero, createHero } from '../../src/game/entities/ClassHero';
import type { World } from '../../src/game/entities/Entity';
import type { HeroInit } from '../../src/game/entities/Hero';
import type { AgentInfo } from '../../src/shared/protocol';
import {
  artWithoutClasses,
  artWithoutEffects,
  idsOfClass,
  mixedIds,
  partyState,
} from '../support/classRig';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const SCALES = [1, 8, 32, 64];
const TEN_MINUTES = 10 * 60 * 1000;

function party(n: number): AgentInfo[] {
  return mixedIds(n).map((id, i) => agent(id, partyState(i), null, 1));
}

function scene(n: number, options: Parameters<typeof gameRig>[0] = {}): GameRig {
  const rig = gameRig(options);
  for (const a of party(n)) {
    feed(rig, a);
  }
  steps(rig, 30_000);
  return rig;
}

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});
function patchPool<K extends 'update' | 'draw' | 'spawn'>(key: K, value: EffectPool[K]): void {
  const original = EffectPool.prototype[key];
  EffectPool.prototype[key] = value;
  restores.push(() => {
    EffectPool.prototype[key] = original;
  });
}

/** Counts every spawn call and which effects were asked for, without changing behavior. */
function spySpawns(): { calls: number; refused: number; effects: Set<string> } {
  const seen = { calls: 0, refused: 0, effects: new Set<string>() };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = EffectPool.prototype.spawn;
  patchPool('spawn', function (this: EffectPool, ...args: Parameters<EffectPool['spawn']>) {
    seen.calls++;
    seen.effects.add(args[0]);
    const ok = original.apply(this, args);
    if (!ok) seen.refused++;
    return ok;
  });
  return seen;
}

function unchanged(
  name: string,
  stimulus: (rig: GameRig, n: number) => void,
  options: Parameters<typeof gameRig>[0] = {},
  scales = SCALES,
): void {
  for (const n of scales) {
    void it(`${name} (${n} heroes, 10 simulated minutes)`, () => {
      const rig = scene(n, options);
      const before = JSON.stringify(rig.game.heroSnapshot());
      assert.equal(rig.game.heroSnapshot().length, n);
      stimulus(rig, n);
      assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
      assert.ok(rig.game.heroSnapshot().every((h) => !h.exiting));
    });
  }
}

void describe('the scene itself covers all twelve classes and all three live states', () => {
  void it('64 heroes: every class and every state appears', () => {
    const rig = scene(64);
    const snap = rig.game.heroSnapshot();
    assert.equal(new Set(snap.map((h) => h.classId)).size, 12);
    assert.equal(new Set(snap.map((h) => h.lifecycle)).size, 3);
    for (const h of snap) {
      assert.equal(h.classId, classFor(h.id));
    }
  });
});

void describe('class stimuli never change a hero or remove one', () => {
  unchanged('continuous attack and ability casting', (rig, n) => {
    const spawns = spySpawns();
    steps(rig, TEN_MINUTES);
    assert.ok(spawns.calls > 0, 'heroes really cast');
    if (n >= 8) {
      assert.ok(spawns.effects.size >= 3, [...spawns.effects].join());
    }
    if (n >= 32) {
      assert.equal(spawns.effects.size, EFFECT_IDS.length, 'every effect was played');
    }
  });

  unchanged('effect-pool exhaustion (every spawn is repeated 30 times)', (rig) => {
    const flood = spySpawns();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const counted = EffectPool.prototype.spawn;
    patchPool('spawn', function (this: EffectPool, ...args: Parameters<EffectPool['spawn']>) {
      for (let i = 0; i < 30; i++) {
        counted.apply(this, args);
      }
      return counted.apply(this, args);
    });
    steps(rig, TEN_MINUTES);
    assert.ok(flood.refused > 0, 'the pool really ran out');
  });

  unchanged(
    'missing class art (every class falls back to the base look)',
    (rig) => {
      steps(rig, TEN_MINUTES);
      assert.deepEqual(rig.errors, [], 'a missing look is a fallback, never an error');
    },
    { art: artWithoutClasses() },
  );

  unchanged(
    'missing effect art (effect draws are skipped)',
    (rig) => {
      steps(rig, TEN_MINUTES);
      assert.deepEqual(rig.errors, []);
    },
    { art: artWithoutEffects() },
  );

  unchanged('a throwing effect update', (rig) => {
    patchPool('update', () => {
      throw new Error('effect update fault');
    });
    steps(rig, TEN_MINUTES);
    assert.equal(rig.errors.filter((e) => e.scope === 'update').length >= 1, true);
  });

  unchanged('a throwing effect draw', (rig) => {
    patchPool('draw', () => {
      throw new Error('effect draw fault');
    });
    steps(rig, TEN_MINUTES, 200);
    assert.equal(rig.errors.filter((e) => e.scope === 'render').length >= 1, true);
  });

  class Throwing extends ClassHero {
    constructor(init: HeroInit) {
      const id = classFor(init.info.id);
      super({ ...init, look: { ...init.look, classId: id } }, classDef(id));
    }
    protected override onAttackStrike(_world: World): void {
      throw new Error('strike fault');
    }
    protected override shouldCastAbility(): boolean {
      throw new Error('cast fault');
    }
    protected override onAbilityRelease(_world: World): void {
      throw new Error('release fault');
    }
  }

  unchanged(
    'throwing strike, trigger, and release hooks',
    (rig) => {
      steps(rig, TEN_MINUTES);
      assert.ok(rig.errors.length >= 1);
    },
    { heroFactory: (init) => new Throwing(init) },
  );

  unchanged(
    'throwing hooks with an identical snapshot re-applied every minute',
    (rig, n) => {
      for (let minute = 0; minute < 10; minute++) {
        rig.game.enqueueSnapshot(party(n));
        steps(rig, 60_000);
      }
    },
    { heroFactory: (init) => new Throwing(init) },
    [8],
  );
});

void describe('host events on class heroes behave as in M4', () => {
  for (const classId of CLASS_IDS) {
    const id = idsOfClass(classId, 1, 'ev-')[0] ?? 'x';

    void describe(`${classId}`, () => {
      function rigFor() {
        const log = heroLog(createHero);
        const rig = gameRig({ heroFactory: log.factory });
        return { rig, log };
      }

      void it('spawned creates a class hero that warps in and waits at the door', () => {
        const { rig, log } = rigFor();
        feed(rig, agent(id, 'spawned'));
        rig.game.step();
        const hero = log.byId(id);
        assert.equal(hero.classId, classId);
        assert.equal(hero.lifecycle, 'spawned');
        assert.equal(hero.phase, 'warpIn');
        run(rig, 2000);
        assert.equal(hero.phase, 'standby');
        assert.equal(hero.lifecycle, 'spawned');
      });

      void it('working walks to the corridor and fights; idle walks to the fire and rests', () => {
        const { rig, log } = rigFor();
        feed(rig, agent(id, 'spawned'));
        run(rig, 1500);
        feed(rig, agent(id, 'working', null, 2));
        const phases = new Set<string>();
        for (let i = 0; i < 40_000 / STEP_MS; i++) {
          rig.game.frame(STEP_MS, rig.surface);
          phases.add(log.byId(id).phase);
        }
        for (const p of ['travel', 'advance', 'attack', 'ability']) {
          assert.ok(phases.has(p), `${p} reached: ${[...phases].join()}`);
        }
        feed(rig, agent(id, 'idle', null, 3));
        run(rig, 40_000);
        assert.equal(log.byId(id).phase, 'rest');
        assert.equal(log.byId(id).lifecycle, 'idle');
        assert.equal(log.byId(id).classId, classId);
      });

      void it('despawned plays victory and warp-out and removes the hero after about 1.8 s', () => {
        const { rig, log } = rigFor();
        feed(rig, agent(id, 'idle'));
        run(rig, 500);
        feed(rig, agent(id, 'despawned', null, 2));
        rig.game.step();
        run(rig, VICTORY_MS - 200);
        assert.equal(log.byId(id).phase, 'victory');
        run(rig, 400);
        assert.equal(log.byId(id).phase, 'warpOut');
        run(rig, WARP_OUT_MS + 200);
        assert.equal(rig.game.heroSnapshot().length, 0);
        assert.ok(VICTORY_MS + WARP_OUT_MS < EXIT_FAILSAFE_MS);
      });

      /** Runs the real hero until it is in `ability` (spawned, working, fighting). */
      function inAbility() {
        const { rig, log } = rigFor();
        feed(rig, agent(id, 'working'));
        for (let i = 0; i < 40_000 / STEP_MS; i++) {
          rig.game.frame(STEP_MS, rig.surface);
          if (log.byId(id).phase === 'ability') {
            return { rig, log, hero: log.byId(id) };
          }
        }
        throw new Error('the hero never cast');
      }

      for (const event of ['idle', 'despawned', 'spawned'] as const) {
        void it(`${event} applied during ability takes effect on the next update`, () => {
          const { rig, hero } = inAbility();
          feed(rig, agent(id, event, null, 9));
          // The event is applied at the start of the next step; the same step then updates the hero.
          rig.game.step();
          assert.equal(hero.lifecycle, event);
          assert.notEqual(hero.phase, 'ability');
          assert.equal(hero.classId, classId);
          run(rig, 30_000);
          assert.equal(
            rig.game.heroSnapshot().find((h) => h.id === id)?.lifecycle ?? 'removed',
            event === 'despawned' ? 'removed' : event,
          );
        });
      }
    });
  }
});

void describe('nothing a hook can reach writes lifecycle', () => {
  void it('a hook that tries to mutate the World it is given cannot change any hero', () => {
    // The World has no roster and no hero list. Even a hook that scribbles on everything it can
    // see (cache, effects, particles, rng, engagement) leaves every lifecycle as the host set it.
    class Scribbler extends ClassHero {
      constructor(init: HeroInit) {
        const id = classFor(init.info.id);
        super({ ...init, look: { ...init.look, classId: id } }, classDef(id));
      }
      protected override onAttackStrike(world: World): void {
        world.effects.clear();
        world.particles.clear();
        world.rng();
      }
      protected override onAbilityRelease(world: World): void {
        world.effects.clear();
        world.campfire.setRestingCount(99);
      }
    }
    const rig = scene(16, { heroFactory: (init) => new Scribbler(init) });
    const before = JSON.stringify(rig.game.heroSnapshot());
    steps(rig, TEN_MINUTES);
    assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
  });
});
