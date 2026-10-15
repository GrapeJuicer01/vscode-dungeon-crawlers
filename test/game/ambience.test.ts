// E2 ambients and particle kinds (E2 plan section 5.1 and test note 5): bubbles (Stage 3) and fog
// with dust (Stage 4) are pure particle emitters. Rates are checked with a seeded rng; the debt cap
// holds after a stage switch; a full pool just drops; every particle kind is one fillRect.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Ambience } from '../../src/game/Ambience';
import { Camera } from '../../src/game/Camera';
import { STAGES } from '../../src/game/data/stages';
import type { AmbientEffect } from '../../src/game/data/stages';
import {
  BUBBLE_MAX_Y,
  BUBBLE_MIN_Y,
  FIREFLY_DRIFT,
  FIREFLY_LIFE_MIN_MS,
  FIREFLY_MAX_Y,
  FIREFLY_MIN_Y,
  MURK_DRIFT,
  MURK_LIFE_MIN_MS,
  MURK_MAX_Y,
  MURK_MIN_Y,
  SNOW_DRIFT,
  SNOW_LIFE_MIN_MS,
  SNOW_MAX_Y,
  SNOW_MIN_Y,
  RIFT_DRIFT,
  RIFT_LIFE_MAX_MS,
  RIFT_LIFE_MIN_MS,
  RIFT_MAX_Y,
  RIFT_MIN_Y,
  SHIMMER_DRIFT,
  SHIMMER_LIFE_MIN_MS,
  SHIMMER_MAX_Y,
  SHIMMER_MIN_Y,
  SHIMMER_RISE_MAX,
  STAGE_EMBER_MAX_Y,
  STAGE_EMBER_MIN_Y,
  FOG_MAX_Y,
  FOG_MIN_Y,
  MOTE_MAX_Y,
  MOTE_MIN_Y,
  PARTICLE_CAPACITY,
  STEP_MS,
} from '../../src/game/data/tuning';
import type { World } from '../../src/game/entities/Entity';
import { CORRIDOR_X, INTERNAL_WIDTH } from '../../src/game/layout';
import { Particles } from '../../src/game/Particles';
import type { ParticleColors } from '../../src/game/Particles';
import { mulberry32 } from '../../src/game/rng';
import { PARTICLE_PALETTE, MASTER_PALETTE } from '../../src/game/sprites/palettes';
import { RecordingSurface } from '../support/engineFakes';
import { repoPath } from '../support/repo';

const COLORS: ParticleColors = {
  ember: ['#e1'],
  spark: ['#s1'],
  drip: ['#d1'],
  splash: ['#p1'],
  mote: ['#m1'],
  bubble: ['#b1'],
  wisp: ['#w1'],
  firefly: ['#f1'],
  snow: ['#n1'],
  murk: ['#k1'],
  shimmer: ['#h1'],
  rift: ['#r1'],
};

interface Rig {
  readonly ambience: Ambience;
  readonly particles: Particles;
  readonly world: World;
  /** Mutable so a test can switch the stage mid-run. */
  effect: AmbientEffect;
}

function rig(effect: AmbientEffect, capacity = PARTICLE_CAPACITY): Rig {
  const rng = mulberry32(2026);
  const particles = new Particles(capacity, rng);
  const holder: Rig = {
    ambience: new Ambience(),
    particles,
    effect,
    world: undefined as unknown as World,
  };
  const world = {
    rng,
    particles,
    stage: {
      dripPoints: [],
      get def(): { ambient: AmbientEffect } {
        return { ambient: holder.effect };
      },
    },
  } as unknown as World;
  return Object.assign(holder, { world });
}

function drawn(r: Rig): { color: string; x: number; y: number; w: number; h: number }[] {
  const surface = new RecordingSurface();
  surface.record = true;
  r.particles.draw(surface, COLORS);
  return surface.calls
    .filter((c) => c.method === 'fillRect')
    .map((c) => ({
      color: String(c.args[0]),
      x: Number(c.args[1]),
      y: Number(c.args[2]),
      w: Number(c.args[3]),
      h: Number(c.args[4]),
    }));
}

/** Runs the ambient for `ms` without moving particles, so every emission is still on the pool. */
function emitOnly(r: Rig, ms: number): void {
  const camera = new Camera();
  for (let t = 0; t < ms; t += STEP_MS) {
    r.ambience.update(STEP_MS, r.world, camera);
  }
}

void describe('Ambience bubbles (Stage 3)', () => {
  void it('10 simulated seconds at 7 per second emit 70 bubbles (+- 1), only bubbles, 2x2, inside the corridor view and the floor band', () => {
    const r = rig({ kind: 'bubbles', perSecond: 7 });
    emitOnly(r, 10_000);
    const out = drawn(r);
    assert.ok(Math.abs(out.length - 70) <= 1, `${out.length} bubbles`);
    for (const p of out) {
      assert.equal(p.color, '#b1');
      assert.deepEqual([p.w, p.h], [2, 2]);
      assert.ok(p.x >= CORRIDOR_X && p.x < INTERNAL_WIDTH, `x ${p.x}`);
      assert.ok(p.y >= BUBBLE_MIN_Y - 1 && p.y <= BUBBLE_MAX_Y, `y ${p.y}`);
    }
  });

  void it('the emission positions are spread (not one point) and the same seed gives the same field', () => {
    const a = rig({ kind: 'bubbles', perSecond: 7 });
    const b = rig({ kind: 'bubbles', perSecond: 7 });
    emitOnly(a, 10_000);
    emitOnly(b, 10_000);
    assert.deepEqual(drawn(a), drawn(b));
    assert.ok(new Set(drawn(a).map((p) => p.x)).size > 30);
  });

  void it('with particles updating, the live set is about rate times life (about 14) and every one is a bubble', () => {
    const r = rig({ kind: 'bubbles', perSecond: 7 });
    const camera = new Camera();
    for (let t = 0; t < 10_000; t += STEP_MS) {
      r.ambience.update(STEP_MS, r.world, camera);
      r.particles.update(STEP_MS);
    }
    assert.ok(r.particles.count >= 6 && r.particles.count <= 26, `${r.particles.count} live`);
    assert.ok(drawn(r).every((p) => p.color === '#b1'));
  });

  void it('a bubble rises: y decreases monotonically over its life while it wobbles sideways', () => {
    const pool = new Particles(4, mulberry32(11));
    pool.emit('bubble', 200, 150, 0, -20, 2000);
    const ys: number[] = [];
    const xs: number[] = [];
    for (let i = 0; i < 90; i++) {
      pool.update(STEP_MS);
      const surface = new RecordingSurface();
      surface.record = true;
      pool.draw(surface, COLORS);
      const fill = surface.calls[0];
      ys.push(Number(fill?.args[2]));
      xs.push(Number(fill?.args[1]));
    }
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i]! <= ys[i - 1]!, `y rose at ${i}`);
    assert.ok(ys[ys.length - 1]! < 150 - 20, 'about 30 px up in 1.5 s');
    assert.ok(new Set(xs).size > 1, 'the x position wobbles');
  });
});

void describe('Ambience fog (Stage 4): wisps plus dust motes', () => {
  void it('10 simulated seconds at 4 wisps and 3 motes per second emit 40 and 30 (+- 1), in their own bands and shapes', () => {
    const r = rig({ kind: 'fog', perSecond: 4, dustPerSecond: 3 });
    emitOnly(r, 10_000);
    const out = drawn(r);
    const wisps = out.filter((p) => p.color === '#w1');
    const motes = out.filter((p) => p.color === '#m1');
    assert.equal(wisps.length + motes.length, out.length, 'only wisps and motes');
    assert.ok(Math.abs(wisps.length - 40) <= 1, `${wisps.length} wisps`);
    assert.ok(Math.abs(motes.length - 30) <= 1, `${motes.length} motes`);
    for (const p of wisps) {
      assert.deepEqual([p.w, p.h], [6, 2]);
      assert.ok(p.x >= CORRIDOR_X - 1 && p.x < INTERNAL_WIDTH);
      assert.ok(p.y >= FOG_MIN_Y - 1 && p.y <= FOG_MAX_Y);
    }
    for (const p of motes) {
      assert.deepEqual([p.w, p.h], [1, 1]);
      assert.ok(p.y >= MOTE_MIN_Y - 1 && p.y <= MOTE_MAX_Y);
    }
  });

  void it('the wisp and dust rates do not couple: dustPerSecond 0 emits wisps only, perSecond 0 emits motes only', () => {
    const noDust = rig({ kind: 'fog', perSecond: 4, dustPerSecond: 0 });
    emitOnly(noDust, 5_000);
    assert.ok(drawn(noDust).length > 0 && drawn(noDust).every((p) => p.color === '#w1'));
    const noWisps = rig({ kind: 'fog', perSecond: 0, dustPerSecond: 3 });
    emitOnly(noWisps, 5_000);
    assert.ok(drawn(noWisps).length > 0 && drawn(noWisps).every((p) => p.color === '#m1'));
  });

  void it('wisps drift left (x decreases) and their vertical wander stays small', () => {
    const r = rig({ kind: 'fog', perSecond: 4, dustPerSecond: 0 });
    emitOnly(r, 1_000);
    const before = drawn(r);
    for (let i = 0; i < 60; i++) r.particles.update(STEP_MS);
    const after = drawn(r);
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) {
      assert.ok(after[i]!.x < before[i]!.x, `wisp ${i} drifted left`);
      assert.ok(Math.abs(after[i]!.y - before[i]!.y) <= 6, 'small vertical wander');
    }
  });
});

void describe('the debt cap and a full pool', () => {
  void it('one huge step (a hidden tab) emits at most one second worth, per effect', () => {
    const camera = new Camera();
    const bubbles = rig({ kind: 'bubbles', perSecond: 7 });
    bubbles.ambience.update(600_000, bubbles.world, camera);
    assert.ok(bubbles.particles.count <= 7, `${bubbles.particles.count}`);
    const fog = rig({ kind: 'fog', perSecond: 4, dustPerSecond: 3 });
    fog.ambience.update(600_000, fog.world, camera);
    const out = drawn(fog);
    assert.ok(out.filter((p) => p.color === '#w1').length <= 4);
    assert.ok(out.filter((p) => p.color === '#m1').length <= 3);
  });

  void it('after a mid-run stage switch (bubbles -> fog -> bubbles) no runaway debt is carried', () => {
    const camera = new Camera();
    const r = rig({ kind: 'bubbles', perSecond: 7 });
    r.ambience.update(600_000, r.world, camera);
    r.particles.clear();
    r.effect = { kind: 'fog', perSecond: 4, dustPerSecond: 3 };
    r.ambience.update(600_000, r.world, camera);
    assert.ok(r.particles.count <= 7, `${r.particles.count} after the fog burst`);
    r.particles.clear();
    r.effect = { kind: 'bubbles', perSecond: 7 };
    r.ambience.update(STEP_MS, r.world, camera);
    assert.ok(r.particles.count <= 1, `${r.particles.count} after one step back on bubbles`);
    // And the steady rate afterwards is the configured one.
    r.particles.clear();
    emitOnly(r, 10_000);
    assert.ok(Math.abs(r.particles.count - 70) <= 1, `${r.particles.count}`);
  });

  void it('emitting into a full pool never throws and never grows the pool', () => {
    for (const effect of [
      { kind: 'bubbles', perSecond: 7 },
      { kind: 'fog', perSecond: 4, dustPerSecond: 3 },
    ] as const) {
      const r = rig(effect, 8);
      for (let i = 0; i < 8; i++) r.particles.emit('spark', 0, 0, 0, 0, 60_000);
      assert.doesNotThrow(() => emitOnly(r, 10_000));
      assert.equal(r.particles.count, 8);
    }
  });

  void it('the shipped stage rows use the planned kinds and rates', () => {
    assert.deepEqual(STAGES[2]?.ambient, { kind: 'bubbles', perSecond: 7 });
    assert.deepEqual(STAGES[3]?.ambient, { kind: 'fog', perSecond: 4, dustPerSecond: 3 });
    assert.deepEqual(STAGES[4]?.ambient, { kind: 'fireflies', perSecond: 5 });
    assert.deepEqual(STAGES[5]?.ambient, { kind: 'embers', perSecond: 6 });
    assert.deepEqual(STAGES[6]?.ambient, { kind: 'snow', perSecond: 9 });
    assert.deepEqual(STAGES[7]?.ambient, { kind: 'murk', perSecond: 4 });
  });

  void it('steady-state ambient load is far below the pool, so ambients cannot starve combat sparks', () => {
    for (const effect of [
      { kind: 'bubbles', perSecond: 7 },
      { kind: 'fog', perSecond: 4, dustPerSecond: 3 },
    ] as const) {
      const r = rig(effect);
      const camera = new Camera();
      let peak = 0;
      for (let t = 0; t < 30_000; t += STEP_MS) {
        r.ambience.update(STEP_MS, r.world, camera);
        r.particles.update(STEP_MS);
        peak = Math.max(peak, r.particles.count);
      }
      assert.ok(peak < PARTICLE_CAPACITY / 4, `${effect.kind}: peak ${peak}`);
    }
  });
});

void describe('Particles: the new kinds', () => {
  const sizes: [Parameters<Particles['emit']>[0], number, number][] = [
    ['ember', 1, 1],
    ['spark', 1, 1],
    ['drip', 1, 2],
    ['splash', 1, 1],
    ['mote', 1, 1],
    ['bubble', 2, 2],
    ['wisp', 6, 2],
    ['firefly', 1, 1],
    ['snow', 1, 1],
    ['murk', 2, 2],
    ['shimmer', 1, 3],
    ['rift', 3, 1],
  ];

  void it('every kind is drawn as exactly one fillRect with its documented size, in its own ramp', () => {
    for (const [kind, w, h] of sizes) {
      const pool = new Particles(8, mulberry32(3));
      pool.emit(kind, 20, 40, 0, 0, 1000);
      pool.emit(kind, 30, 50, 0, 0, 1000);
      const surface = new RecordingSurface();
      surface.record = true;
      pool.draw(surface, COLORS);
      assert.equal(surface.count('fillRect'), 2, kind);
      assert.equal(surface.calls.length, 2, `${kind}: nothing but fillRect`);
      for (const c of surface.calls) {
        assert.deepEqual([c.args[3], c.args[4]], [w, h], kind);
      }
    }
  });

  void it('kinds are told apart by their colour ramp (a bubble never uses another kind ramp)', () => {
    const pool = new Particles(16, mulberry32(3));
    for (const [kind] of sizes) pool.emit(kind, 10, 10, 0, 0, 1000);
    const surface = new RecordingSurface();
    surface.record = true;
    pool.draw(surface, COLORS);
    assert.equal(new Set(surface.calls.map((c) => c.args[0])).size, 12);
  });

  void it('the old kind indices are unchanged and the new ones are appended: ember spark drip splash mote bubble wisp firefly snow murk shimmer rift', () => {
    const src = readFileSync(repoPath('src/game/Particles.ts'), 'utf8');
    const list = /const KIND_NAMES[^=]*=\s*\[([^\]]*)\]/.exec(src)?.[1] ?? '';
    const names = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(names, [
      'ember',
      'spark',
      'drip',
      'splash',
      'mote',
      'bubble',
      'wisp',
      'firefly',
      'snow',
      'murk',
      'shimmer',
      'rift',
    ]);
    assert.match(src, /KIND_EMBER = 0;/);
    assert.match(src, /KIND_DRIP = 2;/);
    assert.match(src, /KIND_SPLASH = 3;/);
    assert.match(src, /KIND_MOTE = 4;/);
    assert.match(src, /KIND_SNOW = 8;/);
    assert.match(src, /KIND_MURK = 9;/);
    assert.match(src, /KIND_SHIMMER = 10;/);
    assert.match(src, /KIND_RIFT = 11;/);
  });

  void it('a full pool refuses a bubble or a wisp without throwing', () => {
    const pool = new Particles(1, mulberry32(3));
    assert.equal(pool.emit('bubble', 0, 0, 0, -10, 1000), true);
    assert.equal(pool.emit('wisp', 0, 0, -5, 0, 1000), false);
    assert.doesNotThrow(() => pool.update(STEP_MS));
  });
});

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

void describe('Ambience fireflies (Stage 5, E3)', () => {
  void it('10 simulated seconds at 5 per second emit 50 fireflies (+- 1), each exactly one 1x1 fillRect, inside the corridor view and the firefly band', () => {
    const r = rig({ kind: 'fireflies', perSecond: 5 });
    emitOnly(r, 10_000);
    const out = drawn(r);
    assert.ok(Math.abs(out.length - 50) <= 1, `${out.length} fireflies`);
    assert.equal(r.particles.count, out.length, 'one fillRect per live particle');
    for (const p of out) {
      assert.equal(p.color, '#f1', 'only the firefly ramp');
      assert.deepEqual([p.w, p.h], [1, 1]);
      assert.ok(p.x >= CORRIDOR_X && p.x < INTERNAL_WIDTH, `x ${p.x}`);
      assert.ok(p.y >= FIREFLY_MIN_Y - 1 && p.y <= FIREFLY_MAX_Y, `y ${p.y}`);
    }
    assert.ok(new Set(out.map((p) => p.x)).size > 20, 'positions are spread');
  });

  void it('the same seed gives the same field', () => {
    const a = rig({ kind: 'fireflies', perSecond: 5 });
    const b = rig({ kind: 'fireflies', perSecond: 5 });
    emitOnly(a, 5_000);
    emitOnly(b, 5_000);
    assert.deepEqual(drawn(a), drawn(b));
  });

  void it('with particles updating, the live set is about rate times life (about 25) and every one stays near its band', () => {
    const r = rig({ kind: 'fireflies', perSecond: 5 });
    const camera = new Camera();
    for (let t = 0; t < 20_000; t += STEP_MS) {
      r.ambience.update(STEP_MS, r.world, camera);
      r.particles.update(STEP_MS);
    }
    assert.ok(r.particles.count >= 12 && r.particles.count <= 40, `${r.particles.count} live`);
    // A wander of +-24 px/s^2 over at most 6.5 s keeps a firefly within a few tens of pixels.
    const slack = 6 + 0.5 * 24 * 6.5 * 6.5 * 0.1;
    for (const p of drawn(r)) {
      assert.ok(p.y > FIREFLY_MIN_Y - slack && p.y < FIREFLY_MAX_Y + slack, `y ${p.y}`);
    }
  });

  void it('a firefly hangs in the air: it is not scrolled and has no net rise (drift is symmetric and small)', () => {
    assert.ok(FIREFLY_DRIFT <= 10, 'initial drift is tiny');
    const pool = new Particles(1, mulberry32(5));
    pool.emit('firefly', 200, 100, 0, 0, 5000);
    let maxDy = 0;
    for (let i = 0; i < 150; i++) {
      pool.update(STEP_MS);
      const surface = new RecordingSurface();
      surface.record = true;
      pool.draw(surface, COLORS);
      maxDy = Math.max(maxDy, Math.abs(Number(surface.calls[0]?.args[2]) - 100));
    }
    assert.ok(maxDy < 40, `moved ${maxDy} px`);
  });

  void it('the shipped firefly ramp alternates bright and dim, has at least 4 steps, and no step is shorter than 0.5 s at the minimum life (no flashing)', () => {
    const ramp = PARTICLE_PALETTE.firefly;
    assert.ok(ramp.length >= 4, `${ramp.length} steps`);
    const lum = ramp.map((ch) => luminance(MASTER_PALETTE[ch] ?? '#000000'));
    const signs: number[] = [];
    for (let i = 1; i < lum.length; i++) signs.push(Math.sign(lum[i]! - lum[i - 1]!));
    assert.ok(
      signs.every((v) => v !== 0),
      'every step changes brightness',
    );
    for (let i = 1; i < signs.length; i++) {
      assert.notEqual(signs[i], signs[i - 1], `step ${i} reverses direction (a blink, not a fade)`);
    }
    assert.ok(
      FIREFLY_LIFE_MIN_MS / ramp.length >= 500,
      `${FIREFLY_LIFE_MIN_MS / ramp.length} ms per step`,
    );
  });
});

void describe('Ambience embers (Stage 6, E3)', () => {
  void it('10 simulated seconds at 6 per second emit 60 embers (+- 1) of the existing ember kind, 1x1, inside the corridor view and the floor band', () => {
    const r = rig({ kind: 'embers', perSecond: 6 });
    emitOnly(r, 10_000);
    const out = drawn(r);
    assert.ok(Math.abs(out.length - 60) <= 1, `${out.length} embers`);
    for (const p of out) {
      assert.equal(p.color, '#e1', 'the ember ramp');
      assert.deepEqual([p.w, p.h], [1, 1]);
      assert.ok(p.x >= CORRIDOR_X && p.x < INTERNAL_WIDTH, `x ${p.x}`);
      assert.ok(p.y >= STAGE_EMBER_MIN_Y - 1 && p.y <= STAGE_EMBER_MAX_Y, `y ${p.y}`);
    }
  });

  void it('embers rise: y decreases for every live ember over its life', () => {
    const r = rig({ kind: 'embers', perSecond: 6 });
    const camera = new Camera();
    r.ambience.update(1000, r.world, camera);
    const before = drawn(r);
    assert.ok(before.length >= 5);
    r.particles.update(500);
    const after = drawn(r);
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++)
      assert.ok(after[i]!.y < before[i]!.y, `ember ${i} rose`);
  });

  void it('the ember and firefly rates do not couple through a shared debt (switching stage starts clean)', () => {
    const camera = new Camera();
    const r = rig({ kind: 'fireflies', perSecond: 5 });
    r.ambience.update(600_000, r.world, camera);
    assert.ok(r.particles.count <= 5, `${r.particles.count} after a hidden-tab step`);
    r.particles.clear();
    r.effect = { kind: 'embers', perSecond: 6 };
    r.ambience.update(600_000, r.world, camera);
    assert.ok(r.particles.count <= 6, `${r.particles.count} after the switch to embers`);
    r.particles.clear();
    r.effect = { kind: 'fireflies', perSecond: 5 };
    r.ambience.update(STEP_MS, r.world, camera);
    assert.ok(r.particles.count <= 1, `${r.particles.count} after one step back`);
    r.particles.clear();
    emitOnly(r, 10_000);
    assert.ok(Math.abs(r.particles.count - 50) <= 1, `${r.particles.count}`);
  });

  void it('emitting into a full pool never throws and never grows the pool', () => {
    for (const effect of [
      { kind: 'fireflies', perSecond: 5 },
      { kind: 'embers', perSecond: 6 },
    ] as const) {
      const r = rig(effect, 8);
      for (let i = 0; i < 8; i++) r.particles.emit('spark', 0, 0, 0, 0, 60_000);
      assert.doesNotThrow(() => emitOnly(r, 10_000));
      assert.equal(r.particles.count, 8);
    }
  });

  void it('steady-state E3 ambient load is far below the pool', () => {
    for (const effect of [
      { kind: 'fireflies', perSecond: 5 },
      { kind: 'embers', perSecond: 6 },
    ] as const) {
      const r = rig(effect);
      const camera = new Camera();
      let peak = 0;
      for (let t = 0; t < 30_000; t += STEP_MS) {
        r.ambience.update(STEP_MS, r.world, camera);
        r.particles.update(STEP_MS);
        peak = Math.max(peak, r.particles.count);
      }
      assert.ok(peak < PARTICLE_CAPACITY / 4, `${effect.kind}: peak ${peak}`);
    }
  });
});

void describe('Ambience snow and murk (Stages 7 and 8, E4)', () => {
  void it('10 simulated seconds at 9 per second emit 90 snow flakes (+- 1), only snow, each one 1x1 fillRect, inside the corridor view and the snow band', () => {
    const r = rig({ kind: 'snow', perSecond: 9 });
    emitOnly(r, 10_000);
    const out = drawn(r);
    assert.ok(Math.abs(out.length - 90) <= 1, `${out.length} flakes`);
    assert.equal(r.particles.count, out.length, 'one fillRect per live particle');
    for (const p of out) {
      assert.equal(p.color, '#n1', 'only the snow ramp');
      assert.deepEqual([p.w, p.h], [1, 1]);
      assert.ok(p.x >= CORRIDOR_X && p.x < INTERNAL_WIDTH, `x ${p.x}`);
      assert.ok(p.y >= SNOW_MIN_Y - 1 && p.y <= SNOW_MAX_Y, `y ${p.y}`);
    }
  });

  void it('10 simulated seconds at 4 per second emit 40 murk motes (+- 1), only murk, each one 2x2 fillRect, inside the corridor view and the murk band', () => {
    const r = rig({ kind: 'murk', perSecond: 4 });
    emitOnly(r, 10_000);
    const out = drawn(r);
    assert.ok(Math.abs(out.length - 40) <= 1, `${out.length} motes`);
    for (const p of out) {
      assert.equal(p.color, '#k1', 'only the murk ramp');
      assert.deepEqual([p.w, p.h], [2, 2]);
      assert.ok(p.x >= CORRIDOR_X && p.x < INTERNAL_WIDTH, `x ${p.x}`);
      assert.ok(p.y >= MURK_MIN_Y - 1 && p.y <= MURK_MAX_Y, `y ${p.y}`);
    }
  });

  void it('the same seed gives the same field and the emission is spread across x', () => {
    for (const effect of [
      { kind: 'snow', perSecond: 9 },
      { kind: 'murk', perSecond: 4 },
    ] as const) {
      const a = rig(effect);
      const b = rig(effect);
      emitOnly(a, 10_000);
      emitOnly(b, 10_000);
      assert.deepEqual(drawn(a), drawn(b), effect.kind);
      assert.ok(new Set(drawn(a).map((p) => p.x)).size > 20, effect.kind);
    }
  });

  void it('snow falls: y increases for every live flake, and the sway stays slight', () => {
    const r = rig({ kind: 'snow', perSecond: 9 });
    const camera = new Camera();
    r.ambience.update(1000, r.world, camera);
    const before = drawn(r);
    assert.ok(before.length >= 8);
    r.particles.update(500);
    const after = drawn(r);
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) {
      assert.ok(after[i]!.y > before[i]!.y, `flake ${i} fell`);
      // Emission drift is at most SNOW_DRIFT; the per-step jitter adds only a few px/s.
      assert.ok(Math.abs(after[i]!.x - before[i]!.x) <= SNOW_DRIFT * 0.5 + 6, `flake ${i} swayed`);
    }
  });

  void it('murk rises on average: mean y decreases, and every mote stays in its band plus drift over its life', () => {
    const r = rig({ kind: 'murk', perSecond: 4 });
    const camera = new Camera();
    r.ambience.update(1000, r.world, camera);
    const before = drawn(r);
    assert.ok(before.length >= 3);
    r.particles.update(500);
    const after = drawn(r);
    assert.equal(after.length, before.length);
    const mean = (xs: { y: number }[]): number => xs.reduce((a, p) => a + p.y, 0) / xs.length;
    assert.ok(mean(after) < mean(before), 'the motes rose');
    for (const p of after) {
      assert.ok(p.x >= CORRIDOR_X - MURK_DRIFT && p.x <= INTERNAL_WIDTH + MURK_DRIFT, `x ${p.x}`);
    }
  });

  void it('neither ambient is scrolled by the camera', () => {
    for (const effect of [
      { kind: 'snow', perSecond: 9 },
      { kind: 'murk', perSecond: 4 },
    ] as const) {
      const still = rig(effect);
      const moved = rig(effect);
      const cam = new Camera();
      for (let t = 0; t < 4000; t += STEP_MS) {
        still.ambience.update(STEP_MS, still.world, cam);
        moved.ambience.update(STEP_MS, moved.world, cam);
      }
      assert.deepEqual(drawn(still), drawn(moved), effect.kind);
    }
  });

  void it('the steady-state live count is about rate times life and far below the pool', () => {
    for (const [effect, lo, hi] of [
      [{ kind: 'snow', perSecond: 9 }, 25, 65],
      [{ kind: 'murk', perSecond: 4 }, 10, 35],
    ] as const) {
      const r = rig(effect);
      const camera = new Camera();
      let peak = 0;
      for (let t = 0; t < 30_000; t += STEP_MS) {
        r.ambience.update(STEP_MS, r.world, camera);
        r.particles.update(STEP_MS);
        peak = Math.max(peak, r.particles.count);
      }
      assert.ok(
        r.particles.count >= lo && r.particles.count <= hi,
        `${effect.kind}: ${r.particles.count} live`,
      );
      assert.ok(peak < PARTICLE_CAPACITY / 4, `${effect.kind}: peak ${peak}`);
    }
  });

  void it('a hidden-tab step and a mid-run stage switch carry no runaway debt (each kind has its own)', () => {
    const camera = new Camera();
    const r = rig({ kind: 'snow', perSecond: 9 });
    r.ambience.update(600_000, r.world, camera);
    assert.ok(r.particles.count <= 9, `${r.particles.count} after a hidden-tab step`);
    r.particles.clear();
    r.effect = { kind: 'murk', perSecond: 4 };
    r.ambience.update(600_000, r.world, camera);
    assert.ok(r.particles.count <= 4, `${r.particles.count} after the switch to murk`);
    r.particles.clear();
    r.effect = { kind: 'snow', perSecond: 9 };
    r.ambience.update(STEP_MS, r.world, camera);
    assert.ok(r.particles.count <= 1, `${r.particles.count} after one step back`);
  });

  void it('emitting into a full pool never throws and never grows the pool', () => {
    for (const effect of [
      { kind: 'snow', perSecond: 9 },
      { kind: 'murk', perSecond: 4 },
    ] as const) {
      const r = rig(effect, 8);
      for (let i = 0; i < 8; i++) r.particles.emit('spark', 0, 0, 0, 0, 60_000);
      assert.doesNotThrow(() => emitOnly(r, 10_000));
      assert.equal(r.particles.count, 8);
    }
  });

  void it('each shipped ramp has at least 3 steps, no step shorter than 0.5 s at the minimum life, and no hit or ember colour', () => {
    for (const [kind, life] of [
      ['snow', SNOW_LIFE_MIN_MS],
      ['murk', MURK_LIFE_MIN_MS],
    ] as const) {
      const ramp = PARTICLE_PALETTE[kind];
      assert.ok(ramp.length >= 3, `${kind}: ${ramp.length} steps`);
      assert.ok(life / ramp.length >= 500, `${kind}: ${life / ramp.length} ms per step`);
      assert.ok(life / 3 > 1000, `${kind}: plan floor`);
      for (const ch of ramp) {
        assert.ok(!'YORD'.includes(ch), `${kind}: ramp uses hit/ember character ${ch}`);
        assert.ok(ch in MASTER_PALETTE, `${kind}: ${ch} is a master character`);
      }
    }
  });
});

void describe('Ambience shimmer and rifts (Stages 9 and 10, E5)', () => {
  const SHIMMER = { kind: 'shimmer', perSecond: 8 } as const;
  const RIFTS = { kind: 'rifts', perSecond: 3 } as const;

  void it('10 simulated seconds at 8 per second emit 80 shimmer streaks (+- 1), only shimmer, each one a 1x3 fillRect, inside the corridor view and the shimmer band', () => {
    const r = rig(SHIMMER);
    emitOnly(r, 10_000);
    const out = drawn(r);
    assert.ok(Math.abs(out.length - 80) <= 1, `${out.length} streaks`);
    assert.equal(r.particles.count, out.length, 'one fillRect per live particle');
    for (const p of out) {
      assert.equal(p.color, '#h1', 'only the shimmer ramp');
      assert.deepEqual([p.w, p.h], [1, 3]);
      assert.ok(p.x >= CORRIDOR_X && p.x < INTERNAL_WIDTH, `x ${p.x}`);
      assert.ok(p.y >= SHIMMER_MIN_Y - 1 && p.y <= SHIMMER_MAX_Y, `y ${p.y}`);
    }
  });

  void it('10 simulated seconds at 3 per second emit 30 rift slits (+- 1), only rift, each one a 3x1 fillRect, inside the corridor view and the rift band', () => {
    const r = rig(RIFTS);
    emitOnly(r, 10_000);
    const out = drawn(r);
    assert.ok(Math.abs(out.length - 30) <= 1, `${out.length} slits`);
    assert.equal(r.particles.count, out.length, 'one fillRect per live particle');
    for (const p of out) {
      assert.equal(p.color, '#r1', 'only the rift ramp');
      assert.deepEqual([p.w, p.h], [3, 1]);
      assert.ok(p.x >= CORRIDOR_X && p.x < INTERNAL_WIDTH, `x ${p.x}`);
      assert.ok(p.y >= RIFT_MIN_Y - 1 && p.y <= RIFT_MAX_Y, `y ${p.y}`);
    }
  });

  void it('emission rate scales with perSecond (the rate bands follow the stage definitions, not a constant)', () => {
    for (const kind of ['shimmer', 'rifts'] as const) {
      const counts = [2, 6].map((perSecond) => {
        const r = rig({ kind, perSecond });
        emitOnly(r, 10_000);
        return r.particles.count;
      });
      assert.ok(
        Math.abs(counts[0]! - 20) <= 1 && Math.abs(counts[1]! - 60) <= 1,
        `${kind}: ${counts.join(',')}`,
      );
    }
  });

  void it('the same seed gives the same field and the emission is spread across x', () => {
    for (const effect of [SHIMMER, RIFTS]) {
      const a = rig(effect);
      const b = rig(effect);
      emitOnly(a, 10_000);
      emitOnly(b, 10_000);
      assert.deepEqual(drawn(a), drawn(b), effect.kind);
      assert.ok(new Set(drawn(a).map((p) => p.x)).size > 15, effect.kind);
    }
  });

  void it('shimmer rises slowly: every streak moves up, never faster than the rise cap plus jitter, and sways only slightly', () => {
    const r = rig(SHIMMER);
    r.ambience.update(1000, r.world, new Camera());
    const before = drawn(r);
    assert.ok(before.length >= 6);
    r.particles.update(500);
    const after = drawn(r);
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) {
      const rose = before[i]!.y - after[i]!.y;
      assert.ok(rose >= 0, `streak ${i} did not sink`);
      assert.ok(rose <= SHIMMER_RISE_MAX * 0.5 + 1, `streak ${i} rose ${rose} px in 0.5 s`);
      assert.ok(
        Math.abs(after[i]!.x - before[i]!.x) <= SHIMMER_DRIFT * 0.5 + 3,
        `streak ${i} swayed`,
      );
    }
    const mean = (xs: { y: number }[]): number => xs.reduce((a, p) => a + p.y, 0) / xs.length;
    assert.ok(mean(after) < mean(before), 'the streaks rose on average');
  });

  void it('rift slits are near-stationary: over 1 s no slit moves more than a couple of pixels on either axis', () => {
    const r = rig(RIFTS);
    emitOnly(r, 2000);
    const before = drawn(r);
    assert.ok(before.length >= 4);
    r.particles.update(1000);
    const after = drawn(r);
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) {
      assert.ok(Math.abs(after[i]!.x - before[i]!.x) <= RIFT_DRIFT + 2, `slit ${i} x`);
      assert.ok(Math.abs(after[i]!.y - before[i]!.y) <= RIFT_DRIFT + 2, `slit ${i} y`);
    }
  });

  void it('the shipped rift ramp pulses once per life: dim up to a peak and back down, and each slit lives 4 to 7 s', () => {
    assert.equal(RIFT_LIFE_MIN_MS, 4000);
    assert.equal(RIFT_LIFE_MAX_MS, 7000);
    const ramp = PARTICLE_PALETTE.rift;
    const mid = Math.floor(ramp.length / 2);
    assert.ok(ramp.length >= 5 && ramp.length % 2 === 1, `${ramp.length} steps`);
    for (let i = 0; i < mid; i++) {
      assert.equal(
        ramp[i],
        ramp[ramp.length - 1 - i],
        `step ${i} mirrors step ${ramp.length - 1 - i}`,
      );
    }
    // Drawn through the pool, a single slit steps through the ramp in order, once, with no step under 500 ms.
    const colors: ParticleColors = { ...COLORS, rift: [...ramp].map((c, i) => `#r${i}${c}`) };
    const pool = new Particles(4, mulberry32(7));
    pool.emit('rift', 50, 50, 0, 0, RIFT_LIFE_MIN_MS);
    const seen: { color: string; at: number }[] = [];
    for (let t = 0; t < RIFT_LIFE_MIN_MS - STEP_MS; t += STEP_MS) {
      const surface = new RecordingSurface();
      surface.record = true;
      pool.draw(surface, colors);
      const color = String(surface.calls[0]?.args[0]);
      if (seen.length === 0 || seen[seen.length - 1]!.color !== color) seen.push({ color, at: t });
      pool.update(STEP_MS);
    }
    assert.equal(seen.length, ramp.length, 'every step is shown exactly once, in order');
    for (let i = 1; i < seen.length; i++) {
      assert.ok(seen[i]!.at - seen[i - 1]!.at >= 500, `step ${i - 1} lasted under 500 ms`);
    }
  });

  void it('neither ambient is scrolled by the camera', () => {
    for (const effect of [SHIMMER, RIFTS]) {
      const still = rig(effect);
      const moved = rig(effect);
      const cam = new Camera();
      for (let t = 0; t < 4000; t += STEP_MS) {
        still.ambience.update(STEP_MS, still.world, cam);
        moved.ambience.update(STEP_MS, moved.world, cam);
      }
      assert.deepEqual(drawn(still), drawn(moved), effect.kind);
    }
  });

  void it('the steady-state live count is about rate times life and far below the pool', () => {
    for (const [effect, lo, hi] of [
      [SHIMMER, 20, 45],
      [RIFTS, 8, 25],
    ] as const) {
      const r = rig(effect);
      const camera = new Camera();
      let peak = 0;
      for (let t = 0; t < 30_000; t += STEP_MS) {
        r.ambience.update(STEP_MS, r.world, camera);
        r.particles.update(STEP_MS);
        peak = Math.max(peak, r.particles.count);
      }
      assert.ok(
        r.particles.count >= lo && r.particles.count <= hi,
        `${effect.kind}: ${r.particles.count} live`,
      );
      assert.ok(peak < PARTICLE_CAPACITY / 4, `${effect.kind}: peak ${peak}`);
    }
  });

  void it('a hidden-tab step and a mid-run stage switch carry no runaway debt (each kind has its own)', () => {
    const camera = new Camera();
    const r = rig(SHIMMER);
    r.ambience.update(600_000, r.world, camera);
    assert.ok(r.particles.count <= 8, `${r.particles.count} shimmer after a hidden-tab step`);
    r.particles.clear();
    r.effect = RIFTS;
    r.ambience.update(600_000, r.world, camera);
    assert.ok(r.particles.count <= 3, `${r.particles.count} after the switch to rifts`);
    r.particles.clear();
    r.effect = SHIMMER;
    r.ambience.update(STEP_MS, r.world, camera);
    assert.ok(r.particles.count <= 1, `${r.particles.count} after one step back`);
  });

  void it('emitting into a full pool never throws and never grows the pool', () => {
    for (const effect of [SHIMMER, RIFTS]) {
      const r = rig(effect, 8);
      for (let i = 0; i < 8; i++) r.particles.emit('spark', 0, 0, 0, 0, 60_000);
      assert.doesNotThrow(() => emitOnly(r, 10_000));
      assert.equal(r.particles.count, 8);
    }
  });

  void it('the shimmer ramp is monotone dimming with at least 3 steps, no step under 500 ms, and no hit or ember colour', () => {
    for (const [kind, life] of [
      ['shimmer', SHIMMER_LIFE_MIN_MS],
      ['rift', RIFT_LIFE_MIN_MS],
    ] as const) {
      const ramp = PARTICLE_PALETTE[kind];
      assert.ok(ramp.length >= 3, `${kind}: ${ramp.length} steps`);
      assert.ok(life / ramp.length >= 500, `${kind}: ${life / ramp.length} ms per step`);
      for (const ch of ramp) {
        assert.ok(!'YORDw'.includes(ch), `${kind}: ramp uses hit/ember/white character ${ch}`);
        assert.ok(ch in MASTER_PALETTE, `${kind}: ${ch} is a master character`);
      }
    }
  });
});
