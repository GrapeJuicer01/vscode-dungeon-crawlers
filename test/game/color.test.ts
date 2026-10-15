// Pins isRedHex (test/support/color.ts): the 18 degree hue cutoff and its margins.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MASTER_PALETTE } from '../../src/game/sprites/palettes';
import { isRedHex } from '../support/color';

void describe('isRedHex', () => {
  void it('accepts reds: Berserker red, deep blood red, master R and D', () => {
    assert.ok(isRedHex('#d03030'));
    assert.ok(isRedHex('#8a1010'));
    assert.ok(isRedHex(MASTER_PALETTE['R'] ?? ''), 'master R');
    assert.ok(isRedHex(MASTER_PALETTE['D'] ?? ''), 'master D');
  });

  void it('rejects browns and coppers just outside the cutoff', () => {
    assert.ok(!isRedHex('#9a6a3a'), 'fur brown');
    assert.ok(!isRedHex('#d9824a'), 'copper C');
    assert.ok(!isRedHex('#9a4f26'), 'copper Z');
    assert.ok(!isRedHex(MASTER_PALETTE['C'] ?? ''), 'master C');
    assert.ok(!isRedHex(MASTER_PALETTE['Z'] ?? ''), 'master Z');
  });

  void it('rejects desaturated and black values', () => {
    assert.ok(!isRedHex('#000000'));
    assert.ok(!isRedHex('#806060'));
  });
});
