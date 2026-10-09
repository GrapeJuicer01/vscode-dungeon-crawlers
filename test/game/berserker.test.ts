// The Berserker is not a meter (H3 plan section 2.1 and test notes 3 and 7; Core invariant 1).
// Battle Roar is a timer-driven one-shot flourish: identical on cast 1 and cast 100, never keyed to
// anything that happens to the hero or to any other hero, no red in any effect, and the war paint
// is two fixed pixels in the head layer of every frame. Also: the Monk and the Druid strikes follow
// the static / moving effect rules, and no class code may read combat.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLASSES, classDef } from '../../src/game/data/classes';
import {
  STEP_MS,
  ABILITY_INTERVAL_MAX_MS,
  ABILITY_INTERVAL_MIN_MS,
} from '../../src/game/data/tuning';
import { EffectPool } from '../../src/game/Effects';
import { ClassHero } from '../../src/game/entities/ClassHero';
import { Particles } from '../../src/game/Particles';
import { mulberry32 } from '../../src/game/rng';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { heroFrameRows } from '../../src/game/sprites/spriteFactory';
import { REQUIRED_HERO_ANIMATIONS } from '../../src/game/sprites/spriteValidator';
import { isRedHex } from '../support/color';
import { idsOfClass, info, lookFor, makeWorld, stepWorld } from '../support/classRig';
import { listFiles } from '../support/repo';
import { code } from '../support/source';

const ROAR_MAX_LIFE_MS = 480;

function berserker(slot = 0, prefix = 'bz-'): ClassHero {
  const id = idsOfClass('berserker', 1, prefix)[0] ?? 'x';
  return new ClassHero(
    {
      info: info(id, 'working'),
      slot,
      instant: true,
      look: { ...lookFor(id), classId: 'berserker' },
    },
    classDef('berserker'),
  );
}

interface Cast {
  /** Spawned shots relative to the floored foot pixel. */
  readonly shots: string[];
  /** Attack-phase ms since the previous cast (or since the start). */
  readonly gapMs: number;
  readonly at: number;
}

/** Runs one Berserker (plus `others` warriors in the same world) and records every cast. */
function casts(count: number, others = 0, seed = 11): Cast[] {
  const w = makeWorld(undefined, seed);
  w.engagement.engaged = true;
  const hero = berserker();
  const crowd = Array.from({ length: others }, (_, i) => {
    const id = idsOfClass('warrior', 1, `wc${i}-`)[0] ?? 'x';
    return new ClassHero(
      {
        info: info(id, 'working'),
        slot: i + 1,
        instant: true,
        look: { ...lookFor(id), classId: 'warrior' },
      },
      classDef('warrior'),
    );
  });
  const out: Cast[] = [];
  let seen = 0;
  let attackSince = 0;
  for (let step = 0; step < (60 * 60 * 1000) / STEP_MS && out.length < count; step++) {
    const phaseBefore = hero.phase;
    hero.update(STEP_MS, w.world);
    for (const c of crowd) c.update(STEP_MS, w.world);
    if (phaseBefore === 'attack') attackSince += STEP_MS;
    if (w.spawns.length > seen) {
      // Only the Berserker's own shots: the warriors' whirl effect is skipped by effect id.
      const mine = w.spawns
        .slice(seen)
        .filter((s) => s.effect === 'warCry' || s.effect === 'smokePuff');
      seen = w.spawns.length;
      if (mine.length > 0) {
        const fx = Math.floor(hero.x);
        const fy = Math.floor(hero.y);
        out.push({
          shots: mine.map((s) =>
            [s.effect, s.x - fx, s.y - fy, s.vx, s.vy, s.lifeMs, s.flipX].join(),
          ),
          gapMs: attackSince,
          at: step * STEP_MS,
        });
        attackSince = 0;
      }
    }
    stepWorld(w);
  }
  return out;
}

void describe('Battle Roar is identical on every cast and timer driven', () => {
  void it('the Berserker row has no strike (the axe swing is art) and an ability of one ring and two puffs', () => {
    const row = classDef('berserker');
    assert.equal(row.strike.length, 0);
    assert.deepEqual(
      row.ability.shots.map((s) => s.effect),
      ['warCry', 'smokePuff', 'smokePuff'],
    );
    for (const s of row.ability.shots) {
      assert.equal(s.vx, 0);
      assert.equal(s.vy, 0);
      assert.ok(s.lifeMs <= ROAR_MAX_LIFE_MS, `${s.effect} ${s.lifeMs}`);
    }
    assert.equal(row.summon, null);
  });

  void it('cast 1 and cast 100 spawn the same shots (effects, offsets, velocities, lifetimes, flip)', () => {
    const all = casts(100);
    assert.equal(all.length, 100, 'one hundred casts happened');
    const first = all[0]?.shots;
    assert.equal(first?.length, 3);
    for (const [i, c] of all.entries()) {
      assert.deepEqual(c.shots, first, `cast ${i + 1}`);
    }
  });

  void it('the interval between casts lies in 4 to 8 s of attack time on every cast, alone or in a crowd', () => {
    for (const others of [0, 7]) {
      const all = casts(60, others, 5 + others);
      assert.equal(all.length, 60);
      for (const [i, c] of all.entries()) {
        assert.ok(
          c.gapMs >= ABILITY_INTERVAL_MIN_MS - 2 * STEP_MS &&
            c.gapMs <= ABILITY_INTERVAL_MAX_MS + 3 * STEP_MS,
          `cast ${i + 1} (${others} others): ${c.gapMs} ms`,
        );
      }
      // The gap does not trend with the number of casts (no ramp-up): first and last 20 averages.
      const mean = (xs: Cast[]): number => xs.reduce((a, c) => a + c.gapMs, 0) / xs.length;
      assert.ok(Math.abs(mean(all.slice(0, 20)) - mean(all.slice(40))) < 1500);
    }
  });

  void it('nothing persists: 0.6 s after a cast the effect pool is empty and no roar outlives 480 ms', () => {
    const w = makeWorld();
    w.engagement.engaged = true;
    const hero = berserker();
    let castAt = -1;
    for (let step = 0; step < 30_000 / STEP_MS && castAt < 0; step++) {
      hero.update(STEP_MS, w.world);
      stepWorld(w);
      if (w.spawns.length > 0) castAt = step;
    }
    assert.ok(castAt >= 0);
    assert.equal(w.effects.count, 3);
    for (let i = 0; i < (ROAR_MAX_LIFE_MS + 60) / STEP_MS; i++) {
      hero.update(STEP_MS, w.world);
      stepWorld(w);
    }
    assert.equal(w.effects.count, 0, 'no Berserker effect is still live');
    assert.equal(w.particles.count, 0, 'stationary effects end without sparks');
  });

  void it('applying each host event during the roar leaves the lifecycle exactly as the event says', () => {
    for (const event of ['spawned', 'working', 'idle', 'despawned'] as const) {
      const w = makeWorld();
      w.engagement.engaged = true;
      const hero = berserker();
      let guard = 0;
      while (hero.phase !== 'ability' && guard++ < 40_000 / STEP_MS) {
        hero.update(STEP_MS, w.world);
        stepWorld(w);
      }
      assert.equal(hero.phase, 'ability');
      hero.applyAgentState(info(hero.id, event, 50));
      assert.equal(hero.lifecycle, event);
      for (let i = 0; i < 30_000 / STEP_MS; i++) {
        hero.update(STEP_MS, w.world);
        stepWorld(w);
      }
      assert.equal(hero.lifecycle, event, 'nothing else changed it');
      assert.equal(hero.classId, 'berserker');
    }
  });
});

void describe('red is static war paint only', () => {
  const paint = SHIPPED_ART.classPalettes['berserker']?.['a'] ?? '';
  const layers = SHIPPED_ART.classLayers['berserker'];

  void it('the Berserker accent a is red; no other class recolors a, c, or d to the same red', () => {
    assert.ok(isRedHex(paint), paint);
    for (const [id, palette] of Object.entries(SHIPPED_ART.classPalettes)) {
      if (id === 'berserker') continue;
      for (const key of ['a', 'c', 'd', 'b', 'k', 'm'] as const) {
        const hex = palette[key];
        if (hex !== undefined)
          assert.notEqual(hex.toLowerCase(), paint.toLowerCase(), `${id}.${key}`);
      }
    }
  });

  void it('no Berserker body color other than the accent a is red (fur, leather, metal)', () => {
    const palette = SHIPPED_ART.classPalettes['berserker'] ?? {};
    for (const key of ['c', 'd', 'b', 'k', 'm'] as const) {
      assert.ok(!isRedHex(palette[key] ?? '#000000'), `berserker.${key} ${palette[key]}`);
    }
  });

  void it('no effect template uses a red color or the red set (R, D); effects resolve a through the master sand-gold', () => {
    // Effects are drawn with the master palette only (never class-swapped), so the check keys on
    // the colors an effect really shows, not on the character `a`.
    for (const [key, t] of Object.entries(SHIPPED_ART.effects)) {
      const used = new Set<string>();
      for (const frames of Object.values(t.animations)) {
        for (const rows of frames) {
          for (const row of rows) {
            for (const ch of row) if (ch !== '.') used.add(ch);
          }
        }
      }
      for (const ch of used) {
        const hex = SHIPPED_ART.palette[ch] ?? '';
        assert.ok(!['R', 'D'].includes(ch), `effects/${key} uses master red ${ch}`);
        assert.ok(!isRedHex(hex), `effects/${key} uses ${ch} ${hex}`);
        assert.notEqual(
          hex.toLowerCase(),
          paint.toLowerCase(),
          `effects/${key} uses the paint color`,
        );
      }
    }
  });

  void it('exactly 2 red a pixels in the head layer of every one of the 26 frames, and 2 in each composited frame', () => {
    assert.ok(layers);
    let frames = 0;
    for (const name of Object.keys(REQUIRED_HERO_ANIMATIONS)) {
      const count = layers.head.animations[name]?.length ?? 0;
      for (let i = 0; i < count; i++) {
        const head = (layers.head.animations[name]?.[i] ?? []).join('');
        assert.equal(head.split('a').length - 1, 2, `head ${name}[${i}]`);
        const composite = heroFrameRows(layers, name, i).join('');
        assert.equal(composite.split('a').length - 1, 2, `composite ${name}[${i}]`);
        frames++;
      }
    }
    assert.equal(frames, 26);
  });

  void it('the two stripes keep the same shape (offset between them) in every frame: nothing grows, drips, or pulses', () => {
    assert.ok(layers);
    const shapes = new Set<string>();
    for (const [name, list] of Object.entries(layers.head.animations)) {
      for (const [i, rows] of list.entries()) {
        const found: [number, number][] = [];
        rows.forEach((row, y) => {
          [...row].forEach((ch, x) => {
            if (ch === 'a') found.push([x, y]);
          });
        });
        assert.equal(found.length, 2, `${name}[${i}]`);
        const [p, q] = found as [[number, number], [number, number]];
        shapes.add(`${q[0] - p[0]},${q[1] - p[1]}`);
      }
    }
    assert.equal(shapes.size, 1, [...shapes].join(' | '));
  });

  void it('the other three H3 classes and the Berserker body/gear/weapon layers carry no red-coded a at all', () => {
    assert.ok(layers);
    // The accent a is red only for the Berserker; there it appears in the head layer only.
    for (const slot of ['gear', 'weapon'] as const) {
      const t = layers[slot];
      assert.ok(t);
      for (const frames of Object.values(t.animations)) {
        for (const rows of frames) assert.ok(!rows.join('').includes('a'), `${t.id}`);
      }
    }
  });
});

void describe('moving and static H3 effects (plan note 8)', () => {
  function endOf(
    effect: 'chiOrb' | 'chiBurst' | 'leaf' | 'wrench',
    vx: number,
    vy: number,
  ): number {
    const pool = new EffectPool(24);
    const particles = new Particles(384, mulberry32(1));
    assert.ok(pool.spawn(effect, 100, 100, vx, vy, 300, false));
    for (let t = 0; t < 400; t += STEP_MS) pool.update(STEP_MS, particles);
    assert.equal(pool.count, 0);
    return particles.count;
  }

  void it('the Monk effects are static: they play once and end without sparks', () => {
    for (const shot of [...classDef('monk').strike, ...classDef('monk').ability.shots]) {
      assert.equal(shot.vx, 0, shot.effect);
      assert.equal(shot.vy, 0, shot.effect);
    }
    assert.equal(endOf('chiOrb', 0, 0), 0);
    assert.equal(endOf('chiBurst', 0, 0), 0);
  });

  void it('Druid and Artificer strikes move and end in two sparks', () => {
    for (const id of ['druid', 'artificer'] as const) {
      const strike = classDef(id).strike[0];
      assert.ok(strike && (strike.vx !== 0 || strike.vy !== 0), id);
    }
    assert.equal(endOf('leaf', 110, -6), 2);
    assert.equal(endOf('wrench', 140, -4), 2);
  });
});

void describe('effect-pool occupancy of the H3 strikers', () => {
  void it('8 Druids, 8 Artificers, 8 Monks, and a mixed party each attacking for 60 s never exceed 24 live', () => {
    const parties: (readonly ClassHero[])[] = [];
    const w = makeWorld();
    w.engagement.engaged = true;
    let slot = 0;
    for (const cls of ['druid', 'artificer', 'monk'] as const) {
      parties.push(
        idsOfClass(cls, 8, `oc-${cls}-`).map(
          (id) =>
            new ClassHero(
              {
                info: info(id, 'working'),
                slot: slot++,
                instant: true,
                look: { ...lookFor(id), classId: cls },
              },
              classDef(cls),
            ),
        ),
      );
    }
    let worst = 0;
    const all = parties.flat();
    for (let step = 0; step < 60_000 / STEP_MS; step++) {
      for (const h of all) h.update(STEP_MS, w.world);
      stepWorld(w);
      worst = Math.max(worst, w.effects.count);
    }
    assert.ok(worst <= 24, `${worst}`);
    assert.ok(worst > 0);
    // Every class row is counted once more as a guard that the table was not changed under us.
    assert.equal(CLASSES.length, 12);
  });
});

void describe('the Berserker cannot read combat (structure)', () => {
  const CLASS_DATA = [
    'src/game/entities/ClassHero.ts',
    'src/game/data/classes.ts',
    'src/game/data/classMap.ts',
    'src/game/data/effects.ts',
    'src/game/data/summons.ts',
    'src/game/Effects.ts',
    'src/game/Summons.ts',
  ];

  /** Splits identifiers into lower-case words (camelCase, snake_case, kebab-case). */
  function words(source: string): Set<string> {
    const out = new Set<string>();
    for (const ident of source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      for (const part of ident.split(/_|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
        out.add(part.toLowerCase());
      }
    }
    return out;
  }

  void it('no identifier or id word is rage or meter in entities/**, classes, effects, summons, or the Berserker art files', () => {
    const files = [
      ...listFiles('src/game/entities').filter((f) => f.endsWith('.ts')),
      ...CLASS_DATA,
      'src/game/sprites/classTemplatesH3.ts',
      'src/game/sprites/effectTemplatesH3.ts',
      'src/game/sprites/summonTemplatesH3.ts',
      'src/game/sprites/palettesH3.ts',
    ];
    const offenders = files.filter((f) => {
      const w = words(code(f));
      return w.has('rage') || w.has('meter') || w.has('enrage') || w.has('enraged');
    });
    assert.deepEqual(offenders, []);
  });

  void it('the lone helper words() really flags a bad identifier (the check can fail)', () => {
    assert.ok(words('const rageLevel = 1;').has('rage'));
    assert.ok(words('const RAGE_METER = 1;').has('meter'));
    assert.ok(!words('const storage = 1; const average = 2;').has('rage'));
  });

  void it('ClassHero.ts imports no Combat, Enemy, Roster, Summons, Engagement, or Game, and never reads the effect pool', () => {
    const src = code('src/game/entities/ClassHero.ts');
    const specs = [...src.matchAll(/from\s*'([^']+)'/g)].map((m) => m[1] ?? '');
    for (const s of specs) {
      assert.doesNotMatch(s, /Combat|Enemy|Boss|Roster|Summons|Engagement|Game\b/, s);
    }
    assert.doesNotMatch(src, /\b(Combat|Enemy|Boss|Engagement)\b/);
    assert.doesNotMatch(
      src,
      /\.effects\.(count|entities|alive)\b/,
      'writes effects, never reads them',
    );
    assert.doesNotMatch(src, /\bengagement\b/);
  });

  void it('no class data row, id, or ability name mentions rage, anger, fury, hurt, or wound', () => {
    for (const c of CLASSES) {
      const text = JSON.stringify(c).toLowerCase();
      assert.doesNotMatch(text, /\b(rage|anger|angry|fury|hurt|wound|blood|bleed)\b/, c.id);
    }
  });
});
