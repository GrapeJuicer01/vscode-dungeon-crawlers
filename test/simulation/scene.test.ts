// Simulation-driven integration test of the scene (testing strategy section 6, M4 plan note 12):
// the M3 rig (AgentMonitor with the SimulatorSource, a real WebviewBridge) feeds its posts through
// handleHostMessage into a SceneFeed over a real Game on a recording surface. The scene must
// follow host events only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXIT_FAILSAFE_MS, STEP_MS } from '../../src/game/data/tuning';
import { handleHostMessage } from '../../src/webview/hostMessages';
import { HostStateMirror } from '../../src/webview/hostState';
import { SceneFeed } from '../../src/webview/sceneFeed';
import { gameRig, heroLog, run } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';
import { monitorRig } from '../support/monitorRig';

const SECOND = 1000;

function simRig(count = 8): ReturnType<typeof monitorRig> {
  return monitorRig({
    start: false,
    config: { simulator: 'on', simulatorAgentCount: count, debounceMs: 100 },
  });
}

function connect(count: number): {
  host: ReturnType<typeof monitorRig>;
  game: GameRig;
  mirror: HostStateMirror;
  feed: SceneFeed;
  log: ReturnType<typeof heroLog>;
  deliver: () => void;
} {
  const host = simRig(count);
  const log = heroLog();
  const game = gameRig({ heroFactory: log.factory });
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
  return { host, game, mirror, feed, log, deliver };
}

void describe('scene follows the simulated host (8 agents, 10 simulated minutes)', () => {
  void it('after every second the heroes match the host agent list by id and lifecycle', async () => {
    const { host, game, deliver } = connect(8);
    const exitingSince = new Map<string, number>();
    let seenWorking = 0;
    let seenDespawn = 0;
    for (let second = 0; second < 600; second++) {
      await host.time.advance(SECOND);
      deliver();
      run(game, SECOND);
      const agents = new Map(host.monitor.getAgents().map((a) => [a.id, a.state]));
      const heroes = game.game.heroSnapshot();
      const ids = heroes.map((h) => h.id);
      assert.equal(new Set(ids).size, ids.length, `duplicate hero at ${second}s`);
      for (const hero of heroes) {
        if (hero.exiting) {
          exitingSince.set(hero.id, exitingSince.get(hero.id) ?? second);
          assert.ok(
            second - (exitingSince.get(hero.id) ?? second) <= EXIT_FAILSAFE_MS / SECOND,
            `${hero.id} exits too long`,
          );
          assert.equal(agents.has(hero.id), false, `${hero.id} exiting but still on the host`);
          seenDespawn += 1;
        } else {
          assert.equal(agents.get(hero.id), hero.lifecycle, `${hero.id} at ${second}s`);
          if (hero.lifecycle === 'working') seenWorking += 1;
        }
      }
      for (const [id, state] of agents) {
        const hero = heroes.find((h) => h.id === id);
        assert.ok(hero, `${id} (${state}) has no hero at ${second}s`);
      }
    }
    assert.ok(seenWorking > 100, 'agents worked');
    assert.ok(seenDespawn > 0, 'at least one agent despawned and exited through the animation');
    assert.deepEqual(game.errors, []);
  });

  void it('a second ready replaces the snapshot without duplicating heroes', async () => {
    const { host, game, deliver } = connect(8);
    await host.time.advance(30 * SECOND);
    deliver();
    run(game, 30 * SECOND);
    const before = JSON.stringify(
      game.game
        .heroSnapshot()
        .filter((h) => !h.exiting)
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    host.ready();
    deliver();
    run(game, 2 * SECOND);
    const after = game.game.heroSnapshot();
    assert.equal(new Set(after.map((h) => h.id)).size, after.length);
    assert.equal(
      JSON.stringify(after.filter((h) => !h.exiting).sort((a, b) => a.id.localeCompare(b.id))),
      before,
    );
  });

  void it('a fresh Game fed the mirror list (webview reload) matches the running scene', async () => {
    const { host, game, mirror, deliver } = connect(8);
    for (let second = 0; second < 120; second++) {
      await host.time.advance(SECOND);
      deliver();
      run(game, SECOND);
      if (second % 20 === 19) {
        run(game, 3 * SECOND); // let exits finish and positions settle
        const rebuilt = gameRig();
        rebuilt.game.enqueueSnapshot(mirror.agents());
        run(rebuilt, 1000);
        const live = (rig: GameRig): string[] =>
          rig.game
            .heroSnapshot()
            .filter((h) => !h.exiting)
            .map((h) => `${h.id}:${h.lifecycle}`)
            .sort();
        assert.deepEqual(live(rebuilt), live(game));
      }
    }
  });

  void it('control messages from the webview side change nothing in the scene or the host', async () => {
    const { host, game, deliver } = connect(3);
    await host.time.advance(20 * SECOND);
    deliver();
    run(game, SECOND);
    const hostBefore = JSON.stringify(host.monitor.getAgents());
    const sceneBefore = JSON.stringify(game.game.heroSnapshot());
    for (const forged of [
      { type: 'stopAgent', id: 'sim-0-0' },
      { type: 'despawn' },
      { type: 'sendText', text: 'x' },
    ]) {
      host.bridge.handleMessage(forged);
    }
    deliver();
    assert.equal(JSON.stringify(host.monitor.getAgents()), hostBefore);
    assert.equal(JSON.stringify(game.game.heroSnapshot()), sceneBefore);
  });

  void it('a game that throws every frame does not disturb the simulation or the host list', async () => {
    const { host, deliver } = connect(4);
    const broken = gameRig({
      onError: () => {
        throw new Error('reporter');
      },
    });
    broken.surface.failOn('clear', 'dead', Infinity);
    const mirror = new HostStateMirror();
    const feed = new SceneFeed(mirror, broken.game, () => undefined);
    let delivered = 0;
    for (let second = 0; second < 60; second++) {
      await host.time.advance(SECOND);
      while (delivered < host.posts.length) {
        handleHostMessage(host.posts[delivered], feed);
        delivered += 1;
      }
      for (let i = 0; i < 60; i++) {
        broken.game.frame(STEP_MS, broken.surface);
      }
    }
    deliver();
    assert.ok(host.monitor.getAgents().length > 0);
    assert.equal(mirror.agentCount, host.monitor.getAgents().length);
  });
});
