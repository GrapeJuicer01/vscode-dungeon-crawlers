// ProgressSaver (E1 plan test note 9, ADR 0012): fail closed until markLoaded, urgent saves go out
// at once, ordinary ones are throttled to one per PROGRESS_SAVE_INTERVAL_MS with the latest value
// winning, flush sends the pending value, dispose cancels the timer.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';
import { PROGRESS_SAVE_INTERVAL_MS, ProgressSaver } from '../../src/webview/progressSaver';

const at = (totalKills: number): Progress => ({
  ...DEFAULT_PROGRESS,
  totalKills,
  killsInStage: totalKills,
});

/** Fake timers: set() records, advance() runs what is due. */
class FakeTimers {
  now = 0;
  readonly cleared: unknown[] = [];
  readonly #pending = new Map<number, { at: number; run: () => void }>();
  #next = 1;
  set = (run: () => void, ms: number): unknown => {
    const handle = this.#next++;
    this.#pending.set(handle, { at: this.now + ms, run });
    return handle;
  };
  clear = (handle: unknown): void => {
    this.cleared.push(handle);
    this.#pending.delete(handle as number);
  };
  get pending(): number {
    return this.#pending.size;
  }
  advance(ms: number): void {
    this.now += ms;
    for (const [handle, entry] of [...this.#pending]) {
      if (entry.at <= this.now) {
        this.#pending.delete(handle);
        entry.run();
      }
    }
  }
}

function rig(): { saver: ProgressSaver; sent: Progress[]; timers: FakeTimers } {
  const sent: Progress[] = [];
  const timers = new FakeTimers();
  const saver = new ProgressSaver((p) => void sent.push(p), timers);
  return { saver, sent, timers };
}

void describe('ProgressSaver', () => {
  void it('throttles at 15 seconds', () => {
    assert.equal(PROGRESS_SAVE_INTERVAL_MS, 15000);
  });

  void it('sends nothing before markLoaded: submit, urgent submit, and flush are all silent, and no timer is armed', () => {
    const { saver, sent, timers } = rig();
    saver.submit(at(1), false);
    saver.submit(at(2), true);
    saver.flush();
    timers.advance(PROGRESS_SAVE_INTERVAL_MS * 3);
    assert.deepEqual(sent, []);
    assert.equal(timers.pending, 0);
  });

  void it('a value submitted before markLoaded is not remembered and never leaks out later', () => {
    const { saver, sent, timers } = rig();
    saver.submit(at(5), false);
    saver.markLoaded();
    saver.flush();
    timers.advance(PROGRESS_SAVE_INTERVAL_MS * 2);
    assert.deepEqual(sent, []);
  });

  void it('an urgent save (a boss defeat) is sent immediately', () => {
    const { saver, sent } = rig();
    saver.markLoaded();
    saver.submit(at(9), true);
    assert.deepEqual(sent, [at(9)]);
  });

  void it('ordinary saves are sent at most once per interval, the latest value winning (trailing send)', () => {
    const { saver, sent, timers } = rig();
    saver.markLoaded();
    saver.submit(at(1), false);
    saver.submit(at(2), false);
    saver.submit(at(3), false);
    assert.deepEqual(sent, [], 'nothing yet: the first one arms the timer');
    assert.equal(timers.pending, 1);
    timers.advance(PROGRESS_SAVE_INTERVAL_MS - 1);
    assert.deepEqual(sent, []);
    timers.advance(1);
    assert.deepEqual(sent, [at(3)]);
    assert.equal(timers.pending, 0);
    saver.submit(at(4), false);
    timers.advance(PROGRESS_SAVE_INTERVAL_MS);
    assert.deepEqual(sent, [at(3), at(4)]);
  });

  void it('an urgent save cancels the pending timer and carries the latest value, so the old one is not sent again', () => {
    const { saver, sent, timers } = rig();
    saver.markLoaded();
    saver.submit(at(1), false);
    saver.submit(at(2), true);
    assert.deepEqual(sent, [at(2)]);
    assert.equal(timers.pending, 0);
    timers.advance(PROGRESS_SAVE_INTERVAL_MS * 2);
    assert.deepEqual(sent, [at(2)], 'no duplicate trailing send');
  });

  void it('flush (pagehide) sends the pending value now and cancels the timer; a second flush sends nothing', () => {
    const { saver, sent, timers } = rig();
    saver.markLoaded();
    saver.submit(at(7), false);
    saver.flush();
    assert.deepEqual(sent, [at(7)]);
    assert.equal(timers.pending, 0);
    saver.flush();
    timers.advance(PROGRESS_SAVE_INTERVAL_MS * 2);
    assert.deepEqual(sent, [at(7)]);
  });

  void it('dispose cancels the timer and drops the pending value', () => {
    const { saver, sent, timers } = rig();
    saver.markLoaded();
    saver.submit(at(1), false);
    saver.dispose();
    assert.equal(timers.pending, 0);
    timers.advance(PROGRESS_SAVE_INTERVAL_MS * 2);
    saver.flush();
    assert.deepEqual(sent, []);
  });

  void it('sends the very object it was given (the creator copies it later), never a mutation of it', () => {
    const { saver, sent } = rig();
    saver.markLoaded();
    const p = at(3);
    saver.submit(p, true);
    assert.equal(sent[0], p);
    assert.deepEqual(p, at(3));
  });

  void it('markLoaded is idempotent and does not send by itself', () => {
    const { saver, sent } = rig();
    saver.markLoaded();
    saver.markLoaded();
    assert.deepEqual(sent, []);
  });
});
