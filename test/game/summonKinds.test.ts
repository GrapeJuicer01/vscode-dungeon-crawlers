// H3 summon kinds (H3 plan test notes 4, 5, 6, ADR 0011): the kind-aware pool, the per-kind shadow
// width, owner binding for the skeleton, the beast, and the turret, and capacity with three
// summoner classes. The pool is keyed by a plain slot integer; a slot reused by a hero of another
// class never keeps (or renews) the previous kind.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SUMMON_RISE_TOTAL_MS, SUMMON_SINK_TOTAL_MS } from '../../src/game/data/animations';
import { CLASS_IDS, classDef } from '../../src/game/data/classes';
import type { ClassDef, ClassId } from '../../src/game/data/classes';
import { SUMMON_IDS } from '../../src/game/data/summons';
import type { SummonId } from '../../src/game/data/summons';
import {
  ABILITY_INTERVAL_MIN_MS,
  STEP_MS,
  SUMMON_CAPACITY,
  SUMMON_LEASE_MS,
  SUMMON_SHADOW_PX,
} from '../../src/game/data/tuning';
import { ClassHero } from '../../src/game/entities/ClassHero';
import { Summon } from '../../src/game/entities/Summon';
import { SummonPool } from '../../src/game/Summons';
import { agent, feed, gameRig, steps } from '../support/engineFakes';
import { idsOfClass, info, lookFor, makeWorld, mixedIds, stepWorld } from '../support/classRig';
import type { ClassWorld } from '../support/classRig';
import { spyOnPools } from '../support/summonRig';
import type { PoolSpy } from '../support/summonRig';

const SUMMONERS: readonly (readonly [ClassId, SummonId])[] = [
  ['necromancer', 'skeleton'],
  ['druid', 'beast'],
  ['artificer', 'turret'],
];
const MAX_REMOVE_MS = 700;
const { world } = makeWorld();

let spy: PoolSpy | null = null;
afterEach(() => {
  spy?.restore();
  spy = null;
});

function advance(pool: SummonPool, ms: number, each?: () => void): void {
  for (let t = 0; t < ms; t += STEP_MS) {
    each?.();
    pool.update(STEP_MS, world);
  }
}

void describe('the pool is kind-aware', () => {
  void it('SUMMON_IDS is skeleton, beast, turret and every kind is owned by exactly one class', () => {
    assert.deepEqual([...SUMMON_IDS], ['skeleton', 'beast', 'turret']);
    for (const kind of SUMMON_IDS) {
      const owners = CLASS_IDS.filter((c) => classDef(c).summon?.kind === kind);
      assert.equal(owners.length, 1, kind);
    }
  });

  void it('mixed kinds live side by side, one per slot', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 40, 100, true);
    pool.raise(1, 'beast', 80, 100, true);
    pool.raise(2, 'turret', 120, 100, true);
    assert.deepEqual(
      pool.entities().map((s) => [s.slot, s.kind]),
      [
        [0, 'skeleton'],
        [1, 'beast'],
        [2, 'turret'],
      ],
    );
  });

  void it('raise with a different kind for a live slot restarts it as the new kind (rise and active)', () => {
    for (const settleMs of [0, SUMMON_RISE_TOTAL_MS + 100]) {
      const pool = new SummonPool(SUMMON_CAPACITY);
      pool.raise(3, 'skeleton', 40, 100, true);
      advance(pool, settleMs, () => pool.renew(3, 'skeleton', 40, 100, true, 'attack'));
      pool.raise(3, 'beast', 90, 110, false);
      assert.equal(pool.count, 1, 'still one summon for the slot');
      const s = pool.entities()[0];
      assert.equal(s?.kind, 'beast');
      assert.equal(s?.phase, 'rise', 'restarted from the beginning');
      assert.equal(s?.x, 90);
      assert.equal(s?.sortY, 110);
      assert.equal(s?.shadowWidth, SUMMON_SHADOW_PX.beast);
    }
  });

  void it('raise with the same kind in rise or active is still a no-op; after a sink it restarts', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'turret', 40, 100, true);
    pool.raise(0, 'turret', 99, 120, false);
    assert.equal(pool.entities()[0]?.x, 40, 'rising: left alone');
    advance(pool, SUMMON_RISE_TOTAL_MS + 60, () =>
      pool.renew(0, 'turret', 40, 100, true, 'attack'),
    );
    assert.equal(pool.entities()[0]?.phase, 'active');
    pool.raise(0, 'turret', 99, 120, false);
    assert.equal(pool.entities()[0]?.x, 40, 'active: left alone');
    assert.equal(pool.entities()[0]?.phase, 'active');
    advance(pool, SUMMON_LEASE_MS + 40);
    assert.equal(pool.entities()[0]?.phase, 'sink');
    pool.raise(0, 'turret', 70, 100, true);
    assert.equal(pool.entities()[0]?.phase, 'rise', 'a sink plus raise restarts');
    assert.equal(pool.entities()[0]?.x, 70);
  });

  void it('renew with a mismatched kind does nothing: no placement, no lease, the old summon sinks and goes', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'skeleton', 40, 100, true);
    pool.renew(0, 'beast', 77, 133, false, 'walk');
    const s = pool.entities()[0];
    assert.equal(s?.x, 40, 'not moved');
    assert.equal(s?.sortY, 100);
    assert.equal(s?.pose, 'attack', 'pose untouched');
    let gone = -1;
    for (let t = 0; t < 3000 && gone < 0; t += STEP_MS) {
      pool.renew(0, 'beast', 77, 133, false, 'walk');
      pool.update(STEP_MS, world);
      if (pool.count === 0) gone = t;
    }
    assert.ok(gone >= 0, 'the unrenewed summon was removed');
    assert.ok(gone <= SUMMON_LEASE_MS + SUMMON_SINK_TOTAL_MS + 2 * STEP_MS, `${gone} ms`);
  });

  void it('renew with the right kind after a mismatched one still works while the lease lasts', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'beast', 40, 100, true);
    pool.renew(0, 'turret', 5, 5, true, 'walk');
    pool.renew(0, 'beast', 55, 105, false, 'walk');
    assert.equal(pool.entities()[0]?.x, 55);
    assert.equal(pool.entities()[0]?.pose, 'walk');
  });

  void it('NaN numbers and unknown kinds are ignored, for raise and renew', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    pool.raise(0, 'dragon' as never, 10, 10, true);
    pool.raise(0, '' as never, 10, 10, true);
    pool.raise(0, 'beast', NaN, 10, true);
    pool.raise(NaN, 'beast', 10, 10, true);
    pool.raise(0, 'beast', 10, Infinity, true);
    assert.equal(pool.count, 0);
    pool.raise(0, 'beast', 10, 10, true);
    pool.renew(0, 'dragon' as never, 99, 99, true, 'walk');
    pool.renew(NaN, 'beast', 99, 99, true, 'walk');
    pool.renew(0, 'beast', NaN, 99, true, 'walk');
    assert.equal(pool.entities()[0]?.x, 10);
    assert.equal(pool.count, 1);
  });

  void it('a full pool drops a raise of any kind silently, and a kind change of a live slot still works', () => {
    const pool = new SummonPool(SUMMON_CAPACITY);
    for (let slot = 0; slot < SUMMON_CAPACITY; slot++) {
      pool.raise(slot, SUMMON_IDS[slot % 3] ?? 'skeleton', slot * 10, 100, true);
    }
    for (const kind of SUMMON_IDS) {
      assert.doesNotThrow(() => pool.raise(50, kind, 1, 1, true));
    }
    assert.equal(pool.count, SUMMON_CAPACITY);
    assert.ok(!pool.entities().some((s) => s.slot === 50));
    pool.raise(0, 'turret', 5, 100, true);
    assert.equal(pool.count, SUMMON_CAPACITY);
    assert.equal(pool.entities().find((s) => s.slot === 0)?.kind, 'turret');
  });

  void it('an idle (never raised) Summon has the skeleton shadow width; each kind has its own', () => {
    assert.equal(new Summon().shadowWidth, SUMMON_SHADOW_PX.skeleton);
    const pool = new SummonPool(SUMMON_CAPACITY);
    for (const [slot, kind] of SUMMON_IDS.entries()) {
      pool.raise(slot, kind, 10 * slot, 100, true);
    }
    assert.deepEqual(
      pool.entities().map((s) => s.shadowWidth),
      [8, 12, 10],
    );
  });
});

// ---- owner binding, parametrized over the three summoner classes ----

class TestHero extends ClassHero {
  forcedFaceLeft = false;
  override get faceRight(): boolean {
    return this.forcedFaceLeft ? false : super.faceRight;
  }
}

interface Rig {
  readonly w: ClassWorld;
  readonly hero: TestHero;
  readonly id: string;
  advance(ms: number): void;
  until(done: () => boolean, limitMs: number): number;
}

function rig(
  classId: ClassId,
  w: ClassWorld = makeWorld(),
  slot = 0,
  prefix = 'k-',
  def?: ClassDef,
): Rig {
  const id = idsOfClass(classId, 1, prefix)[0] ?? 'x';
  const hero = new TestHero(
    { info: info(id, 'working'), slot, instant: true, look: { ...lookFor(id), classId } },
    def ?? classDef(classId),
  );
  const r: Rig = {
    w,
    hero,
    id,
    advance(ms: number): void {
      for (let i = 0; i < Math.round(ms / STEP_MS); i++) {
        hero.update(STEP_MS, w.world);
        stepWorld(w);
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

function untilSummoned(r: Rig): void {
  r.w.engagement.engaged = true;
  r.until(() => r.w.summons.count > 0, 40_000);
  assert.equal(r.w.summons.count, 1, 'the ability raised a summon');
}

for (const [classId, kind] of SUMMONERS) {
  const summon = classDef(classId).summon;
  const dx = summon?.dx ?? 0;
  const dy = summon?.dy ?? 0;

  void describe(`owner binding: ${classId} and its ${kind}`, () => {
    void it('no summon before the first ability, which comes after at least ABILITY_INTERVAL_MIN_MS of attack time', () => {
      const r = rig(classId);
      r.w.engagement.engaged = true;
      let attackMs = 0;
      let firstCast = -1;
      for (let i = 0; i < 40_000 / STEP_MS && firstCast < 0; i++) {
        if (r.hero.phase === 'attack') attackMs += STEP_MS;
        assert.equal(r.w.summons.count, 0);
        r.advance(STEP_MS);
        if (r.w.summons.count > 0) firstCast = attackMs;
      }
      assert.ok(firstCast >= ABILITY_INTERVAL_MIN_MS - STEP_MS, `${firstCast} ms`);
    });

    void it(`raises one ${kind} at the floored foot pixel plus (${dx}, ${dy}), rising, sorted in front of its owner`, () => {
      const r = rig(classId);
      untilSummoned(r);
      const s = r.w.summons.entities()[0];
      assert.equal(s?.kind, kind);
      assert.equal(s?.phase, 'rise');
      assert.equal(s?.x, Math.floor(r.hero.x) + dx);
      assert.equal(s?.sortY, Math.floor(r.hero.y) + dy);
      assert.equal(s?.slot, 0);
      assert.ok((s?.sortY ?? 0) > r.hero.sortY);
    });

    void it('mirrors the offset when the hero faces left', () => {
      const r = rig(classId);
      r.hero.forcedFaceLeft = true;
      untilSummoned(r);
      const s = r.w.summons.entities()[0];
      assert.equal(s?.x, Math.floor(r.hero.x) - dx);
    });

    void it('stays one summon of the right kind through later abilities; attack and ability give pose attack', () => {
      const r = rig(classId);
      untilSummoned(r);
      const poses = new Set<string>();
      for (let i = 0; i < 60_000 / STEP_MS; i++) {
        r.advance(STEP_MS);
        assert.ok(r.w.summons.count <= 1);
        const s = r.w.summons.entities()[0];
        if (s !== undefined && (r.hero.phase === 'attack' || r.hero.phase === 'ability')) {
          poses.add(s.pose);
          assert.equal(s.kind, kind);
        }
      }
      assert.deepEqual([...poses], ['attack']);
    });

    void it('a working but unengaged hero walks and the summon follows with pose walk', () => {
      const r = rig(classId);
      untilSummoned(r);
      r.w.engagement.engaged = false;
      r.advance(1000);
      assert.equal(r.hero.phase, 'advance');
      assert.equal(r.w.summons.entities()[0]?.pose, 'walk');
      assert.equal(r.hero.lifecycle, 'working');
    });

    void it('working to idle removes it within 0.7 s and changes nothing about the hero', () => {
      const r = rig(classId);
      untilSummoned(r);
      r.advance(2000);
      r.hero.applyAgentState(agent(r.id, 'idle', null, 2));
      const took = r.until(() => r.w.summons.count === 0, 3_000);
      assert.ok(took <= MAX_REMOVE_MS, `${took} ms`);
      assert.equal(r.hero.lifecycle, 'idle');
    });

    void it('despawned removes it within 0.7 s, while the hero is still exiting', () => {
      const r = rig(classId);
      untilSummoned(r);
      r.advance(1000);
      r.hero.applyAgentState(agent(r.id, 'despawned', null, 2));
      const took = r.until(() => r.w.summons.count === 0, 3_000);
      assert.ok(took <= MAX_REMOVE_MS, `${took} ms`);
      assert.equal(r.hero.exiting, true);
      assert.equal(r.hero.lifecycle, 'despawned');
    });

    void it('hero phase, lifecycle, class, position, and facing are identical with summons on and off', () => {
      const trace = (on: boolean): string[] => {
        const def = classDef(classId);
        const r = rig(
          classId,
          makeWorld(undefined, 9),
          0,
          'tr-',
          on ? def : { ...def, summon: null },
        );
        const out: string[] = [];
        let engaged = false;
        for (let i = 0; i < 120_000 / STEP_MS; i++) {
          if (i % (20_000 / STEP_MS) === 0) {
            engaged = !engaged;
            r.w.engagement.engaged = engaged;
            r.hero.applyAgentState(info(r.id, engaged ? 'working' : 'idle', i + 2));
          }
          r.advance(STEP_MS);
          out.push(
            [
              r.hero.phase,
              r.hero.lifecycle,
              r.hero.classId,
              r.hero.x,
              r.hero.y,
              r.hero.faceRight,
            ].join('|'),
          );
        }
        return out;
      };
      const on = trace(true);
      const off = trace(false);
      assert.deepEqual(on, off);
      assert.ok(on.some((l) => l.startsWith('ability|')));
    });
  });
}

void describe('Monk and Berserker never touch the pool', () => {
  for (const classId of ['monk', 'berserker'] as const) {
    void it(`${classId} fights for 60 s with no raise and no renew`, () => {
      spy = spyOnPools();
      const r = rig(classId);
      r.w.engagement.engaged = true;
      r.advance(60_000);
      assert.deepEqual(spy.calls, { raise: 0, renew: 0 });
      assert.equal(r.w.summons.count, 0);
    });
  }
});

void describe('a reused slot with a different class never keeps the previous kind', () => {
  for (const [from, fromKind] of SUMMONERS) {
    for (const [to, toKind] of SUMMONERS) {
      if (from === to) continue;
      void it(`${from} (${fromKind}) replaced by ${to} (${toKind}) on slot 0`, () => {
        const w = makeWorld();
        w.engagement.engaged = true;
        const first = rig(from, w, 0, 'ra-');
        first.until(() => w.summons.count > 0, 40_000);
        assert.equal(w.summons.entities()[0]?.kind, fromKind);
        // The first hero leaves; the second takes slot 0 inside the lease window.
        const second = rig(to, w, 0, 'rb-');
        const seen = new Set<string>();
        let removedAt = -1;
        let t = 0;
        for (; t < 40_000 && !(removedAt >= 0 && w.summons.count > 0); t += STEP_MS) {
          second.advance(STEP_MS);
          for (const s of w.summons.entities()) {
            if (s.kind !== null) seen.add(s.kind);
            if (s.kind === fromKind) {
              // The old kind is only ever sinking out, never renewed in place by the new owner.
              assert.ok(
                s.phase === 'sink' || t < SUMMON_LEASE_MS + STEP_MS,
                `${fromKind} still ${s.phase} at ${t} ms`,
              );
            }
          }
          if (removedAt < 0 && !w.summons.entities().some((s) => s.kind === fromKind)) {
            removedAt = t;
          }
        }
        assert.ok(
          removedAt >= 0 && removedAt <= SUMMON_LEASE_MS + SUMMON_SINK_TOTAL_MS + 3 * STEP_MS,
          `${removedAt} ms`,
        );
        assert.equal(w.summons.entities().length, 1);
        assert.equal(w.summons.entities()[0]?.kind, toKind, 'the new owner got its own kind');
      });
    }
  }

  void it('a raise by the new owner while the old kind is still active restarts it as the new kind', () => {
    const w = makeWorld();
    w.engagement.engaged = true;
    const first = rig('druid', w, 0, 'rc-');
    first.until(() => w.summons.count > 0, 40_000);
    first.advance(1000);
    assert.equal(w.summons.entities()[0]?.phase, 'active');
    const second = rig('artificer', w, 0, 'rd-');
    second.until(() => w.summons.entities()[0]?.kind === 'turret', 40_000);
    assert.equal(w.summons.entities()[0]?.kind, 'turret');
    assert.equal(w.summons.count, 1);
  });
});

void describe('capacity with three summoner classes', () => {
  /** A Game whose heroes are `n` ids drawn round-robin from the summoners plus a few others. */
  function summonerParty(n: number): string[] {
    const ids: string[] = [];
    const pools = SUMMONERS.map(([c]) => idsOfClass(c, Math.ceil(n / 3), 'sp-'));
    const others = mixedIds(Math.max(1, Math.floor(n / 8)), 'so-');
    for (let i = 0; i < n; i++) {
      ids.push(i % 8 === 7 ? (others[(i / 8) | 0] ?? 'x') : (pools[i % 3]?.[(i / 3) | 0] ?? 'x'));
    }
    return [...new Set(ids)];
  }

  for (const n of [8, 32, 64]) {
    void it(`${n} heroes, mostly summoners: the live count never exceeds ${SUMMON_CAPACITY}, nothing throws, nothing is reported`, () => {
      spy = spyOnPools();
      const g = gameRig();
      const ids = summonerParty(n);
      for (const id of ids) feed(g, agent(id, 'working'));
      let worst = 0;
      for (let i = 0; i < 90_000 / STEP_MS; i++) {
        g.game.frame(STEP_MS, g.surface);
        worst = Math.max(worst, spy.pools[0]?.count ?? 0);
        assert.ok((spy.pools[0]?.count ?? 0) <= SUMMON_CAPACITY);
      }
      assert.deepEqual(g.errors, []);
      assert.ok(worst >= 1, 'summons really were raised');
      if (n >= 32) assert.equal(worst, SUMMON_CAPACITY, 'the pool filled up');
    });
  }

  void it('64 summoner-heavy heroes: dropped raises leave heroSnapshot identical to a run with summons off', () => {
    const run = (summonsOn: boolean): string[] => {
      const g = gameRig({
        heroFactory: (init) => {
          const id = CLASS_IDS.find((c) => init.info.id.includes(`-${c}-`)) ?? 'warrior';
          const def = classDef(id);
          return new ClassHero(
            { ...init, look: { ...init.look, classId: id } },
            summonsOn ? def : { ...def, summon: null },
          );
        },
      });
      for (let i = 0; i < 64; i++) {
        const c = (['necromancer', 'druid', 'artificer', 'mage'] as const)[i % 4] ?? 'mage';
        feed(g, agent(`h-${c}-${i}`, i % 5 === 4 ? 'idle' : 'working'));
      }
      const out: string[] = [];
      for (let k = 0; k < 6; k++) {
        steps(g, 10_000);
        out.push(JSON.stringify(g.game.heroSnapshot()));
      }
      return out;
    };
    assert.deepEqual(run(true), run(false));
  });

  void it('a hero whose raise was dropped gets its summon at its next ability once a slot frees', () => {
    const w = makeWorld();
    w.engagement.engaged = true;
    const r = rig('druid', w, 0, 'cap-');
    const keep = (): void => {
      for (let slot = 10; slot < 10 + SUMMON_CAPACITY; slot++) {
        w.summons.raise(slot, 'skeleton', slot * 5, 100, true);
        w.summons.renew(slot, 'skeleton', slot * 5, 100, true, 'attack');
      }
    };
    const mine = (): Summon | undefined => w.summons.entities().find((s) => s.slot === 0);
    keep();
    let casts = 0;
    let prev = r.hero.phase;
    for (let i = 0; i < 30_000 / STEP_MS && casts < 2; i++) {
      keep();
      r.advance(STEP_MS);
      if (r.hero.phase === 'ability' && prev !== 'ability') casts++;
      prev = r.hero.phase;
    }
    assert.equal(casts, 2, 'the Druid cast twice against a full pool');
    assert.equal(w.summons.count, SUMMON_CAPACITY);
    assert.equal(mine(), undefined, 'its raises were dropped');
    assert.equal(r.hero.lifecycle, 'working');
    // The other summons are no longer renewed; they sink and free their places.
    r.until(() => mine() !== undefined, 30_000);
    assert.equal(mine()?.kind, 'beast', 'a later ability raised the beast');
    assert.equal(r.hero.lifecycle, 'working');
  });
});
