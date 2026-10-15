// GameHost with an injected scheduler (M4 plan test note 7).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Game } from '../../src/game/Game';
import type { ErrorScope } from '../../src/game/ports';
import { GameHost } from '../../src/webview/gameHost';
import { FakeScheduler, RecordingSurface } from '../support/engineFakes';

function rig(options: { hidden?: boolean; frame?: (delta: number) => void } = {}): {
  host: GameHost;
  scheduler: FakeScheduler;
  deltas: number[];
  errors: { error: unknown; scope: ErrorScope }[];
  pendingAtFrame: number[];
  state: { hidden: boolean };
} {
  const scheduler = new FakeScheduler();
  const deltas: number[] = [];
  const pendingAtFrame: number[] = [];
  const errors: { error: unknown; scope: ErrorScope }[] = [];
  const state = { hidden: options.hidden ?? false };
  const game = {
    frame: (delta: number): void => {
      deltas.push(delta);
      pendingAtFrame.push(scheduler.pendingCount);
      options.frame?.(delta);
    },
  } as unknown as Game;
  const host = new GameHost({
    game,
    surface: new RecordingSurface(),
    scheduler,
    onError: (error, scope) => {
      errors.push({ error, scope });
    },
    isHidden: () => state.hidden,
  });
  return { host, scheduler, deltas, errors, pendingAtFrame, state };
}

void describe('GameHost', () => {
  void it('start requests one frame; a double start is harmless', () => {
    const r = rig();
    r.host.start();
    r.host.start();
    assert.equal(r.scheduler.requested.length, 1);
  });

  void it('the first frame has delta 0, later frames the timestamp difference', () => {
    const r = rig();
    r.host.start();
    r.scheduler.tick(1000);
    r.scheduler.tick(1016.5);
    r.scheduler.tick(1050);
    assert.deepEqual(r.deltas, [0, 16.5, 33.5]);
  });

  void it('schedules the next frame BEFORE calling game.frame', () => {
    const r = rig();
    r.host.start();
    r.scheduler.tick(1);
    assert.deepEqual(r.pendingAtFrame, [1]);
  });

  void it('a throwing game.frame still leaves a pending request and is reported with scope host', () => {
    const r = rig({
      frame: () => {
        throw new Error('frame boom');
      },
    });
    r.host.start();
    for (let i = 0; i < 5; i++) {
      assert.doesNotThrow(() => r.scheduler.tick(i * 16));
      assert.equal(r.scheduler.pendingCount, 1);
    }
    assert.ok(r.errors.length >= 1);
    assert.equal(r.errors[0]?.scope, 'host');
  });

  void it('stop cancels the pending frame and is idempotent; a stale callback does nothing', () => {
    const r = rig();
    r.host.start();
    const stale = [...r.scheduler.pending.values()][0];
    r.host.stop();
    r.host.stop();
    assert.equal(r.scheduler.pendingCount, 0);
    assert.equal(r.scheduler.cancelled.length, 1);
    stale?.(10);
    assert.deepEqual(r.deltas, []);
    assert.equal(r.scheduler.pendingCount, 0);
  });

  void it('setHidden(true) cancels; setHidden(false) restarts and resumes with delta 0 (no catch-up)', () => {
    const r = rig();
    r.host.start();
    r.scheduler.tick(1000);
    r.host.setHidden(true);
    assert.equal(r.scheduler.pendingCount, 0);
    r.host.setHidden(false);
    assert.equal(r.scheduler.pendingCount, 1);
    r.scheduler.tick(600_000);
    assert.deepEqual(r.deltas, [0, 0]);
    r.scheduler.tick(600_016);
    assert.equal(r.deltas[2], 16);
  });

  void it('repeated hidden or visible calls never double-schedule', () => {
    const r = rig();
    r.host.start();
    r.host.setHidden(false);
    r.host.setHidden(false);
    assert.equal(r.scheduler.pendingCount, 1);
    r.host.setHidden(true);
    r.host.setHidden(true);
    assert.equal(r.scheduler.pendingCount, 0);
  });

  void it('start while the document is hidden schedules nothing until it is shown', () => {
    const r = rig({ hidden: true });
    r.host.start();
    assert.equal(r.scheduler.requested.length, 0);
    r.host.setHidden(false);
    assert.equal(r.scheduler.pendingCount, 1);
  });

  void it('setHidden(false) before start or after stop does not start the loop', () => {
    const r = rig();
    r.host.setHidden(false);
    assert.equal(r.scheduler.requested.length, 0);
    r.host.start();
    r.host.stop();
    r.host.setHidden(true);
    r.host.setHidden(false);
    assert.equal(r.scheduler.pendingCount, 0);
  });

  void it('a frame that arrives while hidden is dropped without drawing', () => {
    const r = rig();
    r.host.start();
    const cb = [...r.scheduler.pending.values()][0];
    r.state.hidden = true;
    r.host.setHidden(true);
    cb?.(5);
    assert.deepEqual(r.deltas, []);
  });

  void it('a throwing scheduler.request is reported, never thrown', () => {
    const r = rig();
    r.scheduler.throwOnRequest = 1;
    assert.doesNotThrow(() => r.host.start());
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0]?.scope, 'host');
  });

  void it('a throwing isHidden counts as visible and a throwing onError is swallowed', () => {
    const scheduler = new FakeScheduler();
    const host = new GameHost({
      game: { frame: () => undefined } as unknown as Game,
      surface: new RecordingSurface(),
      scheduler,
      onError: () => {
        throw new Error('reporter');
      },
      isHidden: () => {
        throw new Error('hidden');
      },
    });
    assert.doesNotThrow(() => host.start());
    assert.equal(scheduler.pendingCount, 1);
  });
});
