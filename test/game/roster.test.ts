// Roster and the base Hero: the events-in, heroes-out table of game-engine section 5, the hero
// phase machine of section 6, slots, and the removal rule (M4 plan test notes 8, 9).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EXIT_FAILSAFE_MS,
  STEP_MS,
  VICTORY_MS,
  WARP_IN_MS,
  WARP_OUT_MS,
} from '../../src/game/data/tuning';
import { Hero } from '../../src/game/entities/Hero';
import type { HeroInit } from '../../src/game/entities/Hero';
import { CAMPFIRE_X, formationPosition, seatPosition } from '../../src/game/layout';
import type { Point } from '../../src/game/layout';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

function rigWithLog(): { rig: GameRig; log: ReturnType<typeof heroLog> } {
  const log = heroLog();
  return { rig: gameRig({ heroFactory: log.factory }), log };
}

function ids(rig: GameRig): string[] {
  return rig.game.heroSnapshot().map((h) => h.id);
}

void describe('Roster: events in, heroes out', () => {
  void it('spawned for an unknown id creates a hero that warps in', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'spawned'));
    rig.game.step();
    const hero = log.byId('a');
    assert.equal(hero.lifecycle, 'spawned');
    assert.equal(hero.phase, 'warpIn');
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'spawned', exiting: false, classId: null },
    ]);
    run(rig, WARP_IN_MS + 100);
    assert.equal(hero.phase, 'standby', 'waits at the door while spawned');
    assert.equal(hero.lifecycle, 'spawned');
  });

  void it('working for an unknown id creates the hero already working, without a warp-in', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working', 'Bash'));
    rig.game.step();
    const hero = log.byId('a');
    assert.equal(hero.lifecycle, 'working');
    assert.equal(hero.phase, 'advance');
    const spot: Point = { x: 0, y: 0 };
    formationPosition(0, spot);
    assert.deepEqual([hero.x, hero.y], [spot.x, spot.y], 'placed in its formation slot');
  });

  void it('idle for an unknown id creates the hero resting at its seat facing the fire', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'idle'));
    feed(rig, agent('b', 'idle'));
    rig.game.step();
    const spot: Point = { x: 0, y: 0 };
    seatPosition(0, spot);
    assert.equal(log.byId('a').phase, 'rest');
    assert.deepEqual([log.byId('a').x, log.byId('a').y], [spot.x, spot.y]);
    assert.equal(log.byId('a').faceRight, log.byId('a').x < CAMPFIRE_X);
    assert.equal(log.byId('b').faceRight, log.byId('b').x < CAMPFIRE_X);
    assert.notEqual(log.byId('a').faceRight, log.byId('b').faceRight, 'seats alternate sides');
  });

  void it('despawned for an unknown id is ignored', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('ghost', 'despawned'));
    run(rig, 500);
    assert.deepEqual(ids(rig), []);
    assert.equal(log.made.length, 0);
    assert.deepEqual(rig.errors, []);
  });

  void it('working and idle events take effect on the next step, not before', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'spawned'));
    run(rig, WARP_IN_MS + 100);
    feed(rig, agent('a', 'working', 'Edit'));
    assert.equal(log.byId('a').lifecycle, 'spawned', 'still queued');
    rig.game.step();
    assert.equal(log.byId('a').lifecycle, 'working');
    feed(rig, agent('a', 'idle'));
    assert.equal(log.byId('a').lifecycle, 'working');
    rig.game.step();
    assert.equal(log.byId('a').lifecycle, 'idle');
  });

  void it('a working hero walks to the corridor formation and advances; idle goes back to the fire', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'spawned'));
    run(rig, WARP_IN_MS + 100);
    feed(rig, agent('a', 'working'));
    run(rig, 15_000);
    const hero = log.byId('a');
    assert.ok(hero.phase === 'advance' || hero.phase === 'attack', hero.phase);
    const spot: Point = { x: 0, y: 0 };
    formationPosition(0, spot);
    assert.deepEqual([hero.x, hero.y], [spot.x, spot.y]);
    feed(rig, agent('a', 'idle'));
    run(rig, 15_000);
    assert.equal(hero.phase, 'rest');
    seatPosition(0, spot);
    assert.deepEqual([hero.x, hero.y], [spot.x, spot.y]);
    feed(rig, agent('a', 'working'));
    run(rig, 15_000);
    assert.ok(hero.phase === 'advance' || hero.phase === 'attack');
    assert.equal(rig.errors.length, 0);
  });

  void it('a lifecycle change during warpIn applies at once; travel starts when the warp ends', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'spawned'));
    run(rig, 200);
    assert.equal(log.byId('a').phase, 'warpIn');
    feed(rig, agent('a', 'working'));
    rig.game.step();
    assert.equal(log.byId('a').lifecycle, 'working');
    assert.equal(log.byId('a').phase, 'warpIn', 'the warp is not interrupted');
    run(rig, WARP_IN_MS);
    assert.equal(log.byId('a').phase, 'travel');
  });

  void it('a lifecycle change during travel re-plans to the new goal', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'spawned'));
    run(rig, WARP_IN_MS + 100);
    feed(rig, agent('a', 'working'));
    run(rig, 800);
    assert.equal(log.byId('a').phase, 'travel');
    feed(rig, agent('a', 'idle'));
    run(rig, 20_000);
    assert.equal(log.byId('a').phase, 'rest');
    assert.equal(log.byId('a').lifecycle, 'idle');
  });

  void it('despawned sets exiting, plays victory then warp-out, and removes after about 1.8 s', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    run(rig, 1000);
    feed(rig, agent('a', 'despawned'));
    rig.game.step();
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'despawned', exiting: true, classId: null },
    ]);
    run(rig, 100);
    assert.equal(log.byId('a').phase, 'victory');
    run(rig, VICTORY_MS - 100 + 60);
    assert.equal(log.byId('a').phase, 'warpOut');
    run(rig, WARP_OUT_MS - 200);
    assert.equal(ids(rig).length, 1, 'still there just before the end');
    run(rig, 400);
    assert.deepEqual(ids(rig), []);
    assert.equal(log.byId('a').removable, true);
  });

  void it('despawned interrupts warpIn and travel at once', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'spawned'));
    feed(rig, agent('b', 'working'));
    run(rig, 200);
    assert.equal(log.byId('a').phase, 'warpIn');
    feed(rig, agent('a', 'despawned'));
    rig.game.step();
    rig.game.step();
    assert.equal(log.byId('a').phase, 'victory');
    run(rig, 2000);
    assert.deepEqual(ids(rig), ['b']);
  });

  void it('spawned for an exiting id drops the old hero at once and creates a new one', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    run(rig, 500);
    const old = log.byId('a');
    feed(rig, agent('a', 'despawned'));
    run(rig, 300);
    assert.equal(old.exiting, true);
    feed(rig, agent('a', 'spawned'));
    rig.game.step();
    const fresh = log.byId('a');
    assert.notEqual(fresh, old);
    assert.equal(fresh.lifecycle, 'spawned');
    assert.equal(fresh.phase, 'warpIn');
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'spawned', exiting: false, classId: null },
    ]);
  });

  void it('spawned for a live id just applies the state (no duplicate hero)', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const first = log.byId('a');
    feed(rig, agent('a', 'spawned'));
    rig.game.step();
    assert.equal(log.byId('a'), first);
    assert.equal(log.made.length, 1);
    assert.equal(first.lifecycle, 'spawned');
  });

  void it('a hero is removed only after despawned and its exit: 10 simulated minutes of other states remove nobody', () => {
    const { rig } = rigWithLog();
    for (let i = 0; i < 12; i++) {
      feed(rig, agent(`h${i}`, (['spawned', 'working', 'idle'] as const)[i % 3] ?? 'idle'));
    }
    const states: Array<'working' | 'idle' | 'spawned'> = ['working', 'idle', 'spawned'];
    for (let minute = 0; minute < 10; minute++) {
      steps(rig, 60_000);
      for (let i = 0; i < 12; i++) {
        feed(rig, agent(`h${i}`, states[(i + minute) % 3] ?? 'idle', null, minute + 2));
      }
      assert.equal(rig.game.heroSnapshot().length, 12, `minute ${minute}`);
      assert.ok(rig.game.heroSnapshot().every((h) => !h.exiting));
    }
  });

  void it('removes a hero only when its lifecycle is despawned (never by phase alone)', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    steps(rig, 5000);
    const hero = log.byId('a');
    assert.equal(hero.removable, false);
    assert.equal(hero.exiting, false);
    assert.equal(ids(rig).length, 1);
  });
});

void describe('Roster: snapshots (reconcile)', () => {
  void it('creates every listed agent without warp-in, placed by lifecycle', () => {
    const { rig, log } = rigWithLog();
    const list = [agent('w', 'working'), agent('i', 'idle'), agent('s', 'spawned')];
    rig.mirror = list;
    rig.game.enqueueSnapshot(list);
    rig.game.step();
    assert.equal(log.byId('w').phase, 'advance');
    assert.equal(log.byId('i').phase, 'rest');
    assert.equal(log.byId('s').phase, 'standby');
    assert.equal(log.byId('s').lifecycle, 'spawned');
  });

  void it('a listed despawned agent that is unknown creates nothing', () => {
    const { rig, log } = rigWithLog();
    rig.game.enqueueSnapshot([agent('gone', 'despawned')]);
    rig.game.step();
    assert.equal(log.made.length, 0);
  });

  void it('an existing hero missing from the list gets the synthetic despawned treatment', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    feed(rig, agent('b', 'idle'));
    run(rig, 500);
    rig.game.enqueueSnapshot([agent('b', 'idle')]);
    rig.game.step();
    assert.equal(log.byId('a').lifecycle, 'despawned');
    assert.equal(log.byId('a').exiting, true);
    assert.equal(log.byId('b').exiting, false);
    run(rig, 2000);
    assert.deepEqual(ids(rig), ['b']);
  });

  void it('an exiting hero listed as live is replaced', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    run(rig, 300);
    const old = log.byId('a');
    feed(rig, agent('a', 'despawned'));
    run(rig, 100);
    rig.game.enqueueSnapshot([agent('a', 'idle')]);
    rig.game.step();
    const fresh = log.byId('a');
    assert.notEqual(fresh, old);
    assert.equal(fresh.exiting, false);
    assert.equal(fresh.phase, 'rest');
  });

  void it('a snapshot applies the listed states to existing heroes', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    run(rig, 300);
    rig.game.enqueueSnapshot([agent('a', 'idle', null, 9)]);
    rig.game.step();
    assert.equal(log.byId('a').lifecycle, 'idle');
  });

  void it('replaces queued events: only the latest snapshot is applied', () => {
    const { rig, log } = rigWithLog();
    rig.game.enqueueAgent(agent('queued', 'working'));
    rig.game.enqueueSnapshot([agent('x', 'idle')]);
    rig.game.step();
    assert.deepEqual(ids(rig), ['x']);
    assert.equal(log.made.length, 1);
  });

  void it('events queued after a snapshot are applied after it', () => {
    const { rig } = rigWithLog();
    rig.game.enqueueSnapshot([agent('x', 'idle')]);
    rig.game.enqueueAgent(agent('x', 'working'));
    rig.game.step();
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'x', lifecycle: 'working', exiting: false, classId: null },
    ]);
  });
});

void describe('Roster: slots and ordering', () => {
  void it('allocates the lowest free slot and reuses a freed one', () => {
    const { rig, log } = rigWithLog();
    for (const id of ['a', 'b', 'c']) {
      feed(rig, agent(id, 'idle'));
    }
    rig.game.step();
    assert.deepEqual(
      ['a', 'b', 'c'].map((id) => log.byId(id).slot),
      [0, 1, 2],
    );
    feed(rig, agent('b', 'despawned'));
    run(rig, 2500);
    feed(rig, agent('d', 'idle'));
    rig.game.step();
    assert.equal(log.byId('d').slot, 1, 'takes the freed slot');
    feed(rig, agent('e', 'idle'));
    rig.game.step();
    assert.equal(log.byId('e').slot, 3);
  });

  void it('lists heroes in creation order and the snapshot order is stable across steps', () => {
    const { rig } = rigWithLog();
    for (const id of ['z', 'm', 'a']) {
      feed(rig, agent(id, 'working'));
    }
    run(rig, 1000);
    assert.deepEqual(ids(rig), ['z', 'm', 'a']);
  });

  void it('slots past 32 share positions with an offset and nothing breaks', () => {
    const { rig, log } = rigWithLog();
    for (let i = 0; i < 40; i++) {
      feed(rig, agent(`h${i}`, i % 2 === 0 ? 'working' : 'idle'));
    }
    steps(rig, 30_000);
    assert.equal(rig.game.heroSnapshot().length, 40);
    assert.equal(log.byId('h39').slot, 39);
    assert.deepEqual(rig.errors, []);
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 0, y: 0 };
    formationPosition(0, a);
    formationPosition(32, b);
    assert.equal(log.byId('h32').x, b.x);
    assert.notEqual(a.x, b.x);
  });

  void it('a hero keeps its slot and look for life; look is a pure function of the id', () => {
    const logA = heroLog();
    const logB = heroLog();
    const a = gameRig({ heroFactory: logA.factory });
    const b = gameRig({ heroFactory: logB.factory });
    for (const rig of [a, b]) {
      feed(rig, agent('first', 'idle'));
      feed(rig, agent('second', 'idle'));
      rig.game.step();
    }
    assert.deepEqual(logA.byId('second').look, logB.byId('second').look);
    assert.notDeepEqual(logA.byId('first').look, logA.byId('second').look);
  });
});

void describe('Hero lifecycle can only be written by applyAgentState', () => {
  void it('lifecycle is a read-only accessor: assignment throws or is ignored, never changes state', () => {
    const { rig, log } = rigWithLog();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    assert.throws(() => {
      (hero as unknown as { lifecycle: string }).lifecycle = 'despawned';
    }, TypeError);
    assert.equal(hero.lifecycle, 'working');
    assert.equal(hero.exiting, false);
  });

  void it('applyAgentState ignores an info for another id and clears quarantine on a match', () => {
    const init: HeroInit = {
      info: agent('a', 'working'),
      slot: 0,
      instant: true,
      look: { skin: 0, hair: 0, accent: null, classId: null },
    };
    const hero = new Hero(init);
    hero.applyAgentState(agent('other', 'despawned'));
    assert.equal(hero.lifecycle, 'working');
    hero.frozen = true;
    hero.faults = 3;
    hero.drawFaults = 3;
    hero.applyAgentState(agent('a', 'idle'));
    assert.equal(hero.lifecycle, 'idle');
    assert.deepEqual([hero.frozen, hero.faults, hero.drawFaults], [false, 0, 0]);
  });

  void it('the despawned exit clock restarts only on the first despawned', () => {
    const hero = new Hero({
      info: agent('a', 'working'),
      slot: 0,
      instant: true,
      look: { skin: 0, hair: 0, accent: null, classId: null },
    });
    hero.applyAgentState(agent('a', 'despawned'));
    hero.advanceExitClock(1000);
    hero.applyAgentState(agent('a', 'despawned', null, 5));
    assert.equal(hero.exitClockMs, 1000);
    hero.advanceExitClock(STEP_MS);
    assert.ok(hero.exitClockMs > 1000);
  });

  void it('EXIT_FAILSAFE_MS is 5000 ms of game time', () => {
    assert.equal(EXIT_FAILSAFE_MS, 5000);
  });
});
