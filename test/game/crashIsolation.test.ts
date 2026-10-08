// Crash isolation (Core invariant 4; M4 plan test note 8): entity, surface, and reporter faults
// never escape Game.frame, never stop rendering, and never touch hero lifecycle.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Campfire } from '../../src/game/entities/Campfire';
import { guarded } from '../../src/game/entities/Entity';
import type { Guardable } from '../../src/game/entities/Entity';
import { EXIT_FAILSAFE_MS, FAULT_LIMIT, STEP_MS } from '../../src/game/data/tuning';
import { Hero } from '../../src/game/entities/Hero';
import type { HeroInit } from '../../src/game/entities/Hero';
import type { ErrorScope } from '../../src/game/ports';
import { agent, feed, gameRig, heroLog, run, steps } from '../support/engineFakes';

type World = Parameters<Hero['update']>[1];
type Ctx = Parameters<Hero['draw']>[0];

/** A hero whose update and draw can be scripted to throw. */
class FaultyHero extends Hero {
  updateCalls = 0;
  drawCalls = 0;
  /** Throws on update calls whose 1-based index satisfies this. */
  failUpdate: (call: number) => unknown = () => undefined;
  failDraw: (call: number) => unknown = () => undefined;

  override update(dtMs: number, world: World): void {
    this.updateCalls += 1;
    const thrown = this.failUpdate(this.updateCalls);
    if (thrown !== undefined) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- tests throw non-Errors on purpose
      throw thrown;
    }
    super.update(dtMs, world);
  }

  override draw(ctx: Ctx): void {
    this.drawCalls += 1;
    const thrown = this.failDraw(this.drawCalls);
    if (thrown !== undefined) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- tests throw non-Errors on purpose
      throw thrown;
    }
    super.draw(ctx);
  }
}

function faultyRig(
  onError?: Parameters<typeof gameRig>[0] extends infer O
    ? O extends { onError?: infer E }
      ? E
      : never
    : never,
): { rig: ReturnType<typeof gameRig>; log: ReturnType<typeof heroLog<FaultyHero>> } {
  const log = heroLog<FaultyHero>((init: HeroInit) => new FaultyHero(init));
  const rig = gameRig({ heroFactory: log.factory, ...(onError === undefined ? {} : { onError }) });
  return { rig, log };
}

const always = (message: string) => (): unknown => new Error(message);

void describe('entity update faults', () => {
  void it('a throwing update never escapes frame, is reported once with scope update, and the next frame renders', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    log.byId('a').failUpdate = always('update boom');
    const clears = rig.surface.count('clear');
    for (let i = 0; i < 30; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    }
    assert.equal(rig.surface.count('clear'), clears + 30, 'every frame still renders');
    assert.equal(rig.errors.length, 1, 'the same message is reported once');
    assert.equal(rig.errors[0]?.scope, 'update');
    assert.equal((rig.errors[0]?.error as Error).message, 'update boom');
  });

  void it('after FAULT_LIMIT (3) consecutive faults the entity is frozen but still listed and drawn', () => {
    assert.equal(FAULT_LIMIT, 3);
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    hero.failUpdate = always('frozen boom');
    const before = hero.updateCalls;
    const draws = hero.drawCalls;
    for (let i = 0; i < 20; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    assert.equal(
      hero.updateCalls - before,
      FAULT_LIMIT,
      'update stops being attempted once frozen',
    );
    assert.equal(hero.frozen, true);
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'working', exiting: false, classId: null },
    ]);
    assert.equal(hero.drawCalls - draws, 20, 'a frozen hero is still drawn every frame');
  });

  void it('a clean call resets the fault count, so intermittent faults never freeze', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    const start = hero.updateCalls;
    hero.failUpdate = (call) => ((call - start) % 3 === 0 ? undefined : new Error('flaky'));
    for (let i = 0; i < 60; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    assert.equal(hero.frozen, false);
    assert.equal(hero.updateCalls - start, 60);
    assert.equal(rig.errors.length, 1, 'one message, one report');
  });

  void it('distinct messages are each reported once', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    hero.failUpdate = (call) => (call % 2 === 0 ? new Error('even') : new Error('odd'));
    // Two different messages, then clean calls in between keep it unfrozen.
    for (let i = 0; i < 20; i++) {
      rig.game.frame(STEP_MS, rig.surface);
      hero.faults = 0;
    }
    assert.deepEqual(rig.errors.map((e) => (e.error as Error).message).sort(), ['even', 'odd']);
  });

  void it('a lifecycle event unfreezes the entity and its messages can be reported again only if new', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    hero.failUpdate = always('stuck');
    run(rig, 200);
    assert.equal(hero.frozen, true);
    const attempts = hero.updateCalls;
    run(rig, 200);
    assert.equal(hero.updateCalls, attempts, 'frozen: not attempted');
    hero.failUpdate = () => undefined;
    feed(rig, agent('a', 'idle', null, 2));
    run(rig, 200);
    assert.equal(hero.frozen, false);
    assert.ok(hero.updateCalls > attempts);
    assert.equal(hero.lifecycle, 'idle');
  });

  void it('a frozen hero is not stuck forever: other heroes keep moving', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('bad', 'working'));
    feed(rig, agent('good', 'spawned'));
    rig.game.step();
    log.byId('bad').failUpdate = always('bad hero');
    run(rig, 400);
    feed(rig, agent('good', 'working'));
    run(rig, 15_000);
    assert.equal(log.byId('good').lifecycle, 'working');
    assert.ok(['advance', 'attack'].includes(log.byId('good').phase));
  });

  void it('a frozen despawned hero is still removed after EXIT_FAILSAFE_MS of game time', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    log.byId('a').failUpdate = always('exit boom');
    run(rig, 200);
    feed(rig, agent('a', 'despawned', null, 2));
    run(rig, EXIT_FAILSAFE_MS - 600);
    assert.equal(rig.game.heroSnapshot().length, 1, 'present before the failsafe');
    assert.equal(rig.game.heroSnapshot()[0]?.exiting, true);
    run(rig, 800);
    assert.deepEqual(rig.game.heroSnapshot(), []);
  });

  void it('a thrown non-Error is reported under one key and never changes hero state', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'idle'));
    rig.game.step();
    log.byId('a').failUpdate = () => 'SECRET string';
    for (let i = 0; i < 10; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    }
    assert.equal(rig.errors.length, 1);
    assert.equal(rig.game.heroSnapshot()[0]?.lifecycle, 'idle');
  });
});

void describe('entity draw faults', () => {
  void it('a throwing draw is reported with scope draw; the rest of the frame still renders', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    feed(rig, agent('b', 'working'));
    rig.game.step();
    log.byId('a').failDraw = always('draw boom');
    rig.surface.reset();
    assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    assert.equal(rig.errors.length, 1);
    assert.equal(rig.errors[0]?.scope, 'draw');
    assert.equal(rig.surface.composite, 'source-over');
    assert.equal(rig.surface.alpha, 1);
    assert.ok(rig.surface.bitmapDraws > 10, 'environment and the other hero are drawn');
  });

  void it('after 3 consecutive draw faults the entity is hidden; update keeps running (separate counters)', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    hero.failDraw = always('draw boom');
    const updates = hero.updateCalls;
    for (let i = 0; i < 20; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    assert.equal(hero.drawCalls, FAULT_LIMIT, 'draw is no longer attempted');
    assert.equal(hero.updateCalls - updates, 20, 'update is not frozen by draw faults');
    assert.equal(hero.frozen, false);
    assert.equal(hero.lifecycle, 'working');
  });

  void it('update faults do not hide the entity, and draw faults do not freeze it', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    hero.failUpdate = always('u');
    hero.failDraw = (call) => (call <= 2 ? new Error('d') : undefined);
    for (let i = 0; i < 10; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    assert.equal(hero.frozen, true);
    assert.equal(hero.drawFaults, 0, 'a clean draw reset the draw count');
    assert.ok(hero.drawCalls >= 10, 'drawn every frame');
  });

  void it('a lifecycle event un-hides a draw-faulted hero', () => {
    const { rig, log } = faultyRig();
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    hero.failDraw = always('hidden');
    run(rig, 200);
    const stopped = hero.drawCalls;
    run(rig, 200);
    assert.equal(hero.drawCalls, stopped);
    hero.failDraw = () => undefined;
    feed(rig, agent('a', 'idle', null, 2));
    run(rig, 200);
    assert.ok(hero.drawCalls > stopped);
  });
});

/** Replaces a prototype method for one test and restores it afterwards. */
const restores: (() => void)[] = [];
function patch<T extends object, K extends keyof T>(proto: T, key: K, value: T[K]): void {
  const original = proto[key];
  proto[key] = value;
  restores.push(() => {
    proto[key] = original;
  });
}

afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

void describe('campfire faults', () => {
  void it('a throwing Campfire.update is contained; heroes keep updating and the frame renders', () => {
    const rig = gameRig();
    patch(Campfire.prototype, 'update', () => {
      throw new Error('fire update');
    });
    feed(rig, agent('a', 'working'));
    for (let i = 0; i < 30; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    }
    assert.equal(rig.surface.count('clear'), 30);
    assert.equal(rig.errors.length, 1);
    assert.equal(rig.errors[0]?.scope, 'update');
    assert.equal(rig.game.heroSnapshot()[0]?.lifecycle, 'working');
  });

  void it('a throwing Campfire.draw is contained and the rest of the scene still draws', () => {
    const rig = gameRig();
    patch(Campfire.prototype, 'draw', () => {
      throw new Error('fire draw');
    });
    feed(rig, agent('a', 'idle'));
    for (let i = 0; i < 10; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    }
    assert.equal(rig.errors.length, 1);
    assert.equal(rig.errors[0]?.scope, 'draw');
    assert.ok(rig.surface.bitmapDraws > 100, 'environment and hero keep being drawn');
  });
});

void describe('surface and reporter faults', () => {
  void it('a Surface that throws once: frame does not throw, the fault is reported, the next frame renders fully', () => {
    const rig = gameRig();
    feed(rig, agent('a', 'working'));
    rig.surface.failOn('drawBitmap', 'surface boom', 1);
    assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    assert.equal(rig.errors.length, 1);
    assert.equal(
      rig.surface.composite,
      'source-over',
      'composite is restored after a render fault',
    );
    assert.equal(rig.surface.alpha, 1);
    rig.surface.reset();
    rig.game.frame(STEP_MS, rig.surface);
    assert.equal(rig.surface.count('clear'), 1);
    assert.ok(rig.surface.bitmapDraws >= 12, `${rig.surface.bitmapDraws} bitmap draws`);
    assert.equal(rig.errors.length, 1, 'no new error');
  });

  void it('a Surface that always throws on clear: frame never throws and the error is reported once, scope render', () => {
    const rig = gameRig();
    feed(rig, agent('a', 'working'));
    rig.surface.failOn('clear', 'dead surface', Infinity);
    for (let i = 0; i < 50; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    }
    assert.equal(rig.errors.length, 1);
    assert.equal(rig.errors[0]?.scope, 'render');
    assert.equal(rig.game.heroSnapshot()[0]?.lifecycle, 'working', 'stepping continued');
  });

  void it('a Surface that throws on everything, including the composite restore, still never throws out', () => {
    const rig = gameRig();
    rig.surface.failOn('clear', 'x', Infinity);
    const originalSetComposite = rig.surface.setComposite.bind(rig.surface);
    rig.surface.setComposite = (op) => {
      if (op === 'source-over' && rig.surface.count('clear') === 0 && rig.errors.length > 0) {
        throw new Error('restore boom');
      }
      originalSetComposite(op);
    };
    assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
  });

  void it('a throwing onError never escapes frame, step, or render, for update, draw, and render faults', () => {
    const log = heroLog<FaultyHero>((init) => new FaultyHero(init));
    const rig = gameRig({
      heroFactory: log.factory,
      onError: () => {
        throw new Error('reporter boom');
      },
    });
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    hero.failUpdate = always('u');
    hero.failDraw = always('d');
    rig.surface.failOn('fillRect', 'surface', Infinity);
    for (let i = 0; i < 20; i++) {
      assert.doesNotThrow(() => {
        rig.game.frame(STEP_MS, rig.surface);
        rig.game.step();
        rig.game.render(rig.surface);
      });
    }
    assert.equal(hero.lifecycle, 'working');
  });

  void it('a hero factory that throws is contained as a step fault and the game carries on', () => {
    let calls = 0;
    const rig = gameRig({
      heroFactory: (init) => {
        calls += 1;
        if (init.info.id === 'bad') {
          throw new Error('factory boom');
        }
        return new Hero(init);
      },
    });
    feed(rig, agent('bad', 'working'));
    feed(rig, agent('ok', 'working'));
    assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    assert.deepEqual(
      rig.game.heroSnapshot().map((h) => h.id),
      ['ok'],
    );
    assert.equal(rig.errors[0]?.scope, 'step');
    assert.equal(calls, 2);
  });

  void it('an applyAgentState that throws leaves the lifecycle unchanged and the game running', () => {
    class Stubborn extends Hero {
      override applyAgentState(): void {
        throw new Error('apply boom');
      }
    }
    const rig = gameRig({ heroFactory: (init) => new Stubborn(init) });
    feed(rig, agent('a', 'idle'));
    rig.game.step();
    feed(rig, agent('a', 'despawned', null, 2));
    assert.doesNotThrow(() => run(rig, 500));
    assert.deepEqual(rig.game.heroSnapshot(), [
      { id: 'a', lifecycle: 'idle', exiting: false, classId: null },
    ]);
    assert.equal(rig.errors.length, 1);
  });

  void it('the number of distinct reports per game is bounded (a bug cannot grow the set)', () => {
    const log = heroLog<FaultyHero>((init) => new FaultyHero(init));
    const reported: string[] = [];
    const rig = gameRig({
      heroFactory: log.factory,
      onError: (error: unknown) => {
        reported.push((error as Error).message);
      },
    });
    feed(rig, agent('a', 'working'));
    rig.game.step();
    const hero = log.byId('a');
    let n = 0;
    hero.failUpdate = () => new Error(`unique ${n++}`);
    for (let i = 0; i < 300; i++) {
      rig.game.frame(STEP_MS, rig.surface);
      hero.faults = 0;
      hero.frozen = false;
      hero.reported = null; // defeat the per-entity set so the Game-level bound is exercised
    }
    assert.ok(reported.length > 0 && reported.length <= 64, `${reported.length} reports`);
  });
});

void describe('guarded() on its own', () => {
  function entity(): Guardable {
    return { faults: 0, drawFaults: 0, frozen: false, reported: null };
  }

  void it('runs fn, counts, freezes, and never throws even when onError throws', () => {
    const e = entity();
    const scopes: ErrorScope[] = [];
    const bad = (): void => {
      throw new Error('x');
    };
    for (let i = 0; i < 5; i++) {
      assert.doesNotThrow(() =>
        guarded(e, 'update', bad, (_error, scope) => {
          scopes.push(scope);
          throw new Error('reporter');
        }),
      );
    }
    assert.equal(e.frozen, true);
    assert.equal(e.faults, 3);
    assert.deepEqual(scopes, ['update'], 'reported once');
  });

  void it('update is skipped while frozen; draw is attempted while frozen until its own limit', () => {
    const e = entity();
    e.frozen = true;
    let updates = 0;
    let draws = 0;
    guarded(
      e,
      'update',
      () => (updates += 1),
      () => undefined,
    );
    guarded(
      e,
      'draw',
      () => (draws += 1),
      () => undefined,
    );
    assert.deepEqual([updates, draws], [0, 1]);
    e.drawFaults = 3;
    guarded(
      e,
      'draw',
      () => (draws += 1),
      () => undefined,
    );
    assert.equal(draws, 1);
  });
});

void describe('a long run with every fault injected leaves lifecycle untouched', () => {
  void it('10 simulated minutes of update, draw, and surface faults', () => {
    const log = heroLog<FaultyHero>((init) => new FaultyHero(init));
    const rig = gameRig({ heroFactory: log.factory });
    const states = ['working', 'idle', 'spawned'] as const;
    for (let i = 0; i < 9; i++) {
      feed(rig, agent(`h${i}`, states[i % 3] ?? 'idle'));
    }
    rig.game.step();
    for (const hero of log.made) {
      hero.failUpdate = (call) => (call % 7 < 3 ? new Error('u') : undefined);
      hero.failDraw = (call) => (call % 11 < 4 ? new Error('d') : undefined);
    }
    const before = JSON.stringify(rig.game.heroSnapshot());
    steps(rig, 600_000, 100);
    assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
  });
});
