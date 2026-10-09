// Node cost test (soft; M4 plan note 15, decision H4-6: no frame-time counters in the product).
// Real frame time is the manual DevTools benchmark in testing-strategy section 8.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STEP_MS } from '../../src/game/data/tuning';
import { mixedIds } from '../support/classRig';
import { agent, feed, gameRig } from '../support/engineFakes';

void describe('engine CPU cost (counting surface, node)', () => {
  void it('8 heroes over 10 simulated minutes average well under 4 ms per frame, including boot', (t) => {
    const bootStart = process.hrtime.bigint();
    const rig = gameRig();
    const bootMs = Number(process.hrtime.bigint() - bootStart) / 1e6;
    for (let i = 0; i < 8; i++) {
      feed(rig, agent(`h${i}`, i % 2 === 0 ? 'working' : 'idle'));
    }
    const frames = 36_000;
    const start = process.hrtime.bigint();
    let worst = 0;
    for (let i = 0; i < frames; i++) {
      const frameStart = process.hrtime.bigint();
      rig.game.frame(STEP_MS, rig.surface);
      const ms = Number(process.hrtime.bigint() - frameStart) / 1e6;
      if (i > 600 && ms > worst) worst = ms;
    }
    const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
    t.diagnostic(
      `boot ${bootMs.toFixed(1)} ms; average ${avg.toFixed(3)} ms per frame; worst steady frame ${worst.toFixed(2)} ms`,
    );
    assert.ok(avg < 4, `average ${avg} ms`);
    assert.ok(bootMs < 1000, `boot ${bootMs} ms`);
    assert.deepEqual(rig.errors, []);
  });

  void it('8 mixed class heroes with live summons over 10 simulated minutes average under 4 ms per frame (target 1 ms)', (t) => {
    const rig = gameRig();
    for (const id of mixedIds(8)) {
      feed(rig, agent(id, 'working'));
    }
    const frames = 36_000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < frames; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
    t.diagnostic(
      `8 mixed heroes with summons: average ${avg.toFixed(3)} ms per frame (target 1 ms)`,
    );
    assert.ok(avg < 4, `average ${avg} ms`);
    assert.deepEqual(rig.errors, []);
  });

  void it('12 mixed class heroes (all twelve classes, three summon kinds) over 10 simulated minutes average under 4 ms per frame (target 1 ms)', (t) => {
    const rig = gameRig();
    for (const id of mixedIds(12)) {
      feed(rig, agent(id, 'working'));
    }
    const frames = 36_000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < frames; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
    t.diagnostic(
      `12 mixed heroes with summons: average ${avg.toFixed(3)} ms per frame (target 1 ms)`,
    );
    assert.ok(avg < 4, `average ${avg} ms`);
    assert.deepEqual(rig.errors, []);
  });
});
