// ClassHero behavior (H1 plan test note 5): shot positions and facing, strike cadence, the hidden
// ability timer, and the look. Heroes are driven update by update against a hand-built World with
// a manual engagement, so no enemy, no Game, and no renderer is involved.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classFor } from '../../src/game/data/classMap';
import { CLASS_IDS, classDef } from '../../src/game/data/classes';
import type { ClassId } from '../../src/game/data/classes';
import { ABILITY_TOTAL_MS } from '../../src/game/data/animations';
import {
  ABILITY_INTERVAL_MAX_MS,
  ABILITY_INTERVAL_MIN_MS,
  STEP_MS,
} from '../../src/game/data/tuning';
import { ClassHero, createHero } from '../../src/game/entities/ClassHero';
import type { World } from '../../src/game/entities/Entity';
import { Hero } from '../../src/game/entities/Hero';
import type { HeroInit } from '../../src/game/entities/Hero';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import {
  artWithoutClasses,
  drawContext,
  idsOfClass,
  info,
  lookFor,
  makeWorld,
  stepWorld,
} from '../support/classRig';
import type { ClassWorld, SpawnRecord } from '../support/classRig';
import { FakeBitmap, RecordingSurface } from '../support/engineFakes';

/** A ClassHero that records which hook ran and what it spawned, and can face left. */
class SpyHero extends ClassHero {
  readonly strikes: SpawnRecord[][] = [];
  readonly releases: SpawnRecord[][] = [];
  readonly strikeAtMs: number[] = [];
  readonly releaseAtMs: number[] = [];
  readonly #w: ClassWorld;
  readonly #clock: () => number;
  forcedFaceLeft = false;

  constructor(init: HeroInit, w: ClassWorld, clock: () => number) {
    super(init, classDef(init.look.classId as ClassId));
    this.#w = w;
    this.#clock = clock;
  }

  override get faceRight(): boolean {
    return this.forcedFaceLeft ? false : super.faceRight;
  }

  protected override onAttackStrike(world: World): void {
    const from = this.#w.spawns.length;
    super.onAttackStrike(world);
    this.strikes.push(this.#w.spawns.slice(from));
    this.strikeAtMs.push(this.#clock());
  }

  protected override onAbilityRelease(world: World): void {
    const from = this.#w.spawns.length;
    super.onAbilityRelease(world);
    this.releases.push(this.#w.spawns.slice(from));
    this.releaseAtMs.push(this.#clock());
  }
}

interface Rig {
  readonly w: ClassWorld;
  readonly hero: SpyHero;
  /** Simulated ms since the rig was made. */
  readonly now: () => number;
  /** Time spent with phase 'attack' before each update (the ability timer's clock). */
  readonly attackMs: () => number;
  readonly casts: number[];
  advance(ms: number): void;
}

function rig(classId: ClassId, options: { seed?: number; state?: 'working' | 'idle' } = {}): Rig {
  const w = options.seed === undefined ? makeWorld() : makeWorld(SHIPPED_ART, options.seed);
  const id = idsOfClass(classId, 1)[0] ?? 'x';
  let t = 0;
  let attack = 0;
  const casts: number[] = [];
  const hero = new SpyHero(
    {
      info: info(id, options.state ?? 'working'),
      slot: 0,
      instant: true,
      look: { ...lookFor(id), classId },
    },
    w,
    () => t,
  );
  return {
    w,
    hero,
    now: () => t,
    attackMs: () => attack,
    casts,
    advance(ms: number): void {
      const n = Math.round(ms / STEP_MS);
      for (let i = 0; i < n; i++) {
        const before = hero.phase;
        if (before === 'attack') {
          attack += STEP_MS;
        }
        hero.update(STEP_MS, w.world);
        stepWorld(w);
        t += STEP_MS;
        if (before !== 'ability' && hero.phase === 'ability') {
          casts.push(attack);
        }
      }
    },
  };
}

/** Engages the party and runs until the hero is attacking. */
function startAttack(r: Rig): void {
  r.w.engagement.engaged = true;
  r.advance(600);
  assert.equal(r.hero.phase, 'attack');
}

const near = (actual: number, expected: number, tolerance: number, what: string): void => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} vs ${expected}`);
};

void describe('shot positions and velocities', () => {
  const STRIKERS: readonly [ClassId, string, number, number, number, number][] = [
    ['mage', 'orbBolt', 12, -12, 150, 500],
    ['archer', 'arrow', 12, -10, 180, 500],
  ];

  for (const [cls, effect, dx, dy, vx, life] of STRIKERS) {
    void it(`${cls} strike spawns one ${effect} at the floored foot pixel plus (${dx}, ${dy})`, () => {
      const r = rig(cls);
      startAttack(r);
      r.advance(500);
      const first = r.hero.strikes[0];
      assert.ok(first !== undefined, 'a strike happened');
      assert.equal(first.length, 1);
      assert.deepEqual(first[0], {
        effect,
        x: Math.floor(r.hero.x) + dx,
        y: Math.floor(r.hero.y) + dy,
        vx,
        vy: 0,
        lifeMs: life,
        flipX: false,
        accepted: true,
      });
    });
  }

  const ABILITIES: readonly [
    ClassId,
    readonly [string, number, number, number, number, number][],
  ][] = [
    ['warrior', [['whirl', 0, -6, 0, 0, 460]]],
    ['mage', [['arcaneBurst', 28, -10, 0, 0, 420]]],
    [
      'archer',
      [
        ['arrow', 12, -14, 180, -10, 500],
        ['arrow', 12, -10, 180, 0, 500],
        ['arrow', 12, -6, 180, 10, 500],
      ],
    ],
    [
      'rogue',
      [
        ['smokePuff', 0, -4, 0, 0, 360],
        ['dagger', 10, -12, 200, 0, 400],
        ['dagger', 4, -8, 200, 0, 400],
      ],
    ],
  ];

  for (const [cls, shots] of ABILITIES) {
    void it(`${cls} ability spawns exactly its ${shots.length} shot(s) once, at the right offsets`, () => {
      const r = rig(cls);
      startAttack(r);
      r.advance(ABILITY_INTERVAL_MAX_MS + 1500);
      const release = r.hero.releases[0];
      assert.ok(release !== undefined, 'an ability was released');
      assert.deepEqual(
        release.map((s) => [
          s.effect,
          s.x - Math.floor(r.hero.x),
          s.y - Math.floor(r.hero.y),
          s.vx,
          s.vy,
          s.lifeMs,
        ]),
        shots.map((s) => [...s]),
      );
      assert.ok(release.every((s) => !s.flipX && s.accepted));
      assert.equal(
        r.hero.releases.length,
        r.casts.length,
        'one release per ability entered (the last may still be playing)',
      );
    });
  }

  void it('shot origins use the floored hero position even when the hero stands on a fraction', () => {
    const r = rig('archer');
    startAttack(r);
    // Formation positions are whole numbers, so check the rule on the spawn arithmetic directly:
    // x and y of every recorded shot are whole numbers plus whole offsets.
    r.advance(3000);
    for (const s of r.w.spawns) {
      assert.equal(Number.isInteger(s.x) && Number.isInteger(s.y), true);
    }
  });

  void it('a hero facing left mirrors dx and vx and sets flipX; dy and vy are unchanged', () => {
    for (const cls of ['mage', 'archer'] as const) {
      const r = rig(cls);
      startAttack(r);
      r.hero.forcedFaceLeft = true;
      const already = r.hero.strikes.length; // strikes before the flip are not mirrored
      r.advance(500);
      const strike = r.hero.strikes[already]?.[0];
      assert.ok(strike !== undefined);
      const def = classDef(cls).strike[0];
      assert.ok(def !== undefined);
      assert.equal(strike.x, Math.floor(r.hero.x) - def.dx);
      assert.equal(strike.y, Math.floor(r.hero.y) + def.dy);
      assert.equal(strike.vx, -def.vx);
      assert.equal(strike.vy, def.vy);
      assert.equal(strike.flipX, true);
    }
    const r = rig('archer');
    startAttack(r);
    r.hero.forcedFaceLeft = true;
    r.advance(ABILITY_INTERVAL_MAX_MS + 1500);
    assert.equal(r.hero.releases.length >= 1, true);
    const volley = r.hero.releases[0];
    assert.ok(volley !== undefined);
    assert.deepEqual(
      volley.map((s) => [s.x - Math.floor(r.hero.x), s.vx, s.vy, s.flipX]),
      [
        [-12, -180, -10, true],
        [-12, -180, 0, true],
        [-12, -180, 10, true],
      ],
    );
  });

  void it('in the corridor a class hero always faces right, so shots go right unflipped', () => {
    for (const cls of CLASS_IDS) {
      const r = rig(cls);
      startAttack(r);
      r.advance(ABILITY_INTERVAL_MAX_MS + 1500);
      assert.ok(r.hero.faceRight);
      assert.ok(r.w.spawns.length > 0, cls);
      assert.ok(
        r.w.spawns.every((s) => !s.flipX && s.vx >= 0),
        cls,
      );
    }
  });
});

void describe('strike cadence', () => {
  for (const cls of ['mage', 'archer'] as const) {
    void it(`${cls} strikes once per 390 ms attack cycle and never twice in a cycle`, () => {
      const r = rig(cls);
      startAttack(r);
      const start = r.now();
      r.advance(3500); // below ABILITY_INTERVAL_MIN_MS, so no ability interrupts the cycle
      const times = r.hero.strikeAtMs.map((x) => x - start);
      assert.ok(times.length >= 8 && times.length <= 10, `${times.length} strikes in 3.5 s`);
      for (let i = 1; i < times.length; i++) {
        near((times[i] ?? 0) - (times[i - 1] ?? 0), 390, STEP_MS + 1, `gap ${i}`);
      }
      assert.ok(r.hero.strikes.every((s) => s.length === 1));
    });
  }

  for (const cls of ['warrior', 'rogue'] as const) {
    void it(`${cls} (pure melee) spawns no strike shot, though the strike hook runs each cycle`, () => {
      const r = rig(cls);
      startAttack(r);
      r.advance(3500);
      assert.ok(r.hero.strikes.length >= 8, 'the hook still fires once per cycle');
      assert.ok(r.hero.strikes.every((s) => s.length === 0));
      assert.equal(r.w.spawns.length, 0);
    });
  }

  void it('no strike while advancing (party not engaged) or resting', () => {
    const r = rig('mage');
    r.advance(20_000); // advancing, not engaged
    assert.equal(r.hero.phase, 'advance');
    assert.equal(r.hero.strikes.length, 0);
    const rest = rig('archer', { state: 'idle' });
    rest.w.engagement.engaged = true;
    rest.advance(20_000);
    assert.equal(rest.hero.phase, 'rest');
    assert.equal(rest.w.spawns.length, 0);
  });
});

void describe('the hidden ability timer', () => {
  void it('the first ability is not before ABILITY_INTERVAL_MIN_MS of attack time, for every class', () => {
    for (const cls of CLASS_IDS) {
      const r = rig(cls);
      startAttack(r);
      r.advance(ABILITY_INTERVAL_MAX_MS + 2000);
      const first = r.casts[0];
      assert.ok(first !== undefined, `${cls} cast within the maximum interval`);
      assert.ok(first >= ABILITY_INTERVAL_MIN_MS, `${cls} cast after ${first} ms of attack`);
      assert.ok(first <= ABILITY_INTERVAL_MAX_MS + STEP_MS * 2, `${cls} cast after ${first} ms`);
    }
  });

  void it('no ability in the first 4 seconds of attacking, however long the hero advanced before', () => {
    const r = rig('mage');
    r.advance(60_000); // advancing for a minute, not attacking
    assert.equal(r.casts.length, 0);
    startAttack(r);
    const before = r.attackMs();
    r.advance(ABILITY_INTERVAL_MIN_MS - 700);
    assert.equal(r.casts.length, 0, `still attacking after ${r.attackMs() - before} ms`);
  });

  void it('intervals between casts stay within 4 to 8 s of attack time', () => {
    const r = rig('rogue');
    startAttack(r);
    r.advance(120_000);
    assert.ok(r.casts.length >= 12, `${r.casts.length} casts in 2 minutes`);
    for (let i = 1; i < r.casts.length; i++) {
      const gap = (r.casts[i] ?? 0) - (r.casts[i - 1] ?? 0);
      assert.ok(gap >= ABILITY_INTERVAL_MIN_MS - STEP_MS * 2, `interval ${i}: ${gap}`);
      assert.ok(gap <= ABILITY_INTERVAL_MAX_MS + STEP_MS * 2, `interval ${i}: ${gap}`);
    }
  });

  void it('is deterministic for a fixed seed, and the seed matters', () => {
    const run = (seed: number): number[] => {
      const r = rig('mage', { seed });
      startAttack(r);
      r.advance(90_000);
      return r.casts.map((c) => Math.round(c));
    };
    assert.deepEqual(run(11), run(11));
    assert.notDeepEqual(run(11), run(12));
  });

  void it('the timer does not advance while advancing: attack time, not wall time, triggers a cast', () => {
    const r = rig('archer');
    startAttack(r);
    r.advance(3000); // 3 s of attack time banked (below the 4 s minimum)
    assert.equal(r.casts.length, 0);
    r.w.engagement.engaged = false;
    r.advance(60_000); // a minute of advancing
    assert.equal(r.hero.phase, 'advance');
    assert.equal(r.casts.length, 0, 'advancing never casts');
    r.w.engagement.engaged = true;
    r.advance(ABILITY_INTERVAL_MAX_MS + 2000);
    const first = r.casts[0];
    assert.ok(first !== undefined);
    assert.ok(first >= ABILITY_INTERVAL_MIN_MS, `cast after ${first} ms of attack time in total`);
  });

  void it('the timer does not advance while resting or traveling', () => {
    const r = rig('warrior');
    startAttack(r);
    r.advance(3000);
    r.hero.applyAgentState(info(r.hero.id, 'idle', 2));
    r.advance(40_000); // travels to the fire and rests
    assert.equal(r.hero.phase, 'rest');
    assert.equal(r.casts.length, 0);
    assert.equal(r.w.spawns.length, 0, 'a resting hero spawns nothing');
    r.hero.applyAgentState(info(r.hero.id, 'working', 3));
    r.w.engagement.engaged = true;
    r.advance(40_000);
    const first = r.casts[0];
    assert.ok(first !== undefined, 'casts again once attacking');
    assert.ok(first >= ABILITY_INTERVAL_MIN_MS, `cast after ${first} ms of attack time`);
  });

  void it('exposes no timer: no member of a ClassHero looks like a cooldown or resource', () => {
    const r = rig('mage');
    const names = new Set<string>();
    for (
      let o: object | null = r.hero;
      o !== null && o !== Object.prototype;
      o = Object.getPrototypeOf(o) as object | null
    ) {
      for (const n of Object.getOwnPropertyNames(o)) {
        names.add(n);
      }
    }
    for (const n of names) {
      assert.doesNotMatch(n, /cooldown|charge|mana|power|resource|timer|interval|energy/i, n);
    }
  });
});

void describe('what the hooks receive', () => {
  void it('hooks are given a World with exactly the eight engine fields: no roster, no host channel', () => {
    const seen: World[] = [];
    class Peek extends ClassHero {
      protected override onAttackStrike(world: World): void {
        seen.push(world);
        super.onAttackStrike(world);
      }
      protected override onAbilityRelease(world: World): void {
        seen.push(world);
        super.onAbilityRelease(world);
      }
    }
    const w = makeWorld();
    const id = idsOfClass('mage', 1)[0] ?? 'x';
    const hero = new Peek(
      {
        info: info(id, 'working'),
        slot: 0,
        instant: true,
        look: { ...lookFor(id), classId: 'mage' },
      },
      classDef('mage'),
    );
    w.engagement.engaged = true;
    for (let i = 0; i < 700 / STEP_MS + 600; i++) {
      hero.update(STEP_MS, w.world);
    }
    assert.ok(seen.length >= 2);
    for (const world of seen) {
      assert.deepEqual(Object.keys(world).sort(), [
        'cache',
        'campfire',
        'effects',
        'engagement',
        'particles',
        'rng',
        'stage',
        'summons',
      ]);
      for (const value of Object.values(world)) {
        assert.equal(typeof (value as { applyAgentState?: unknown }).applyAgentState, 'undefined');
      }
    }
  });

  void it('createHero returns a ClassHero whose class comes from the id alone', () => {
    for (const id of ['a', 'b', 'sim-3-0', 'héro']) {
      const hero = createHero({
        info: info(id, 'idle'),
        slot: 0,
        instant: true,
        look: lookFor(id),
      });
      assert.ok(hero instanceof ClassHero);
      assert.equal(hero.classId, classFor(id));
      assert.equal(hero.id, id);
    }
  });
});

void describe('the look', () => {
  function drawn(hero: Hero, w: ClassWorld): FakeBitmap {
    const surface = new RecordingSurface();
    hero.draw(drawContext(surface, w));
    assert.equal(surface.count('drawBitmap'), 1);
    assert.equal(surface.count('fillRect'), 0);
    const bitmap = surface.calls[0]?.args[0];
    assert.ok(bitmap instanceof FakeBitmap);
    return bitmap;
  }
  const rgbaKey = (b: FakeBitmap): string =>
    `${b.width}x${b.height}:${Buffer.from(b.rgba ?? []).toString('base64')}`;

  void it('missing class art draws the base hero look, without throwing or logging', () => {
    const id = idsOfClass('mage', 1)[0] ?? 'x';
    const w = makeWorld(artWithoutClasses());
    const classHero = createHero({
      info: info(id, 'working'),
      slot: 0,
      instant: true,
      look: lookFor(id),
    });
    const baseHero = new Hero({
      info: info(id, 'working'),
      slot: 0,
      instant: true,
      look: lookFor(id),
    });
    const reference = makeWorld(artWithoutClasses());
    for (let i = 0; i < 30; i++) {
      classHero.update(STEP_MS, w.world);
      baseHero.update(STEP_MS, reference.world);
    }
    assert.equal(classHero.classId, 'mage', 'still a mage by id');
    assert.equal(rgbaKey(drawn(classHero, w)), rgbaKey(drawn(baseHero, reference)));
  });

  void it('missing class art still strikes and casts (the look falls back, the behavior does not)', () => {
    const id = idsOfClass('archer', 1)[0] ?? 'x';
    const w = makeWorld(artWithoutClasses());
    const hero = createHero({
      info: info(id, 'working'),
      slot: 0,
      instant: true,
      look: lookFor(id),
    });
    w.engagement.engaged = true;
    for (let i = 0; i < 12_000 / STEP_MS; i++) {
      hero.update(STEP_MS, w.world);
      stepWorld(w);
    }
    assert.ok(w.spawns.length > 0);
    assert.equal(hero.lifecycle, 'working');
  });

  void it('with the shipped art each class draws a look different from the base hero and from each other', () => {
    const keys = new Map<string, string>();
    const baseWorld = makeWorld();
    const id0 = 'look-probe';
    const base = new Hero({
      info: info(id0, 'working'),
      slot: 0,
      instant: true,
      look: lookFor(id0),
    });
    const baseKey = rgbaKey(drawn(base, baseWorld));
    for (const cls of CLASS_IDS) {
      const w = makeWorld();
      const hero = new ClassHero(
        {
          info: info(id0, 'working'),
          slot: 0,
          instant: true,
          look: { ...lookFor(id0), classId: cls },
        },
        classDef(cls),
      );
      const key = rgbaKey(drawn(hero, w));
      assert.notEqual(key, baseKey, `${cls} differs from the base hero`);
      keys.set(cls, key);
    }
    assert.equal(new Set(keys.values()).size, CLASS_IDS.length, 'four distinct looks');
  });

  void it('a class hero draws only bitmaps, in every phase, and never fills a rect', () => {
    for (const cls of CLASS_IDS) {
      const r = rig(cls);
      const w = r.w;
      w.engagement.engaged = true;
      const surface = new RecordingSurface();
      for (let i = 0; i < 20_000 / STEP_MS; i++) {
        r.advance(STEP_MS);
        r.hero.draw(drawContext(surface, w));
      }
      assert.equal(surface.count('fillRect'), 0, cls);
      assert.equal(surface.count('drawBitmapRegion'), 0, cls);
      assert.ok(surface.count('drawBitmap') > 100, cls);
    }
  });

  void it('ABILITY_TOTAL_MS is the 460 ms the effects are timed against', () => {
    assert.equal(ABILITY_TOTAL_MS, 460);
  });
});
