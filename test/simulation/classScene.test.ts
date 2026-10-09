// Simulation-driven integration test with the shipped class heroes (testing strategy section 6,
// H1 plan test notes 1 and 9): the SimulatorSource drives a full hero lifecycle for 8 agents over
// 10 simulated minutes into a real Game that uses the default createHero factory. Every hero's
// class is classFor(id) at every second, the party shows several classes and plays effects, and
// lifecycles follow host events only.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { classFor } from '../../src/game/data/classMap';
import { EffectPool } from '../../src/game/Effects';
import { handleHostMessage } from '../../src/webview/hostMessages';
import { HostStateMirror } from '../../src/webview/hostState';
import { SceneFeed } from '../../src/webview/sceneFeed';
import { gameRig, run } from '../support/engineFakes';
import { monitorRig } from '../support/monitorRig';

const SECOND = 1000;

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

function connect(count: number) {
  const host = monitorRig({
    start: false,
    config: { simulator: 'on', simulatorAgentCount: count, debounceMs: 100 },
  });
  const game = gameRig();
  const mirror = new HostStateMirror();
  const feed = new SceneFeed(mirror, game.game, () => undefined);
  let delivered = 0;
  const deliver = (): void => {
    while (delivered < host.posts.length) {
      handleHostMessage(host.posts[delivered], feed);
      delivered += 1;
    }
    game.mirror = [...mirror.agents()];
  };
  host.ready();
  host.monitor.start();
  return { host, game, deliver };
}

void describe('class heroes follow the simulated host (8 agents, 10 simulated minutes)', () => {
  void it('lifecycle matches the host, class is classFor(id) throughout, and effects play', async () => {
    const effects = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const original = EffectPool.prototype.spawn;
    EffectPool.prototype.spawn = function (
      this: EffectPool,
      ...args: Parameters<EffectPool['spawn']>
    ) {
      effects.add(args[0]);
      return original.apply(this, args);
    };
    restores.push(() => {
      EffectPool.prototype.spawn = original;
    });

    const { host, game, deliver } = connect(8);
    const classOfId = new Map<string, string | null>();
    let seenWorking = 0;
    for (let second = 0; second < 600; second++) {
      await host.time.advance(SECOND);
      deliver();
      run(game, SECOND);
      const agents = new Map(host.monitor.getAgents().map((a) => [a.id, a.state]));
      for (const hero of game.game.heroSnapshot()) {
        assert.equal(hero.classId, classFor(hero.id), `${hero.id} at ${second}s`);
        const first = classOfId.get(hero.id);
        assert.ok(first === undefined || first === hero.classId, `${hero.id} changed class`);
        classOfId.set(hero.id, hero.classId);
        if (!hero.exiting) {
          assert.equal(agents.get(hero.id), hero.lifecycle, `${hero.id} at ${second}s`);
          if (hero.lifecycle === 'working') seenWorking += 1;
        }
      }
    }
    assert.ok(seenWorking > 100);
    assert.ok(
      new Set(classOfId.values()).size >= 3,
      'the simulated party shows at least three classes',
    );
    assert.ok(effects.size >= 3, `effects played: ${[...effects].join()}`);
    assert.deepEqual(game.errors, []);
  });

  void it('a second ready (a webview reload) rebuilds the same classes from the host list', async () => {
    const { host, game, deliver } = connect(8);
    await host.time.advance(60 * SECOND);
    deliver();
    run(game, 3 * SECOND);
    const before = game.game
      .heroSnapshot()
      .filter((h) => !h.exiting)
      .map((h) => [h.id, h.classId]);
    assert.ok(before.length >= 1);
    host.ready();
    deliver();
    run(game, 3 * SECOND);
    const after = game.game
      .heroSnapshot()
      .filter((h) => !h.exiting)
      .map((h) => [h.id, h.classId]);
    assert.deepEqual(after.sort(), before.sort());
    assert.deepEqual(game.errors, []);
  });
});
