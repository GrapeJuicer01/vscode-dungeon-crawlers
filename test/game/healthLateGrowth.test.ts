// E5 stage-growth decision (plan E5-3, option b): healthOf multiplies by HEALTH_GROWTH (1.35) per
// stage through Stage 8 and by HEALTH_GROWTH_LATE (1.05) per stage from Stage 9. Stages 1 to 8 must
// stay bit-identical. The Stage 9 and 10 rows do not exist yet, so the late stages are probed with
// existing boss and minion rows moved to those stage indices (healthOf only reads tier and vigor).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CYCLE_CAP,
  ENEMIES,
  HEALTH_GROWTH,
  HEALTH_GROWTH_LATE,
  LATE_GROWTH_FROM_STAGE,
  healthOf,
} from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';

const row = (id: string): EnemyRow => {
  const r = ENEMIES.find((e) => e.id === id);
  assert.ok(r, `row ${id}`);
  return r;
};
/** A probe boss at the planned Stage 9 and 10 vigor. */
const probeBoss: EnemyRow = { ...row('rat-king'), vigor: 0.5 };

void describe('healthOf late growth (E5)', () => {
  void it('has the documented constants', () => {
    assert.equal(HEALTH_GROWTH, 1.35);
    assert.equal(HEALTH_GROWTH_LATE, 1.05);
    assert.equal(LATE_GROWTH_FROM_STAGE, 9);
  });

  void it('Stages 1 to 8 are unchanged: a pinned sample equals the old formula exactly, for every stage, tier, cycle, and party', () => {
    const old = (r: EnemyRow, s: number, c: number, p: number): number => {
      const sf = Math.pow(1.35, Math.max(0, s - 1));
      const cf = 1 + 0.25 * Math.min(Math.max(0, c), 8);
      const pf = r.tier === 'boss' ? 1 + 0.35 * (Math.min(Math.max(1, p), 8) - 1) : 1;
      const base = r.tier === 'boss' ? 120 : r.tier === 'elite' ? 24 : 10;
      return Math.max(1, Math.round(base * r.vigor * sf * cf * pf));
    };
    for (const r of ENEMIES) {
      for (let s = 1; s <= 8; s++) {
        for (const c of [0, 1, 8]) {
          for (const p of [1, 4, 8]) {
            assert.equal(
              healthOf(r, s, c, p),
              old(r, s, c, p),
              `${r.id} stage ${s} cycle ${c} party ${p}`,
            );
          }
        }
      }
    }
  });

  void it('pinned existing values (real healthOf output) are untouched', () => {
    assert.equal(healthOf(row('cellar-rat'), 1, 0, 1), 10);
    assert.equal(healthOf(row('rat-king'), 1, 0, 8), 414);
    assert.equal(healthOf(row('ooze-queen'), 3, 0, 8), 755);
    assert.equal(healthOf(row('tomb-lich'), 4, 0, 8), 1019);
    // Stage 8 sits on the old curve (1.35 ** 7).
    for (const r of ENEMIES.filter((e) => e.stage === 8)) {
      assert.equal(
        healthOf(r, 8, 0, 1),
        Math.max(
          1,
          Math.round(
            (r.tier === 'boss' ? 120 : r.tier === 'elite' ? 24 : 10) * r.vigor * Math.pow(1.35, 7),
          ),
        ),
        r.id,
      );
    }
  });

  void it('Stage 9 boss at vigor 0.5: 515 solo, 1776 with eight fighters', () => {
    assert.equal(healthOf(probeBoss, 9, 0, 1), 515);
    assert.equal(healthOf(probeBoss, 9, 0, 8), 1776);
  });

  void it('Stage 10 boss at vigor 0.5: 541 solo, 1865 with eight fighters; at the cycle cap with eight fighters 5595', () => {
    assert.equal(healthOf(probeBoss, 10, 0, 1), 541);
    assert.equal(healthOf(probeBoss, 10, 0, 8), 1865);
    assert.equal(healthOf(probeBoss, 10, CYCLE_CAP, 8), 5595);
    assert.equal(healthOf(probeBoss, 10, CYCLE_CAP + 5, 8), 5595, 'the cycle cap holds');
  });

  void it('the tail is flat-ish: Stage 9 to 10 grows by 1.05, not 1.35, and Stage 8 to 9 also by 1.05', () => {
    const at = (s: number): number => healthOf({ ...probeBoss, vigor: 100 }, s, 0, 1);
    assert.ok(Math.abs(at(9) / at(8) - 1.05) < 0.001, `${at(9) / at(8)}`);
    assert.ok(Math.abs(at(10) / at(9) - 1.05) < 0.001, `${at(10) / at(9)}`);
    assert.ok(Math.abs(at(8) / at(7) - 1.35) < 0.001, `${at(8) / at(7)}`);
  });

  void it('stays monotone in the stage, the cycle, and (bosses) the party across the whole range', () => {
    for (const r of [probeBoss, row('cellar-rat'), row('crate-mimic')]) {
      let prev = 0;
      for (let s = 1; s <= 12; s++) {
        const h = healthOf(r, s, 0, 1);
        assert.ok(h >= prev, `${r.id} stage ${s}`);
        prev = h;
      }
      assert.ok(healthOf(r, 10, 3, 1) >= healthOf(r, 10, 2, 1));
      assert.ok(healthOf(r, 10, 0, 5) >= healthOf(r, 10, 0, 1));
    }
  });
});
