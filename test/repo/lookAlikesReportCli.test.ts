// The pixel-artist's look-alike report accepts a Record<id, SpriteTemplate> export and a single
// SpriteTemplate export (a boss), and keeps the old argument form working (E4 plan, T-E4-0).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { ENEMY_SPRITES } from '../../src/game/sprites/enemyTemplates';

const FIXTURE = 'test/fixtures/lookAlikes/shapes.ts';
const firstId = Object.keys(ENEMY_SPRITES)[0] ?? '';

function report(...args: string[]): { status: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, ['test/support/lookAlikesReport.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

void describe('lookAlikesReport.mjs export shapes', () => {
  void it('no arguments prints the wired matrix and the policy holds', () => {
    const r = report();
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /policy holds/);
  });

  void it('accepts a Record<id, SpriteTemplate> export (backward compatible form)', () => {
    const r = report(`${FIXTURE}:RECORD_SHAPE:1`);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, new RegExp(`showing pairs with: ${firstId}\\b`));
  });

  void it('accepts a single SpriteTemplate export with an explicit id as 4th part', () => {
    const r = report(`${FIXTURE}:SINGLE_SHAPE:1:${firstId}`);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, new RegExp(`showing pairs with: ${firstId}\\b`));
  });

  void it('derives the id of a single template from the export name when none is given', () => {
    const r = report(`${FIXTURE}:SINGLE_SHAPE:7`);
    // A copy of a wired sprite under a new id may violate the policy; only the id is asserted.
    assert.match(r.out, /showing pairs with: single-shape/);
    assert.match(r.out, /enemies, /);
  });

  void it('rejects an argument without an export name', () => {
    const r = report(FIXTURE);
    assert.notEqual(r.status, 0);
  });
});
