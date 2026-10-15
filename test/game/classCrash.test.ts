// Crash isolation for class hooks (H1 plan test note 8; Core invariants 2 and 4). A ClassHero whose
// onAttackStrike, shouldCastAbility, or onAbilityRelease throws must not escape Game.frame, must
// not stop rendering, and must not touch the lifecycle. Repeated faults freeze that hero only,
// and a host lifecycle event unfreezes it.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { classFor } from '../../src/game/data/classMap';
import { classDef } from '../../src/game/data/classes';
import { FAULT_LIMIT, STEP_MS } from '../../src/game/data/tuning';
import { ClassHero } from '../../src/game/entities/ClassHero';
import type { World } from '../../src/game/entities/Entity';
import type { HeroInit } from '../../src/game/entities/Hero';
import { mixedIds, trackBitmaps } from '../support/classRig';
import type { BitmapTracker } from '../support/classRig';
import { agent, feed, gameRig, heroLog, run } from '../support/engineFakes';

interface Mode {
  strike: boolean;
  cast: boolean;
  release: boolean;
}

class Boom extends ClassHero {
  readonly #mode: Mode;
  strikeCalls = 0;
  castCalls = 0;
  releaseCalls = 0;

  constructor(init: HeroInit, mode: Mode) {
    const id = classFor(init.info.id);
    super({ ...init, look: { ...init.look, classId: id } }, classDef(id));
    this.#mode = mode;
  }

  protected override onAttackStrike(world: World): void {
    this.strikeCalls++;
    if (this.#mode.strike) {
      throw new Error('strike boom');
    }
    super.onAttackStrike(world);
  }

  protected override shouldCastAbility(dtMs: number, world: World): boolean {
    this.castCalls++;
    if (this.#mode.cast) {
      throw new Error('cast boom');
    }
    return super.shouldCastAbility(dtMs, world);
  }

  protected override onAbilityRelease(world: World): void {
    this.releaseCalls++;
    if (this.#mode.release) {
      throw new Error('release boom');
    }
    super.onAbilityRelease(world);
  }
}

let tracker: BitmapTracker | null = null;
afterEach(() => {
  tracker?.restore();
  tracker = null;
});

function rigWith(mode: Mode) {
  tracker = trackBitmaps();
  const log = heroLog<Boom>((init) => new Boom(init, mode));
  const rig = gameRig({ heroFactory: log.factory });
  return { rig, log, tracker };
}

/** A working id for each class so every class is covered. */
const IDS = mixedIds(4);

void describe('a throwing strike hook', () => {
  void it('never escapes frame, is reported once for the game, the heroes stay drawn, and the lifecycle is unchanged', () => {
    const { rig, log, tracker: t } = rigWith({ strike: true, cast: false, release: false });
    for (const id of IDS) {
      feed(rig, agent(id, 'working'));
    }
    for (let i = 0; i < 30_000 / STEP_MS; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
    }
    rig.surface.record = true;
    rig.surface.reset();
    rig.game.frame(STEP_MS, rig.surface);
    const heroDraws = rig.surface.calls.filter((c) => t.hero.has(c.args[0])).length;
    assert.equal(heroDraws, 4, 'every hero is still drawn');
    assert.ok(log.made.every((h) => h.strikeCalls > 0));
    const reports = rig.errors.filter((e) => (e.error as Error).message === 'strike boom');
    // Game's sink deduplicates by scope and message across the whole game: one line, not one per hero.
    assert.equal(reports.length, 1);
    assert.ok(reports.every((e) => e.scope === 'update'));
    assert.deepEqual(
      rig.game.heroSnapshot().map((h) => [h.id, h.lifecycle, h.exiting]),
      IDS.map((id) => [id, 'working', false]),
    );
  });
});

void describe('a throwing ability trigger', () => {
  const id = IDS[0] ?? 'x';

  void it('three consecutive faults freeze that hero only; it stays listed and drawn', () => {
    const { rig, log, tracker: t } = rigWith({ strike: false, cast: true, release: false });
    feed(rig, agent(id, 'working'));
    const other = IDS[1] ?? 'y';
    feed(rig, agent(other, 'idle'));
    run(rig, 15_000);
    const hero = log.byId(id);
    assert.equal(hero.frozen, true);
    assert.equal(hero.castCalls, FAULT_LIMIT, 'updates stop once frozen');
    assert.equal(log.byId(other).frozen, false);
    assert.equal(rig.game.heroSnapshot().length, 2);
    assert.equal(hero.lifecycle, 'working');
    rig.surface.record = true;
    rig.surface.reset();
    rig.game.frame(STEP_MS, rig.surface);
    assert.equal(rig.surface.calls.filter((c) => t.hero.has(c.args[0])).length, 2);
    assert.equal(rig.errors.filter((e) => (e.error as Error).message === 'cast boom').length, 1);
  });

  void it('a host lifecycle event unfreezes it, and the lifecycle only ever follows host events', () => {
    const { rig, log } = rigWith({ strike: false, cast: true, release: false });
    feed(rig, agent(id, 'working'));
    run(rig, 15_000);
    const hero = log.byId(id);
    assert.equal(hero.frozen, true);
    feed(rig, agent(id, 'idle', null, 2));
    rig.game.step();
    assert.equal(hero.frozen, false);
    assert.equal(hero.lifecycle, 'idle');
    run(rig, 30_000);
    assert.equal(hero.phase, 'rest', 'an unfrozen hero resumes and walks to the fire');
    assert.equal(hero.lifecycle, 'idle');
  });

  void it('a faulting trigger does not stop the engagement rhythm for the other heroes', () => {
    const { rig, log } = rigWith({ strike: false, cast: true, release: false });
    for (const hid of IDS) {
      feed(rig, agent(hid, 'working'));
    }
    run(rig, 30_000);
    assert.ok(
      log.made.every((h) => h.frozen),
      'all four froze at their first attack update',
    );
    assert.equal(rig.game.heroSnapshot().length, 4);
    assert.ok(rig.game.heroSnapshot().every((h) => h.lifecycle === 'working'));
  });
});

void describe('a throwing release hook', () => {
  void it('is reported once; the ability completes and the hero fights on', () => {
    const { rig, log } = rigWith({ strike: false, cast: false, release: true });
    for (const id of IDS) {
      feed(rig, agent(id, 'working'));
    }
    const phases = new Set<string>();
    for (let i = 0; i < 60_000 / STEP_MS; i++) {
      assert.doesNotThrow(() => rig.game.frame(STEP_MS, rig.surface));
      phases.add(log.byId(IDS[2] ?? '').phase);
    }
    assert.ok(phases.has('ability'));
    assert.ok(phases.has('attack'));
    assert.ok(log.made.every((h) => h.releaseCalls >= 1));
    const reports = rig.errors.filter((e) => (e.error as Error).message === 'release boom');
    assert.equal(reports.length, 1);
    assert.ok(rig.game.heroSnapshot().every((h) => h.lifecycle === 'working' && !h.exiting));
  });
});

void describe('every hook throwing at once, with a mixed party', () => {
  void it('eight heroes, two simulated minutes: frames never throw and the party is unchanged', () => {
    const { rig } = rigWith({ strike: true, cast: true, release: true });
    const ids = mixedIds(8);
    for (const hid of ids) {
      feed(rig, agent(hid, 'working'));
    }
    rig.game.step();
    const before = rig.game.heroSnapshot().map((h) => ({ ...h, lifecycle: 'working' }));
    for (let i = 0; i < 120_000 / STEP_MS; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    assert.deepEqual(rig.game.heroSnapshot(), before);
    assert.equal(before.length, 8);
    assert.equal(rig.surface.count('clear'), Math.round(120_000 / STEP_MS), 'every frame rendered');
  });
});
