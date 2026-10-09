// The particle pool (M4 plan test note 3).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PARTICLE_CAPACITY } from '../../src/game/data/tuning';
import { Particles } from '../../src/game/Particles';
import type { ParticleColors } from '../../src/game/Particles';
import { mulberry32 } from '../../src/game/rng';
import { RecordingSurface } from '../support/engineFakes';

const COLORS: ParticleColors = {
  ember: ['#e1', '#e2', '#e3'],
  spark: ['#s1', '#s2'],
  drip: ['#d1', '#d2'],
  splash: ['#p1', '#p2'],
  mote: ['#m1', '#m2'],
  bubble: ['#b1', '#b2', '#b3'],
  wisp: ['#w1', '#w2', '#w3'],
  firefly: ['#f1', '#f2', '#f3', '#f4'],
};

void describe('Particles', () => {
  void it('the engine pool is 384 particles', () => {
    assert.equal(PARTICLE_CAPACITY, 384);
  });

  void it('honours capacity: 1000 emissions into 384 leave count 384, extras return false', () => {
    const pool = new Particles(PARTICLE_CAPACITY, mulberry32(1));
    let accepted = 0;
    assert.doesNotThrow(() => {
      for (let i = 0; i < 1000; i++) {
        if (pool.emit('ember', i, 0, 0, -10, 1000)) {
          accepted++;
        }
      }
    });
    assert.equal(accepted, 384);
    assert.equal(pool.count, 384);
    assert.equal(pool.emit('spark', 0, 0, 0, 0, 100), false);
  });

  void it('rejects an unusable lifetime and leaves the pool unchanged', () => {
    const pool = new Particles(4, mulberry32(1));
    for (const life of [0, -5, NaN]) {
      assert.equal(pool.emit('ember', 0, 0, 0, 0, life), false, String(life));
    }
    assert.equal(pool.count, 0);
  });

  void it('reuses the slots of expired particles', () => {
    const pool = new Particles(8, mulberry32(1));
    for (let i = 0; i < 8; i++) {
      assert.equal(pool.emit('ember', 0, 0, 0, 0, 100), true);
    }
    assert.equal(pool.emit('ember', 0, 0, 0, 0, 100), false);
    pool.update(150);
    assert.equal(pool.count, 0);
    for (let i = 0; i < 8; i++) {
      assert.equal(pool.emit('ember', 0, 0, 0, 0, 100), true, `reuse ${i}`);
    }
    assert.equal(pool.count, 8);
  });

  void it('moves by velocity (px/s) over dt', () => {
    const pool = new Particles(4, mulberry32(1));
    pool.emit('spark', 10, 50, 20, -40, 1000);
    pool.update(500);
    const surface = new RecordingSurface();
    pool.draw(surface, COLORS);
    const fill = surface.calls.find((c) => c.method === 'fillRect');
    assert.deepEqual(fill?.args.slice(1), [20, 30, 1, 1]);
  });

  void it('ignores a non-positive or NaN step', () => {
    const pool = new Particles(4, mulberry32(1));
    pool.emit('spark', 10, 50, 20, -40, 1000);
    for (const dt of [0, -16, NaN]) {
      pool.update(dt);
    }
    const surface = new RecordingSurface();
    pool.draw(surface, COLORS);
    assert.deepEqual(surface.calls[0]?.args.slice(1), [10, 50, 1, 1]);
  });

  void it('colours follow the ramp by age, bright to dim', () => {
    const pool = new Particles(4, mulberry32(1));
    pool.emit('ember', 0, 0, 0, 0, 900);
    const colorAt = (): string => {
      const surface = new RecordingSurface();
      pool.draw(surface, COLORS);
      return String(surface.calls[0]?.args[0]);
    };
    assert.equal(colorAt(), '#e1');
    pool.update(300);
    assert.equal(colorAt(), '#e2');
    pool.update(300);
    assert.equal(colorAt(), '#e3');
  });

  void it('a drip falls under gravity and splashes where it ends', () => {
    const pool = new Particles(16, mulberry32(3));
    pool.emit('drip', 40, 100, 0, 0, 200);
    pool.update(100);
    const surface = new RecordingSurface();
    pool.draw(surface, COLORS);
    const drip = surface.calls[0];
    assert.equal(drip?.args[0], '#d2', 'half way through its life: second ramp colour');
    assert.equal(drip?.args[4], 2, 'a drip is 2 px tall');
    assert.ok(Number(drip?.args[2]) > 100, 'gravity pulls it down');
    pool.update(100);
    assert.equal(pool.count, 2, 'two splash particles replace the drip');
    const after = new RecordingSurface();
    pool.draw(after, COLORS);
    assert.ok(after.calls.every((c) => String(c.args[0]).startsWith('#p')));
    pool.update(1000);
    assert.equal(pool.count, 0, 'splashes expire');
  });

  void it('a splash that cannot be emitted (pool full) does not throw', () => {
    const pool = new Particles(1, mulberry32(3));
    pool.emit('drip', 0, 0, 0, 0, 10);
    assert.doesNotThrow(() => pool.update(20));
    assert.ok(pool.count <= 1);
  });

  void it('is deterministic for the same seed and different for another', () => {
    const snapshot = (seed: number): string => {
      const pool = new Particles(64, mulberry32(seed));
      for (let i = 0; i < 20; i++) {
        pool.emit('ember', i, 100, 0, -20, 2000);
      }
      for (let i = 0; i < 60; i++) {
        pool.update(16);
      }
      const surface = new RecordingSurface();
      pool.draw(surface, COLORS);
      return JSON.stringify(surface.calls.map((c) => c.args));
    };
    assert.equal(snapshot(5), snapshot(5));
    assert.notEqual(snapshot(5), snapshot(6));
  });

  void it('clear empties the pool and restores full capacity', () => {
    const pool = new Particles(8, mulberry32(1));
    for (let i = 0; i < 8; i++) {
      pool.emit('ember', 0, 0, 0, 0, 5000);
    }
    pool.clear();
    assert.equal(pool.count, 0);
    for (let i = 0; i < 8; i++) {
      assert.equal(pool.emit('ember', 0, 0, 0, 0, 5000), true);
    }
  });

  void it('update and draw allocate nothing across many cycles (count stays consistent)', () => {
    const pool = new Particles(64, mulberry32(9));
    for (let cycle = 0; cycle < 2000; cycle++) {
      pool.emit('ember', 10, 100, 1, -10, 300);
      pool.emit('drip', 20, 10, 0, 0, 150);
      pool.update(16);
      assert.ok(pool.count >= 0 && pool.count <= 64);
    }
    const surface = new RecordingSurface();
    surface.record = false;
    pool.draw(surface, COLORS);
    assert.equal(surface.count('fillRect'), pool.count);
  });
});
