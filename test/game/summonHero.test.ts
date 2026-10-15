// ClassHero summon support (H2 plan test notes 5 and 6, ADR 0011): the Necromancer's ability
// raises one cosmetic skeleton at a mirrored offset, the hero tends it only while fighting, and it
// disappears within 0.7 s of the hero leaving the fight for ANY reason, without the summon ever
// changing a hero's phase, lifecycle, or class. Driven hero by hero against a hand-built World.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { classFor } from '../../src/game/data/classMap';
import { CLASS_IDS, classDef } from '../../src/game/data/classes';
import type { ClassDef, ClassId } from '../../src/game/data/classes';
import { ABILITY_INTERVAL_MIN_MS, FAULT_LIMIT, STEP_MS } from '../../src/game/data/tuning';
import { ClassHero } from '../../src/game/entities/ClassHero';
import type { World } from '../../src/game/entities/Entity';
import type { HeroInit } from '../../src/game/entities/Hero';
import type { Summon } from '../../src/game/entities/Summon';
import { Roster } from '../../src/game/Roster';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { idsOfClass, info, lookFor, makeWorld, stepWorld } from '../support/classRig';
import type { ClassWorld } from '../support/classRig';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';
import { spyOnPools } from '../support/summonRig';
import type { PoolSpy } from '../support/summonRig';

const MAX_REMOVE_MS = 700;

class TestHero extends ClassHero {
  forcedFaceLeft = false;
  boom = false;
  override get faceRight(): boolean {
    return this.forcedFaceLeft ? false : super.faceRight;
  }
  override update(dtMs: number, world: World): void {
    if (this.boom) {
      throw new Error('hero update fault');
    }
    super.update(dtMs, world);
  }
}

interface Rig {
  readonly w: ClassWorld;
  readonly hero: TestHero;
  readonly id: string;
  t: number;
  advance(ms: number): void;
  /** Runs until `done()` or `limitMs` passes; returns the ms it took. */
  until(done: () => boolean, limitMs: number): number;
}

function rig(
  classId: ClassId,
  options: { def?: ClassDef; slot?: number; prefix?: string } = {},
): Rig {
  const w = makeWorld();
  const id = idsOfClass(classId, 1, options.prefix ?? 's-')[0] ?? 'x';
  const hero = new TestHero(
    {
      info: info(id, 'working'),
      slot: options.slot ?? 0,
      instant: true,
      look: { ...lookFor(id), classId },
    },
    options.def ?? classDef(classId),
  );
  const r: Rig = {
    w,
    hero,
    id,
    t: 0,
    advance(ms: number): void {
      const n = Math.round(ms / STEP_MS);
      for (let i = 0; i < n; i++) {
        hero.update(STEP_MS, w.world);
        stepWorld(w);
        r.t += STEP_MS;
      }
    },
    until(done: () => boolean, limitMs: number): number {
      let spent = 0;
      while (!done() && spent < limitMs) {
        r.advance(STEP_MS);
        spent += STEP_MS;
      }
      return spent;
    },
  };
  return r;
}

const only = (r: Rig): Summon => {
  const s = r.w.summons.entities()[0];
  assert.ok(s, 'a summon is live');
  return s;
};

/** Fights until the first summon exists; returns the time spent attacking and casting. */
function untilSummoned(r: Rig): number {
  r.w.engagement.engaged = true;
  const spent = r.until(() => r.w.summons.count > 0, 40_000);
  assert.equal(r.w.summons.count, 1, 'the ability raised a summon');
  return spent;
}

let spy: PoolSpy | null = null;
afterEach(() => {
  spy?.restore();
  spy = null;
});

void describe('the Necromancer raises one skeleton with its ability', () => {
  void it('no summon before the first ability, which is not earlier than ABILITY_INTERVAL_MIN_MS of attack time', () => {
    const r = rig('necromancer');
    r.w.engagement.engaged = true;
    let attackMs = 0;
    let firstCastAttackMs = -1;
    for (let i = 0; i < 40_000 / STEP_MS && firstCastAttackMs < 0; i++) {
      if (r.hero.phase === 'attack') {
        attackMs += STEP_MS;
      }
      assert.equal(r.w.summons.count, 0, 'no summon before the ability');
      r.advance(STEP_MS);
      if (r.w.summons.count > 0) {
        firstCastAttackMs = attackMs;
      }
    }
    assert.ok(firstCastAttackMs >= ABILITY_INTERVAL_MIN_MS - STEP_MS, `${firstCastAttackMs} ms`);
    assert.equal(r.w.summons.count, 1);
  });

  void it('puts the skeleton at the floored foot pixel plus (18, 1), rising', () => {
    const r = rig('necromancer');
    untilSummoned(r);
    const s = only(r);
    assert.equal(s.kind, 'skeleton');
    assert.equal(s.phase, 'rise');
    assert.equal(s.x, Math.floor(r.hero.x) + 18);
    assert.equal(s.sortY, Math.floor(r.hero.y) + 1);
    assert.ok(s.sortY > r.hero.sortY, 'sorted in front of its owner');
    assert.equal(s.slot, 0);
  });

  void it('mirrors the offset when the hero faces left', () => {
    const r = rig('necromancer');
    r.hero.forcedFaceLeft = true;
    untilSummoned(r);
    const s = only(r);
    assert.equal(s.x, Math.floor(r.hero.x) - 18);
    assert.equal(s.sortY, Math.floor(r.hero.y) + 1);
  });

  void it('stays one skeleton through every later ability (a renewal, not a second summon)', () => {
    const r = rig('necromancer');
    untilSummoned(r);
    for (let i = 0; i < 120_000 / STEP_MS; i++) {
      r.advance(STEP_MS);
      assert.ok(r.w.summons.count <= 1);
    }
    assert.equal(r.w.summons.count, 1);
    assert.equal(only(r).phase, 'active');
  });

  void it('attack and ability poses are attack; advance is walk', () => {
    const r = rig('necromancer');
    untilSummoned(r);
    const poses = new Map<string, Set<string>>();
    for (let i = 0; i < 20_000 / STEP_MS; i++) {
      r.advance(STEP_MS);
      const s = r.w.summons.entities()[0];
      if (s !== undefined) {
        const set = poses.get(r.hero.phase) ?? new Set<string>();
        set.add(s.pose);
        poses.set(r.hero.phase, set);
      }
    }
    assert.deepEqual([...(poses.get('attack') ?? [])], ['attack']);
    assert.ok(poses.has('attack'), [...poses.keys()].join());
    if (poses.has('ability')) {
      assert.deepEqual([...(poses.get('ability') ?? [])], ['attack']);
    }
  });

  void it('advance gives pose walk (a skeleton raised for the slot while the hero walks the corridor)', () => {
    const r = rig('necromancer');
    r.w.engagement.engaged = true;
    r.until(() => r.hero.phase === 'advance', 20_000);
    assert.equal(r.hero.phase, 'advance');
    r.w.summons.raise(0, 'skeleton', 10, 100, true);
    r.advance(STEP_MS * 2);
    assert.equal(only(r).pose, 'walk');
    r.until(() => r.hero.phase === 'attack', 20_000);
    assert.equal(r.hero.phase, 'attack');
    r.advance(STEP_MS * 2);
    assert.equal(only(r).pose, 'attack');
  });

  void it('a hero that is working but not engaged walks (advance), and the skeleton follows with pose walk', () => {
    const r = rig('necromancer');
    untilSummoned(r);
    r.w.engagement.engaged = false;
    r.advance(1000);
    assert.equal(r.hero.phase, 'advance');
    assert.equal(r.w.summons.count, 1);
    assert.equal(only(r).pose, 'walk');
    assert.equal(r.hero.lifecycle, 'working');
  });
});

void describe('the summon disappears within 0.7 s once the hero stops fighting', () => {
  void it('working to idle: travel starts, the lease runs out, the skeleton sinks and is freed', () => {
    const r = rig('necromancer');
    untilSummoned(r);
    r.advance(2000);
    assert.equal(only(r).phase, 'active');
    r.hero.applyAgentState(agent(r.id, 'idle', null, 2));
    assert.equal(r.hero.lifecycle, 'idle');
    const took = r.until(() => r.w.summons.count === 0, 3_000);
    assert.ok(took <= MAX_REMOVE_MS, `${took} ms`);
    assert.equal(r.hero.lifecycle, 'idle', 'the summon leaving changes nothing about the hero');
    assert.notEqual(r.hero.phase, 'attack');
  });

  void it('despawned: the skeleton is gone before the hero finishes its victory and warp-out', () => {
    const r = rig('necromancer');
    untilSummoned(r);
    r.advance(1000);
    r.hero.applyAgentState(agent(r.id, 'despawned', null, 2));
    assert.equal(r.hero.lifecycle, 'despawned');
    const took = r.until(() => r.w.summons.count === 0, 3_000);
    assert.ok(took <= MAX_REMOVE_MS, `${took} ms`);
    assert.equal(r.hero.exiting, true);
    assert.equal(r.hero.lifecycle, 'despawned');
  });

  void it('while the sink plays the skeleton is in phase sink and the hero is already out of the fight', () => {
    const r = rig('necromancer');
    untilSummoned(r);
    r.advance(1000);
    r.hero.applyAgentState(agent(r.id, 'idle', null, 2));
    let sawSink = false;
    for (let i = 0; i < 1000 / STEP_MS && r.w.summons.count > 0; i++) {
      r.advance(STEP_MS);
      if (r.w.summons.entities()[0]?.phase === 'sink') {
        sawSink = true;
        assert.ok(!['attack', 'ability', 'advance'].includes(r.hero.phase), r.hero.phase);
      }
    }
    assert.ok(sawSink);
  });

  void it('a frozen (quarantined) Necromancer loses its skeleton within 0.7 s', () => {
    // Drive through Roster so the real guard and quarantine path are used.
    const w = makeWorld();
    const id = idsOfClass('necromancer', 1, 'fz-')[0] ?? 'x';
    let hero: TestHero | null = null;
    const roster = new Roster(
      (init: HeroInit) => {
        hero = new TestHero(init, classDef('necromancer'));
        return hero;
      },
      () => undefined,
    );
    roster.apply(agent(id, 'working'), w.world);
    w.engagement.engaged = true;
    const tick = (): void => {
      roster.update(STEP_MS, w.world);
      stepWorld(w);
    };
    for (let i = 0; i < 40_000 / STEP_MS && w.summons.count === 0; i++) {
      tick();
    }
    assert.equal(w.summons.count, 1);
    assert.ok(hero);
    const h = hero as TestHero;
    h.boom = true;
    let frozenAt = -1;
    for (let i = 0; i < 20_000 / STEP_MS && frozenAt < 0; i++) {
      tick();
      if (h.frozen) {
        frozenAt = i;
      }
    }
    assert.ok(frozenAt >= 0, 'three consecutive update faults froze the hero');
    assert.ok(FAULT_LIMIT === 3);
    let took = 0;
    while (w.summons.count > 0 && took < 2_000) {
      tick();
      took += STEP_MS;
    }
    assert.ok(took <= MAX_REMOVE_MS, `${took} ms after the freeze`);
    assert.equal(h.lifecycle, 'working', 'a frozen hero keeps the lifecycle the host set');
    assert.ok(!h.exiting);
  });
});

void describe('summon: null never touches the pool', () => {
  for (const classId of CLASS_IDS.filter((c) => classDef(c).summon === null)) {
    void it(`${classId} fights and casts for 60 s without a raise or renew call`, () => {
      spy = spyOnPools();
      const r = rig(classId);
      r.w.engagement.engaged = true;
      r.advance(60_000);
      assert.equal(r.hero.phase === 'attack' || r.hero.phase === 'ability', true);
      assert.deepEqual(spy.calls, { raise: 0, renew: 0 });
      assert.equal(r.w.summons.count, 0);
    });
  }

  void it('a Necromancer row with summon replaced by null never touches the pool either', () => {
    spy = spyOnPools();
    const base = classDef('necromancer');
    const r = rig('necromancer', { def: { ...base, summon: null } });
    r.w.engagement.engaged = true;
    r.advance(60_000);
    assert.deepEqual(spy.calls, { raise: 0, renew: 0 });
  });

  void it('a Necromancer renews only while fighting (calls happen, but only for its own slot)', () => {
    spy = spyOnPools();
    const r = rig('necromancer', { slot: 5 });
    untilSummoned(r);
    r.advance(5000);
    assert.ok(spy.calls.raise >= 1 && spy.calls.renew > 100);
    assert.ok(spy.raises.every((s) => s === 5));
    assert.ok(spy.renews.every((s) => s === 5));
  });
});

void describe('the summon never changes the hero', () => {
  /** A per-step trace of everything observable about the hero. */
  function trace(summonOn: boolean, seed = 7): string[] {
    const w = makeWorld(SHIPPED_ART, seed);
    const id = idsOfClass('necromancer', 1, 'tr-')[0] ?? 'x';
    const base = classDef('necromancer');
    const hero = new TestHero(
      {
        info: info(id, 'working'),
        slot: 0,
        instant: true,
        look: { ...lookFor(id), classId: 'necromancer' },
      },
      summonOn ? base : { ...base, summon: null },
    );
    const out: string[] = [];
    let engaged = false;
    for (let i = 0; i < 180_000 / STEP_MS; i++) {
      if (i % (30_000 / STEP_MS) === 0) {
        engaged = !engaged;
        w.engagement.engaged = engaged;
        hero.applyAgentState(info(id, engaged ? 'working' : 'idle', i + 2));
      }
      hero.update(STEP_MS, w.world);
      stepWorld(w);
      out.push(
        [
          hero.phase,
          hero.lifecycle,
          hero.classId,
          hero.x,
          hero.y,
          hero.faceRight,
          hero.exiting,
        ].join('|'),
      );
    }
    return out;
  }

  void it('phase, lifecycle, classId, position, and facing are identical with the summon system on and off', () => {
    const on = trace(true);
    const off = trace(false);
    assert.equal(on.length, off.length);
    for (let i = 0; i < on.length; i++) {
      assert.equal(on[i], off[i], `step ${i}`);
    }
    assert.ok(
      on.some((l) => l.startsWith('ability|')),
      'the run really cast',
    );
  });

  void it('Game.heroSnapshot is identical with and without a summon', () => {
    const makeFactory = (summonOn: boolean) =>
      heroLog((init) => {
        const id = classFor(init.info.id);
        const def = classDef(id);
        return new ClassHero(
          { ...init, look: { ...init.look, classId: id } },
          summonOn ? def : { ...def, summon: null },
        );
      });
    const ids = CLASS_IDS.flatMap((c) => idsOfClass(c, 1, 'gs-'));
    const snapshots: string[][] = [[], []];
    const pools: PoolSpy[] = [];
    [true, false].forEach((on, k) => {
      const spyHere = spyOnPools();
      pools.push(spyHere);
      const log = makeFactory(on);
      const g = gameRig({ heroFactory: log.factory });
      for (const id of ids) {
        feed(g, agent(id, 'working'));
      }
      for (let m = 0; m < 6; m++) {
        run(g, 20_000);
        snapshots[k]?.push(JSON.stringify(g.game.heroSnapshot()));
      }
      for (const id of ids) {
        feed(g, agent(id, 'idle', null, 5));
      }
      run(g, 20_000);
      snapshots[k]?.push(JSON.stringify(g.game.heroSnapshot()));
      spyHere.restore();
    });
    assert.deepEqual(snapshots[0], snapshots[1]);
    assert.ok((pools[0]?.calls.raise ?? 0) > 0, 'summons really were raised in the "on" run');
    assert.equal(pools[1]?.calls.raise, 0);
  });
});

void describe('replacement and slot reuse', () => {
  void it('replacing an exiting Necromancer for the same id leaves at most one skeleton', () => {
    spy = spyOnPools();
    const log = heroLog((init) => {
      return new ClassHero(
        { ...init, look: { ...init.look, classId: 'necromancer' } },
        classDef('necromancer'),
      );
    });
    const g = gameRig({ heroFactory: log.factory });
    const id = idsOfClass('necromancer', 1, 'rp-')[0] ?? 'x';
    feed(g, agent(id, 'working'));
    run(g, 40_000);
    const pool = spy.pools[0];
    assert.ok(pool);
    assert.equal(pool.count, 1);
    feed(g, agent(id, 'despawned', null, 2));
    run(g, 200);
    feed(g, agent(id, 'spawned', null, 3));
    feed(g, agent(id, 'working', null, 4));
    for (let i = 0; i < 40_000 / STEP_MS; i++) {
      g.game.frame(STEP_MS, g.surface);
      assert.ok(pool.count <= 1, `${pool.count} summons at step ${i}`);
    }
    assert.equal(g.game.heroSnapshot().length, 1);
    assert.equal(g.game.heroSnapshot()[0]?.lifecycle, 'working');
  });

  void it('a non-summoner hero on a reused slot never renews the pool entry', () => {
    spy = spyOnPools();
    const g = gameRig({
      heroFactory: (init) => {
        const id = init.info.id.startsWith('nn-') ? 'necromancer' : 'mage';
        return new ClassHero({ ...init, look: { ...init.look, classId: id } }, classDef(id));
      },
    });
    feed(g, agent('nn-1', 'working'));
    run(g, 40_000);
    const pool = spy.pools[0];
    assert.equal(pool?.count, 1);
    feed(g, agent('nn-1', 'despawned', null, 2));
    run(g, 3_000);
    assert.equal(g.game.heroSnapshot().length, 0, 'the Necromancer is gone');
    feed(g, agent('mm-1', 'working', null, 3));
    const renewsBefore = spy.calls.renew;
    run(g, 60_000);
    assert.equal(spy.calls.renew, renewsBefore, 'the mage never renews');
    assert.equal(pool?.count, 0, 'the old skeleton is gone');
  });

  void it('a Game fed a snapshot rebuilds the heroes with no skeleton until the next ability', () => {
    spy = spyOnPools();
    const g = gameRig();
    const id = idsOfClass('necromancer', 1, 'sn-')[0] ?? 'x';
    g.game.enqueueSnapshot([agent(id, 'working')]);
    run(g, 1000);
    assert.equal(spy.pools[0]?.count ?? 0, 0);
    steps(g, 40_000);
    assert.equal(spy.pools[0]?.count, 1);
    g.game.enqueueSnapshot([agent(id, 'working')]);
    run(g, 100);
    assert.equal(g.game.heroSnapshot()[0]?.classId, 'necromancer');
  });
});
