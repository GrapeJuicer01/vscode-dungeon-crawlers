// THE HERO-INVARIANT TEST (Core invariants 1 and 2; testing strategy section 5; M4 plan note 9).
// Hero lifecycle changes only on host agent-state events, and nothing in the game (engagement,
// rest poses, slot overflow, snapshots, queue overflow, faults, absurd frame deltas, dispose,
// pathfinding failure, pool exhaustion, light overflow) can change a hero or remove one.
// Extended in every later milestone; never narrowed.
import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { STAGES } from '../../src/game/data/stages';
import type { PropPlacement, StageDef } from '../../src/game/data/stages';
import {
  ENGINE_SEED,
  EVENT_QUEUE_CAP,
  STEP_MS,
  VICTORY_MS,
  WARP_OUT_MS,
} from '../../src/game/data/tuning';
import { classFor } from '../../src/game/data/classMap';
import { Game } from '../../src/game/Game';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { FakeBitmaps, RecordingSurface } from '../support/engineFakes';

import { Hero } from '../../src/game/entities/Hero';
import { Lighting } from '../../src/game/Lighting';
import { NavGrid } from '../../src/game/Pathfinding';
import { Particles } from '../../src/game/Particles';
import { createHostChannel } from '../../src/webview/hostChannel';
import { handleHostMessage } from '../../src/webview/hostMessages';
import { HostStateMirror } from '../../src/webview/hostState';
import { SceneFeed } from '../../src/webview/sceneFeed';
import type { AgentInfo } from '../../src/shared/protocol';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const SCALES = [1, 8, 32, 64];
const TEN_MINUTES = 10 * 60 * 1000;
const LIVE = ['spawned', 'working', 'idle'] as const;

function list(n: number): AgentInfo[] {
  return Array.from({ length: n }, (_, i) => agent(`h${i}`, LIVE[i % 3] ?? 'idle', null, 1));
}

/** A rig holding `n` heroes in spawned/working/idle, settled so every hero has arrived. */
function scene(n: number, options: Parameters<typeof gameRig>[0] = {}): GameRig {
  const rig = gameRig(options);
  for (const a of list(n)) {
    feed(rig, a);
  }
  steps(rig, 30_000);
  return rig;
}

const snap = (rig: GameRig): string => JSON.stringify(rig.game.heroSnapshot());

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});
function patch<T extends object, K extends keyof T>(proto: T, key: K, value: T[K]): void {
  const original = proto[key];
  proto[key] = value;
  restores.push(() => {
    proto[key] = original;
  });
}

/** Runs `stimulus` for 10 simulated minutes at every scale and asserts nothing about heroes changed. */
function unchanged(
  name: string,
  stimulus: (rig: GameRig, n: number) => void,
  scales = SCALES,
): void {
  for (const n of scales) {
    void it(`${name} (${n} heroes, 10 simulated minutes)`, () => {
      const rig = scene(n);
      const before = snap(rig);
      stimulus(rig, n);
      assert.equal(snap(rig), before);
      assert.ok(rig.game.heroSnapshot().every((h) => !h.exiting));
    });
  }
}

void describe('non-lifecycle stimuli never change a hero or remove one', () => {
  unchanged('engagement advance and engage cycles', (rig) => {
    steps(rig, TEN_MINUTES);
  });

  unchanged('rest-pose changes (sleep, eat, read, polish) over a long rest', (rig) => {
    for (let i = 0; i < 6; i++) {
      steps(rig, TEN_MINUTES / 6, 500);
    }
  });

  for (const n of [1, 32]) {
    void it(`slot overflow beyond 32 heroes (${n} heroes, 10 simulated minutes)`, () => {
      const rig = scene(n);
      const before = rig.game.heroSnapshot();
      for (let i = n; i < n + 40; i++) {
        feed(rig, agent(`extra${i}`, 'idle'));
      }
      steps(rig, TEN_MINUTES);
      const after = rig.game.heroSnapshot();
      assert.equal(after.length, n + 40);
      assert.deepEqual(after.slice(0, n), before, 'the original heroes are untouched');
      assert.ok(after.every((h) => !h.exiting));
    });
  }

  unchanged('an identical snapshot re-applied every minute', (rig, n) => {
    for (let minute = 0; minute < 10; minute++) {
      rig.game.enqueueSnapshot(list(n));
      steps(rig, 60_000);
    }
  });

  unchanged('a snapshot with a changed order every minute', (rig, n) => {
    for (let minute = 0; minute < 10; minute++) {
      const l = list(n);
      rig.game.enqueueSnapshot(minute % 2 === 0 ? l.reverse() : l);
      steps(rig, 60_000);
    }
  });

  unchanged('event-queue overflow (300 events in one frame) and resync', (rig, n) => {
    rig.mirror = list(n);
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < 300; i++) {
        rig.game.enqueueAgent(list(n)[i % n] as AgentInfo);
      }
      rig.game.frame(STEP_MS, rig.surface);
      steps(rig, 60_000);
    }
  });

  unchanged('absurd frame deltas (0, negative, NaN, Infinity, 1e9)', (rig) => {
    for (let round = 0; round < 6000; round++) {
      for (const delta of [0, -5, NaN, Infinity, -Infinity, 1e9, Number.MAX_VALUE, STEP_MS]) {
        rig.game.frame(delta, rig.surface);
      }
    }
    steps(rig, TEN_MINUTES);
  });

  unchanged('dispose is last: heroes are still observable and unchanged', (rig) => {
    steps(rig, TEN_MINUTES);
    rig.game.dispose();
    rig.game.frame(1000, rig.surface);
    rig.game.enqueueAgent(agent('h0', 'despawned', null, 9));
    rig.game.step();
  });

  unchanged('entity faults in update and draw', (rig, n) => {
    // Faults are injected into the base class, so every hero throws intermittently.
    let count = 0;
    patch(Hero.prototype, 'update', function (this: Hero): void {
      count += 1;
      throw new Error(`update fault ${count % 5}`);
    });
    patch(Hero.prototype, 'draw', function (this: Hero): void {
      throw new Error('draw fault');
    });
    for (let i = 0; i < 6000; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    assert.ok(rig.errors.length >= 1);
    assert.ok(n >= 1);
  });

  unchanged('a throwing campfire and a throwing surface', (rig) => {
    rig.surface.failOn('fillRect', 'surface boom', Infinity);
    for (let i = 0; i < 6000; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
  });

  unchanged(
    'a throwing error reporter',
    (rig) => {
      const throwing = gameRig({
        onError: () => {
          throw new Error('reporter');
        },
      });
      for (const a of list(8)) {
        feed(throwing, a);
      }
      patch(Hero.prototype, 'update', () => {
        throw new Error('boom');
      });
      for (let i = 0; i < 600; i++) {
        throwing.game.frame(STEP_MS, throwing.surface);
      }
      steps(rig, 60_000);
    },
    [1],
  );

  unchanged('pathfinding failure (every route unreachable)', (rig) => {
    patch(NavGrid.prototype, 'cellAt', () => -1);
    steps(rig, TEN_MINUTES);
    assert.deepEqual(rig.errors, [], 'an unreachable goal is never an error');
  });

  for (const n of [8, 64]) {
    void it(`particle pool exhaustion by simultaneous warp-ins (${n} heroes)`, () => {
      const rig = gameRig();
      let refused = 0;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
      const emit = Particles.prototype.emit;
      patch(
        Particles.prototype,
        'emit',
        function (this: Particles, ...args: Parameters<Particles['emit']>) {
          const ok = emit.apply(this, args);
          if (!ok) refused += 1;
          return ok;
        },
      );
      for (const a of list(n)) {
        feed(rig, { ...a, state: 'spawned' });
      }
      const before = JSON.stringify(
        list(n).map((a) => ({
          id: a.id,
          lifecycle: 'spawned',
          exiting: false,
          classId: classFor(a.id),
        })),
      );
      run(rig, 800);
      steps(rig, TEN_MINUTES);
      assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
      if (n === 64) {
        assert.ok(refused > 0, 'the pool really ran out');
      }
      assert.deepEqual(rig.errors, []);
    });
  }

  void it('lights past MAX_LIGHTS are refused and nothing else changes', () => {
    const torches: PropPlacement[] = Array.from({ length: 8 }, (_, i) => ({
      prop: 'torch',
      zone: 'corridor',
      layer: 'wall',
      x: 10 + i * 46,
      y: 40,
      solid: null,
      light: { radius: 96, intensity: 0.8, colorChar: 'T', flicker: true },
    }));
    const def = STAGES[0] as StageDef;
    const crowded: StageDef = {
      ...def,
      props: [...def.props.filter((p) => p.prop !== 'torch'), ...torches],
    };
    let refused = 0;
    // A valid stage cannot request more than MAX_LIGHTS (at most 8 stage lights, one visible
    // copy each, plus the fire), so each light is requested three times to overflow the cap.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const add = Lighting.prototype.add;
    patch(
      Lighting.prototype,
      'add',
      function (this: Lighting, ...args: Parameters<Lighting['add']>) {
        let ok = true;
        for (let i = 0; i < 3; i++) {
          ok = add.apply(this, args);
          if (!ok) refused += 1;
        }
        return ok;
      },
    );
    const rig = gameRigWithStages([crowded]);
    for (const a of list(8)) feed(rig, a);
    steps(rig, 30_000, 100);
    const before = snap(rig);
    steps(rig, TEN_MINUTES);
    assert.equal(snap(rig), before);
    assert.ok(refused > 0, 'more than 16 lights were requested');
    assert.deepEqual(rig.errors, []);
  });
});

function gameRigWithStages(stages: readonly StageDef[]): GameRig {
  const bitmaps = new FakeBitmaps();
  bitmaps.recordOffscreen = false;
  const surface = new RecordingSurface();
  surface.record = false;
  const errors: GameRig['errors'] = [];
  const rig: GameRig = { game: undefined as unknown as Game, surface, bitmaps, errors, mirror: [] };
  return Object.assign(rig, {
    game: new Game({
      art: SHIPPED_ART,
      stages,
      bitmaps,
      onError: (error, scope) => {
        errors.push({ error, scope });
      },
      seed: ENGINE_SEED,
      agentSource: () => rig.mirror,
    }),
  });
}

void describe('the engine never talks to the host', () => {
  void it('a full scenario through SceneFeed sends nothing on the host channel', () => {
    const posted: unknown[] = [];
    createHostChannel({ postMessage: (m: unknown) => void posted.push(m) });
    const rig = scene(8);
    const mirror = new HostStateMirror();
    const sceneFeed = new SceneFeed(mirror, rig.game);
    handleHostMessage({ type: 'agentList', agents: list(8) }, sceneFeed);
    handleHostMessage({ type: 'agentState', agent: agent('h0', 'despawned', null, 3) }, sceneFeed);
    run(rig, 5000);
    assert.deepEqual(posted, []);
  });
});

void describe('host events change hero state exactly as specified', () => {
  void it('lifecycle is observable only through the four host states; a hero cannot be in any other', () => {
    const rig = scene(9);
    for (const h of rig.game.heroSnapshot()) {
      assert.ok((['spawned', 'working', 'idle', 'despawned'] as string[]).includes(h.lifecycle));
    }
  });

  void it('working and idle apply on the next step; the previous state shows until then', () => {
    const rig = scene(3);
    const first = rig.game.heroSnapshot()[1];
    assert.equal(first?.lifecycle, 'working');
    feed(rig, agent('h1', 'idle', null, 5));
    assert.equal(rig.game.heroSnapshot()[1]?.lifecycle, 'working');
    rig.game.step();
    assert.equal(rig.game.heroSnapshot()[1]?.lifecycle, 'idle');
  });

  void it('despawned applies on the next step, exits through victory and warp-out, then removes', () => {
    const log = heroLog();
    const rig = gameRig({ heroFactory: log.factory });
    feed(rig, agent('a', 'working'));
    run(rig, 500);
    feed(rig, agent('a', 'despawned', null, 2));
    assert.equal(rig.game.heroSnapshot()[0]?.exiting, false);
    rig.game.step();
    assert.equal(rig.game.heroSnapshot()[0]?.exiting, true);
    run(rig, VICTORY_MS + WARP_OUT_MS + 200);
    assert.deepEqual(rig.game.heroSnapshot(), []);
  });

  void it('a state applied during warpIn, travel, and victory takes effect on the next step', () => {
    for (const [name, delay, state] of [
      ['warpIn', 100, 'idle'],
      ['travel', 1000, 'idle'],
    ] as const) {
      const log = heroLog();
      const rig = gameRig({ heroFactory: log.factory });
      feed(rig, agent('a', 'spawned'));
      run(rig, delay);
      if (name === 'travel') {
        feed(rig, agent('a', 'working', null, 2));
        run(rig, 400);
      }
      assert.equal(log.byId('a').phase, name, name);
      feed(rig, agent('a', state, null, 3));
      rig.game.step();
      assert.equal(log.byId('a').lifecycle, state, name);
    }
    const log = heroLog();
    const rig = gameRig({ heroFactory: log.factory });
    feed(rig, agent('a', 'working'));
    run(rig, 300);
    feed(rig, agent('a', 'despawned', null, 2));
    run(rig, 300);
    assert.equal(log.byId('a').phase, 'victory');
    feed(rig, agent('a', 'working', null, 3));
    rig.game.step();
    assert.equal(log.byId('a').lifecycle, 'working');
  });

  void it('events for unknown ids: working creates without warp-in, despawned is ignored', () => {
    const log = heroLog();
    const rig = gameRig({ heroFactory: log.factory });
    feed(rig, agent('x', 'despawned'));
    feed(rig, agent('y', 'working'));
    rig.game.step();
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'y', lifecycle: 'working', exiting: false, classId: null },
    ]);
    assert.notEqual(log.byId('y').phase, 'warpIn');
  });

  void it('spawned for an exiting id replaces it', () => {
    const rig = gameRig();
    feed(rig, agent('a', 'working'));
    run(rig, 300);
    feed(rig, agent('a', 'despawned', null, 2));
    run(rig, 200);
    feed(rig, agent('a', 'spawned', null, 3));
    rig.game.step();
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'spawned', exiting: false, classId: classFor('a') },
    ]);
  });

  void it('the queue limit is 256 and a hero list survives 300 queued events', () => {
    assert.equal(EVENT_QUEUE_CAP, 256);
    const rig = scene(4);
    const before = snap(rig);
    for (let i = 0; i < 300; i++) {
      rig.game.enqueueAgent(agent('h0', 'spawned', null, i));
    }
    rig.mirror = list(4);
    rig.game.step();
    assert.equal(rig.game.heroSnapshot().length, 4);
    assert.ok(before.length > 0);
  });
});
