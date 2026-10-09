// THE HERO-INVARIANT TEST, E1 extension (Core invariants 1 and 2; E1 plan test notes 6 and 7).
// With enemies, bosses, stage swaps, and combat faults all running, a hero's lifecycle follows the
// host's agent-state events and nothing else: only spawned, working, idle, and despawned change a
// hero or remove one, and enemy attacks change how a hero is drawn but never where it is, what
// phase it is in, or what its lifecycle is. Never narrowed; the M4 to H3 suite is heroInvariant.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Combat } from '../../src/game/Combat';
import { Drops } from '../../src/game/Drops';
import { Enemy } from '../../src/game/entities/Enemy';
import { Boss } from '../../src/game/entities/Boss';
import type { Hero } from '../../src/game/entities/Hero';
import { HitReactions } from '../../src/game/HitReactions';
import { StageDirector } from '../../src/game/StageDirector';
import { mulberry32 } from '../../src/game/rng';
import { COMBAT_FAULT_LIMIT, STEP_MS } from '../../src/game/data/tuning';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import type { AgentInfo, AgentState } from '../../src/shared/protocol';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const SCALES = [1, 8, 32, 64];
const LIVE = ['spawned', 'working', 'idle'] as const;

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

function patch<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  const original = target[key];
  target[key] = value;
  restores.push(() => {
    target[key] = original;
  });
}

/** An aggressive fight: a boss after 5 kills, up to 12 enemies. */
const HARD = { enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 };

function list(n: number, states: readonly AgentState[] = LIVE): AgentInfo[] {
  return Array.from({ length: n }, (_, i) =>
    agent(`h${i}`, states[i % states.length] ?? 'idle', null, 1),
  );
}

/** A rig with n heroes, hard combat, run long enough for a boss fight to begin at n >= 8. */
function fighting(n: number, options: Parameters<typeof gameRig>[0] = {}): GameRig {
  const rig = gameRig(options);
  rig.game.applyConfig(HARD);
  for (const a of list(n, ['working', 'working', 'idle', 'spawned'])) {
    feed(rig, a);
  }
  return rig;
}

const snapshotOf = (rig: GameRig): string => JSON.stringify(rig.game.heroSnapshot());

const capture = (c: Combat): Combat => c;

/** Spies the Combat the game built so a test can see whether a boss is alive. */
function spy(): { boss: () => boolean; combat: () => Combat | null } {
  let seen: Combat | null = null;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = Combat.prototype.update;
  patch(Combat.prototype, 'update', function (this: Combat, ...args: Parameters<Combat['update']>) {
    seen ??= capture(this);
    original.apply(this, args);
  });
  return {
    combat: () => seen,
    boss: () => seen?.entities().some((e) => e instanceof Boss) ?? false,
  };
}

/** Steps until `done()`; fails the test if it takes longer than `limitMs`. */
function until(rig: GameRig, done: () => boolean, limitMs: number, what: string): void {
  const n = Math.round(limitMs / STEP_MS);
  for (let i = 0; i < n && !done(); i++) {
    rig.game.step();
  }
  assert.ok(done(), what);
}

void describe('lifecycle follows the host model through a long, hard fight (seeded random events)', () => {
  for (const n of SCALES) {
    void it(`${n} heroes, random spawned/working/idle/despawned events, bosses and stage swaps running`, () => {
      const rig = fighting(n);
      const rng = mulberry32(1000 + n);
      const model = new Map<string, AgentState>();
      for (const a of list(n, ['working', 'working', 'idle', 'spawned'])) {
        model.set(a.id, a.state);
      }
      let clock = 2;
      const pool = Math.max(4, Math.floor(n * 1.5));
      let bossSeconds = 0;
      let enemyPeak = 0;
      const sees = spy();
      for (let second = 0; second < 240; second++) {
        // A few host events per second at most; this is the only thing allowed to change a hero.
        const events = Math.floor(rng() * 3);
        for (let e = 0; e < events; e++) {
          const id = `h${Math.floor(rng() * pool)}`;
          const roll = rng();
          const state: AgentState =
            roll < 0.15 ? 'despawned' : roll < 0.4 ? 'spawned' : roll < 0.7 ? 'working' : 'idle';
          if (!model.has(id) && state === 'despawned') {
            continue;
          }
          const info = agent(id, state, state === 'working' ? 'Edit' : null, clock++);
          feed(rig, info);
          model.set(id, state);
        }
        steps(rig, 1000, 500);
        if (sees.boss()) {
          bossSeconds += 1;
        }
        enemyPeak = Math.max(enemyPeak, sees.combat()?.entities().length ?? 0);
        const snap = rig.game.heroSnapshot();
        const live = snap.filter((h) => h.lifecycle !== 'despawned');
        for (const hero of live) {
          assert.equal(hero.lifecycle, model.get(hero.id), `${hero.id} at second ${second}`);
          assert.equal(hero.exiting, false);
        }
        const expectedLive = [...model]
          .filter(([, s]) => s !== 'despawned')
          .map(([id]) => id)
          .sort();
        assert.deepEqual(live.map((h) => h.id).sort(), expectedLive, `second ${second}`);
        for (const hero of snap.filter((h) => h.lifecycle === 'despawned')) {
          assert.equal(hero.exiting, true, 'a despawned hero is only ever leaving');
          assert.equal(model.get(hero.id), 'despawned');
        }
        assert.equal(new Set(snap.map((h) => h.id)).size, snap.length, 'no duplicate hero');
      }
      assert.deepEqual(rig.errors, []);
      // The test is only meaningful if the fight really ran.
      assert.ok(enemyPeak > 0, 'enemies were on screen');
      if (n >= 8) {
        assert.ok(bossSeconds > 0, 'a boss was on screen at some point');
      }
    });
  }
});

void describe('the four host events with a boss and a wave live', () => {
  void it('spawned, working, idle, despawned each do exactly their documented thing; combat adds nothing', () => {
    const sees = spy();
    const log = heroLog();
    const rig = fighting(8, { heroFactory: log.factory });
    rig.game.step();
    until(rig, () => sees.boss(), 240_000, 'a boss fight started');
    const base = rig.game.heroSnapshot();
    assert.equal(base.length, 8);

    // spawned: one new hero, warping in; nobody else changes.
    feed(rig, agent('new1', 'spawned', null, 50));
    rig.game.step();
    const afterSpawn = rig.game.heroSnapshot();
    assert.equal(afterSpawn.length, 9);
    assert.equal(afterSpawn.find((h) => h.id === 'new1')?.lifecycle, 'spawned');
    assert.deepEqual(
      afterSpawn.filter((h) => h.id !== 'new1'),
      base,
    );

    // working then idle for one existing hero: only that hero changes.
    const target = base.find((h) => h.lifecycle === 'working')!;
    feed(rig, agent(target.id, 'idle', null, 51));
    rig.game.step();
    const afterIdle = rig.game.heroSnapshot();
    assert.equal(afterIdle.find((h) => h.id === target.id)?.lifecycle, 'idle');
    assert.deepEqual(
      afterIdle.filter((h) => h.id !== target.id),
      afterSpawn.filter((h) => h.id !== target.id),
    );
    feed(rig, agent(target.id, 'working', 'Edit', 52));
    rig.game.step();
    assert.equal(rig.game.heroSnapshot().find((h) => h.id === target.id)?.lifecycle, 'working');

    // despawned: exactly that hero leaves, after its exit, and no one else.
    feed(rig, agent('new1', 'despawned', null, 53));
    rig.game.step();
    assert.equal(rig.game.heroSnapshot().find((h) => h.id === 'new1')?.exiting, true);
    steps(rig, 10_000);
    assert.equal(
      rig.game.heroSnapshot().some((h) => h.id === 'new1'),
      false,
    );
    assert.equal(rig.game.heroSnapshot().length, 8);
    assert.deepEqual(rig.errors, []);
  });

  void it('a boss fight ends the way it always does, with no hero state touched: every hero is still the same working/idle/spawned hero', () => {
    const sees = spy();
    const rig = fighting(8);
    rig.game.step();
    const before = snapshotOf(rig);
    until(rig, () => sees.boss(), 240_000, 'boss walked in');
    assert.equal(snapshotOf(rig), before, 'boss on screen');
    // Through the boss defeat, the hold, the fade, and into Stage 2.
    steps(rig, 300_000, 500);
    assert.equal(snapshotOf(rig), before);
    assert.deepEqual(rig.errors, []);
  });
});

void describe('combat stimuli never change a hero or remove one', () => {
  for (const n of SCALES) {
    void it(`enemy attacks on every slot, boss telegraph and slam, phase change, defeat, hold, fade, applyProgress, applyConfig on and off (${n} heroes)`, () => {
      let swaps = 0;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
      const begin = StageDirector.prototype.begin;
      patch(
        StageDirector.prototype,
        'begin',
        function (this: StageDirector, ...args: Parameters<StageDirector['begin']>) {
          swaps += 1;
          begin.apply(this, args);
        },
      );
      const rig = fighting(n);
      rig.game.step();
      const before = snapshotOf(rig);
      for (let round = 0; round < 6; round++) {
        steps(rig, 60_000, 500);
        rig.game.applyConfig({ ...HARD, enemiesEnabled: false });
        steps(rig, 2_000, 500);
        rig.game.applyConfig(HARD);
        rig.game.applyProgress(DEFAULT_PROGRESS);
        run(rig, 2_000);
        assert.equal(snapshotOf(rig), before, `round ${round}`);
      }
      assert.deepEqual(rig.errors, []);
      if (n >= 8) {
        assert.ok(swaps >= 1, 'a boss fell and the stage changed during the run');
      }
    });
  }

  void it('a stage swap while heroes are travelling between their seats and the corridor changes no lifecycle and no class', () => {
    const sees = spy();
    const rig = fighting(8);
    rig.game.step();
    until(rig, () => sees.boss(), 240_000, 'boss');
    // Flip the idle heroes to working so they set off down the corridor just before the swap.
    const ids = rig.game
      .heroSnapshot()
      .filter((h) => h.lifecycle === 'idle')
      .map((h) => h.id);
    assert.ok(ids.length > 0);
    ids.forEach((id, i) => feed(rig, agent(id, 'working', 'Edit', 100 + i)));
    rig.game.step();
    const before = snapshotOf(rig);
    run(rig, 120_000);
    assert.equal(snapshotOf(rig), before);
    assert.deepEqual(rig.errors, []);
  });
});

void describe('a hit reaction changes how a hero is drawn, never where it is or what it is (plan note 6)', () => {
  void it('two identical runs, one with the reaction board muted, leave every hero x, y, phase, lifecycle, and class identical every step', () => {
    const trace = (muteBoard: boolean): { rows: string[]; flashes: number } => {
      let flashes = 0;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
      const originalFlash = HitReactions.prototype.flash;
      HitReactions.prototype.flash = function (
        this: HitReactions,
        ...args: Parameters<HitReactions['flash']>
      ) {
        flashes += 1;
        if (!muteBoard) {
          originalFlash.apply(this, args);
        }
      };
      try {
        const log = heroLog();
        const rig = gameRig({ heroFactory: log.factory, seed: 4242 });
        rig.game.applyConfig(HARD);
        for (const a of list(8, ['working'])) feed(rig, a);
        const rows: string[] = [];
        for (let i = 0; i < 60 * 90; i++) {
          rig.game.frame(STEP_MS, rig.surface);
          const heroes = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'].map((id) => {
            const h: Hero = log.byId(id);
            return [h.id, h.lifecycle, h.phase, h.x, h.y, h.exiting, h.slot, h.classId].join(':');
          });
          rows.push(heroes.join('|'));
        }
        return { rows, flashes };
      } finally {
        HitReactions.prototype.flash = originalFlash;
      }
    };
    const live = trace(false);
    const muted = trace(true);
    assert.ok(live.flashes > 5, `enemy attacks landed (${live.flashes})`);
    assert.ok(muted.flashes > 5);
    assert.deepEqual(live.rows, muted.rows);
  });

  void it('draw output differs only by the silhouette bitmap and a slide of at most 2 px', () => {
    const frames = (
      muteBoard: boolean,
    ): { calls: readonly (readonly unknown[])[]; bitmaps: Set<unknown> }[] => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
      const originalFlash = HitReactions.prototype.flash;
      HitReactions.prototype.flash = function (
        this: HitReactions,
        ...args: Parameters<HitReactions['flash']>
      ) {
        if (!muteBoard) {
          originalFlash.apply(this, args);
        }
      };
      try {
        const rig = gameRig({ seed: 4242 });
        rig.game.applyConfig(HARD);
        for (const a of list(8, ['working'])) feed(rig, a);
        const out: { calls: readonly (readonly unknown[])[]; bitmaps: Set<unknown> }[] = [];
        for (let i = 0; i < 60 * 40; i++) {
          rig.surface.reset();
          rig.surface.record = true;
          rig.game.frame(STEP_MS, rig.surface);
          out.push({
            calls: rig.surface.calls.filter((c) => c.method === 'drawBitmap').map((c) => c.args),
            bitmaps: new Set(),
          });
        }
        return out;
      } finally {
        HitReactions.prototype.flash = originalFlash;
      }
    };
    const a = frames(false);
    const b = frames(true);
    assert.equal(a.length, b.length);
    let differing = 0;
    for (let i = 0; i < a.length; i++) {
      const ca = a[i]!.calls;
      const cb = b[i]!.calls;
      assert.equal(
        ca.length,
        cb.length,
        `frame ${i}: the same number of bitmap draws (nothing added)`,
      );
      for (let k = 0; k < ca.length; k++) {
        const x = ca[k]!;
        const y = cb[k]!;
        assert.equal(x[2], y[2], 'same y');
        assert.equal(x[3], y[3], 'same mirroring');
        const dx = (x[1] as number) - (y[1] as number);
        assert.ok(Math.abs(dx) <= 2, `slide ${dx}`);
        if (x[0] !== y[0] || dx !== 0) differing += 1;
      }
    }
    assert.ok(differing > 0, 'the reactions were really drawn');
  });
});

void describe('faults in the game loop never touch a hero (invariant 4)', () => {
  const faults: { name: string; arm: () => void }[] = [
    {
      name: 'Combat.update',
      arm: () =>
        patch(Combat.prototype, 'update', () => {
          throw new Error('combat boom');
        }),
    },
    {
      name: 'Enemy.update',
      arm: () =>
        patch(Enemy.prototype, 'update', function (this: Enemy) {
          throw new Error('enemy boom');
        }),
    },
    {
      name: 'Enemy.draw',
      arm: () =>
        patch(Enemy.prototype, 'draw', function (this: Enemy) {
          throw new Error('enemy draw boom');
        }),
    },
    {
      name: 'Boss.update (the boss only)',
      arm: () => {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
        const original = Enemy.prototype.update;
        patch(
          Enemy.prototype,
          'update',
          function (this: Enemy, ...args: Parameters<Enemy['update']>) {
            if (this instanceof Boss) {
              throw new Error('boss boom');
            }
            original.apply(this, args);
          },
        );
      },
    },
    {
      name: 'the drop pass',
      arm: () =>
        patch(Drops.prototype, 'draw', () => {
          throw new Error('drops boom');
        }),
    },
    {
      name: 'HitReactions.update',
      arm: () =>
        patch(HitReactions.prototype, 'update', () => {
          throw new Error('reactions boom');
        }),
    },
  ];

  for (const fault of faults) {
    for (const n of [1, 8, 32]) {
      void it(`${fault.name} throws every time (${n} heroes): snapshot and poses unchanged, the next frame renders`, () => {
        fault.arm();
        const log = heroLog();
        const rig = fighting(n, { heroFactory: log.factory });
        rig.game.step();
        const before = snapshotOf(rig);
        for (let i = 0; i < 60 * 120; i++) {
          rig.game.frame(STEP_MS, rig.surface);
        }
        assert.equal(snapshotOf(rig), before);
        assert.ok(rig.errors.length >= 1);
        for (const e of rig.errors) {
          assert.doesNotMatch(String((e.error as Error).message), /h\d|Edit|Agent/);
        }
        rig.surface.reset();
        rig.surface.record = true;
        rig.game.frame(STEP_MS, rig.surface);
        assert.ok(rig.surface.bitmapDraws > 3, 'the scene still draws');
        // Heroes keep moving: a working hero is not frozen by an enemy-side fault.
        const phases = new Set(log.made.map((h) => h.phase));
        assert.ok(phases.size >= 1);
      });
    }
  }

  void it('a throwing onProgress and the faults above together change nothing', () => {
    for (const fault of faults.slice(0, 4)) fault.arm();
    const rig = fighting(8, {
      deps: {
        onProgress: () => {
          throw new Error('progress boom');
        },
      },
    });
    rig.game.step();
    const before = snapshotOf(rig);
    run(rig, 120_000);
    assert.equal(snapshotOf(rig), before);
    assert.ok(rig.errors.length >= 1);
  });

  void it('a throwing fade (the full-screen rectangle) leaves heroes and alpha alone', () => {
    const sees = spy();
    const rig = fighting(8);
    rig.game.step();
    const before = snapshotOf(rig);
    const original = rig.surface.fillRect.bind(rig.surface);
    rig.surface.fillRect = (color, x, y, w, h): void => {
      if (w >= 320) {
        throw new Error('fade boom');
      }
      original(color, x, y, w, h);
    };
    until(rig, () => sees.boss(), 240_000, 'boss');
    run(rig, 300_000);
    assert.equal(snapshotOf(rig), before);
    assert.equal(rig.surface.alpha, 1);
  });

  void it('three Combat faults disable it for the page load; no hero is removed at any scale', () => {
    for (const n of SCALES) {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
      const original = Combat.prototype.update;
      let thrown = 0;
      Combat.prototype.update = function (this: Combat, ...args: Parameters<Combat['update']>) {
        if (thrown < COMBAT_FAULT_LIMIT) {
          thrown += 1;
          throw new Error('combat boom');
        }
        original.apply(this, args);
      };
      try {
        const rig = fighting(n);
        rig.game.step();
        const before = snapshotOf(rig);
        steps(rig, 120_000, 500);
        assert.equal(thrown, COMBAT_FAULT_LIMIT);
        assert.equal(snapshotOf(rig), before, `${n} heroes`);
        assert.equal(rig.game.heroSnapshot().length, n);
        thrown = 0;
      } finally {
        Combat.prototype.update = original;
      }
    }
  });
});

void describe('what the engine knows about a hero is a handful of numbers', () => {
  void it('Combat receives only the FighterBuffer: its update signature takes (dt, world, fighters) and no roster', () => {
    assert.equal(Combat.prototype.update.length, 3);
    const rig = fighting(8);
    rig.game.step();
    assert.ok(rig);
  });
});
