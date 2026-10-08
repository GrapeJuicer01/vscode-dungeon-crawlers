// Class mapping (H1 plan test note 1, decision H1-1): the class is a pure, total function of the
// session id. It is sticky through every route that rebuilds a hero (cycles, replacement, snapshot,
// a fresh Game as after a webview reload), and independent of skin and hair.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DELIVERED_CLASSES, classFor } from '../../src/game/data/classMap';
import { CLASS_IDS, CLASSES, classDef } from '../../src/game/data/classes';
import { SKIN_TONE_COUNT, STEP_MS } from '../../src/game/data/tuning';
import { createHero } from '../../src/game/entities/ClassHero';
import { mulberry32 } from '../../src/game/rng';
import { lookFor } from '../../src/game/Roster';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

/** Deterministic UUID-shaped ids (v4 layout) from a seeded generator. */
function uuids(count: number, seed = 7): string[] {
  const rng = mulberry32(seed);
  const hex = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');
  return Array.from(
    { length: count },
    () =>
      `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(rng() * 4)).toString(16)}${hex(3)}-${hex(12)}`,
  );
}

function tally(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const c = classFor(id);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

const classesOf = (rig: GameRig): string =>
  JSON.stringify(
    rig.game
      .heroSnapshot()
      .map((h) => [h.id, h.classId])
      .sort(),
  );

void describe('classFor is pure and total', () => {
  const awkward = ['', ' ', 'sim-0-0', 'x'.repeat(10_240), 'héro-ñ-日本語-🙂', '\u0000￿', '..\\/'];

  void it('always returns one of the delivered class ids and never throws', () => {
    for (const id of [...awkward, ...uuids(200)]) {
      let result = '';
      assert.doesNotThrow(() => {
        result = classFor(id);
      });
      assert.ok((DELIVERED_CLASSES as readonly string[]).includes(result), id.slice(0, 20));
    }
  });

  void it('gives the same class for the same id on every call', () => {
    for (const id of [...awkward, ...uuids(200)]) {
      const first = classFor(id);
      for (let i = 0; i < 5; i++) {
        assert.equal(classFor(id), first);
      }
    }
  });

  void it('matches an independent reference (FNV-1a, upper 16 bits, modulo the delivered count) and pinned answers', () => {
    const reference = (id: string): string => {
      let h = 0x811c9dc5;
      for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return CLASS_IDS[((h >>> 0) >>> 16) % CLASS_IDS.length] ?? '';
    };
    for (const id of [...awkward, ...uuids(500, 21)]) {
      assert.equal(classFor(id), reference(id), id.slice(0, 20));
    }
    // Pinned: a change here reshuffles every user's heroes and must be a deliberate decision.
    assert.deepEqual(['', 'a', 'alpha', 'sim-0-0', 'sim-1-0', 'sim-3-0', 'sim-6-0'].map(classFor), [
      'warrior',
      'warrior',
      'rogue',
      'rogue',
      'warrior',
      'mage',
      'archer',
    ]);
  });

  void it('DELIVERED_CLASSES equals CLASS_IDS in H1, and CLASSES has one row per id in the same order', () => {
    assert.deepEqual([...DELIVERED_CLASSES], [...CLASS_IDS]);
    assert.deepEqual(
      CLASSES.map((c) => c.id),
      [...CLASS_IDS],
    );
    assert.equal(CLASS_IDS.length, 4);
  });
});

void describe('classFor distribution', () => {
  void it('1,000 UUID-like ids use all four classes and none is under 15 percent', () => {
    const counts = tally(uuids(1000));
    assert.equal(counts.size, 4);
    for (const [cls, n] of counts) {
      assert.ok(n >= 150, `${cls} has only ${n} of 1000`);
    }
  });

  void it('sim-0-0 to sim-7-0 (the default simulator party) use at least three classes', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `sim-${i}-0`);
    const used = new Set(ids.map(classFor));
    assert.ok(used.size >= 3, [...used].join());
  });

  void it('is independent of skin tone and hair: all 16 skin and class pairs occur over 1,000 ids', () => {
    const pairs = new Set<string>();
    for (const id of uuids(1000, 3)) {
      pairs.add(`${lookFor(id).skin}|${classFor(id)}`);
    }
    assert.equal(pairs.size, SKIN_TONE_COUNT * CLASS_IDS.length);
  });

  void it('is independent of hair color as well (every hair and class pair occurs)', () => {
    const pairs = new Set<string>();
    for (const id of uuids(2000, 5)) {
      pairs.add(`${lookFor(id).hair}|${classFor(id)}`);
    }
    assert.equal(pairs.size, 6 * CLASS_IDS.length);
  });

  void it('looks never carry the class (lookFor stays class-less); createHero adds it', () => {
    assert.equal(lookFor('abc').classId, null);
    const id = 'abc';
    const hero = createHero({
      info: agent(id, 'working'),
      slot: 0,
      instant: true,
      look: lookFor(id),
    });
    assert.equal(hero.classId, classFor(id));
    assert.equal(hero.look.skin, lookFor(id).skin);
    assert.equal(hero.look.hair, lookFor(id).hair);
    assert.equal(classDef(classFor(id)).id, classFor(id));
  });
});

void describe('a hero keeps its class through Game', () => {
  const IDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

  void it('every hero snapshot carries classFor(id)', () => {
    const rig = gameRig();
    for (const id of IDS) {
      feed(rig, agent(id, 'working'));
    }
    rig.game.step();
    for (const h of rig.game.heroSnapshot()) {
      assert.equal(h.classId, classFor(h.id));
    }
  });

  void it('is unchanged after 10 simulated minutes of working and idle cycles', () => {
    const rig = gameRig();
    for (const id of IDS) {
      feed(rig, agent(id, 'spawned'));
    }
    steps(rig, 2000);
    const before = classesOf(rig);
    for (let cycle = 0; cycle < 30; cycle++) {
      const state = cycle % 2 === 0 ? 'working' : 'idle';
      for (const id of IDS) {
        feed(rig, agent(id, state, null, cycle + 2));
      }
      steps(rig, 20_000);
      assert.equal(classesOf(rig), before, `cycle ${cycle}`);
    }
  });

  for (const exit of ['victory', 'warpOut'] as const) {
    void it(`is unchanged by a replacement after despawned (${exit}): same id, same class`, () => {
      const log = heroLog(createHero);
      const rig = gameRig({ heroFactory: log.factory });
      feed(rig, agent('alpha', 'working'));
      run(rig, 400);
      const first = log.byId('alpha');
      feed(rig, agent('alpha', 'despawned', null, 2));
      run(rig, exit === 'victory' ? 200 : 1500);
      assert.equal(first.exiting, true);
      feed(rig, agent('alpha', 'spawned', null, 3));
      rig.game.step();
      const second = log.byId('alpha');
      assert.notEqual(second, first, 'a fresh hero replaced the exiting one');
      assert.equal(second.classId, first.classId);
      assert.equal(rig.game.heroSnapshot()[0]?.classId, classFor('alpha'));
    });
  }

  void it('is unchanged by a snapshot rebuild', () => {
    const rig = gameRig();
    const list = IDS.map((id, i) => agent(id, i % 2 === 0 ? 'working' : 'idle'));
    for (const a of list) {
      feed(rig, a);
    }
    run(rig, 3000);
    const before = classesOf(rig);
    rig.game.enqueueSnapshot(list.slice().reverse());
    run(rig, 500);
    assert.equal(classesOf(rig), before);
    rig.game.enqueueSnapshot([]);
    run(rig, 3000);
    rig.game.enqueueSnapshot(list);
    run(rig, 500);
    assert.equal(classesOf(rig), before, 'a hero rebuilt from an empty scene has the same class');
  });

  void it('a fresh Game fed the same list (a webview reload) assigns the same classes', () => {
    const list = IDS.map((id, i) => agent(id, i % 2 === 0 ? 'working' : 'idle'));
    const first = gameRig();
    first.game.enqueueSnapshot(list);
    run(first, 1000);
    const second = gameRig({ seed: 12345 });
    second.game.enqueueSnapshot(list.slice().reverse());
    run(second, 1000);
    assert.equal(classesOf(second), classesOf(first));
    assert.ok(STEP_MS > 0);
  });
});
