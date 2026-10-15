// THE HERO-INVARIANT TEST, E2 extension (Core invariants 1 and 2; E2 plan test note 6). The E1
// combat-isolation suites run once per stage: for each of the ten stages (E5) a hero's lifecycle follows
// the host's agent-state events and nothing else, whatever the stage's enemies, bosses, ambient, or
// stage swaps do. Never narrowed; heroInvariantCombat.test.ts keeps the stage 1 and 2 runs.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Ambience } from '../../src/game/Ambience';
import { Combat } from '../../src/game/Combat';
import { STAGES } from '../../src/game/data/stages';
import { STEP_MS } from '../../src/game/data/tuning';
import { Boss } from '../../src/game/entities/Boss';
import { Enemy } from '../../src/game/entities/Enemy';
import type { EnemyRow } from '../../src/game/data/enemies';
import { HitReactions } from '../../src/game/HitReactions';
import { mulberry32 } from '../../src/game/rng';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import type { Progress } from '../../src/shared/progress';
import type { AgentState } from '../../src/shared/protocol';
import { agent, feed, gameRig, heroLog, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';
import { makeCombat } from '../support/combatRig';

const STAGE_INDEXES = STAGES.map((s) => s.index);
/** The boss of each stage in order, pinned by id so a re-ordered or missing boss fails here. */
const BOSS_BY_STAGE = [
  'rat-king',
  'goblin-foreman',
  'ooze-queen',
  'tomb-lich',
  'elder-dryad',
  'molten-colossus',
  'glacier-mammoth',
  'eclipse-warden',
  'hoard-dragon',
  'void-sovereign',
] as const;
const LAST_STAGE = STAGES.length;
const HARD = { enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 };
const OFF = { enemiesEnabled: false, killsPerStage: 5, maxEnemies: 12 };

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

/** A rig whose game starts on `stage` (stored progress) with the given combat setting. */
function stageRig(
  stage: number,
  config: typeof HARD,
  options: Parameters<typeof gameRig>[0] = {},
): GameRig {
  const rig = gameRig({ seed: 77, ...options });
  rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stage });
  rig.game.applyConfig(config);
  return rig;
}

/** The scripted host events for second `s` (the same in both runs of a twin). */
function script(seed: number, n: number): (rig: GameRig, second: number) => void {
  const rng = mulberry32(seed);
  const pool = Math.max(4, Math.floor(n * 1.5));
  let clock = 2;
  const known = new Set<string>();
  return (rig, second) => {
    if (second === 0) {
      for (let i = 0; i < n; i++) {
        const state: AgentState = i % 4 === 2 ? 'idle' : i % 4 === 3 ? 'spawned' : 'working';
        feed(rig, agent(`h${i}`, state, state === 'working' ? 'Edit' : null, clock++));
        known.add(`h${i}`);
      }
      return;
    }
    const events = Math.floor(rng() * 3);
    for (let e = 0; e < events; e++) {
      const id = `h${Math.floor(rng() * pool)}`;
      const roll = rng();
      const state: AgentState =
        roll < 0.15 ? 'despawned' : roll < 0.4 ? 'spawned' : roll < 0.7 ? 'working' : 'idle';
      if (!known.has(id) && state === 'despawned') continue;
      feed(rig, agent(id, state, state === 'working' ? 'Edit' : null, clock++));
      if (state === 'despawned') known.delete(id);
      else known.add(id);
    }
  };
}

const capture = (c: Combat): Combat => c;

/** Which Combat the game built, to observe its entities. */
function spyCombat(): { combat: () => Combat | null } {
  let seen: Combat | null = null;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const original = Combat.prototype.update;
  patch(Combat.prototype, 'update', function (this: Combat, ...args: Parameters<Combat['update']>) {
    seen ??= capture(this);
    original.apply(this, args);
  });
  return { combat: () => seen };
}

const snap = (rig: GameRig): string => JSON.stringify(rig.game.heroSnapshot());

void describe('per stage: hero state is identical with enemies on and off (host events are the only input)', () => {
  for (const stage of STAGE_INDEXES) {
    for (const n of [1, 8, 32]) {
      void it(`stage ${stage}, ${n} heroes: ninety seconds of random host events give the same heroSnapshot every second, combat on or off`, () => {
        const on = stageRig(stage, HARD);
        const off = stageRig(stage, OFF);
        const scriptOn = script(900 + stage * 10 + n, n);
        const scriptOff = script(900 + stage * 10 + n, n);
        const seen = spyCombat();
        let enemyPeak = 0;
        const stagesSeen: number[] = [];
        for (let second = 0; second < 90; second++) {
          scriptOn(on, second);
          scriptOff(off, second);
          steps(on, 1000, 500);
          steps(off, 1000, 500);
          assert.equal(snap(on), snap(off), `second ${second}`);
          const entities = seen.combat()?.entities() ?? [];
          enemyPeak = Math.max(enemyPeak, entities.length);
          for (const e of entities) {
            const st = (e as unknown as { row: EnemyRow }).row.stage;
            if (stagesSeen[stagesSeen.length - 1] !== st) stagesSeen.push(st);
          }
        }
        assert.deepEqual(on.errors, []);
        assert.deepEqual(off.errors, []);
        assert.ok(enemyPeak > 0, 'enemies were on screen in the combat run');
        // The stages the enemies came from run in order from this stage: only a boss defeat
        // (never a hero event) moves on, and after Stage 10 (the last) it wraps to Stage 1.
        assert.equal(stagesSeen[0], stage, `stage ${stage} enemies fought first`);
        stagesSeen.forEach((st, i) => {
          if (i > 0) assert.equal(st, (stagesSeen[i - 1]! % STAGES.length) + 1, stagesSeen.join());
        });
      });
    }
  }
});

void describe('per stage: a boss fight and the stage swap that follows touch no hero', () => {
  for (const stage of STAGE_INDEXES) {
    void it(`stage ${stage}: eight working heroes through the boss walk-in, intro, both phases, defeat, hold, fade, and swap`, () => {
      const reports: Progress[] = [];
      const log = heroLog();
      const rig = stageRig(stage, HARD, {
        heroFactory: log.factory,
        deps: { onProgress: (p) => void reports.push(p) },
      });
      const seen = spyCombat();
      for (let i = 0; i < 8; i++) feed(rig, agent(`h${i}`, 'working', 'Edit', i + 1));
      rig.game.step();
      const before = snap(rig);
      const bossRows = new Set<string>();
      const limit = Math.round(900_000 / STEP_MS);
      for (let i = 0; i < limit && !reports.some((r) => r.bossesDefeated >= 1); i++) {
        rig.game.step();
        if (i % 30 === 0) rig.game.render(rig.surface);
        for (const e of seen.combat()?.entities() ?? []) {
          if (e instanceof Boss) {
            bossRows.add((e as unknown as { row: EnemyRow }).row.id);
          }
        }
      }
      assert.ok(
        reports.some((r) => r.bossesDefeated >= 1),
        'the boss fell',
      );
      assert.deepEqual([...bossRows], [BOSS_BY_STAGE[stage - 1]]);
      // The hold and the fade after the defeat.
      steps(rig, 6_000, 500);
      assert.equal(snap(rig), before);
      const last = reports[reports.length - 1]!;
      assert.equal(last.stageIndex, stage === LAST_STAGE ? 1 : stage + 1);
      assert.equal(last.cycle, stage === LAST_STAGE ? 1 : 0);
      assert.deepEqual(rig.errors, []);
      assert.equal(log.made.length, 8, 'no hero was ever recreated');
    });
  }
});

void describe('a 1 to 2 to ... to 10 to 1 sequence (boss defeats, holds, fades, wrap, cycle + 1)', () => {
  const trace = (
    muteBoard: boolean,
  ): { rows: string[]; stages: number[]; cycles: number[]; flashes: number } => {
    let flashes = 0;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
    const flash = HitReactions.prototype.flash;
    HitReactions.prototype.flash = function (
      this: HitReactions,
      ...args: Parameters<HitReactions['flash']>
    ) {
      flashes += 1;
      if (!muteBoard) flash.apply(this, args);
    };
    try {
      const reports: Progress[] = [];
      const log = heroLog();
      const rig = gameRig({
        seed: 31,
        heroFactory: log.factory,
        deps: { onProgress: (p) => void reports.push(p) },
      });
      rig.game.applyConfig(HARD);
      for (let i = 0; i < 8; i++) feed(rig, agent(`h${i}`, 'working', 'Edit', i + 1));
      const rows: string[] = [];
      const ids = Array.from({ length: 8 }, (_, i) => `h${i}`);
      const limit = Math.round(3_600_000 / 1000);
      let afterWrap = 0;
      for (let second = 0; second < limit; second++) {
        steps(rig, 1000, 500);
        rows.push(
          ids
            .map((id) => {
              const h = log.byId(id);
              return [h.id, h.lifecycle, h.phase, h.x, h.y, h.exiting, h.slot, h.classId].join(':');
            })
            .join('|'),
        );
        const last = reports[reports.length - 1];
        if (last !== undefined && last.cycle >= 1) afterWrap += 1;
        if (afterWrap >= 30) break;
      }
      assert.deepEqual(rig.errors, []);
      assert.equal(log.made.length, 8, 'no hero was removed or recreated');
      return {
        rows,
        stages: reports.map((r) => r.stageIndex),
        cycles: reports.map((r) => r.cycle),
        flashes,
      };
    } finally {
      HitReactions.prototype.flash = flash;
    }
  };

  void it('visits the stages in order, wraps with cycle + 1, and every hero x, y, phase, lifecycle, and class is unchanged by the reaction board throughout', () => {
    const live = trace(false);
    const muted = trace(true);
    const order = live.stages.filter((s, i) => i === 0 || s !== live.stages[i - 1]);
    assert.equal(LAST_STAGE, 10);
    assert.deepEqual(order.slice(0, 11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1]);
    assert.equal(live.cycles[live.cycles.length - 1], 1);
    assert.ok(live.cycles.slice(0, live.stages.indexOf(LAST_STAGE) + 1).every((c) => c === 0));
    assert.ok(live.flashes > 20 && muted.flashes > 20, `enemy attacks landed (${live.flashes})`);
    assert.deepEqual(live.rows, muted.rows);
    // Lifecycle never left working for any hero over the whole sequence.
    for (const row of live.rows) {
      for (const hero of row.split('|')) assert.match(hero, /^h\d:working:/);
    }
  });
});

void describe('per stage: fighters only (the reaction board and summons)', () => {
  for (const stage of STAGE_INDEXES) {
    void it(`stage ${stage}: a wave of this stage flashes only fighter slots, never a non-fighter, and every enemy is of this stage`, () => {
      const rig = makeCombat({ fighters: 6, stage, seed: 5, config: { maxEnemies: 6 } });
      const flashed = new Set<number>();
      for (let i = 0; i < 60 * 40; i++) {
        rig.step(STEP_MS);
        for (const e of rig.enemies()) {
          assert.equal((e as unknown as { row: EnemyRow }).row.stage, stage);
        }
        for (let slot = 0; slot < 64; slot++) {
          if (rig.reactions.flashing(slot)) flashed.add(slot);
        }
      }
      assert.ok(flashed.size > 0, 'enemies attacked');
      for (const slot of flashed) assert.ok(slot < 6, `slot ${slot} is not a fighter`);
      assert.deepEqual(rig.errors, []);
    });

    void it(`stage ${stage}: summons raised in the world are never in the enemy list`, () => {
      const rig = makeCombat({ fighters: 2, stage, seed: 5 });
      for (const kind of ['skeleton', 'beast', 'turret'] as const) {
        rig.world.summons.raise(kind === 'skeleton' ? 0 : 1, kind, 120, 150, true);
      }
      rig.step(30_000);
      assert.ok(rig.combat.entities().every((e) => e instanceof Enemy));
      for (let slot = 2; slot < 64; slot++) assert.equal(rig.reactions.flashing(slot), false);
    });
  }
});

void describe('faults on the later stages never touch a hero (invariant 4)', () => {
  const faults: { name: string; stages: readonly number[]; arm: () => void }[] = [
    {
      name: 'Ambience.update (bubbles, fog, fireflies, embers, snow, murk, shimmer, rifts)',
      stages: [3, 4, 5, 6, 7, 8, 9, 10],
      arm: () =>
        patch(Ambience.prototype, 'update', () => {
          throw new Error('ambience boom');
        }),
    },
    {
      name: 'Enemy.draw of a Stage 3 to 10 enemy',
      stages: [3, 4, 5, 6, 7, 8, 9, 10],
      arm: () => {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
        const original = Enemy.prototype.draw;
        patch(Enemy.prototype, 'draw', function (this: Enemy, ...args: Parameters<Enemy['draw']>) {
          if ((this as unknown as { row: EnemyRow }).row.stage >= 3) {
            throw new Error('enemy draw boom');
          }
          original.apply(this, args);
        });
      },
    },
  ];
  for (const fault of faults) {
    for (const stage of fault.stages) {
      for (const n of [1, 8, 32, 64]) {
        void it(`${fault.name} throws every time (stage ${stage}, ${n} heroes): snapshot unchanged, errors reported, the scene still draws`, () => {
          fault.arm();
          const rig = stageRig(stage, HARD);
          for (let i = 0; i < n; i++) {
            const state: AgentState = i % 3 === 2 ? 'idle' : 'working';
            feed(rig, agent(`h${i}`, state, state === 'working' ? 'Edit' : null, i + 1));
          }
          rig.game.step();
          const before = snap(rig);
          for (let i = 0; i < 60 * 45; i++) rig.game.frame(STEP_MS, rig.surface);
          assert.equal(snap(rig), before);
          assert.equal(rig.game.heroSnapshot().length, n);
          assert.ok(rig.errors.length >= 1, 'the fault was reported');
          for (const e of rig.errors) {
            assert.doesNotMatch(String((e.error as Error).message), /h\d|Edit|Agent/);
          }
          rig.surface.reset();
          rig.surface.record = true;
          rig.game.frame(STEP_MS, rig.surface);
          assert.ok(rig.surface.bitmapDraws > 3, 'the scene still draws');
        });
      }
    }
  }

  for (const stage of [3, 5, 6, 7, 8, 9, 10]) {
    void it(`a throwing ambient does not stop combat or progress on stage ${stage}: kills still count`, () => {
      patch(Ambience.prototype, 'update', () => {
        throw new Error('ambience boom');
      });
      const reports: Progress[] = [];
      const rig = stageRig(stage, HARD, { deps: { onProgress: (p) => void reports.push(p) } });
      for (let i = 0; i < 4; i++) feed(rig, agent(`h${i}`, 'working', 'Edit', i + 1));
      steps(rig, 60_000, 500);
      assert.ok(rig.errors.length > 0);
      assert.deepEqual(
        rig.game.heroSnapshot().map((h) => h.lifecycle),
        ['working', 'working', 'working', 'working'],
      );
    });
  }
});
