// Self-calibrating legibility evidence for Stages 1 to 8 (E5 plan section 7, note 8; task T-E5-0).
// The numbers are computed from the shipped palettes and printed, never typed in as targets. The
// assertions record what E5 art must satisfy: the minimum cloth contrast over all twelve classes
// and Stages 1 to 8 is the calibration for the rule "Stages 9 and 10: every cloth >= 2.0".
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STAGES } from '../../src/game/data/stages';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import {
  calibrate,
  clothColors,
  contrast,
  floorCeiling,
  formatTable,
  legibilityRows,
  relLum,
  rgb,
} from '../support/legibility';

const OLD_IDS = STAGES.slice(0, 8).map((s) => s.id);
const rows = legibilityRows(SHIPPED_ART, OLD_IDS);
const cal = calibrate(SHIPPED_ART, rows);

void describe('legibility calibration over Stages 1 to 8', () => {
  void it('prints the floor luminance and cloth-contrast table', (t) => {
    t.diagnostic(formatTable(rows, cal));
    assert.equal(rows.length, 8);
  });

  void it('measures all twelve classes plus the base hero cloth', () => {
    const cloths = clothColors(SHIPPED_ART);
    assert.equal(cloths.size, 13);
    assert.ok(cloths.has('necromancer'));
    assert.equal(cloths.get('base'), '#4fa3e8');
  });

  void it('every cloth clears 2.0 on every shipped floor, the minimum being the calibration', () => {
    assert.ok(cal.minContrast >= 2.0, `${cal.minContrastAt}: ${cal.minContrast}`);
    // The tightest pair today is the Necromancer on the Stage 3 floor (about 2.002).
    assert.equal(cal.minContrastAt, 'necromancer on toxic-slime-caverns');
  });

  void it('the Necromancer is the tightest cloth on every floor (E4 figures: about 2.11 on Stage 7, 2.46 on Stage 8)', () => {
    for (const r of rows) assert.equal(r.cloth.minClass, 'necromancer', r.id);
    const at = (id: string): number =>
      rows.find((r) => r.id === id)!.cloth.byClass.get('necromancer')!;
    assert.ok(Math.abs(at('frozen-citadel') - 2.11) < 0.01, String(at('frozen-citadel')));
    assert.ok(Math.abs(at('shadow-realm') - 2.46) < 0.01, String(at('shadow-realm')));
  });

  void it('the cloth-limited ceiling for a darker floor is the Necromancer bound and matches the brightest shipped floor', () => {
    const ceiling = floorCeiling(SHIPPED_ART, 2.0);
    assert.equal(ceiling.limitedBy, 'necromancer');
    // At the ceiling the contrast is exactly 2.0; the brightest shipped floor sits just under it.
    const necro = relLum(rgb(clothColors(SHIPPED_ART).get('necromancer')!));
    assert.ok(Math.abs(contrast(necro, ceiling.value) - 2.0) < 1e-9);
    assert.ok(cal.brightest <= ceiling.value, `${cal.brightest} vs ${ceiling.value}`);
    assert.ok(ceiling.value - cal.brightest < 0.001);
  });

  void it('the rules are not vacuous: a floor above the ceiling fails a cloth, a floor below passes', () => {
    const ceiling = floorCeiling(SHIPPED_ART, 2.0).value;
    const necro = relLum(rgb(clothColors(SHIPPED_ART).get('necromancer')!));
    assert.ok(contrast(necro, ceiling * 1.2) < 2.0);
    assert.ok(contrast(necro, ceiling * 0.8) > 2.0);
  });

  void it('Stages 1 to 8 are pairwise distinct in mean floor colour (calibration for rule 4)', () => {
    assert.ok(cal.minDistance.value > 0, `${cal.minDistance.a} vs ${cal.minDistance.b}`);
  });
});
