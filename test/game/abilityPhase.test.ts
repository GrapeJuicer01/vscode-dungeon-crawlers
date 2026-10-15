// The `ability` phase machine (H1 plan test note 4). A scripted Hero subclass casts on demand, so
// the phase rules are tested without the ClassHero timer: ability is entered only from attack,
// lasts ABILITY_TOTAL_MS, returns to attack (engaged) or advance, is interrupted by host
// lifecycle events on the next update, and counts as fighting for the engagement rhythm.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ABILITY_TOTAL_MS } from '../../src/game/data/animations';
import { TimedEngagement } from '../../src/game/Engagement';
import {
  ABILITY_RELEASE_FRAME,
  EXIT_FAILSAFE_MS,
  STEP_MS,
  VICTORY_MS,
  WARP_OUT_MS,
} from '../../src/game/data/tuning';
import type { World } from '../../src/game/entities/Entity';
import { Hero } from '../../src/game/entities/Hero';
import type { HeroInit, HeroPhase } from '../../src/game/entities/Hero';
import { Roster } from '../../src/game/Roster';
import { info, lookFor, makeWorld, stepWorld } from '../support/classRig';
import type { ClassWorld } from '../support/classRig';

/** Casts when told to. Records the phase seen by every hook call. */
class Caster extends Hero {
  castNext = false;
  castAlways = false;
  readonly castCheckPhases = new Set<HeroPhase>();
  strikes = 0;
  releases = 0;

  protected override onAttackStrike(_world: World): void {
    this.strikes++;
  }

  protected override shouldCastAbility(_dtMs: number, _world: World): boolean {
    this.castCheckPhases.add(this.phase);
    if (this.castAlways || this.castNext) {
      this.castNext = false;
      return true;
    }
    return false;
  }

  protected override onAbilityRelease(_world: World): void {
    this.releases++;
  }
}

function caster(state: 'spawned' | 'working' | 'idle', instant: boolean, id = 'c1'): Caster {
  const init: HeroInit = { info: info(id, state), slot: 0, instant, look: lookFor(id) };
  return new Caster(init);
}

interface Trace {
  readonly transitions: { from: HeroPhase; to: HeroPhase; atMs: number }[];
  advance(ms: number): void;
  now(): number;
}

function trace(hero: Hero, w: ClassWorld): Trace {
  const transitions: Trace['transitions'] = [];
  let t = 0;
  return {
    transitions,
    now: () => t,
    advance(ms: number): void {
      const n = Math.round(ms / STEP_MS);
      for (let i = 0; i < n; i++) {
        const from = hero.phase;
        hero.update(STEP_MS, w.world);
        stepWorld(w);
        t += STEP_MS;
        if (hero.phase !== from) {
          transitions.push({ from, to: hero.phase, atMs: t });
        }
      }
    },
  };
}

/** A working caster that is attacking and has not yet cast. */
function attacking(): { hero: Caster; w: ClassWorld; tr: Trace } {
  const hero = caster('working', true);
  const w = makeWorld();
  w.engagement.engaged = true;
  const tr = trace(hero, w);
  tr.advance(800);
  assert.equal(hero.phase, 'attack');
  return { hero, w, tr };
}

void describe('entering the ability phase', () => {
  void it('the base Hero, with no hooks, never enters ability in two minutes of engaged fighting', () => {
    const hero = new Hero({
      info: info('b', 'working'),
      slot: 0,
      instant: true,
      look: lookFor('b'),
    });
    const w = makeWorld();
    w.engagement.engaged = true;
    const tr = trace(hero, w);
    tr.advance(120_000);
    assert.ok(tr.transitions.length >= 1);
    assert.ok(tr.transitions.every((x) => x.to !== 'ability'));
    assert.equal(hero.phase, 'attack');
  });

  void it('is entered only from attack, across a full lifecycle with a hero that always wants to cast', () => {
    const hero = caster('spawned', false);
    hero.castAlways = true;
    const w = makeWorld();
    const tr = trace(hero, w);
    tr.advance(1500); // warp in, wait at the door
    hero.applyAgentState(info('c1', 'working', 2));
    w.engagement.engaged = true;
    tr.advance(15_000);
    w.engagement.engaged = false;
    tr.advance(6000);
    hero.applyAgentState(info('c1', 'idle', 3));
    tr.advance(40_000); // walks to the fire and rests
    hero.applyAgentState(info('c1', 'working', 4));
    w.engagement.engaged = true;
    tr.advance(15_000);
    hero.applyAgentState(info('c1', 'despawned', 5));
    tr.advance(3000);
    const phases = new Set(tr.transitions.map((x) => x.to));
    // warpIn is the starting phase of a non-instant hero, so it is never a transition target.
    for (const p of [
      'standby',
      'travel',
      'advance',
      'attack',
      'ability',
      'rest',
      'victory',
      'warpOut',
    ] as const) {
      assert.ok(phases.has(p), `the run reached ${p}`);
    }
    for (const x of tr.transitions.filter((y) => y.to === 'ability')) {
      assert.equal(x.from, 'attack');
    }
    assert.deepEqual([...hero.castCheckPhases], ['attack'], 'asked only while attacking');
  });

  void it('never while resting, traveling, advancing, or in a warp, even when forced to want it', () => {
    const rest = caster('idle', true);
    rest.castAlways = true;
    const w = makeWorld();
    w.engagement.engaged = true;
    const tr = trace(rest, w);
    tr.advance(30_000);
    assert.equal(rest.phase, 'rest');
    assert.equal(rest.castCheckPhases.size, 0);
    const adv = caster('working', true, 'c2');
    adv.castAlways = true;
    const w2 = makeWorld();
    const tr2 = trace(adv, w2); // not engaged
    tr2.advance(30_000);
    assert.equal(adv.phase, 'advance');
    assert.equal(adv.castCheckPhases.size, 0);
    assert.ok(tr2.transitions.length === 0);
  });

  void it('the first update after entering attack does not also enter ability from the same frame', () => {
    const hero = caster('working', true);
    hero.castAlways = true;
    const w = makeWorld();
    w.engagement.engaged = true;
    const tr = trace(hero, w);
    tr.advance(1500);
    const toAttack = tr.transitions.find((x) => x.to === 'attack');
    const toAbility = tr.transitions.find((x) => x.to === 'ability');
    assert.ok(toAttack !== undefined && toAbility !== undefined);
    assert.ok(toAbility.atMs > toAttack.atMs);
  });
});

void describe('leaving the ability phase', () => {
  void it('lasts ABILITY_TOTAL_MS and returns to attack while the party is engaged', () => {
    const { hero, tr } = attacking();
    hero.castNext = true;
    tr.advance(100);
    const enter = tr.transitions.at(-1);
    assert.equal(enter?.to, 'ability');
    tr.advance(1000);
    const exit = tr.transitions.at(-1);
    assert.equal(exit?.from, 'ability');
    assert.equal(exit?.to, 'attack');
    const duration = (exit?.atMs ?? 0) - (enter?.atMs ?? 0);
    assert.ok(duration >= ABILITY_TOTAL_MS, `${duration}`);
    assert.ok(duration <= ABILITY_TOTAL_MS + STEP_MS + 1, `${duration}`);
  });

  void it('goes to advance when the party is no longer engaged', () => {
    const { hero, w, tr } = attacking();
    hero.castNext = true;
    tr.advance(100);
    assert.equal(hero.phase, 'ability');
    w.engagement.engaged = false; // disengaging does not cut the animation short
    tr.advance(200);
    assert.equal(hero.phase, 'ability');
    tr.advance(500);
    assert.equal(hero.phase, 'advance');
  });

  void it('releases exactly once per ability, on or after the release frame, never before the animation reaches it', () => {
    const { hero, tr } = attacking();
    const before = hero.releases;
    hero.castNext = true;
    tr.advance(STEP_MS * 2);
    assert.equal(hero.releases - before, 0, 'not on entry');
    tr.advance(ABILITY_TOTAL_MS + 200);
    assert.equal(hero.releases - before, 1);
    assert.equal(ABILITY_RELEASE_FRAME, 1);
  });

  void it('fights on after an ability: strikes resume', () => {
    const { hero, tr } = attacking();
    hero.castNext = true;
    tr.advance(ABILITY_TOTAL_MS + 100);
    const strikes = hero.strikes;
    tr.advance(1000);
    assert.ok(hero.strikes > strikes);
  });
});

void describe('host events during ability', () => {
  function casting(): { hero: Caster; w: ClassWorld; tr: Trace } {
    const r = attacking();
    r.hero.castNext = true;
    r.tr.advance(200); // past the release frame, mid animation
    assert.equal(r.hero.phase, 'ability');
    return r;
  }

  void it('working to idle: the lifecycle changes at once, the phase on the next update (travel, then rest)', () => {
    const { hero, w, tr } = casting();
    hero.applyAgentState(info('c1', 'idle', 9));
    assert.equal(hero.lifecycle, 'idle');
    assert.equal(hero.phase, 'ability', 'the phase is cosmetic and follows on update');
    hero.update(STEP_MS, w.world);
    assert.equal(hero.phase, 'travel');
    tr.advance(30_000);
    assert.equal(hero.phase, 'rest');
    assert.equal(hero.lifecycle, 'idle');
  });

  void it('an interrupt before the release frame means the ability never releases', () => {
    const r = attacking();
    r.hero.castNext = true;
    r.tr.advance(STEP_MS * 2);
    assert.equal(r.hero.phase, 'ability');
    const releases = r.hero.releases;
    r.hero.applyAgentState(info('c1', 'idle', 9));
    r.tr.advance(2000);
    assert.equal(r.hero.releases, releases);
    assert.equal(r.hero.lifecycle, 'idle');
  });

  void it('despawned: victory on the next update, then warp-out, then removable after about 1.8 s', () => {
    const { hero, w, tr } = casting();
    hero.applyAgentState(info('c1', 'despawned', 9));
    assert.equal(hero.lifecycle, 'despawned');
    hero.update(STEP_MS, w.world);
    assert.equal(hero.phase, 'victory');
    const t0 = tr.now();
    tr.advance(VICTORY_MS + 100);
    assert.equal(hero.phase, 'warpOut');
    assert.equal(hero.removable, false);
    tr.advance(WARP_OUT_MS);
    assert.equal(hero.removable, true);
    assert.ok(tr.now() - t0 < EXIT_FAILSAFE_MS);
  });

  void it('spawned during ability sends the hero back to the door', () => {
    const { hero, w, tr } = casting();
    hero.applyAgentState(info('c1', 'spawned', 9));
    hero.update(STEP_MS, w.world);
    assert.equal(hero.phase, 'travel');
    tr.advance(30_000);
    assert.equal(hero.lifecycle, 'spawned');
    assert.equal(hero.phase, 'standby');
  });

  void it('a repeated working event does not interrupt the ability', () => {
    const { hero, w, tr } = casting();
    hero.applyAgentState(info('c1', 'working', 9));
    hero.update(STEP_MS, w.world);
    assert.equal(hero.phase, 'ability');
    tr.advance(ABILITY_TOTAL_MS);
    assert.notEqual(hero.phase, 'ability');
    assert.equal(hero.lifecycle, 'working');
  });
});

void describe('Roster.countFighting and the engagement rhythm', () => {
  function party(n: number): { roster: Roster; heroes: Caster[]; w: ClassWorld } {
    const heroes: Caster[] = [];
    const roster = new Roster(
      (init) => {
        const h = new Caster(init);
        h.castAlways = true;
        heroes.push(h);
        return h;
      },
      () => undefined,
    );
    const w = makeWorld();
    for (let i = 0; i < n; i++) {
      roster.apply(info(`p${i}`, 'working'), w.world);
    }
    return { roster, heroes, w };
  }

  void it('counts advance, attack, and ability heroes, and only those', () => {
    const { roster, heroes, w } = party(4);
    const engagement = new TimedEngagement();
    const w2 = { ...w, world: { ...w.world, engagement } };
    let sawAbility = false;
    for (let i = 0; i < 40_000 / STEP_MS; i++) {
      engagement.update(STEP_MS, roster.countFighting());
      roster.update(STEP_MS, w2.world);
      const expected = heroes.filter((h) =>
        ['advance', 'attack', 'ability'].includes(h.phase),
      ).length;
      assert.equal(roster.countFighting(), expected);
      sawAbility ||= heroes.some((h) => h.phase === 'ability');
    }
    assert.ok(sawAbility);
    heroes[0]?.applyAgentState(info('p0', 'idle', 2));
    roster.update(STEP_MS, w2.world);
    assert.ok(roster.countFighting() <= 3, 'a hero leaving for the fire stops counting');
  });

  void it('the advance and engage rhythm keeps going when every hero casts constantly', () => {
    const { roster, w } = party(4);
    const engagement = new TimedEngagement();
    const world = { ...w.world, engagement };
    let toggles = 0;
    let last = engagement.isEngaged;
    let allCasting = 0;
    for (let i = 0; i < 90_000 / STEP_MS; i++) {
      engagement.update(STEP_MS, roster.countFighting());
      roster.update(STEP_MS, world);
      if (roster.heroes().every((h) => h.phase === 'ability')) {
        allCasting++;
      }
      if (engagement.isEngaged !== last) {
        toggles++;
        last = engagement.isEngaged;
      }
    }
    // 7.4 s per advance+engage cycle: about 24 toggles in 90 s. A roster that stopped counting
    // ability heroes would reset the cycle whenever all of them were casting at once.
    assert.ok(allCasting > 0, 'every hero was casting at the same moment at least once');
    assert.ok(toggles >= 20, `${toggles} toggles`);
  });
});
