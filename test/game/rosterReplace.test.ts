// Regression for commit 0ea8ddb: a working, idle, or spawned event (or a live snapshot entry) for
// a hero that is still exiting replaces it with a fresh hero instead of leaving a ghost stuck in
// victory or warpOut. Lifecycle is still written only by Hero.applyAgentState (invariant 2).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VICTORY_MS } from '../../src/game/data/tuning';
import { formationPosition, seatPosition } from '../../src/game/layout';
import type { Point } from '../../src/game/layout';
import type { Hero } from '../../src/game/entities/Hero';
import { agent, feed, gameRig, heroLog, run } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

type Exit = 'victory' | 'warpOut';

/** A rig with hero `a` (slot 0) plus `b` (slot 1) that has been despawned and is mid-exit. */
function exitingRig(exit: Exit): { rig: GameRig; log: ReturnType<typeof heroLog>; old: Hero } {
  const log = heroLog();
  const rig = gameRig({ heroFactory: log.factory });
  feed(rig, agent('a', 'working'));
  feed(rig, agent('b', 'idle'));
  run(rig, 500);
  const old = log.byId('a');
  feed(rig, agent('a', 'despawned'));
  run(rig, exit === 'victory' ? 300 : VICTORY_MS + 300);
  assert.equal(old.phase, exit, 'precondition: the old hero is mid-exit');
  assert.equal(old.exiting, true);
  return { rig, log, old };
}

function liveFor(rig: GameRig, id: string): readonly Hero[] {
  return rig.game.heroSnapshot().filter((h) => h.id === id) as unknown as readonly Hero[];
}

const EXITS: readonly Exit[] = ['victory', 'warpOut'];

for (const exit of EXITS) {
  void describe(`Roster replaces a hero that is exiting (${exit})`, () => {
    for (const state of ['working', 'idle'] as const) {
      void it(`${state} gives one new instant hero in the freed slot, old instance gone`, () => {
        const { rig, log, old } = exitingRig(exit);
        const madeBefore = log.made.length;
        feed(rig, agent('a', state, state === 'working' ? 'Edit' : null, 9));
        rig.game.step();
        assert.equal(log.made.length, madeBefore + 1, 'exactly one hero created');
        const fresh = log.byId('a');
        assert.notEqual(fresh, old);
        assert.equal(fresh.slot, old.slot, 'keeps the freed slot');
        assert.equal(fresh.slot, 0);
        assert.equal(fresh.exiting, false);
        assert.equal(fresh.lifecycle, state);
        assert.deepEqual(
          rig.game.heroSnapshot().filter((h) => h.id === 'a'),
          [{ id: 'a', lifecycle: state, exiting: false, classId: null }],
          'one entry, not exiting',
        );
        assert.equal(liveFor(rig, 'a').length, 1);
        assert.notEqual(fresh.phase, 'warpIn', 'instant: no warp-in');
        assert.notEqual(fresh.phase, 'warpOut');
        assert.notEqual(fresh.phase, 'victory');
        assert.equal(fresh.phase, state === 'working' ? 'advance' : 'rest');
        const spot: Point = { x: 0, y: 0 };
        if (state === 'working') {
          formationPosition(0, spot);
        } else {
          seatPosition(0, spot);
        }
        assert.deepEqual([fresh.x, fresh.y], [spot.x, spot.y], 'placed instantly');
        assert.equal(fresh.warpBeam, 0, 'no beam');
        assert.deepEqual(rig.errors, []);
      });

      void it(`${state}: the replacement is what the roster updates; the old one never returns`, () => {
        const { rig, log, old } = exitingRig(exit);
        feed(rig, agent('a', state, null, 9));
        run(rig, 6000);
        const heroes = rig.game.heroSnapshot();
        assert.deepEqual(heroes.map((h) => h.id).sort(), ['a', 'b']);
        assert.ok(
          heroes.every((h) => !h.exiting),
          'nothing is stuck exiting',
        );
        assert.notEqual(log.byId('a'), old);
        assert.equal(old.lifecycle, 'despawned', 'the old hero is left untouched');
        assert.equal(log.byId('b').slot, 1, 'the neighbour keeps its slot');
      });
    }

    void it('spawned replaces the exiting hero but warps in (not instant)', () => {
      const { rig, log, old } = exitingRig(exit);
      feed(rig, agent('a', 'spawned', null, 9));
      rig.game.step();
      const fresh = log.byId('a');
      assert.notEqual(fresh, old);
      assert.equal(fresh.slot, 0);
      assert.equal(fresh.exiting, false);
      assert.equal(fresh.lifecycle, 'spawned');
      assert.equal(fresh.phase, 'warpIn');
      assert.equal(liveFor(rig, 'a').length, 1);
      assert.deepEqual(rig.errors, []);
    });
  });
}

void describe('Roster updates a non-exiting hero in place', () => {
  void it('working and idle keep the same instance, slot, and creation count', () => {
    const log = heroLog();
    const rig = gameRig({ heroFactory: log.factory });
    feed(rig, agent('a', 'spawned'));
    run(rig, 2000);
    const hero = log.byId('a');
    for (const state of ['working', 'idle', 'working', 'idle'] as const) {
      feed(rig, agent('a', state, null, 5));
      rig.game.step();
      assert.equal(log.byId('a'), hero, `${state}: same instance`);
      assert.equal(hero.lifecycle, state);
      assert.equal(hero.exiting, false);
    }
    assert.equal(log.made.length, 1);
    assert.equal(hero.slot, 0);
  });
});

void describe('Roster.reconcile with exiting heroes', () => {
  function snapshot(rig: GameRig, list: ReturnType<typeof agent>[]): void {
    rig.mirror = list;
    rig.game.enqueueSnapshot(list);
    rig.game.step();
  }

  for (const exit of EXITS) {
    void it(`a live entry replaces an exiting (${exit}) hero, instantly, in its slot`, () => {
      const { rig, log, old } = exitingRig(exit);
      snapshot(rig, [agent('a', 'working', null, 9), agent('b', 'idle')]);
      const fresh = log.byId('a');
      assert.notEqual(fresh, old);
      assert.equal(fresh.slot, 0);
      assert.equal(fresh.exiting, false);
      assert.equal(fresh.phase, 'advance');
      assert.equal(liveFor(rig, 'a').length, 1);
    });

    void it(`a despawned entry leaves an exiting (${exit}) hero exiting and creates nothing`, () => {
      const { rig, log, old } = exitingRig(exit);
      const made = log.made.length;
      snapshot(rig, [agent('a', 'despawned', null, 9), agent('b', 'idle')]);
      assert.equal(log.made.length, made);
      assert.equal(log.byId('a'), old);
      assert.equal(old.exiting, true);
      run(rig, 3000);
      assert.deepEqual(
        rig.game.heroSnapshot().map((h) => h.id),
        ['b'],
        'the exit still completes',
      );
    });

    void it(`an exiting (${exit}) hero absent from the list is not despawned again`, () => {
      const { rig, old } = exitingRig(exit);
      const clock = old.exitClockMs;
      snapshot(rig, [agent('b', 'idle')]);
      assert.equal(old.exiting, true);
      assert.ok(old.exitClockMs >= clock, 'the exit clock was not restarted');
    });
  }

  void it('a non-exiting hero listed live updates in place; one missing from the list exits', () => {
    const log = heroLog();
    const rig = gameRig({ heroFactory: log.factory });
    feed(rig, agent('a', 'working'));
    feed(rig, agent('b', 'working'));
    run(rig, 300);
    const a = log.byId('a');
    snapshot(rig, [agent('a', 'idle', null, 4)]);
    assert.equal(log.byId('a'), a);
    assert.equal(a.lifecycle, 'idle');
    assert.equal(log.byId('b').exiting, true);
    assert.equal(log.made.length, 2);
  });

  void it('a despawned, working, idle sequence through reconcile ends with one live hero', () => {
    const log = heroLog();
    const rig = gameRig({ heroFactory: log.factory });
    snapshot(rig, [agent('a', 'working', null, 1)]);
    const first = log.byId('a');
    run(rig, 300);
    snapshot(rig, [agent('a', 'despawned', null, 2)]);
    run(rig, 100);
    assert.equal(first.exiting, true);
    snapshot(rig, [agent('a', 'working', null, 3)]);
    const second = log.byId('a');
    assert.notEqual(second, first);
    assert.equal(second.exiting, false);
    assert.equal(second.lifecycle, 'working');
    snapshot(rig, [agent('a', 'idle', null, 4)]);
    assert.equal(log.byId('a'), second, 'now alive, so updated in place');
    assert.equal(second.lifecycle, 'idle');
    assert.equal(log.made.length, 2);
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'idle', exiting: false, classId: null },
    ]);
    run(rig, 5000);
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'idle', exiting: false, classId: null },
    ]);
  });
});
