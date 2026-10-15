// The artist's legibility command (test/support/legibilityReport.mjs) prints the Stages 1 to 8
// calibration and judges an unwired candidate palette (E5 plan T-E5-0).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const FIXTURE = 'test/fixtures/legibility/candidate.ts';

function report(...args: string[]): { status: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, ['test/support/legibilityReport.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

void describe('legibilityReport.mjs', () => {
  void it('no arguments prints the Stages 1 to 8 table and the calibration', () => {
    const r = report();
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /necromancer/);
    assert.match(r.out, /minimum cloth contrast 2\.\d+ \(necromancer on /);
    assert.match(r.out, /rule 1 ceiling/);
    assert.equal((r.out.match(/lum 0\.\d{4} rgb/g) ?? []).length, 8);
  });

  void it('a dark candidate floor passes rule 1', () => {
    const r = report(`${FIXTURE}:DARK_PALETTE:FLOOR_BACK:FLOOR_FRONT`);
    assert.match(r.out, /PASS rule 1: every cloth contrast >= 2\.0/);
  });

  void it('a bright candidate floor fails rule 1 and exits non-zero', () => {
    const r = report(`${FIXTURE}:BRIGHT_PALETTE:FLOOR_BACK:FLOOR_FRONT`);
    assert.match(r.out, /FAIL rule 1/);
    assert.notEqual(r.status, 0);
  });

  void it('the optional stage makes rule 2 binding for Stage 9', () => {
    const bright = report(`${FIXTURE}:BRIGHT_PALETTE:FLOOR_BACK:FLOOR_FRONT:9`);
    assert.match(bright.out, /FAIL rule 2/);
    const plain = report(`${FIXTURE}:BRIGHT_PALETTE:FLOOR_BACK:FLOOR_FRONT`);
    assert.match(plain.out, /info rule 2/);
  });

  void it('rejects a malformed argument', () => {
    const r = report('x.ts:ONLY_TWO');
    assert.notEqual(r.status, 0);
  });
});
