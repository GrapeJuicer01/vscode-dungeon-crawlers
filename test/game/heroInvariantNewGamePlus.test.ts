// THE HERO-INVARIANT TEST, E5 extension: New Game+ looping (Core invariants 1, 2, and 4; E5 plan test
// note 7, ADR 0014). After the Stage 10 boss the game fades back to Stage 1 and counts one more cycle,
// and enemy health scales with the cycle (capped at 8). None of that may touch a hero: a hero's
// lifecycle, position, phase, and class follow the host's agent-state events and nothing else.
//
// Every case runs a combat game next to an enemies-off twin (same seed, same host script) and asserts the
// heroSnapshot is identical at every step of the loop, including the Stage 10 boss, the fade into New
// Game+, the first New Game+ stage, and the crossing of the cycle cap.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Combat } from '../../src/game/Combat';
import { ENEMIES, CYCLE_CAP, healthOf } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import { Boss } from '../../src/game/entities/Boss';
import { Enemy } from '../../src/game/entities/Enemy';
import { mulberry32 } from '../../src/game/rng';
import { DEFAULT_PROGRESS, isProgress } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';
import type { AgentState } from '../../src/shared/protocol';
import { agent, feed, gameRig, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const HARD = { enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 };
const OFF = { enemiesEnabled: false, killsPerStage: 5, maxEnemies: 12 };
const LAST = STAGES.length;

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});
function patch<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  const original = target[key];
  target[key] = value;
  restores.push(() => {
    target[key] = original;
  });
}

interface Run {
  readonly rig: GameRig;
  readonly reports: Progress[];
}

/** A rig that starts from stored progress with the given combat setting and reports every Progress. */
function runFrom(progress: Progress, config: typeof HARD, seed = 61): Run {
  const reports: Progress[] = [];
  const rig = gameRig({ seed, deps: { onProgress: (p) => void reports.push(p) } });
  rig.game.applyProgress(progress);
  rig.game.applyConfig(config);
  return { rig, reports };
}

const snap = (rig: GameRig): string => JSON.stringify(rig.game.heroSnapshot());

function feedParty(rig: GameRig, n: number): void {
  for (let i = 0; i < n; i++) feed(rig, agent(`h${i}`, 'working', 'Edit', i + 1));
}

const capture = (c: Combat): Combat => c;

/** The enemies a Combat holds, observed from outside (the first Combat the game builds). */
function spyEntities(): { entities: () => readonly unknown[] } {
  let seen: Combat | null = null;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = Combat.prototype.update;
  patch(Combat.prototype, 'update', function (this: Combat, ...args: Parameters<Combat['update']>) {
    seen ??= capture(this);
    original.apply(this, args);
  });
  return { entities: () => seen?.entities() ?? [] };
}

/** Records the health every enemy was given when it entered, in order (Enemy.begin is the only entry). */
function recordSpawns(): { row: EnemyRow; health: number }[] {
  const spawns: { row: EnemyRow; health: number }[] = [];
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = Enemy.prototype.begin;
  patch(Enemy.prototype, 'begin', function (this: Enemy, ...args: Parameters<Enemy['begin']>) {
    spawns.push({ row: args[0], health: args[1] });
    original.apply(this, args);
  });
  return spawns;
}

/**
 * Steps both runs in lockstep one simulated second at a time. `after` runs after every second with the
 * elapsed seconds and may apply the same host events to both rigs. Returns when `done` is true or after
 * `limitSeconds`. Asserts the hero snapshots are identical after every second.
 */
function lockstep(
  on: Run,
  off: Run,
  limitSeconds: number,
  done: () => boolean,
  after: (second: number) => void = () => undefined,
): number {
  let second = 0;
  for (; second < limitSeconds && !done(); second++) {
    steps(on.rig, 1000, 500);
    steps(off.rig, 1000, 500);
    assert.equal(snap(on.rig), snap(off.rig), `second ${second}`);
    after(second);
  }
  assert.deepEqual(on.rig.errors, []);
  assert.deepEqual(off.rig.errors, []);
  return second;
}

const last = (r: readonly Progress[]): Progress => r[r.length - 1]!;
const NG = (stageIndex: number, cycle: number): Progress => ({
  ...DEFAULT_PROGRESS,
  stageIndex,
  cycle,
  bossesDefeated: 9,
});

void describe('New Game+ looping: no hero changes anywhere in the loop (host events are the only input)', () => {
  void it('(a) from stored {stage 10, cycle 1}: the Stage 10 boss wraps to Stage 1 at cycle 2 and play continues through Stage 2, hero rows identical to an enemies-off twin', () => {
    const seen = spyEntities();
    const on = runFrom(NG(LAST, 1), HARD);
    const off = runFrom(NG(LAST, 1), OFF);
    feedParty(on.rig, 8);
    feedParty(off.rig, 8);
    on.rig.game.step();
    off.rig.game.step();
    const stageOf = (): number[] => seen.entities().map((e) => (e as { row: EnemyRow }).row.stage);
    const stagesFought: number[] = [];
    let bossSeen = false;
    const sawStage2 = (): boolean => stagesFought.includes(2);
    const seconds = lockstep(on, off, 3000, sawStage2, () => {
      for (const st of stageOf()) {
        if (stagesFought[stagesFought.length - 1] !== st) stagesFought.push(st);
      }
      if (seen.entities().some((e) => e instanceof Boss)) bossSeen = true;
    });
    assert.ok(seconds < 3000, 'Stage 2 of New Game+ was reached');
    assert.ok(bossSeen, 'the Stage 10 boss fought');
    assert.deepEqual(stagesFought.slice(0, 3), [10, 1, 2], stagesFought.join());
    const wrap = on.reports.find((r) => r.stageIndex === 1 && r.cycle === 2);
    assert.ok(wrap, 'the wrap reported Stage 1 at cycle 2');
    assert.equal(wrap.bossesDefeated, 10);
    assert.equal(wrap.killsInStage, 0);
    assert.equal(on.rig.game.heroSnapshot().length, 8, 'no hero was removed or created');
    assert.ok(on.reports.every((r) => r.cycle >= 1 && isProgress(r)));
    assert.ok(off.reports.length === 0 || off.reports.every((r) => r.stageIndex === LAST));
  });

  void it('(b) from stored {stage 10, cycle 8}: crossing the cap reports cycle 9, the next Stage 1 enemies have healthOf(row, 1, 8) health, and hero rows stay identical to an enemies-off twin', () => {
    const spawns = recordSpawns();
    const on = runFrom(NG(LAST, CYCLE_CAP), HARD);
    const off = runFrom(NG(LAST, CYCLE_CAP), OFF);
    feedParty(on.rig, 8);
    feedParty(off.rig, 8);
    on.rig.game.step();
    off.rig.game.step();
    const wrapped = (): boolean => on.reports.some((r) => r.cycle === CYCLE_CAP + 1);
    let spawnsAtWrap = -1;
    const seconds = lockstep(
      on,
      off,
      4000,
      () => wrapped() && spawns.length > spawnsAtWrap + 2 && spawnsAtWrap >= 0,
      () => {
        if (spawnsAtWrap < 0 && wrapped()) spawnsAtWrap = spawns.length;
      },
    );
    assert.ok(seconds < 4000, 'the wave after the wrap spawned');
    const wrap = on.reports.find((r) => r.cycle === CYCLE_CAP + 1)!;
    assert.equal(wrap.stageIndex, 1);
    // Every enemy spawned after the wrap is a Stage 1 enemy with the capped cycle factor (not cycle 9).
    const after = spawns.slice(spawnsAtWrap);
    assert.ok(after.length >= 2);
    for (const s of after.slice(0, 3)) {
      assert.equal(s.row.stage, 1, s.row.id);
      assert.equal(s.health, healthOf(s.row, 1, CYCLE_CAP, 8), `${s.row.id} at cycle 8`);
      assert.equal(s.health, healthOf(s.row, 1, CYCLE_CAP + 1, 8), `${s.row.id}: cycle 9 equals 8`);
    }
    // The boss that was just fought carried the capped Stage 10 value: 5595 with eight fighters.
    const boss = spawns.find((s) => s.row.tier === 'boss');
    assert.equal(boss?.row.id, 'void-sovereign');
    assert.equal(boss.health, 5595);
    assert.equal(on.rig.game.heroSnapshot().length, 8);
  });

  void it('(c) twin runs at cycle 0 and cycle 5 (same seed, same host script): identical hero rows for five minutes; scaling changes fight length only', () => {
    const run = (cycle: number): { rows: string[]; reports: Progress[] } => {
      const reports: Progress[] = [];
      const rig = gameRig({ seed: 99, deps: { onProgress: (p) => void reports.push(p) } });
      rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: 1, cycle });
      rig.game.applyConfig(HARD);
      const rng = mulberry32(4242);
      const rows: string[] = [];
      let clock = 2;
      for (let i = 0; i < 8; i++) {
        const state: AgentState = i % 4 === 2 ? 'idle' : 'working';
        feed(rig, agent(`h${i}`, state, state === 'working' ? 'Edit' : null, clock++));
      }
      for (let second = 0; second < 300; second++) {
        const events = Math.floor(rng() * 3);
        for (let e = 0; e < events; e++) {
          const id = `h${Math.floor(rng() * 10)}`;
          const roll = rng();
          const state: AgentState =
            roll < 0.1 ? 'despawned' : roll < 0.4 ? 'spawned' : roll < 0.7 ? 'working' : 'idle';
          feed(rig, agent(id, state, state === 'working' ? 'Edit' : null, clock++));
        }
        steps(rig, 1000, 500);
        rows.push(snap(rig));
      }
      assert.deepEqual(rig.errors, []);
      return { rows, reports };
    };
    const fresh = run(0);
    const veteran = run(5);
    assert.deepEqual(fresh.rows, veteran.rows);
    assert.ok(fresh.reports.length > 0 && veteran.reports.length > 0, 'combat ran in both');
    // The only difference the cycle makes is how many kills fit in the same five minutes.
    const kills = (r: Progress[]): number => last(r).totalKills;
    assert.ok(
      kills(veteran.reports) <= kills(fresh.reports),
      `${kills(veteran.reports)} vs ${kills(fresh.reports)}`,
    );
  });

  void it('(d) host events applied during the boss intro, the fade into New Game+, and the first New Game+ stage take effect exactly as in an enemies-off twin', () => {
    const seen = spyEntities();
    const on = runFrom(NG(LAST, 1), HARD);
    const off = runFrom(NG(LAST, 1), OFF);
    feedParty(on.rig, 8);
    feedParty(off.rig, 8);
    on.rig.game.step();
    off.rig.game.step();
    let clock = 100;
    const both = (info: (t: number) => ReturnType<typeof agent>): void => {
      const t = clock++;
      feed(on.rig, info(t));
      feed(off.rig, info(t));
    };
    const phases = { intro: false, wrap: -1, ng: false, finishAt: Infinity };
    const wrapped = (): boolean => on.reports.some((r) => r.stageIndex === 1 && r.cycle === 2);
    lockstep(
      on,
      off,
      4000,
      () => phases.ng && phases.finishAt <= 0,
      (second) => {
        const boss = seen.entities().some((e) => e instanceof Boss);
        if (boss && !phases.intro) {
          phases.intro = true;
          // During the boss intro: one goes idle, one is despawned, a new one spawns.
          both((t) => agent('h1', 'idle', null, t));
          both((t) => agent('h2', 'despawned', null, t));
          both((t) => agent('n1', 'spawned', null, t));
        }
        if (wrapped() && phases.wrap < 0) {
          phases.wrap = second;
          // At the Stage 10 to Stage 1 fade.
          both((t) => agent('h3', 'idle', null, t));
          both((t) => agent('h4', 'despawned', null, t));
          both((t) => agent('n2', 'working', 'Edit', t));
        }
        if (phases.wrap >= 0 && !phases.ng && second - phases.wrap >= 15) {
          phases.ng = true;
          phases.finishAt = 10;
          // In the first New Game+ stage.
          both((t) => agent('h3', 'working', 'Edit', t));
          both((t) => agent('n1', 'idle', null, t));
          both((t) => agent('h5', 'despawned', null, t));
        }
        if (phases.ng) phases.finishAt -= 1;
      },
    );
    assert.ok(phases.intro, 'host events were applied during the boss intro');
    assert.ok(phases.wrap >= 0, 'host events were applied at the fade');
    assert.ok(phases.ng, 'host events were applied in the first New Game+ stage');
    // The lifecycle the host set is the lifecycle the scene has: nothing in the loop overrode it.
    const lifecycle = new Map(on.rig.game.heroSnapshot().map((h) => [h.id, h.lifecycle]));
    assert.equal(lifecycle.get('h3'), 'working');
    assert.equal(lifecycle.get('n1'), 'idle');
    assert.equal(lifecycle.get('n2'), 'working');
    assert.equal(lifecycle.get('h1'), 'idle');
  });

  void it('(e) a reload mid-loop restores Stage 10 at any stored cycle from the host agent list alone: no hero state comes from progress', () => {
    for (const cycle of [0, 1, 7, 8, 9, 40]) {
      const seen = spyEntities();
      const reports: Progress[] = [];
      const rig = gameRig({ seed: 5, deps: { onProgress: (p) => void reports.push(p) } });
      // The webview reloads: the host replays its agent list, then stored progress arrives.
      feed(rig, agent('a', 'working', 'Edit', 1));
      feed(rig, agent('b', 'idle', null, 2));
      feed(rig, agent('c', 'spawned', null, 3));
      rig.game.applyConfig(HARD);
      rig.game.applyProgress(NG(LAST, cycle));
      const plain = gameRig({ seed: 5 });
      feed(plain, agent('a', 'working', 'Edit', 1));
      feed(plain, agent('b', 'idle', null, 2));
      feed(plain, agent('c', 'spawned', null, 3));
      plain.game.applyConfig(OFF);
      steps(rig, 30_000, 500);
      steps(plain, 30_000, 500);
      assert.equal(snap(rig), snap(plain), `cycle ${cycle}`);
      const stages = new Set(seen.entities().map((e) => (e as { row: EnemyRow }).row.stage));
      assert.deepEqual([...stages], [LAST], `cycle ${cycle}: Stage 10 enemies`);
      assert.deepEqual(rig.errors, []);
      assert.equal(rig.game.heroSnapshot().length, 3);
      // Progress carries numbers only.
      for (const r of reports) {
        for (const value of Object.values(r)) assert.equal(typeof value, 'number');
        assert.equal(Object.keys(r).length, 6);
      }
      restores.splice(0).forEach((r) => r());
    }
  });

  void it('the cycle never reaches a hero: a thrown error in the loop at the wrap leaves heroes, the scene, and progress reporting running', () => {
    // A fault in the update loop at the moment the cycle increments must not remove or change a hero.
    let armed = false;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const original = Enemy.prototype.begin;
    patch(Enemy.prototype, 'begin', function (this: Enemy, ...args: Parameters<Enemy['begin']>) {
      if (armed && args[0].stage === 1) throw new Error('spawn boom after the wrap');
      original.apply(this, args);
    });
    const on = runFrom(NG(LAST, 3), HARD);
    const off = runFrom(NG(LAST, 3), OFF);
    feedParty(on.rig, 8);
    feedParty(off.rig, 8);
    on.rig.game.step();
    off.rig.game.step();
    const wrapped = (): boolean => on.reports.some((r) => r.cycle === 4);
    let after = 0;
    for (let second = 0; second < 3000 && after < 60; second++) {
      steps(on.rig, 1000, 500);
      steps(off.rig, 1000, 500);
      if (wrapped()) {
        armed = true;
        after += 1;
      }
      assert.equal(snap(on.rig), snap(off.rig), `second ${second}`);
    }
    assert.ok(after >= 60, 'the loop wrapped and ran a minute with spawns failing');
    assert.ok(on.rig.errors.length >= 1, 'the fault was reported');
    assert.equal(on.rig.game.heroSnapshot().length, 8);
    assert.ok(ENEMIES.length === 50);
    on.rig.surface.reset();
    on.rig.surface.record = true;
    on.rig.game.frame(16, on.rig.surface);
    assert.ok(on.rig.surface.bitmapDraws > 3, 'the scene still draws');
  });
});
