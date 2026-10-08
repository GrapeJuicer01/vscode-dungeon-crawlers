// SceneFeed: mirror first, then the engine sink; config never reaches the sink (M4 plan note 11).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AgentEventSink } from '../../src/game/Game';
import { PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { AgentInfo } from '../../src/shared/protocol';
import { HostStateMirror } from '../../src/webview/hostState';
import { SceneFeed } from '../../src/webview/sceneFeed';
import { agent } from '../support/engineFakes';

function recordingSink(mirror: HostStateMirror): { sink: AgentEventSink; log: string[] } {
  const log: string[] = [];
  const sink: AgentEventSink = {
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
    new SceneFeed(mirror, sink).applyAgent(agent('a', 'working'));
    assert.deepEqual(log, ['agent:a:working:mirror=working']);
  });

  void it('replaceAgents updates the mirror before the sink gets the snapshot', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    new SceneFeed(mirror, sink).replaceAgents([agent('a', 'idle'), agent('b', 'working')]);
    assert.deepEqual(log, ['snapshot:2:mirror=2']);
  });

  void it('a despawned event still reaches the sink even though the mirror deletes the agent', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    const feed = new SceneFeed(mirror, sink);
    feed.applyAgent(agent('a', 'working'));
    feed.applyAgent(agent('a', 'despawned'));
    assert.deepEqual(log, ['agent:a:working:mirror=working', 'agent:a:despawned:mirror=none']);
  });

  void it('config reaches the mirror only', () => {
    const mirror = new HostStateMirror();
    const { sink, log } = recordingSink(mirror);
    new SceneFeed(mirror, sink).applyConfig({ protocolVersion: PROTOCOL_VERSION });
    assert.deepEqual(log, []);
    assert.deepEqual(mirror.config, { protocolVersion: PROTOCOL_VERSION });
  });

  void it('with a null sink (engine failed to boot) the mirror still works', () => {
    const mirror = new HostStateMirror();
    const feed = new SceneFeed(mirror, null);
    feed.replaceAgents([agent('a', 'idle')]);
    feed.applyAgent(agent('b', 'working'));
    feed.applyConfig({ protocolVersion: PROTOCOL_VERSION });
    assert.deepEqual(
      mirror.agents().map((a) => a.id),
      ['a', 'b'],
    );
  });

  void it('a throwing sink does not stop the mirror from having been updated', () => {
    const mirror = new HostStateMirror();
    const sink: AgentEventSink = {
      enqueueAgent(): void {
        throw new Error('sink');
      },
      enqueueSnapshot(): void {
        throw new Error('sink');
      },
    };
    const feed = new SceneFeed(mirror, sink);
    assert.throws(() => feed.applyAgent(agent('a', 'idle')));
    assert.equal(mirror.agentCount, 1);
  });
});
