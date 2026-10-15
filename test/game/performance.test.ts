// Node cost test (soft; M4 plan note 15, decision H4-6: no frame-time counters in the product).
// Real frame time is the manual DevTools benchmark in testing-strategy section 8.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Combat } from '../../src/game/Combat';
import { STAGES } from '../../src/game/data/stages';
import { STEP_MS } from '../../src/game/data/tuning';
import { Boss } from '../../src/game/entities/Boss';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import { buildStage } from '../../src/game/Stage';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import { mixedIds } from '../support/classRig';
import { FakeBitmaps, agent, feed, gameRig } from '../support/engineFakes';

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

  void it('E5: building all ten stage runtimes (boot cost) takes well under a second', (t) => {
    const bitmaps = new FakeBitmaps();
    const cache = new SpriteCache(bitmaps, SHIPPED_ART);
    const start = process.hrtime.bigint();
    for (const def of STAGES) buildStage(def, SHIPPED_ART, cache, bitmaps);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    t.diagnostic(`ten stage runtimes built in ${ms.toFixed(1)} ms`);
    assert.equal(STAGES.length, 10);
    assert.ok(ms < 1000, `${ms} ms`);
  });

  for (const stage of [7, 8, 9, 10]) {
    void it(`E5: the maximum configuration in Stage ${stage} (maxEnemies 12, eight fighters, boss on screen, six lights, ambient on) averages under 4 ms per frame (target 1 ms)`, (t) => {
      let bossFrames = 0;
      let maxEnemies = 0;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
      const original = Combat.prototype.update;
      Combat.prototype.update = function (
        this: Combat,
        ...args: Parameters<Combat['update']>
      ): void {
        original.apply(this, args);
        const entities = this.entities();
        maxEnemies = Math.max(maxEnemies, entities.length);
        if (entities.some((e) => e instanceof Boss)) bossFrames += 1;
      };
      try {
        const rig = gameRig();
        rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stage });
        rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 });
        mixedIds(8).forEach((id) => feed(rig, agent(id, 'working')));
        const frames = 60 * 180;
        let worst = 0;
        const start = process.hrtime.bigint();
        for (let i = 0; i < frames; i++) {
          const frameStart = process.hrtime.bigint();
          rig.game.frame(STEP_MS, rig.surface);
          const ms = Number(process.hrtime.bigint() - frameStart) / 1e6;
          if (i > 600 && ms > worst) worst = ms;
        }
        const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
        t.diagnostic(
          `stage ${stage}: average ${avg.toFixed(3)} ms per frame; worst steady frame ${worst.toFixed(2)} ms; boss on screen for ${bossFrames} frames; peak ${maxEnemies} enemies`,
        );
        assert.ok(bossFrames > 0, 'the boss was on screen');
        assert.ok(maxEnemies >= 2, 'a wave was on screen');
        assert.ok(avg < 4, `average ${avg} ms`);
        assert.deepEqual(rig.errors, []);
      } finally {
        Combat.prototype.update = original;
      }
    });
  }
});
