// SceneFeed: mirror first, then the engine sink. Config reaches the sink only as the three game
// settings (E1), progress as plain numbers; neither can touch a hero (M4 plan note 11, E1 note 9).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GameConfig, GameSink } from '../../src/game/Game';
import type { Progress } from '../../src/shared/progress';
import { PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { AgentInfo, ConfigSnapshot } from '../../src/shared/protocol';
import { HostStateMirror } from '../../src/webview/hostState';
import { SceneFeed } from '../../src/webview/sceneFeed';
import { agent } from '../support/engineFakes';

const CONFIG: ConfigSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  enemiesEnabled: false,
  killsPerStage: 12,
  maxEnemies: 3,
};
const PROGRESS: Progress = {
  schemaVersion: 1,
  stageIndex: 2,
  killsInStage: 3,
  totalKills: 33,
  bossesDefeated: 1,
  cycle: 0,
};
const NO_LOAD = (): void => undefined;

function recordingSink(mirror: HostStateMirror): { sink: GameSink; log: string[] } {
  const log: string[] = [];
  const sink: GameSink = {
    applyProgress(p: Progress): void {
      log.push(`progress:${p.totalKills}:mirror=${mirror.progress?.totalKills ?? 'none'}`);
    },
    applyConfig(c: GameConfig): void {
      log.push(`config:${JSON.stringify(c)}:mirror=${mirror.config === null ? 'none' : 'set'}`);
    },
    enqueueAgent(a: AgentInfo): void {
      log.push(`agent:${a.id}:${a.state}:mirror=${mirror.getAgent(a.id)?.state ?? 'none'}`);
    },
    enqueueSnapshot(list: readonly AgentInfo[]): void {
      log.push(`snapshot:${list.length}:mirror=${mirror.agentCount}`);
    },
  };
  return { sink, log };
}

void describe('SceneFeed', () => {
  void it('applyAgent updates the mirror before the sink sees the event', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    new SceneFeed(mirror, sink, NO_LOAD).applyAgent(agent('a', 'working'));
    assert.deepEqual(log, ['agent:a:working:mirror=working']);
  });

  void it('replaceAgents updates the mirror before the sink gets the snapshot', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    new SceneFeed(mirror, sink, NO_LOAD).replaceAgents([agent('a', 'idle'), agent('b', 'working')]);
    assert.deepEqual(log, ['snapshot:2:mirror=2']);
  });

  void it('a despawned event still reaches the sink even though the mirror deletes the agent', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    const feed = new SceneFeed(mirror, sink, NO_LOAD);
    feed.applyAgent(agent('a', 'working'));
    feed.applyAgent(agent('a', 'despawned'));
    assert.deepEqual(log, ['agent:a:working:mirror=working', 'agent:a:despawned:mirror=none']);
  });

  void it('config reaches the mirror, then the sink as exactly the three game settings', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    new SceneFeed(mirror, sink, NO_LOAD).applyConfig(CONFIG);
    assert.deepEqual(log, [
      'config:{"enemiesEnabled":false,"killsPerStage":12,"maxEnemies":3}:mirror=set',
    ]);
    assert.deepEqual(mirror.config, CONFIG);
  });

  void it('progress reaches the mirror, then the sink, then onProgressLoaded (in that order)', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    new SceneFeed(mirror, sink, () => log.push('loaded')).applyProgress(PROGRESS);
    assert.deepEqual(log, ['progress:33:mirror=33', 'loaded']);
    assert.deepEqual(mirror.progress, PROGRESS);
  });

  void it('config and agent events never fire onProgressLoaded (saving stays closed)', () => {
    const mirror = new HostStateMirror();
    const { sink } = recordingSink(mirror);
    let loaded = 0;
    const feed = new SceneFeed(mirror, sink, () => (loaded += 1));
    feed.applyConfig(CONFIG);
    feed.replaceAgents([agent('a', 'idle')]);
    feed.applyAgent(agent('a', 'working'));
    assert.equal(loaded, 0);
  });

  void it('a throwing sink for progress does not fire onProgressLoaded and the mirror has it', () => {
    const mirror = new HostStateMirror();
    const { sink } = recordingSink(mirror);
    sink.applyProgress = (): void => {
      throw new Error('sink');
    };
    let loaded = 0;
    const feed = new SceneFeed(mirror, sink, () => (loaded += 1));
    assert.throws(() => feed.applyProgress(PROGRESS));
    assert.equal(loaded, 0, 'fail closed: a failed apply never opens saving');
    assert.deepEqual(mirror.progress, PROGRESS);
  });

  void it('with a null sink (engine failed to boot) the mirror still works', () => {
    const mirror = new HostStateMirror();
    const feed = new SceneFeed(mirror, null, NO_LOAD);
    feed.replaceAgents([agent('a', 'idle')]);
    feed.applyAgent(agent('b', 'working'));
    feed.applyConfig(CONFIG);
    feed.applyProgress(PROGRESS);
    assert.deepEqual(
      mirror.agents().map((a) => a.id),
      ['a', 'b'],
    );
  });

  void it('a throwing sink does not stop the mirror from having been updated', () => {
    const mirror = new HostStateMirror();
    const sink: GameSink = {
      ...recordingSink(mirror).sink,
      enqueueAgent(): void {
        throw new Error('sink');
      },
      enqueueSnapshot(): void {
        throw new Error('sink');
      },
    };
    const feed = new SceneFeed(mirror, sink, NO_LOAD);
    assert.throws(() => feed.applyAgent(agent('a', 'idle')));
    assert.equal(mirror.agentCount, 1);
  });
});
