// Game.frame / step / render, the event queue, overflow resync, snapshot rebuild, and boot
// validation (M4 plan test notes 7, 11; game-engine sections 4 and 5).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classFor } from '../../src/game/data/classMap';
import { Game } from '../../src/game/Game';
import { STAGES } from '../../src/game/data/stages';
import {
  ENGINE_SEED,
  EVENT_QUEUE_CAP,
  MAX_FRAME_MS,
  MAX_STEPS_PER_FRAME,
  STEP_MS,
} from '../../src/game/data/tuning';
import { Hero } from '../../src/game/entities/Hero';
import type { HeroInit } from '../../src/game/entities/Hero';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { SceneFeed } from '../../src/webview/sceneFeed';
import { HostStateMirror } from '../../src/webview/hostState';
import type { RecordingSurface } from '../support/engineFakes';
import {
  FakeBitmaps,
  agent,
  describeHeroes,
  feed,
  gameRig,
  heroLog,
  run,
  steps,
} from '../support/engineFakes';

/** Counts update calls, i.e. fixed steps taken while the hero exists. */
class CountingHero extends Hero {
  static updates = 0;
  override update(dtMs: number, world: Parameters<Hero['update']>[1]): void {
    CountingHero.updates += 1;
    super.update(dtMs, world);
  }
}

function countingRig(): ReturnType<typeof gameRig> {
  CountingHero.updates = 0;
  const rig = gameRig({ heroFactory: (init: HeroInit) => new CountingHero(init) });
  feed(rig, agent('a', 'idle'));
  rig.game.step(); // creates the hero (one counted update)
  CountingHero.updates = 0;
  return rig;
}

void describe('Game.frame clamping and stepping', () => {
  void it('the loop constants are the documented ones', () => {
    assert.equal(STEP_MS, 1000 / 60);
    assert.equal(MAX_FRAME_MS, 100);
    assert.equal(MAX_STEPS_PER_FRAME, 5);
    assert.equal(EVENT_QUEUE_CAP, 256);
  });

  void it('frame(1000) clamps to 100 ms and runs at most 5 steps, then drops the rest', () => {
    const rig = countingRig();
    rig.game.frame(1000, rig.surface);
    assert.equal(CountingHero.updates, 5);
    rig.game.frame(0, rig.surface);
    assert.equal(CountingHero.updates, 5, 'no catch-up burst afterwards');
  });

  void it('a frame of exactly one step is one step; half a step carries over', () => {
    const rig = countingRig();
    rig.game.frame(STEP_MS, rig.surface);
    assert.equal(CountingHero.updates, 1);
    rig.game.frame(STEP_MS / 2, rig.surface);
    assert.equal(CountingHero.updates, 1);
    rig.game.frame(STEP_MS / 2 + 0.01, rig.surface);
    assert.equal(CountingHero.updates, 2);
  });

  void it('NaN and negative deltas count as 0 steps', () => {
    const rig = countingRig();
    for (const delta of [NaN, -1, -1000, -Infinity, 0]) {
      rig.game.frame(delta, rig.surface);
    }
    assert.equal(CountingHero.updates, 0);
  });

  void it('Infinity, 1e9, and MAX_VALUE clamp to 100 ms (5 steps), never hang', () => {
    for (const delta of [Infinity, 1e9, Number.MAX_VALUE]) {
      const rig = countingRig();
      rig.game.frame(delta, rig.surface);
      assert.equal(CountingHero.updates, 5, String(delta));
    }
  });

  void it('a delta just over the clamp runs 5 steps; 100 ms is 5 steps with the rest dropped', () => {
    const rig = countingRig();
    rig.game.frame(MAX_FRAME_MS, rig.surface);
    assert.equal(CountingHero.updates, 5);
    rig.game.frame(0, rig.surface);
    assert.equal(CountingHero.updates, 5);
  });

  void it('renders exactly once per frame, even with zero steps, starting with a clear', () => {
    const rig = gameRig({ record: true });
    rig.game.frame(0, rig.surface);
    rig.game.frame(NaN, rig.surface);
    rig.game.frame(1000, rig.surface);
    assert.equal(rig.surface.count('clear'), 3);
    // The renderer resets composite and alpha first (state, not drawing); clear is the first draw.
    const firstDraw = rig.surface.calls.find(
      (c) => c.method !== 'setComposite' && c.method !== 'setAlpha',
    );
    assert.equal(firstDraw?.method, 'clear');
  });

  void it('step() is a fixed STEP_MS and render() draws without stepping', () => {
    const rig = countingRig();
    rig.game.render(rig.surface);
    assert.equal(CountingHero.updates, 0);
    rig.game.step();
    assert.equal(CountingHero.updates, 1);
  });

  void it('dispose clears the queue and later calls are no-ops (nothing drawn, nothing thrown)', () => {
    const rig = gameRig({ record: true });
    feed(rig, agent('a', 'working'));
    rig.game.dispose();
    rig.surface.reset();
    assert.doesNotThrow(() => {
      rig.game.frame(1000, rig.surface);
      rig.game.step();
      rig.game.render(rig.surface);
      rig.game.enqueueAgent(agent('b', 'working'));
      rig.game.enqueueSnapshot([agent('c', 'idle')]);
      rig.game.dispose();
    });
    assert.equal(rig.surface.calls.length, 0);
    assert.deepEqual(rig.game.heroSnapshot(), [], 'the queued event was dropped, never applied');
  });
});

void describe('Game boot validation', () => {
  void it('throws a fixed RangeError for invalid stage data', () => {
    const bad = [{ ...STAGES[0], id: 'Bad Id' }] as unknown as typeof STAGES;
    assert.throws(
      () =>
        new Game({
          art: SHIPPED_ART,
          stages: bad,
          bitmaps: new FakeBitmaps(),
          onError: () => undefined,
          seed: ENGINE_SEED,
          agentSource: () => [],
        }),
      /^RangeError: Stage data is invalid$/,
    );
  });

  void it('throws a fixed RangeError when no stage is defined', () => {
    assert.throws(
      () =>
        new Game({
          art: SHIPPED_ART,
          stages: [],
          bitmaps: new FakeBitmaps(),
          onError: () => undefined,
          seed: ENGINE_SEED,
          agentSource: () => [],
        }),
      /^RangeError: No stages are defined$/,
    );
  });
});

void describe('event queue overflow (cap 256)', () => {
  /** Distinct working agents a0..a(n-1) fed through the mirror and the queue. */
  function overflowRig(): ReturnType<typeof gameRig> {
    return gameRig();
  }

  void it('up to 256 queued events are all applied in order', () => {
    const rig = overflowRig();
    for (let i = 0; i < EVENT_QUEUE_CAP; i++) {
      feed(rig, agent(`a${i}`, 'idle'));
    }
    rig.game.step();
    assert.equal(rig.game.heroSnapshot().length, EVENT_QUEUE_CAP);
  });

  void it('300 events in one frame resync from the mirror: every agent present with its latest state', () => {
    const rig = overflowRig();
    for (let i = 0; i < 300; i++) {
      feed(rig, agent(`a${i}`, i % 2 === 0 ? 'working' : 'idle'));
    }
    rig.game.frame(STEP_MS, rig.surface);
    const snapshot = rig.game.heroSnapshot();
    assert.equal(snapshot.length, 300);
    assert.deepEqual(
      new Set(snapshot.map((h) => `${h.id}:${h.lifecycle}`)),
      new Set(rig.mirror.map((a) => `${a.id}:${a.state}`)),
    );
    assert.deepEqual(rig.errors, []);
  });

  void it('a state change lost in the overflow is recovered from the mirror', () => {
    const rig = overflowRig();
    feed(rig, agent('keep', 'working'));
    rig.game.step();
    // Fill the queue, then flip `keep` to idle as the 257th event.
    for (let i = 0; i < EVENT_QUEUE_CAP; i++) {
      feed(rig, agent(`f${i}`, 'idle'));
    }
    feed(rig, agent('keep', 'idle', null, 2));
    rig.game.step();
    const keep = rig.game.heroSnapshot().find((h) => h.id === 'keep');
    assert.equal(keep?.lifecycle, 'idle');
  });

  void it('a hero whose despawned event was lost gets a synthetic despawned and then leaves', () => {
    const rig = overflowRig();
    feed(rig, agent('victim', 'working'));
    rig.game.step();
    for (let i = 0; i < EVENT_QUEUE_CAP; i++) {
      feed(rig, agent(`f${i}`, 'idle'));
    }
    feed(rig, agent('victim', 'despawned', null, 5)); // the 257th event: overflow, dropped
    rig.game.step();
    const victim = rig.game.heroSnapshot().find((h) => h.id === 'victim');
    assert.deepEqual(victim, {
      id: 'victim',
      lifecycle: 'despawned',
      exiting: true,
      classId: classFor('victim'),
    });
    run(rig, 2500);
    assert.equal(
      rig.game.heroSnapshot().some((h) => h.id === 'victim'),
      false,
    );
    assert.equal(rig.game.heroSnapshot().length, EVENT_QUEUE_CAP);
  });

  void it('events arriving after the overflow are still applied after the resync', () => {
    const rig = overflowRig();
    for (let i = 0; i < EVENT_QUEUE_CAP + 1; i++) {
      feed(rig, agent(`f${i}`, 'idle'));
    }
    feed(rig, agent('late', 'working'));
    rig.game.step();
    assert.equal(rig.game.heroSnapshot().find((h) => h.id === 'late')?.lifecycle, 'working');
    assert.equal(rig.game.heroSnapshot().length, EVENT_QUEUE_CAP + 2);
  });

  void it('a later snapshot supersedes a pending resync', () => {
    const rig = overflowRig();
    for (let i = 0; i < EVENT_QUEUE_CAP + 1; i++) {
      feed(rig, agent(`f${i}`, 'idle'));
    }
    rig.game.enqueueSnapshot([agent('only', 'working')]);
    rig.game.step();
    assert.deepEqual(
      rig.game.heroSnapshot().map((h) => h.id),
      ['only'],
    );
  });

  void it('the queue keeps working after an overflow (ring buffer reuse)', () => {
    const rig = overflowRig();
    for (let i = 0; i < EVENT_QUEUE_CAP + 5; i++) {
      feed(rig, agent(`f${i}`, 'idle'));
    }
    rig.game.step();
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 200; i++) {
        feed(rig, agent(`f${i}`, round % 2 === 0 ? 'working' : 'idle', null, round + 10));
      }
      rig.game.step();
      const expect = round % 2 === 0 ? 'working' : 'idle';
      assert.equal(rig.game.heroSnapshot().find((h) => h.id === 'f7')?.lifecycle, expect);
    }
  });
});

void describe('snapshot rebuild equals the running scene (reload, invariant 4)', () => {
  function positions(log: ReturnType<typeof heroLog>, rig: ReturnType<typeof gameRig>): string {
    return JSON.stringify(
      rig.game
        .heroSnapshot()
        .map((h) => [h.id, h.lifecycle, log.byId(h.id).slot, log.byId(h.id).x, log.byId(h.id).y]),
    );
  }

  void it('a fresh Game fed the mirror list has the same heroes, lifecycles, slots, and places', () => {
    const logA = heroLog();
    const a = gameRig({ heroFactory: logA.factory });
    const mirror = new HostStateMirror();
    const feedA = new SceneFeed(mirror, a.game);
    const states = ['spawned', 'working', 'idle', 'working', 'idle', 'spawned'] as const;
    states.forEach((state, i) => {
      feedA.applyAgent(agent(`h${i}`, state));
    });
    a.mirror = [...mirror.agents()];
    run(a, 2000);
    feedA.applyAgent(agent('h1', 'idle', null, 3));
    feedA.applyAgent(agent('h2', 'working', null, 3));
    feedA.applyAgent(agent('h5', 'working', null, 3));
    a.mirror = [...mirror.agents()];
    run(a, 40_000);

    const logB = heroLog();
    const b = gameRig({ heroFactory: logB.factory });
    b.game.enqueueSnapshot(mirror.agents());
    run(b, 40_000);

    assert.equal(describeHeroes(b), describeHeroes(a));
    assert.equal(positions(logB, b), positions(logA, a));
  });

  void it('rebuilding twice from the same list is idempotent', () => {
    const rig = gameRig();
    const list = [agent('a', 'working'), agent('b', 'idle')];
    rig.game.enqueueSnapshot(list);
    rig.game.step();
    const first = describeHeroes(rig);
    rig.game.enqueueSnapshot(list);
    rig.game.step();
    assert.equal(describeHeroes(rig), first);
    assert.equal(rig.game.heroSnapshot().length, 2);
  });
});

void describe('determinism by seed', () => {
  /** The draws of second 21 of a run, with bitmaps replaced by a pixel checksum. */
  function drawLog(seed: number): string {
    const rig = gameRig({ seed });
    feed(rig, agent('a', 'working'));
    feed(rig, agent('b', 'idle'));
    feed(rig, agent('c', 'spawned'));
    run(rig, 20_000);
    rig.surface.record = true;
    run(rig, 1000);
    const checksum = (b: {
      width: number;
      height: number;
      rgba?: Uint8ClampedArray | null;
    }): string => {
      let h = 0;
      for (const v of b.rgba ?? []) {
        h = (Math.imul(h, 31) + v) >>> 0;
      }
      return `${b.width}x${b.height}:${h}`;
    };
    return JSON.stringify(
      rig.surface.calls.map((c) => [
        c.method,
        c.composite,
        c.alpha,
        ...c.args.map((x) =>
          typeof x === 'object' && x !== null && 'width' in x
            ? checksum(x as { width: number; height: number; rgba?: Uint8ClampedArray | null })
            : x,
        ),
      ]),
    );
  }

  void it('the same seed and events give identical draws', () => {
    assert.equal(drawLog(ENGINE_SEED), drawLog(ENGINE_SEED));
  });

  void it('a different seed changes the cosmetic randomness (embers, flicker, rest timing)', () => {
    assert.notEqual(drawLog(ENGINE_SEED), drawLog(ENGINE_SEED + 1));
  });
});

void describe('Game never reaches the host', () => {
  void it('has no channel: no send, post, or message methods on the Game surface', () => {
    const names = Object.getOwnPropertyNames(Game.prototype);
    assert.deepEqual(
      names.filter((n) => /send|post|message|channel|focus|terminal/i.test(n)),
      [],
    );
    assert.deepEqual(names.sort(), [
      'constructor',
      'dispose',
      'enqueueAgent',
      'enqueueSnapshot',
      'frame',
      'heroSnapshot',
      'render',
      'step',
    ]);
  });

  void it('a long mixed run reports no error and renders every frame', () => {
    const rig = gameRig();
    for (let i = 0; i < 8; i++) {
      feed(rig, agent(`h${i}`, i % 2 === 0 ? 'working' : 'idle'));
    }
    steps(rig, 120_000);
    assert.deepEqual(rig.errors, []);
    const surface: RecordingSurface = rig.surface;
    assert.ok(surface.count('clear') >= 100);
  });
});
