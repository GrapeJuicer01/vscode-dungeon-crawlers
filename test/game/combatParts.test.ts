// The small E1 engine parts: the FighterBuffer, HitReactions, Roster.collectFighters, the hero
// flash in Hero.draw, Progression, StageDirector, CombatEngagement, and the Drops pool (E1 plan
// test notes 5, 6, 8; drift 13.2). Hero reactions are cosmetic only: they change draw calls, never
// a hero's position, phase, or lifecycle.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Camera } from '../../src/game/Camera';
import { CombatEngagement, TimedEngagement } from '../../src/game/Engagement';
import type { Engagement } from '../../src/game/Engagement';
import { DROP_ARC_MS, DROP_CAPACITY, DROP_FADE_MS, DROP_REST_MS } from '../../src/game/data/drops';
import { STAGES } from '../../src/game/data/stages';
import type { StageDef } from '../../src/game/data/stages';
import {
  ADVANCE_MS,
  ENGAGE_MS,
  HERO_FLASH_GAP_MS,
  HERO_FLASH_MS,
  HERO_KNOCK_MS,
  HERO_KNOCK_PX,
  HERO_KNOCK_STRONG_PX,
  SCROLL_EASE_MS,
  SCROLL_PX_PER_S,
  STAGE_FADE_MS,
  STEP_MS,
} from '../../src/game/data/tuning';
import { Hero } from '../../src/game/entities/Hero';
import type { HeroInit } from '../../src/game/entities/Hero';
import { Drops } from '../../src/game/Drops';
import { FighterBuffer } from '../../src/game/Fighters';
import { HitReactions } from '../../src/game/HitReactions';
import { Progression } from '../../src/game/Progression';
import { Roster } from '../../src/game/Roster';
import { StageDirector } from '../../src/game/StageDirector';
import type { StageRuntime } from '../../src/game/Stage';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { DEFAULT_PROGRESS, MAX_PROGRESS_COUNT, MAX_STAGE_INDEX } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';
import { drawContext, info, lookFor, makeWorld } from '../support/classRig';
import { RecordingSurface } from '../support/engineFakes';

const countOf = (b: FighterBuffer): number => b.count;
const stageId = (d: StageDirector): string => d.runtime.def.id;

void describe('FighterBuffer (the only hero-to-enemy channel)', () => {
  void it('stores slot, x, y, and both serials in typed arrays and counts', () => {
    const b = new FighterBuffer(4);
    assert.equal(b.count, 0);
    b.push(7, 10.5, 20.25, 3, 4);
    b.push(2, 1, 2, 5, 6);
    assert.equal(b.count, 2);
    assert.deepEqual([...b.slot.subarray(0, 2)], [7, 2]);
    assert.deepEqual([...b.x.subarray(0, 2)], [10.5, 1]);
    assert.deepEqual([...b.y.subarray(0, 2)], [20.25, 2]);
    assert.deepEqual([...b.strikeSerial.subarray(0, 2)], [3, 5]);
    assert.deepEqual([...b.abilitySerial.subarray(0, 2)], [4, 6]);
    b.clear();
    assert.equal(b.count, 0);
  });

  void it('silently drops entries past capacity', () => {
    const b = new FighterBuffer(2);
    for (let i = 0; i < 10; i++) b.push(i, i, i, i, i);
    assert.equal(b.count, 2);
    assert.deepEqual([...b.slot], [0, 1]);
  });
});

void describe('Roster.collectFighters lists advance, attack, and ability heroes only', () => {
  function rosterWith(states: readonly ['working' | 'idle' | 'spawned', string][]): {
    roster: Roster;
    heroes: Map<string, Hero>;
  } {
    const w = makeWorld();
    const heroes = new Map<string, Hero>();
    const roster = new Roster(
      (init: HeroInit) => {
        const h = new Hero(init);
        heroes.set(init.info.id, h);
        return h;
      },
      () => undefined,
    );
    for (const [state, id] of states) {
      roster.apply(info(id, state), w.world);
    }
    return { roster, heroes };
  }

  void it('fills slot, position, and serials of fighting heroes; resting, standby, and warping heroes are absent', () => {
    const w = makeWorld();
    w.engagement.engaged = true;
    const { roster, heroes } = rosterWith([
      ['working', 'w1'],
      ['working', 'w2'],
      ['idle', 'i1'],
      ['spawned', 's1'],
    ]);
    const buffer = new FighterBuffer(64);
    roster.update(STEP_MS, w.world);
    roster.collectFighters(buffer);
    const phases = new Map([...heroes].map(([id, h]) => [id, h.phase]));
    const fighting = [...heroes.values()].filter((h) =>
      ['advance', 'attack', 'ability'].includes(h.phase),
    );
    assert.equal(buffer.count, fighting.length);
    assert.equal(buffer.count, 2, JSON.stringify([...phases]));
    for (let i = 0; i < buffer.count; i++) {
      const hero = fighting.find((h) => h.slot === buffer.slot[i]);
      assert.ok(hero);
      assert.equal(buffer.x[i], Math.fround(hero.x));
      assert.equal(buffer.y[i], Math.fround(hero.y));
      assert.equal(buffer.strikeSerial[i], hero.strikeSerial);
      assert.equal(buffer.abilitySerial[i], hero.abilitySerial);
    }
    assert.ok(!['advance', 'attack', 'ability'].includes(heroes.get('i1')?.phase ?? ''));
    assert.ok(!['advance', 'attack', 'ability'].includes(heroes.get('s1')?.phase ?? ''));
  });

  void it('writes nothing to any hero: the same call twice leaves every field as it was', () => {
    const w = makeWorld();
    const { roster, heroes } = rosterWith([
      ['working', 'a'],
      ['idle', 'b'],
    ]);
    roster.update(STEP_MS, w.world);
    const snapshot = (): string =>
      JSON.stringify(
        [...heroes.values()].map((h) => [h.id, h.slot, h.lifecycle, h.phase, h.x, h.y, h.exiting]),
      );
    const before = snapshot();
    const buffer = new FighterBuffer(64);
    roster.collectFighters(buffer);
    roster.collectFighters(buffer);
    assert.equal(snapshot(), before);
    assert.equal(buffer.count <= 1, true, 'refilled, not appended');
  });

  void it('an idle hero is never in the buffer, and a despawned one leaves it at once', () => {
    const w = makeWorld();
    const { roster } = rosterWith([
      ['working', 'a'],
      ['idle', 'b'],
    ]);
    const buffer = new FighterBuffer(64);
    for (let i = 0; i < 600; i++) {
      roster.update(STEP_MS, w.world);
      roster.collectFighters(buffer);
      for (let k = 0; k < buffer.count; k++) {
        assert.equal(buffer.slot[k], 0, 'only slot 0 (the working hero)');
      }
    }
    roster.apply(info('a', 'idle', 2), w.world);
    roster.update(STEP_MS, w.world);
    roster.collectFighters(buffer);
    assert.equal(buffer.count, 0, 'working -> idle: gone on the next step');
    roster.apply(info('a', 'working', 3), w.world);
    let back = false;
    for (let i = 0; i < 60 * 60 && !back; i++) {
      roster.update(STEP_MS, w.world);
      roster.collectFighters(buffer);
      back = countOf(buffer) === 1;
      assert.ok(countOf(buffer) <= 1);
    }
    assert.equal(back, true, 'idle -> working: back once it has walked to its formation slot');
    roster.apply(info('a', 'despawned', 4), w.world);
    // Game.step runs roster.update before collectFighters, so within the same step:
    roster.update(STEP_MS, w.world);
    roster.collectFighters(buffer);
    assert.equal(buffer.count, 0, 'despawned: out of the buffer in the same step');
  });
});

void describe('HitReactions (cosmetic board)', () => {
  void it('flashes for HERO_FLASH_MS and slides pushSign x HERO_KNOCK_PX, decaying to 0 within HERO_KNOCK_MS', () => {
    const board = new HitReactions(64);
    assert.equal(HERO_FLASH_MS, 100);
    assert.equal(HERO_KNOCK_PX, 1);
    assert.equal(HERO_KNOCK_STRONG_PX, 2);
    assert.equal(board.flashing(3), false);
    assert.equal(board.offsetPx(3), 0);
    board.flash(3, -1, false);
    assert.equal(board.flashing(3), true);
    assert.equal(board.offsetPx(3), -1);
    board.update(HERO_FLASH_MS - 1);
    assert.equal(board.flashing(3), true);
    board.update(2);
    assert.equal(board.flashing(3), false);
    board.update(HERO_KNOCK_MS);
    assert.equal(board.offsetPx(3), 0);
  });

  void it('a strong reaction slides 2 px; every offset is a whole number between -2 and 2', () => {
    const board = new HitReactions(64);
    board.flash(1, -1, true);
    assert.equal(board.offsetPx(1), -2);
    board.flash(2, 1, true);
    let max = 0;
    for (let t = 0; t < HERO_KNOCK_MS + 40; t += 4) {
      for (const slot of [1, 2]) {
        const px = board.offsetPx(slot);
        assert.ok(Number.isInteger(px) && Math.abs(px) <= 2, String(px));
        max = Math.max(max, Math.abs(px));
      }
      board.update(4);
    }
    assert.equal(max, 2);
    assert.equal(board.offsetPx(1), 0);
    assert.equal(board.offsetPx(2), 0);
  });

  void it('ignores a second flash on the same slot inside HERO_FLASH_GAP_MS (photosensitivity)', () => {
    const board = new HitReactions(64);
    board.flash(5, -1, false);
    board.update(HERO_FLASH_MS + 10);
    board.flash(5, -1, false);
    assert.equal(board.flashing(5), false, 'within the gap');
    board.update(HERO_FLASH_GAP_MS);
    board.flash(5, -1, false);
    assert.equal(board.flashing(5), true, 'after the gap');
    assert.equal(HERO_FLASH_GAP_MS, 500);
  });

  void it('slots are independent', () => {
    const board = new HitReactions(64);
    board.flash(0, -1, false);
    assert.equal(board.flashing(1), false);
    assert.equal(board.offsetPx(1), 0);
  });

  void it('a slot beyond the board wraps (slot mod size); negative, NaN, and Infinity slots never throw', () => {
    const board = new HitReactions(8);
    board.flash(9, -1, false);
    assert.equal(board.flashing(1), true);
    for (const slot of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1e12, -0.5]) {
      assert.doesNotThrow(() => {
        board.flash(slot, 1, false);
        board.flashing(slot);
        board.offsetPx(slot);
      });
    }
  });

  void it('update with a non-positive or NaN step changes nothing; clear forgets everything', () => {
    const board = new HitReactions(8);
    board.flash(2, -1, false);
    for (const dt of [0, -5, Number.NaN]) board.update(dt);
    assert.equal(board.flashing(2), true);
    board.clear();
    assert.equal(board.flashing(2), false);
    assert.equal(board.offsetPx(2), 0);
    board.flash(2, -1, false);
    assert.equal(board.flashing(2), true, 'the gap was cleared too');
  });

  void it('exposes no way to read a kind or an amount: only flashing() and offsetPx()', () => {
    const readers = Object.getOwnPropertyNames(HitReactions.prototype).filter(
      (n) => !['constructor', 'flash', 'update', 'clear'].includes(n),
    );
    assert.deepEqual(readers.sort(), ['flashing', 'offsetPx']);
  });
});

void describe('Hero.draw reads the reaction board and only changes how the hero is drawn', () => {
  function hero(state: 'working' | 'idle', instant = true): Hero {
    return new Hero({ info: info('h', state), slot: 3, instant, look: lookFor('h') });
  }

  void it('draws the white silhouette (not the normal frame) while flashing, and the normal frame again after', () => {
    const w = makeWorld();
    const h = hero('working');
    h.update(STEP_MS, w.world);
    const s = new RecordingSurface();
    s.record = true;
    h.draw(drawContext(s, w, new Camera()));
    const normal = s.calls.find((c) => c.method === 'drawBitmap')!.args[0];
    w.reactions.flash(3, -1, false);
    s.reset();
    h.draw(drawContext(s, w, new Camera()));
    const flash = s.calls.find((c) => c.method === 'drawBitmap')!.args[0];
    assert.notEqual(flash, normal);
    w.reactions.update(HERO_FLASH_MS + 10);
    s.reset();
    h.draw(drawContext(s, w, new Camera()));
    assert.equal(s.calls.find((c) => c.method === 'drawBitmap')!.args[0], normal);
  });

  void it("the flash silhouette is a single opaque color over the hero's own shape", () => {
    const w = makeWorld();
    const h = hero('working');
    h.update(STEP_MS, w.world);
    w.reactions.flash(3, -1, false);
    const s = new RecordingSurface();
    s.record = true;
    h.draw(drawContext(s, w, new Camera()));
    const bitmap = s.calls.find((c) => c.method === 'drawBitmap')!.args[0] as {
      pixel(x: number, y: number): number[];
      width: number;
      height: number;
    };
    const colors = new Set<string>();
    let opaque = 0;
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        const px = bitmap.pixel(x, y);
        if (px[3] !== 0) {
          opaque += 1;
          colors.add(px.join());
        }
      }
    }
    assert.ok(opaque > 20);
    assert.equal(colors.size, 1, 'one flat color');
    const [r, g, b] = [...colors][0]!.split(',').map(Number);
    assert.ok((r ?? 0) > 200 && (g ?? 0) > 200 && (b ?? 0) > 200, 'white, never red');
  });

  void it('slides only the draw x by the board offset; x, y, phase, and lifecycle never change', () => {
    const w = makeWorld();
    const h = hero('working');
    h.update(STEP_MS, w.world);
    const s = new RecordingSurface();
    s.record = true;
    h.draw(drawContext(s, w, new Camera()));
    const dx0 = s.calls.find((c) => c.method === 'drawBitmap')!.args[1] as number;
    const before = JSON.stringify([h.x, h.y, h.phase, h.lifecycle, h.exiting, h.slot, h.id]);
    w.reactions.flash(3, -1, true);
    s.reset();
    h.draw(drawContext(s, w, new Camera()));
    const dx1 = s.calls.find((c) => c.method === 'drawBitmap')!.args[1] as number;
    assert.equal(dx1 - dx0, -2);
    assert.equal(JSON.stringify([h.x, h.y, h.phase, h.lifecycle, h.exiting, h.slot, h.id]), before);
    assert.equal(s.count('fillRect'), 0, 'no bar, gauge, or tint on a hero');
    assert.equal(s.bitmapDraws, 1, 'the flash replaces the frame; nothing is added');
  });

  void it('warp phases ignore the board entirely (the warp-in reveals, the flash does not)', () => {
    const w = makeWorld();
    const h = hero('working', false);
    h.update(STEP_MS, w.world);
    assert.equal(h.phase, 'warpIn');
    const s = new RecordingSurface();
    s.record = true;
    h.draw(drawContext(s, w, new Camera()));
    const plain = s.calls.map((c) => [c.method, ...c.args.slice(1)].join());
    w.reactions.flash(3, -1, true);
    s.reset();
    h.draw(drawContext(s, w, new Camera()));
    assert.deepEqual(
      s.calls.map((c) => [c.method, ...c.args.slice(1)].join()),
      plain,
    );
  });

  void it('a resting hero drawn with no flash costs exactly one bitmap: nothing extra is ever drawn on a hero', () => {
    const w = makeWorld();
    const h = hero('idle');
    h.update(STEP_MS, w.world);
    const s = new RecordingSurface();
    s.record = true;
    h.draw(drawContext(s, w, new Camera()));
    assert.equal(s.bitmapDraws, 1);
    assert.equal(s.count('fillRect'), 0);
    assert.equal(s.count('setAlpha'), 0);
  });
});

void describe('Progression (stage progress by cumulative work)', () => {
  const stored = (patch: Partial<Progress>): Progress => ({ ...DEFAULT_PROGRESS, ...patch });

  void it('starts at the defaults: stage 1, zero counters', () => {
    const p = new Progression(2);
    assert.deepEqual(p.snapshot(), DEFAULT_PROGRESS);
    assert.equal(p.stageIndex, 1);
    assert.equal(p.killsInStage, 0);
    assert.equal(p.cycle, 0);
  });

  void it('onKill raises killsInStage and totalKills together', () => {
    const p = new Progression(2);
    p.onKill();
    p.onKill();
    assert.deepEqual(p.snapshot(), { ...DEFAULT_PROGRESS, killsInStage: 2, totalKills: 2 });
  });

  void it('onBossDefeated advances the stage, resets killsInStage, counts the boss, and keeps totalKills', () => {
    const p = new Progression(2);
    p.onKill();
    p.onKill();
    p.onBossDefeated();
    assert.deepEqual(p.snapshot(), {
      schemaVersion: 1,
      stageIndex: 2,
      killsInStage: 0,
      totalKills: 2,
      bossesDefeated: 1,
      cycle: 0,
    });
  });

  void it('after the last delivered stage it wraps to Stage 1 and increments the cycle (New Game+ looping)', () => {
    const p = new Progression(2);
    p.onBossDefeated();
    p.onBossDefeated();
    assert.deepEqual(p.snapshot(), { ...DEFAULT_PROGRESS, bossesDefeated: 2, cycle: 1 });
    for (let i = 0; i < 20; i++) p.onBossDefeated();
    assert.equal(p.cycle, 11);
    assert.equal(p.stageIndex, 1);
    const one = new Progression(1);
    one.onBossDefeated();
    assert.equal(one.cycle, 1);
    assert.equal(one.stageIndex, 1);
  });

  void it('with the shipped ten stages: Stages 1 to 9 advance with no cycle, the Stage 10 boss wraps to Stage 1 with cycle + 1 (E5, New Game+)', () => {
    const p = new Progression(STAGES.length);
    assert.equal(STAGES.length, 10);
    assert.equal(STAGES.length, MAX_STAGE_INDEX, 'the loop point equals the schema bound');
    for (let stage = 1; stage <= 9; stage++) {
      assert.equal(p.stageIndex, stage);
      p.onBossDefeated();
      assert.equal(p.cycle, 0, `after the Stage ${stage} boss`);
      assert.equal(p.stageIndex, stage + 1);
    }
    assert.equal(p.stageIndex, 10);
    p.onBossDefeated();
    assert.equal(p.stageIndex, 1);
    assert.equal(p.cycle, 1);
    assert.equal(p.snapshot().bossesDefeated, 10);
    assert.equal(p.snapshot().killsInStage, 0);
  });

  void it('with ten stages a stored stageIndex 9 to 12 wraps by ((i - 1) % 10) + 1 (9 and 10 stay, 11 -> 1, 12 -> 2) and the counters are kept', () => {
    const p = new Progression(10);
    for (let i = 9; i <= 12; i++) {
      p.load(
        stored({ stageIndex: i, killsInStage: 3, totalKills: 40, bossesDefeated: 2, cycle: 1 }),
      );
      assert.equal(p.stageIndex, ((i - 1) % 10) + 1, `stored ${i}`);
      if (i === 9 || i === 10) assert.equal(p.stageIndex, i, 'in range: stays');
      if (i === 11) assert.equal(p.stageIndex, 1);
      if (i === 12) assert.equal(p.stageIndex, 2);
      assert.deepEqual(
        [p.snapshot().killsInStage, p.snapshot().totalKills, p.snapshot().bossesDefeated, p.cycle],
        [3, 40, 2, 1],
      );
    }
  });

  void it('load keeps the counters and wraps a stageIndex above the delivered count instead of failing', () => {
    const p = new Progression(2);
    p.load(stored({ stageIndex: 2, killsInStage: 7, totalKills: 70, bossesDefeated: 1, cycle: 3 }));
    assert.deepEqual(
      p.snapshot(),
      stored({ stageIndex: 2, killsInStage: 7, totalKills: 70, bossesDefeated: 1, cycle: 3 }),
    );
    p.load(stored({ stageIndex: 3 }));
    assert.equal(p.stageIndex, 1);
    p.load(stored({ stageIndex: 10 }));
    assert.equal(p.stageIndex, 2);
    p.load(stored({ stageIndex: 0 }));
    assert.equal(p.stageIndex, 1, 'a bad stage index still lands inside 1..stageCount');
  });

  void it('counters saturate at MAX_PROGRESS_COUNT so a snapshot always stays valid', () => {
    const p = new Progression(2);
    p.load(
      stored({
        killsInStage: MAX_PROGRESS_COUNT,
        totalKills: MAX_PROGRESS_COUNT,
        bossesDefeated: MAX_PROGRESS_COUNT,
        cycle: MAX_PROGRESS_COUNT,
      }),
    );
    p.onKill();
    assert.equal(p.snapshot().totalKills, MAX_PROGRESS_COUNT);
    p.onBossDefeated();
    p.onBossDefeated();
    assert.equal(p.snapshot().bossesDefeated, MAX_PROGRESS_COUNT);
    assert.equal(p.snapshot().cycle, MAX_PROGRESS_COUNT);
  });

  void it('snapshot returns a new frozen object each time and has no string field', () => {
    const p = new Progression(2);
    const a = p.snapshot();
    const b = p.snapshot();
    assert.notEqual(a, b);
    assert.ok(Object.isFrozen(a));
    assert.deepEqual(a, b);
    for (const v of Object.values(a)) assert.equal(typeof v, 'number');
  });

  void it('reset returns to the defaults', () => {
    const p = new Progression(2);
    p.onKill();
    p.onBossDefeated();
    p.reset();
    assert.deepEqual(p.snapshot(), DEFAULT_PROGRESS);
  });

  void it('a stage count below 1 is treated as 1', () => {
    const p = new Progression(0);
    p.onBossDefeated();
    assert.equal(p.stageIndex, 1);
    assert.equal(p.cycle, 1);
  });
});

void describe('StageDirector (the dark fade swap)', () => {
  /** A director over stub runtimes; counts builds. */
  function director(onSwap: ((def: StageDef) => void) | null = null): {
    d: StageDirector;
    builds: string[];
    swaps: string[];
  } {
    const builds: string[] = [];
    const swaps: string[] = [];
    const d = new StageDirector(
      (def) => {
        builds.push(def.id);
        return { def } as unknown as StageRuntime;
      },
      STAGES,
      (def) => {
        swaps.push(def.id);
        onSwap?.(def);
      },
    );
    return { d, builds, swaps };
  }

  void it('starts on the first stage with no fade, built once', () => {
    const { d, builds } = director();
    assert.equal(d.runtime.def.id, 'forgotten-cellar');
    assert.equal(d.fadeAlpha, 0);
    assert.equal(d.transitioning, false);
    assert.deepEqual(builds, ['forgotten-cellar']);
  });

  void it('fades 0 to 1 over STAGE_FADE_MS, swaps at the peak, then fades 1 to 0 over STAGE_FADE_MS', () => {
    const { d, swaps } = director();
    d.begin(2);
    assert.equal(d.transitioning, true);
    assert.equal(d.runtime.def.id, 'forgotten-cellar', 'not swapped yet');
    const alphas: number[] = [];
    let swappedAt = -1;
    for (let t = 0; t < 2 * STAGE_FADE_MS + 100; t += STEP_MS) {
      d.update(STEP_MS);
      alphas.push(d.fadeAlpha);
      if (swappedAt < 0 && stageId(d) === 'goblin-mine-shafts') swappedAt = t;
    }
    assert.ok(alphas.every((a) => a >= 0 && a <= 1));
    assert.ok(Math.abs(swappedAt - STAGE_FADE_MS) <= STEP_MS + 1, `swapped at ${swappedAt}`);
    assert.equal(Math.max(...alphas), 1);
    const peak = alphas.indexOf(1);
    for (let i = 1; i <= peak; i++) assert.ok(alphas[i]! >= alphas[i - 1]!, 'rising');
    for (let i = peak + 1; i < alphas.length; i++)
      assert.ok(alphas[i]! <= alphas[i - 1]!, 'falling');
    assert.equal(d.fadeAlpha, 0);
    assert.equal(d.transitioning, false);
    assert.deepEqual(swaps, ['goblin-mine-shafts'], 'onSwap fired once, at the midpoint');
  });

  void it('onSwap fires after the runtime changed (Combat.setStage sees the new room)', () => {
    let seen = '';
    const { d } = director();
    const again = new StageDirector(
      (def) => ({ def }) as unknown as StageRuntime,
      STAGES,
      () => {
        seen = again.runtime.def.id;
      },
    );
    again.begin(2);
    for (let t = 0; t < 2 * STAGE_FADE_MS; t += STEP_MS) again.update(STEP_MS);
    assert.equal(seen, 'goblin-mine-shafts');
    assert.ok(d);
  });

  void it('show swaps instantly, cancels a fade, and does not fire onSwap', () => {
    const { d, swaps } = director();
    d.begin(2);
    d.update(100);
    d.show(2);
    assert.equal(d.runtime.def.id, 'goblin-mine-shafts');
    assert.equal(d.transitioning, false);
    assert.equal(d.fadeAlpha, 0);
    assert.deepEqual(swaps, []);
  });

  void it('runtimes are built once per stage and cached across swaps', () => {
    const { d, builds } = director();
    for (let round = 0; round < 3; round++) {
      d.show(2);
      d.show(1);
    }
    d.begin(2);
    for (let t = 0; t < 2 * STAGE_FADE_MS + 40; t += STEP_MS) d.update(STEP_MS);
    assert.deepEqual(builds, ['forgotten-cellar', 'goblin-mine-shafts']);
  });

  void it('begin is ignored while a fade runs; an index past the delivered stages wraps', () => {
    const { d } = director();
    d.begin(2);
    d.update(100);
    d.begin(1);
    for (let t = 0; t < 2 * STAGE_FADE_MS + 40; t += STEP_MS) d.update(STEP_MS);
    assert.equal(d.runtime.def.id, 'goblin-mine-shafts', 'the second begin did nothing');
    d.show(3);
    assert.equal(d.runtime.def.id, 'toxic-slime-caverns');
    d.show(4);
    assert.equal(d.runtime.def.id, 'ancient-catacombs');
    d.show(5);
    assert.equal(d.runtime.def.id, 'enchanted-forest-ruins');
    d.show(6);
    assert.equal(d.runtime.def.id, 'molten-core');
    d.show(7);
    assert.equal(d.runtime.def.id, 'frozen-citadel');
    d.show(8);
    assert.equal(d.runtime.def.id, 'shadow-realm');
    d.show(9);
    assert.equal(d.runtime.def.id, 'dragons-lair');
    d.show(10);
    assert.equal(d.runtime.def.id, 'void-spire');
    d.show(11);
    assert.equal(d.runtime.def.id, 'forgotten-cellar', 'index 11 wraps to Stage 1 of 10');
    d.show(12);
    assert.equal(d.runtime.def.id, 'goblin-mine-shafts');
    d.show(0);
    assert.equal(d.runtime.def.id, 'void-spire', 'index 0 wraps to the last stage');
  });

  void it('walks Stage 1 to 10 by fades and then wraps to Stage 1 by a fade (E5)', () => {
    const { d, swaps } = director();
    for (const next of [2, 3, 4, 5, 6, 7, 8, 9, 10, 1]) {
      d.begin(next);
      for (let t = 0; t < 2 * STAGE_FADE_MS + 40; t += STEP_MS) d.update(STEP_MS);
      assert.equal(d.transitioning, false);
    }
    assert.deepEqual(swaps, [
      'goblin-mine-shafts',
      'toxic-slime-caverns',
      'ancient-catacombs',
      'enchanted-forest-ruins',
      'molten-core',
      'frozen-citadel',
      'shadow-realm',
      'dragons-lair',
      'void-spire',
      'forgotten-cellar',
    ]);
  });

  void it('update with no fade or a non-positive step does nothing', () => {
    const { d } = director();
    d.update(100);
    assert.equal(d.fadeAlpha, 0);
    d.begin(2);
    d.update(0);
    d.update(-10);
    d.update(Number.NaN);
    assert.equal(d.fadeAlpha, 0);
  });

  void it('an empty stage list throws a fixed message', () => {
    assert.throws(
      () => new StageDirector(() => ({}) as StageRuntime, []),
      (e: unknown) => e instanceof RangeError && e.message === 'No stages are defined',
    );
  });

  void it('the director is handed no hero: its constructor takes builders and stages only', () => {
    assert.equal(StageDirector.length >= 2, true);
    assert.ok(
      STAGES.length === 10 &&
        STAGES.every((stage) => SHIPPED_ART.stageSprites[stage.id] !== undefined),
    );
  });
});

void describe('CombatEngagement (the E1 rhythm, with the M4 timer as the fallback)', () => {
  const fake = (): { inContact: boolean; disabled: boolean } => ({
    inContact: false,
    disabled: false,
  });

  void it('is engaged only with contact and at least one fighter', () => {
    const c = fake();
    const e = new CombatEngagement(c, new TimedEngagement());
    e.update(STEP_MS, 2);
    assert.equal(e.isEngaged, false);
    c.inContact = true;
    e.update(STEP_MS, 2);
    assert.equal(e.isEngaged, true);
    e.update(STEP_MS, 0);
    assert.equal(e.isEngaged, false, 'no fighters, no engagement even in contact');
  });

  void it('the scroll eases to 0 on contact and back to SCROLL_PX_PER_S, over SCROLL_EASE_MS', () => {
    const c = fake();
    const e = new CombatEngagement(c, new TimedEngagement());
    for (let t = 0; t < SCROLL_EASE_MS + 40; t += STEP_MS) e.update(STEP_MS, 1);
    assert.equal(e.scrollPxPerS, SCROLL_PX_PER_S);
    c.inContact = true;
    e.update(STEP_MS, 1);
    assert.ok(e.scrollPxPerS < SCROLL_PX_PER_S && e.scrollPxPerS > 0, 'easing, not a snap');
    for (let t = 0; t < SCROLL_EASE_MS + 40; t += STEP_MS) e.update(STEP_MS, 1);
    assert.equal(e.scrollPxPerS, 0);
    c.inContact = false;
    for (let t = 0; t < SCROLL_EASE_MS + 40; t += STEP_MS) e.update(STEP_MS, 1);
    assert.equal(e.scrollPxPerS, SCROLL_PX_PER_S);
  });

  void it('with no fighters the scroll eases to 0 and nothing is engaged', () => {
    const c = fake();
    const e = new CombatEngagement(c, new TimedEngagement());
    for (let t = 0; t < 600; t += STEP_MS) e.update(STEP_MS, 1);
    assert.equal(e.scrollPxPerS, SCROLL_PX_PER_S);
    e.update(STEP_MS, 0);
    assert.ok(e.scrollPxPerS < SCROLL_PX_PER_S);
    for (let t = 0; t < 600; t += STEP_MS) e.update(STEP_MS, 0);
    assert.equal(e.scrollPxPerS, 0);
    assert.equal(e.isEngaged, false);
  });

  void it('disabled combat reproduces TimedEngagement exactly (the M4 numbers)', () => {
    const c = { inContact: true, disabled: true };
    const reference = new TimedEngagement();
    const e = new CombatEngagement(c, new TimedEngagement());
    let engagedSteps = 0;
    for (let t = 0; t < 3 * (ADVANCE_MS + ENGAGE_MS); t += STEP_MS) {
      const fighters = t % 9000 < 7000 ? 3 : 0;
      reference.update(STEP_MS, fighters);
      e.update(STEP_MS, fighters);
      assert.equal(e.scrollPxPerS, reference.scrollPxPerS);
      assert.equal(e.isEngaged, reference.isEngaged);
      if (e.isEngaged) engagedSteps += 1;
    }
    assert.ok(engagedSteps > 0, 'the timer did engage');
  });

  void it('switching to disabled mid-run hands over to the fallback without throwing', () => {
    const c = fake();
    const e = new CombatEngagement(c, new TimedEngagement());
    for (let i = 0; i < 100; i++) e.update(STEP_MS, 2);
    c.disabled = true;
    assert.doesNotThrow(() => e.update(STEP_MS, 2));
    const asEngagement: Engagement = e;
    assert.equal(typeof asEngagement.scrollPxPerS, 'number');
  });

  void it('a non-positive step is ignored', () => {
    const c = fake();
    const e = new CombatEngagement(c, new TimedEngagement());
    e.update(0, 2);
    e.update(-3, 2);
    e.update(Number.NaN, 2);
    assert.equal(e.scrollPxPerS, 0);
  });
});

void describe('Drops (decoration only)', () => {
  void it('spawns up to DROP_CAPACITY, refuses past it, and frees each after arc + rest + fade', () => {
    const d = new Drops();
    for (let i = 0; i < DROP_CAPACITY; i++) assert.equal(d.spawn('coin', 100, 150, 0), true);
    assert.equal(d.count, DROP_CAPACITY);
    assert.equal(d.spawn('gem', 100, 150, 0), false);
    d.update(DROP_ARC_MS + DROP_REST_MS + DROP_FADE_MS - 20);
    assert.equal(d.count, DROP_CAPACITY);
    d.update(40);
    assert.equal(d.count, 0);
    assert.equal(d.spawn('chest', 1, 1, 0), true);
  });

  void it('draws every kind from the art set, fades by alpha only after resting, and restores alpha 1', () => {
    const w = makeWorld();
    const d = new Drops();
    for (const kind of ['coin', 'gem', 'ore', 'chest'] as const) d.spawn(kind, 100, 150, 4);
    const s = new RecordingSurface();
    s.record = true;
    d.draw(s, w.world.cache);
    assert.equal(s.bitmapDraws, 4);
    assert.equal(s.count('setAlpha'), 0, 'no fade while arcing');
    d.update(DROP_ARC_MS + DROP_REST_MS + DROP_FADE_MS / 2);
    s.reset();
    d.draw(s, w.world.cache);
    assert.equal(s.bitmapDraws, 4);
    const alphas = s.calls.filter((c) => c.method === 'setAlpha').map((c) => c.args[0] as number);
    assert.ok(alphas.some((a) => a > 0 && a < 1));
    assert.equal(alphas[alphas.length - 1], 1, 'alpha restored');
    assert.equal(s.alpha, 1);
  });

  void it('draws nothing, and does not throw, when the art lacks a drop; clear empties the pool', () => {
    const w = makeWorld({ ...SHIPPED_ART, drops: {} as never });
    const d = new Drops();
    d.spawn('coin', 10, 10, 0);
    const s = new RecordingSurface();
    assert.doesNotThrow(() => d.draw(s, w.world.cache));
    assert.equal(s.bitmapDraws, 0);
    d.clear();
    assert.equal(d.count, 0);
  });

  void it('a drop holds no value: the pool exposes a count and nothing a hero could collect', () => {
    const names = Object.getOwnPropertyNames(Drops.prototype).filter((n) => n !== 'constructor');
    assert.deepEqual(names.sort(), ['clear', 'count', 'draw', 'spawn', 'update']);
  });
});
