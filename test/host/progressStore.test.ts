// src/host/progressStore.ts (E1 plan test note 2; ADR 0012). The store is validated, monotonic
// (a lower totalKills than stored is ignored), coalesced (one write per PROGRESS_WRITE_COALESCE_MS,
// latest wins), read-only when the stored value is from a newer version, and total: nothing
// escapes it and its logs are fixed strings (invariants 4 and 7). Fake store, timers, and logger.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROGRESS_KEY,
  PROGRESS_WRITE_COALESCE_MS,
  ProgressStore,
} from '../../src/host/progressStore';
import type { KeyValueStore, StoreTimers } from '../../src/host/progressStore';
import type { BridgeLogger } from '../../src/host/webviewBridge';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';

const SECRET = 'SECRET-STORE-PAYLOAD';
const P = (totalKills: number, extra: Partial<Progress> = {}): Progress => ({
  schemaVersion: 1,
  stageIndex: 1,
  killsInStage: totalKills % 30,
  totalKills,
  bossesDefeated: 0,
  cycle: 0,
  ...extra,
});

class FakeStore implements KeyValueStore {
  value: unknown;
  readonly updates: { key: string; value: unknown }[] = [];
  readonly gets: string[] = [];
  getThrows = false;
  updateMode: 'ok' | 'reject' | 'throw' = 'ok';

  constructor(value?: unknown) {
    this.value = value;
  }

  get(key: string): unknown {
    this.gets.push(key);
    if (this.getThrows) {
      throw new Error(SECRET);
    }
    return this.value;
  }

  update(key: string, value: unknown): PromiseLike<void> {
    this.updates.push({ key, value });
    if (this.updateMode === 'throw') {
      throw new Error(SECRET);
    }
    if (this.updateMode === 'reject') {
      return Promise.reject(new Error(SECRET));
    }
    this.value = value;
    return Promise.resolve();
  }
}

class FakeTimers implements StoreTimers {
  readonly pending = new Map<number, { run: () => void; ms: number }>();
  readonly delays: number[] = [];
  clearThrows = false;
  #next = 1;

  set(run: () => void, ms: number): number {
    const handle = this.#next++;
    this.pending.set(handle, { run, ms });
    this.delays.push(ms);
    return handle;
  }

  clear(handle: unknown): void {
    if (this.clearThrows) {
      throw new Error('clear threw');
    }
    this.pending.delete(handle as number);
  }

  fire(): void {
    for (const [handle, timer] of [...this.pending]) {
      this.pending.delete(handle);
      timer.run();
    }
  }
}

class Log implements BridgeLogger {
  readonly errors: string[] = [];
  readonly traces: string[] = [];
  throws = false;

  trace(message: string): void {
    this.traces.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
    if (this.throws) {
      throw new Error('logger threw');
    }
  }
}

function make(stored?: unknown): {
  store: ProgressStore;
  backing: FakeStore;
  timers: FakeTimers;
  log: Log;
} {
  const backing = new FakeStore(stored);
  const timers = new FakeTimers();
  const log = new Log();
  return {
    store: new ProgressStore({ store: backing, timers, logger: log }),
    backing,
    timers,
    log,
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((done) => setImmediate(done));
}

void describe('ProgressStore.load between save and flush', () => {
  void it('returns the pending value before the coalesce flush and the written value after it', () => {
    const { store, backing, timers } = make(P(40));
    store.load();
    store.save(P(55));
    assert.equal(backing.updates.length, 0, 'nothing written inside the window');
    assert.deepEqual(store.load(), P(55), 'the pending value');
    timers.fire();
    assert.equal(backing.updates.length, 1);
    assert.deepEqual(backing.updates.at(-1)?.value, P(55));
    assert.deepEqual(store.load(), P(55), 'the written value');
  });
});

void describe('ProgressStore.load', () => {
  void it('uses the key pixelAgents.progress and a 2 s coalesce window', () => {
    assert.equal(PROGRESS_KEY, 'pixelAgents.progress');
    assert.equal(PROGRESS_WRITE_COALESCE_MS, 2000);
  });

  void it('a fresh install returns the default, writes nothing, logs nothing', () => {
    const { store, backing, log } = make();
    assert.deepEqual(store.load(), DEFAULT_PROGRESS);
    assert.deepEqual(backing.updates, []);
    assert.deepEqual(log.errors, []);
  });

  void it('returns a valid stored value and reads storage once (the first outcome is cached)', () => {
    const { store, backing } = make(P(40));
    assert.deepEqual(store.load(), P(40));
    assert.equal(store.load(), store.load());
    assert.deepEqual(backing.gets, [PROGRESS_KEY]);
  });

  void it('an invalid stored value gives the default and one fixed line, and is not touched', () => {
    const junk = { schemaVersion: 1, stageIndex: 'two', note: SECRET };
    const { store, backing, log } = make(junk);
    assert.deepEqual(store.load(), DEFAULT_PROGRESS);
    assert.deepEqual(log.errors, ['progress: stored value invalid, using defaults']);
    assert.deepEqual(backing.updates, []);
    assert.ok(!log.errors.join().includes(SECRET));
  });

  void it('a value from a newer version gives the default and one fixed line', () => {
    const { store, log } = make({ ...P(10), schemaVersion: 99 });
    assert.deepEqual(store.load(), DEFAULT_PROGRESS);
    assert.deepEqual(log.errors, ['progress: stored value is from a newer version, read-only']);
  });

  void it('a throwing get never escapes: defaults, fixed lines, no error text', () => {
    const { store, backing, log } = make(P(5));
    backing.getThrows = true;
    let loaded: Progress | undefined;
    assert.doesNotThrow(() => {
      loaded = store.load();
    });
    assert.deepEqual(loaded, DEFAULT_PROGRESS);
    assert.ok(log.errors.length >= 1);
    assert.ok(log.errors.every((line) => line.startsWith('progress: ')));
    assert.ok(!log.errors.join().includes(SECRET));
  });

  void it('a throwing logger never escapes load', () => {
    const { store, log } = make({ schemaVersion: 1 });
    log.throws = true;
    assert.doesNotThrow(() => store.load());
  });
});

void describe('ProgressStore.load after saves (hide/show and Reload Webviews restore the counters)', () => {
  // E1 plan task 17 and risk R11: a webview rebuilt in the same extension session (panel hidden and
  // shown, or Developer: Reload Webviews) must start from the latest progress, not from the value
  // read at activation. Each document load sends `ready`, and the bridge answers with load().
  void it('a saved value that has been written is what the next load returns', () => {
    const { store, timers } = make(P(40));
    assert.deepEqual(store.load(), P(40));
    store.save(P(55));
    timers.fire();
    assert.deepEqual(store.load(), P(55));
  });

  void it('a saved value still waiting for the coalesce window is returned too (the panel can be re-shown within 2 s)', () => {
    const { store } = make(P(40));
    store.load();
    store.save(P(47));
    assert.deepEqual(store.load(), P(47));
  });

  void it('the latest of several saves wins, and a dropped (lower or invalid) save never replaces it', () => {
    const { store, timers } = make(P(40));
    store.load();
    store.save(P(50));
    store.save(P(45));
    store.save({ ...P(60), stageIndex: 0 });
    assert.deepEqual(store.load(), P(50));
    store.save(P(52));
    timers.fire();
    assert.deepEqual(store.load(), P(52));
  });

  void it('a read-only (newer version) store keeps returning the defaults after saves', () => {
    const { store } = make({ ...P(10), schemaVersion: 99 });
    assert.deepEqual(store.load(), DEFAULT_PROGRESS);
    store.save(P(500));
    assert.deepEqual(store.load(), DEFAULT_PROGRESS);
  });
});

void describe('ProgressStore.save: validation and monotonic rule', () => {
  void it('a valid save schedules one write after the coalesce window', () => {
    const { store, backing, timers } = make();
    store.save(P(3));
    assert.deepEqual(backing.updates, []);
    assert.deepEqual(timers.delays, [PROGRESS_WRITE_COALESCE_MS]);
    timers.fire();
    assert.deepEqual(backing.updates, [{ key: PROGRESS_KEY, value: P(3) }]);
  });

  void it('the written value is a fresh copy with exactly the six keys', () => {
    const { store, backing, timers } = make();
    const mine = P(3);
    store.save(mine);
    timers.fire();
    const written = backing.updates[0]?.value;
    assert.notEqual(written, mine);
    assert.deepEqual(Object.keys(written as object), [
      'schemaVersion',
      'stageIndex',
      'killsInStage',
      'totalKills',
      'bossesDefeated',
      'cycle',
    ]);
  });

  void it('saving does not need an explicit load first', () => {
    const { store, backing, timers } = make(P(50));
    store.save(P(60));
    timers.fire();
    assert.equal((backing.updates[0]?.value as Progress).totalKills, 60);
    assert.deepEqual(backing.gets, [PROGRESS_KEY]);
  });

  void it('an invalid save is dropped with one fixed line and schedules nothing', () => {
    const { store, backing, timers, log } = make();
    for (const bad of [
      P(1, { stageIndex: 0 }),
      { ...P(1), agentId: SECRET },
      null,
      undefined,
      'x',
      P(1, { killsInStage: -1 }),
    ]) {
      store.save(bad as unknown as Progress);
    }
    assert.equal(timers.pending.size, 0);
    assert.deepEqual(backing.updates, []);
    assert.ok(log.errors.length >= 1);
    assert.ok(log.errors.every((line) => line === 'progress: dropped invalid save'));
  });

  void it('a lower totalKills than stored is ignored; an equal one is accepted', () => {
    const { store, backing, timers } = make(P(50));
    store.save(P(49));
    assert.equal(timers.pending.size, 0, 'a lower count schedules nothing');
    store.save(P(50, { bossesDefeated: 1 }));
    timers.fire();
    assert.equal(backing.updates.length, 1);
  });

  void it('a lower count than the pending one is ignored; the pending one is not replaced', () => {
    const { store, backing, timers } = make();
    store.save(P(60));
    store.save(P(55));
    timers.fire();
    assert.deepEqual(
      backing.updates.map((u) => (u.value as Progress).totalKills),
      [60],
    );
  });

  void it('after a write, the floor is the written count', () => {
    const { store, backing, timers } = make();
    store.save(P(60));
    timers.fire();
    store.save(P(58));
    assert.equal(timers.pending.size, 0);
    store.save(P(61));
    timers.fire();
    assert.deepEqual(
      backing.updates.map((u) => (u.value as Progress).totalKills),
      [60, 61],
    );
  });

  void it('a stage change at equal totalKills (a boss defeat) is saved', () => {
    const { store, backing, timers } = make(P(30));
    store.save(P(30, { stageIndex: 2, killsInStage: 0, bossesDefeated: 1 }));
    timers.fire();
    assert.equal((backing.updates[0]?.value as Progress).stageIndex, 2);
  });
});

void describe('ProgressStore: coalescing', () => {
  void it('many saves inside the window make one write with the latest value', () => {
    const { store, backing, timers } = make();
    for (let kills = 1; kills <= 20; kills += 1) {
      store.save(P(kills));
    }
    assert.equal(timers.pending.size, 1, 'one timer');
    assert.deepEqual(timers.delays, [PROGRESS_WRITE_COALESCE_MS]);
    timers.fire();
    assert.equal(backing.updates.length, 1);
    assert.equal((backing.updates[0]?.value as Progress).totalKills, 20);
  });

  void it('a save after the window starts a new window', () => {
    const { store, backing, timers } = make();
    store.save(P(1));
    timers.fire();
    store.save(P(2));
    assert.equal(timers.pending.size, 1);
    timers.fire();
    assert.equal(backing.updates.length, 2);
  });

  void it('firing with nothing pending writes nothing', () => {
    const { store, backing, timers } = make();
    store.save(P(1));
    store.flush();
    timers.fire();
    assert.equal(backing.updates.length, 1);
  });
});

void describe('ProgressStore.flush and dispose', () => {
  void it('flush writes the pending value now and cancels the timer', () => {
    const { store, backing, timers } = make();
    store.save(P(7));
    store.flush();
    assert.equal(backing.updates.length, 1);
    assert.equal(timers.pending.size, 0);
  });

  void it('dispose flushes the pending value', () => {
    const { store, backing } = make();
    store.save(P(7));
    store.dispose();
    assert.deepEqual(backing.updates, [{ key: PROGRESS_KEY, value: P(7) }]);
  });

  void it('flush and dispose with nothing pending write nothing, and may be repeated', () => {
    const { store, backing } = make();
    store.flush();
    store.dispose();
    store.dispose();
    assert.deepEqual(backing.updates, []);
  });

  void it('a throwing timers.clear does not stop the flush', () => {
    const { store, backing, timers } = make();
    store.save(P(7));
    timers.clearThrows = true;
    assert.doesNotThrow(() => store.flush());
    assert.equal(backing.updates.length, 1);
  });
});

void describe('ProgressStore: read-only mode for a newer stored version', () => {
  void it('never calls update, for save, flush, or dispose, however high the count', () => {
    const future = { ...P(10), schemaVersion: 99 };
    const { store, backing, timers } = make(future);
    store.save(P(1_000));
    store.save(P(2_000, { stageIndex: 5 }));
    assert.equal(timers.pending.size, 0);
    store.flush();
    store.dispose();
    assert.deepEqual(backing.updates, []);
    assert.deepEqual(backing.value, future, 'the stored value is untouched');
  });

  void it('a save before any load still discovers the future value and stays read-only', () => {
    const future = { ...P(10), schemaVersion: 7 };
    const { store, backing } = make(future);
    store.save(P(500));
    store.dispose();
    assert.deepEqual(backing.updates, []);
  });
});

void describe('ProgressStore: failures never escape (invariant 4) and log fixed text (invariant 7)', () => {
  void it('a throwing update is contained', () => {
    const { store, backing, log } = make();
    backing.updateMode = 'throw';
    store.save(P(3));
    assert.doesNotThrow(() => store.flush());
    assert.deepEqual(log.errors, ['progress: write failed']);
    assert.ok(!log.errors.join().includes(SECRET));
  });

  void it('a rejecting update is contained and logs one fixed line, with no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const { store, backing, log } = make();
      backing.updateMode = 'reject';
      store.save(P(3));
      store.flush();
      await settle();
      await settle();
      assert.deepEqual(unhandled, []);
      assert.deepEqual(log.errors, ['progress: write failed']);
      assert.ok(!log.errors.join().includes(SECRET));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  void it('a throwing logger never escapes save, flush, dispose, or the timer', async () => {
    const { store, backing, timers, log } = make();
    log.throws = true;
    backing.updateMode = 'reject';
    assert.doesNotThrow(() => store.save({ nope: true } as unknown as Progress));
    store.save(P(2));
    assert.doesNotThrow(() => timers.fire());
    store.save(P(3));
    assert.doesNotThrow(() => store.dispose());
    await settle();
    await settle();
  });

  void it('a store whose get returns a hostile object is handled', () => {
    const hostile = Object.defineProperty({ ...P(1) }, 'cycle', {
      enumerable: true,
      get(): never {
        throw new Error(SECRET);
      },
    });
    const { store, log } = make(hostile);
    assert.doesNotThrow(() => store.load());
    assert.ok(!log.errors.join().includes(SECRET));
  });

  void it('all log lines ever produced are one of a small fixed set', () => {
    const fixed = new Set([
      'progress: read failed, using defaults',
      'progress: stored value invalid, using defaults',
      'progress: stored value is from a newer version, read-only',
      'progress: dropped invalid save',
      'progress: save failed',
      'progress: write failed',
    ]);
    const { store, backing, log } = make({ junk: SECRET });
    store.save({ x: SECRET } as unknown as Progress);
    backing.updateMode = 'throw';
    store.save(P(2));
    store.flush();
    for (const line of log.errors) {
      assert.ok(fixed.has(line), line);
    }
  });
});
