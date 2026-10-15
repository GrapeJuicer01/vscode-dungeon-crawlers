// Entry for the artist's legibility command (see legibilityReport.mjs). Prints the floor luminance and
// cloth-contrast table for the wired stages, then, for each candidate named on the command line, the
// same measures plus a verdict against the rules calibrated from Stages 1 to 8. Candidates are not wired.
import { STAGES } from '../../src/game/data/stages';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import {
  calibrate,
  clothContrasts,
  colorDistance,
  formatTable,
  legibilityRows,
  measureFloor,
} from './legibility';

export interface Candidate {
  readonly name: string;
  /** Partial stage palette over the master palette; must carry `g` (or the master g is used). */
  readonly palette: Readonly<Record<string, string>>;
  readonly floorBack: SpriteTemplate;
  readonly floorFront: SpriteTemplate;
  /** 9 or 10 makes rule 2 or rule 3 binding; any other value reports them as information only. */
  readonly stage: number;
}

export function report(candidates: readonly Candidate[]): void {
  const ids = STAGES.map((s) => s.id);
  const old = ids.slice(0, 8);
  const rows = legibilityRows(SHIPPED_ART, old);
  const cal = calibrate(SHIPPED_ART, rows);
  console.log('Stages 1 to 8 (calibration)');
  console.log(formatTable(rows, cal));
  let failed = false;
  for (const c of candidates) {
    const resolve = (ch: string): string => {
      const hex = c.palette[ch] ?? SHIPPED_ART.palette[ch];
      if (!hex) throw new Error(`${c.name}: character ${ch} has no colour`);
      return hex;
    };
    const floor = measureFloor([c.floorBack, c.floorFront], resolve, resolve('g'));
    const cloth = clothContrasts(SHIPPED_ART, floor.luminance);
    console.log(`\ncandidate ${c.name}: floor luminance ${floor.luminance.toFixed(4)}`);
    console.log(
      `  rgb ${floor.color.map((v) => Math.round(v)).join(',')}; cloth contrast min ${cloth.min.toFixed(2)} (${cloth.minClass})`,
    );
    console.log(
      `  per class: ${[...cloth.byClass].map(([n, v]) => `${n} ${v.toFixed(2)}`).join(', ')}`,
    );
    const nearest = rows
      .map((r) => ({ id: r.id, d: colorDistance(floor.color, r.floor.color) }))
      .sort((a, b) => a.d - b.d)[0]!;
    const checks: [string, boolean, boolean][] = [
      ['rule 1: every cloth contrast >= 2.0', cloth.min >= 2.0, true],
      [
        'rule 2: floor <= 130% of the brightest of Stages 1-8 (binding for Stage 9)',
        floor.luminance <= cal.stage9Ceiling,
        c.stage === 9,
      ],
      [
        'rule 3: floor >= 70% of the darkest of Stages 1-8 (binding for Stage 10)',
        floor.luminance >= cal.stage10Floor,
        c.stage === 10,
      ],
      [
        `rule 4: mean floor colour distance ${nearest.d.toFixed(1)} from ${nearest.id} >= ${cal.minDistance.value.toFixed(1)}`,
        nearest.d >= cal.minDistance.value,
        true,
      ],
    ];
    for (const [label, ok, binding] of checks) {
      console.log(`  ${ok ? 'PASS' : binding ? 'FAIL' : 'info'} ${label}`);
      if (!ok && binding) failed = true;
    }
    console.log(
      '  (rule 5, enemy fill to floor >= 2.0, needs the enemies and is not computed here)',
    );
  }
  if (failed) process.exitCode = 1;
  console.log(failed ? '\nlegibility: a binding rule FAILS' : '\nlegibility: all rules hold');
}
