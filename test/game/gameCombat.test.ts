// Game-level E1 behavior: the boot gate and the late-progress rule, applyProgress and applyConfig,
// the onProgress callback guard, an invalid enemy table, three combat faults falling back to the
// M4 rhythm, and the renderer's drop pass and stage fade (E1 plan test notes 1, 7, 8, 9; drift
// 13.4 and 13.8). Observed through the public Game API plus a spy that captures the Combat the
// game built; no hero field is read except through heroSnapshot and the hero log.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Combat } from '../../src/game/Combat';
import { ENEMIES } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import {
  ADVANCE_MS,
  COMBAT_FAULT_LIMIT,
  ENGAGE_MS,
  PASS_FAULT_LIMIT,
  PROGRESS_WAIT_MS,
  STAGE_CLEAR_HOLD_MS,
  STAGE_FADE_MS,
  STEP_MS,
} from '../../src/game/data/tuning';
import type { HeroPhase } from '../../src/game/entities/Hero';
import { Renderer } from '../../src/game/Renderer';
import type { RenderExtras } from '../../src/game/Renderer';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { DEFAULT_PROGRESS, isProgress } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';
import { Camera } from '../../src/game/Camera';
import { HitReactions } from '../../src/game/HitReactions';
import { makeWorld } from '../support/classRig';
import { RecordingSurface, agent, feed, gameRig, heroLog, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
});

const capture = (c: Combat): Combat => c;

/** Captures the Combat the Game under test builds (the first one to update). */
function spyCombat(): { readonly combat: () => Combat | null; updates: () => number } {
  let seen: Combat | null = null;
  let updates = 0;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = Combat.prototype.update;
  Combat.prototype.update = function (this: Combat, ...args: Parameters<Combat['update']>) {
    seen ??= capture(this);
    updates += 1;
    return original.apply(this, args);
  };
  restores.push(() => {
    Combat.prototype.update = original;
  });
  return { combat: () => seen, updates: () => updates };
}

/** Steps until `done()` or `limitMs` of game time; returns whether it was met. */
function stepUntil(rig: GameRig, done: () => boolean, limitMs: number): boolean {
  const n = Math.round(limitMs / STEP_MS);
  for (let i = 0; i < n; i++) {
    if (done()) {
      return true;
    }
    rig.game.step();
  }
  return done();
}

const STORED_STAGE_2: Progress = {
  schemaVersion: 1,
  stageIndex: 2,
  killsInStage: 11,
  totalKills: 71,
  bossesDefeated: 1,
  cycle: 0,
};

function party(rig: GameRig, n: number): void {
  for (let i = 0; i < n; i++) {
    feed(rig, agent(`h${i}`, 'working', 'Edit', 1));
  }
}

void describe('the boot gate (awaitProgress)', () => {
  void it('draws only the clear colour and keeps combat idle until progress arrives, while heroes still build and animate', () => {
    const spy = spyCombat();
    const rig = gameRig({ deps: { awaitProgress: true } });
    party(rig, 3);
    rig.surface.record = true;
    for (let i = 0; i < 60; i++) {
      rig.game.frame(STEP_MS, rig.surface);
    }
    assert.equal(rig.surface.bitmapDraws, 0, 'no room, no hero, no enemy drawn');
    assert.equal(rig.surface.count('fillRect'), 0);
    assert.ok(rig.surface.count('clear') >= 60);
    assert.equal(spy.updates(), 0, 'combat does not update behind the gate');
    assert.equal(rig.game.heroSnapshot().length, 3, 'heroes are built from the snapshot meanwhile');
    assert.deepEqual(rig.errors, []);
  });

  void it('applyProgress lifts the gate at once: the room draws and combat runs', () => {
    const spy = spyCombat();
    const rig = gameRig({ deps: { awaitProgress: true } });
    party(rig, 2);
    steps(rig, 500);
    rig.game.applyProgress(DEFAULT_PROGRESS);
    rig.surface.reset();
    rig.surface.record = true;
    rig.game.frame(STEP_MS, rig.surface);
    assert.ok(rig.surface.bitmapDraws > 10);
    assert.ok(spy.updates() > 0);
  });

  void it('gives up after PROGRESS_WAIT_MS of game time and runs on the defaults', () => {
    const spy = spyCombat();
    const rig = gameRig({ deps: { awaitProgress: true } });
    party(rig, 2);
    steps(rig, PROGRESS_WAIT_MS - 100);
    assert.equal(spy.updates(), 0);
    steps(rig, 300);
    assert.ok(spy.updates() > 0);
    rig.surface.reset();
    rig.surface.record = true;
    rig.game.frame(STEP_MS, rig.surface);
    assert.ok(rig.surface.bitmapDraws > 10);
    assert.deepEqual(rig.errors, []);
  });

  void it('a progress message after the gate timed out is still applied, once, and restores the stored stage', () => {
    const spy = spyCombat();
    const rig = gameRig({ deps: { awaitProgress: true } });
    party(rig, 4);
    steps(rig, PROGRESS_WAIT_MS + 500);
    const live = spy.combat()!;
    assert.ok(
      stepUntil(rig, () => live.entities().length > 0, 8000),
      'a wave on Stage 1 defaults',
    );
    rig.game.applyProgress(STORED_STAGE_2);
    rig.game.step();
    assert.deepEqual(live.entities(), [], 'applying cleared the live wave (setStage)');
    stepUntil(rig, () => live.entities().length > 0, 8000);
    const rows = live.entities().map((e) => (e as unknown as { row: EnemyRow }).row.stage);
    assert.ok(rows.length > 0 && rows.every((s) => s === 2), `stage 2 enemies: ${rows.join()}`);
    // A second message is ignored.
    rig.game.applyProgress(DEFAULT_PROGRESS);
    rig.game.step();
    assert.ok(
      live.entities().length === 0 ||
        live.entities().every((e) => (e as unknown as { row: EnemyRow }).row.stage === 2),
    );
    stepUntil(rig, () => live.entities().length > 0, 8000);
    const again = live.entities().map((e) => (e as unknown as { row: EnemyRow }).row.stage);
    assert.ok(again.every((s) => s === 2));
  });

  void it('an invalid progress object is ignored and does not use up the single application', () => {
    const spy = spyCombat();
    const rig = gameRig({ deps: { awaitProgress: true } });
    party(rig, 2);
    for (const junk of [
      null,
      undefined,
      {},
      { ...DEFAULT_PROGRESS, stageIndex: 0 },
      { ...DEFAULT_PROGRESS, extra: 1 },
      'x',
    ]) {
      assert.doesNotThrow(() => rig.game.applyProgress(junk as Progress));
    }
    steps(rig, 300);
    assert.equal(spy.updates(), 0, 'the gate is still closed');
    rig.game.applyProgress(STORED_STAGE_2);
    steps(rig, 300);
    assert.ok(spy.updates() > 0);
  });

  void it('a stored stage above the delivered count wraps instead of failing (E4: eight stages, ((i - 1) % 8) + 1; 7 and 8 stay, 9 -> 1, 10 -> 2; 3 to 6 stay)', () => {
    for (const [stored, expected] of [
      [7, 7],
      [8, 8],
      [9, 1],
      [10, 2],
      // 11 and 12 are outside the stored schema (MAX_STAGE_INDEX 10): rejected, so default Stage 1.
      [11, 1],
      [12, 1],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ] as const) {
      const spy = spyCombat();
      const rig = gameRig();
      party(rig, 4);
      rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stored });
      steps(rig, 5000);
      const rows = spy
        .combat()!
        .entities()
        .map((e) => (e as unknown as { row: EnemyRow }).row.stage);
      assert.ok(
        rows.length > 0 && rows.every((st) => st === expected),
        `stored ${stored}: ${rows.join()}`,
      );
      assert.deepEqual(rig.errors, []);
    }
  });
});

void describe('onProgress: numbers out, never a reference in', () => {
  void it('a kill reports a valid frozen Progress with urgent false; the counters match', () => {
    const reports: { progress: Progress; urgent: boolean }[] = [];
    const rig = gameRig({
      deps: { onProgress: (progress, urgent) => void reports.push({ progress, urgent }) },
    });
    party(rig, 8);
    steps(rig, 120_000);
    assert.ok(reports.length > 0, 'kills happened');
    let last = 0;
    for (const { progress, urgent } of reports) {
      assert.ok(isProgress(progress));
      assert.ok(Object.isFrozen(progress));
      assert.ok(progress.totalKills >= last, 'monotonic');
      last = progress.totalKills;
      if (!urgent) {
        assert.equal(progress.schemaVersion, 1);
      }
    }
    assert.equal(reports.filter((r) => !r.urgent).length >= 1, true);
  });

  void it('a boss defeat reports urgent true with bossesDefeated + 1 and the next stage', () => {
    const reports: { progress: Progress; urgent: boolean }[] = [];
    const rig = gameRig({
      deps: { onProgress: (progress, urgent) => void reports.push({ progress, urgent }) },
    });
    rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 });
    party(rig, 8);
    for (let i = 0; i < 60 * 600 && !reports.some((r) => r.urgent); i++) {
      rig.game.step();
    }
    const urgent = reports.find((r) => r.urgent);
    assert.ok(urgent, 'a boss fell');
    assert.equal(urgent.progress.bossesDefeated, 1);
    assert.equal(urgent.progress.stageIndex, 2);
    assert.equal(urgent.progress.killsInStage, 0);
    assert.equal(reports.filter((r) => r.urgent).length, 1);
    const before = reports.filter((r) => !r.urgent).length;
    assert.ok(before >= 5, 'at least the threshold of regular kills came first');
  });

  void it('the Stage 8 boss defeat wraps to Stage 1 and reports cycle + 1 (New Game+ after eight stages)', () => {
    const reports: { progress: Progress; urgent: boolean }[] = [];
    const rig = gameRig({
      deps: { onProgress: (progress, urgent) => void reports.push({ progress, urgent }) },
    });
    rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 });
    rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: 8, bossesDefeated: 7, cycle: 0 });
    party(rig, 8);
    for (let i = 0; i < 60 * 600 && !reports.some((r) => r.urgent); i++) {
      rig.game.step();
    }
    const urgent = reports.find((r) => r.urgent);
    assert.ok(urgent, 'the Stage 8 boss fell');
    assert.equal(urgent.progress.stageIndex, 1);
    assert.equal(urgent.progress.cycle, 1);
    assert.equal(urgent.progress.bossesDefeated, 8);
    assert.deepEqual(rig.errors, []);
    assert.equal(rig.game.heroSnapshot().length, 8, 'no hero is removed by the wrap');
  });

  void it('a throwing callback is caught and reported once; heroes, the scene, and combat keep running', () => {
    let calls = 0;
    const rig = gameRig({
      deps: {
        onProgress: () => {
          calls += 1;
          throw new Error('callback broke');
        },
      },
    });
    party(rig, 8);
    rig.game.step();
    const before = JSON.stringify(rig.game.heroSnapshot());
    steps(rig, 120_000);
    assert.ok(calls > 3, 'it was called repeatedly');
    assert.equal(rig.errors.length, 1, 'reported once');
    assert.equal((rig.errors[0]?.error as Error).message, 'callback broke');
    assert.equal(rig.errors[0]?.scope, 'update');
    assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
    rig.surface.reset();
    rig.surface.record = true;
    rig.game.frame(STEP_MS, rig.surface);
    assert.ok(rig.surface.bitmapDraws > 10, 'the next frame renders');
  });
});

void describe('applyConfig', () => {
  void it('turning enemies off clears the field and stops spawning; turning them on resumes', () => {
    const spy = spyCombat();
    const rig = gameRig();
    party(rig, 4);
    rig.game.step();
    const combat = spy.combat()!;
    assert.ok(stepUntil(rig, () => combat.entities().length > 0, 8000));
    rig.game.applyConfig({ enemiesEnabled: false, killsPerStage: 30, maxEnemies: 6 });
    steps(rig, 100);
    assert.equal(combat.disabled, true);
    assert.deepEqual(combat.entities(), []);
    steps(rig, 10_000);
    assert.deepEqual(combat.entities(), []);
    rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 30, maxEnemies: 6 });
    assert.equal(combat.disabled, false);
    assert.ok(stepUntil(rig, () => combat.entities().length > 0, 8000));
    assert.equal(rig.game.heroSnapshot().length, 4);
    assert.deepEqual(rig.errors, []);
  });

  void it('maxEnemies caps the wave', () => {
    const spy = spyCombat();
    const rig = gameRig();
    party(rig, 12);
    rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 30, maxEnemies: 2 });
    rig.game.step();
    let most = 0;
    for (let i = 0; i < 60 * 20; i++) {
      rig.game.step();
      most = Math.max(most, spy.combat()!.entities().length);
    }
    assert.equal(most, 2, 'twelve fighters would call for six; the setting caps it at two');
  });

  void it('applying config or progress never touches the roster', () => {
    const rig = gameRig();
    party(rig, 5);
    steps(rig, 3000);
    const before = JSON.stringify(rig.game.heroSnapshot());
    rig.game.applyConfig({ enemiesEnabled: false, killsPerStage: 5, maxEnemies: 1 });
    rig.game.applyProgress(STORED_STAGE_2);
    steps(rig, 1000);
    assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
  });
});

void describe('an invalid enemy table (decision: it never stops the game)', () => {
  const broken: readonly EnemyRow[] = ENEMIES.slice(0, 9);

  void it('reports once with scope boot and fixed text, then runs with combat disabled', () => {
    const spy = spyCombat();
    const rig = gameRig({ deps: { enemies: broken } });
    assert.equal(rig.errors.length, 1);
    assert.equal(rig.errors[0]?.scope, 'boot');
    assert.equal((rig.errors[0]?.error as Error).message, 'Enemy data is invalid');
    party(rig, 4);
    rig.game.step();
    const before = JSON.stringify(rig.game.heroSnapshot());
    steps(rig, 30_000);
    assert.equal(spy.combat()?.disabled, true);
    assert.deepEqual(spy.combat()?.entities(), []);
    assert.equal(JSON.stringify(rig.game.heroSnapshot()), before);
    assert.equal(rig.errors.length, 1, 'still just the one report');
    rig.surface.reset();
    rig.surface.record = true;
    rig.game.frame(STEP_MS, rig.surface);
    assert.ok(rig.surface.bitmapDraws > 10, 'the scene renders');
  });

  void it('a later applyConfig(enemies on) cannot revive combat on an invalid table', () => {
    const spy = spyCombat();
    const rig = gameRig({ deps: { enemies: broken } });
    party(rig, 4);
    rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 30, maxEnemies: 6 });
    steps(rig, 10_000);
    assert.equal(spy.combat()?.disabled, true);
  });
});

void describe('three combat faults fall back to the timed rhythm (invariant 4)', () => {
  void it('the third fault disables combat; the M4 timer drives attack and advance; no hero is removed', () => {
    const log = heroLog();
    const rig = gameRig({ heroFactory: log.factory });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const original = Combat.prototype.update;
    let throws = 0;
    Combat.prototype.update = function (this: Combat, ...args: Parameters<Combat['update']>) {
      if (throws < COMBAT_FAULT_LIMIT) {
        throws += 1;
        throw new Error('combat broke');
      }
      original.apply(this, args);
    };
    restores.push(() => {
      Combat.prototype.update = original;
    });
    feed(rig, agent('w', 'working', 'Edit', 1));
    const phases: { phase: HeroPhase; ms: number }[] = [];
    let last: HeroPhase | null = null;
    for (let i = 0; i < 60 * 14; i++) {
      rig.game.step();
      const hero = log.byId('w');
      if (hero.phase !== last) {
        phases.push({ phase: hero.phase, ms: i * STEP_MS });
        last = hero.phase;
      }
    }
    assert.equal(throws, COMBAT_FAULT_LIMIT, 'three faults were thrown');
    assert.equal(rig.errors.length, 1, 'one distinct message, reported once');
    assert.equal(rig.errors[0]?.scope, 'update');
    const attack = phases.filter((p) => p.phase === 'attack' || p.phase === 'ability');
    assert.ok(attack.length > 0, JSON.stringify(phases));
    const firstAttack = attack[0]!.ms;
    const tolerance = 400;
    assert.ok(
      Math.abs(firstAttack - (ADVANCE_MS + COMBAT_FAULT_LIMIT * STEP_MS)) <= tolerance,
      `attack began at ${firstAttack}, expected about ${ADVANCE_MS}`,
    );
    const back = phases.find((p) => p.phase === 'advance' && p.ms > firstAttack)!;
    assert.ok(
      Math.abs(back.ms - firstAttack - ENGAGE_MS) <= tolerance,
      `engaged for ${back.ms - firstAttack}`,
    );
    assert.equal(rig.game.heroSnapshot().length, 1);
    assert.equal(rig.game.heroSnapshot()[0]?.lifecycle, 'working');
  });

  void it('the thrown text contains no agent id, name, or tool', () => {
    const rig = gameRig();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const original = Combat.prototype.update;
    Combat.prototype.update = function () {
      throw new Error('combat broke');
    };
    restores.push(() => {
      Combat.prototype.update = original;
    });
    feed(rig, agent('SECRET-ID', 'working', 'SECRET-TOOL'));
    steps(rig, 2000);
    assert.ok(rig.errors.length >= 1);
    assert.ok(
      !JSON.stringify(rig.errors.map((e) => (e.error as Error).message)).includes('SECRET'),
    );
  });
});

void describe('Renderer extras: the drop pass and the stage fade', () => {
  function extras(patch: Partial<RenderExtras> = {}): RenderExtras {
    return {
      foes: [],
      reactions: new HitReactions(64),
      drops: () => undefined,
      fadeAlpha: 0,
      ...patch,
    };
  }

  function render(
    ex: RenderExtras | undefined,
    onError: (e: unknown, s: string) => void = () => undefined,
  ): { surface: RecordingSurface; renderer: Renderer } {
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, onError);
    const surface = new RecordingSurface();
    surface.record = true;
    renderer.render(surface, w.world, [], new Camera(), ex);
    return { surface, renderer };
  }

  void it('renders without extras (the M4 to H3 call shape): no fade rect, no drop pass', () => {
    const { surface } = render(undefined);
    assert.ok(surface.bitmapDraws > 5);
    assert.equal(
      surface.calls.filter((c) => c.method === 'fillRect' && (c.args[3] as number) >= 320).length,
      0,
    );
  });

  void it('draws the fade last, full-screen, in the stage clear colour, with the given alpha and never white', () => {
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, () => undefined);
    const surface = new RecordingSurface();
    surface.record = true;
    renderer.render(surface, w.world, [], new Camera(), extras({ fadeAlpha: 0.6 }));
    const fills = surface.calls.filter((c) => c.method === 'fillRect');
    const fade = fills[fills.length - 1]!;
    assert.deepEqual(fade.args.slice(1), [0, 0, 320, 180]);
    assert.equal(fade.args[0], w.world.stage.clearColor);
    assert.equal(fade.alpha, 0.6);
    const lastBitmap = surface.calls.map((c) => c.method).lastIndexOf('drawBitmap');
    assert.ok(
      surface.calls.indexOf(fade) > lastBitmap,
      'after everything else, particles included',
    );
    assert.ok(!/^#f{3,6}$/i.test(String(fade.args[0])));
    assert.equal(surface.alpha, 1, 'alpha restored');
    assert.equal(surface.composite, 'source-over');
  });

  void it('no fade rect at alpha 0, and alpha above 1 is clamped', () => {
    const none = render(extras({ fadeAlpha: 0 })).surface;
    assert.equal(
      none.calls.filter((c) => c.method === 'fillRect' && (c.args[3] as number) >= 320).length,
      0,
    );
    const over = render(extras({ fadeAlpha: 7 })).surface;
    const fade = over.calls.filter((c) => c.method === 'fillRect').pop()!;
    assert.equal(fade.alpha, 1);
  });

  void it('the drop pass runs once per frame between the effects and the foreground', () => {
    let calls = 0;
    render(extras({ drops: () => void (calls += 1) }));
    assert.equal(calls, 1);
  });

  void it('a throwing drop pass is reported once, never blanks the frame, and is switched off after PASS_FAULT_LIMIT faults', () => {
    const reported: unknown[] = [];
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, (e) => void reported.push(e));
    let calls = 0;
    const ex = extras({
      drops: () => {
        calls += 1;
        throw new Error('drops broke');
      },
    });
    for (let i = 0; i < 10; i++) {
      const surface = new RecordingSurface();
      surface.record = true;
      assert.doesNotThrow(() => renderer.render(surface, w.world, [], new Camera(), ex));
      assert.ok(surface.bitmapDraws > 5, 'the room still draws');
      assert.equal(surface.alpha, 1);
    }
    assert.equal(calls, PASS_FAULT_LIMIT);
    assert.equal(reported.length, 1);
  });

  void it('a throwing fade is reported once, leaves alpha 1, and is switched off after PASS_FAULT_LIMIT faults', () => {
    const reported: unknown[] = [];
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, (e) => void reported.push(e));
    const ex = extras({ fadeAlpha: 0.5 });
    let attempts = 0;
    for (let i = 0; i < 8; i++) {
      const surface = new RecordingSurface();
      surface.record = false;
      // Fail only the full-screen fade rectangle.
      const original = surface.fillRect.bind(surface);
      surface.fillRect = (color, x, y, ww, h): void => {
        if (ww >= 320) {
          attempts += 1;
          throw new Error('fade broke');
        }
        original(color, x, y, ww, h);
      };
      assert.doesNotThrow(() => renderer.render(surface, w.world, [], new Camera(), ex));
      assert.equal(surface.alpha, 1);
    }
    assert.equal(attempts, PASS_FAULT_LIMIT);
    assert.equal(reported.length, 1);
  });

  void it('foes passed in extras are y-sorted with heroes and drawn through the entity guard', () => {
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, () => undefined);
    const order: string[] = [];
    const foe = (name: string, y: number): RenderExtras['foes'][number] => ({
      x: 100,
      sortY: y,
      shadowWidth: 0,
      faults: 0,
      drawFaults: 0,
      frozen: false,
      reported: null,
      update: () => undefined,
      draw: () => void order.push(name),
    });
    const surface = new RecordingSurface();
    renderer.render(
      surface,
      w.world,
      [],
      new Camera(),
      extras({ foes: [foe('far', 140), foe('near', 156), foe('mid', 148)] }),
    );
    assert.deepEqual(order, ['far', 'mid', 'near']);
  });

  void it('FakeBitmaps are untouched by the fade: no bitmap is created per frame', () => {
    const w = makeWorld();
    const renderer = new Renderer(w.bitmaps, SHIPPED_ART, () => undefined);
    const surface = new RecordingSurface();
    renderer.render(surface, w.world, [], new Camera(), extras({ fadeAlpha: 0.3 }));
    const created = w.bitmaps.fromRgbaBitmaps.length;
    renderer.render(surface, w.world, [], new Camera(), extras({ fadeAlpha: 0.9 }));
    renderer.render(surface, w.world, [], new Camera(), extras({ fadeAlpha: 0 }));
    assert.equal(w.bitmaps.fromRgbaBitmaps.length, created);
  });
});

void describe('Game stage flow: boss defeat, hold, fade, swap', () => {
  void it('after a boss falls the fade covers the screen, the stage swaps at the peak, and heroes keep their poses', () => {
    const log = heroLog();
    const spy = spyCombat();
    const reports: Progress[] = [];
    const rig = gameRig({
      heroFactory: log.factory,
      deps: { onProgress: (p, urgent) => urgent && void reports.push(p) },
    });
    rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 });
    party(rig, 8);
    for (let i = 0; i < 60 * 600 && reports.length === 0; i++) {
      rig.game.step();
    }
    assert.equal(reports.length, 1, 'the boss fell');
    const snap = JSON.stringify(rig.game.heroSnapshot());
    // Hold, then the fade: render frames and watch the last fill's alpha.
    let peak = 0;
    let sawStageTwoRows = false;
    for (let t = 0; t < STAGE_CLEAR_HOLD_MS + 2 * STAGE_FADE_MS + 1500; t += STEP_MS) {
      rig.surface.reset();
      rig.surface.record = true;
      rig.game.frame(STEP_MS, rig.surface);
      rig.surface.record = false;
      const fills = rig.surface.calls.filter(
        (c) => c.method === 'fillRect' && (c.args[3] as number) >= 320,
      );
      for (const f of fills) peak = Math.max(peak, f.alpha);
      assert.equal(rig.surface.alpha, 1);
      for (const e of spy.combat()!.entities()) {
        if ((e as unknown as { row: EnemyRow }).row.stage === 2) sawStageTwoRows = true;
      }
    }
    assert.equal(peak, 1, 'the fade reached full dark');
    assert.equal(
      JSON.stringify(rig.game.heroSnapshot()),
      snap,
      'hero lifecycle and class unchanged by the stage change',
    );
    assert.equal(sawStageTwoRows, true, 'Stage 2 enemies arrive after the swap');
    assert.deepEqual(rig.errors, []);
    assert.ok(log.made.length === 8, 'no hero was rebuilt');
  });
});
