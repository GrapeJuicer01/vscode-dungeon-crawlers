// Fixtures for the E1 combat suites: a Combat wired to real pieces (Progression, HitReactions,
// FighterBuffer, a hand-built World from classRig) with a scripted party, so wave sizing, strike
// counting, the boss flow, and withdrawal can be driven one 60 Hz step at a time. The engine is
// DOM-free, so no canvas is involved; art is SHIPPED_ART on fake bitmaps.
import { Combat } from '../../src/game/Combat';
import type { CombatConfig, CombatEvents } from '../../src/game/Combat';
import { ENEMIES } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import { ENGINE_SEED, STEP_MS } from '../../src/game/data/tuning';
import { Boss } from '../../src/game/entities/Boss';
import { Enemy } from '../../src/game/entities/Enemy';
import { FighterBuffer } from '../../src/game/Fighters';
import { HitReactions } from '../../src/game/HitReactions';
import { Progression } from '../../src/game/Progression';
import { mulberry32 } from '../../src/game/rng';
import { MAX_AGENTS } from '../../src/shared/protocol';
import { makeWorld } from './classRig';
import type { ClassWorld } from './classRig';

export interface ScriptedFighter {
  slot: number;
  x: number;
  y: number;
  strike: number;
  ability: number;
}

export interface CombatRig {
  readonly combat: Combat;
  readonly world: ClassWorld;
  readonly reactions: HitReactions;
  readonly progression: Progression;
  readonly fighters: FighterBuffer;
  /** Every onProgress(urgent) call, in order. */
  readonly progressCalls: boolean[];
  /** How many times onStageClear fired. */
  stageClears: number;
  /** Errors Combat reported through its sink. */
  readonly errors: unknown[];
  /** The scripted party; edit it, then step(). */
  party: ScriptedFighter[];
  /** Pushes the party into the buffer and runs `ms` of combat steps; serials are left as they are. */
  step(ms: number): void;
  /** One step with every fighter's strike serial bumped by `perStep` first (hammering). */
  hammer(ms: number, perStep?: number): void;
  /** Steps (hammering lightly is NOT done) until `done()` or `limitMs`; returns whether it was met. */
  until(done: () => boolean, limitMs: number): boolean;
  enemies(): Enemy[];
  /** The live regular enemies (not the boss). */
  regulars(): Enemy[];
  boss(): Boss | undefined;
}

export interface CombatRigOptions {
  readonly rows?: readonly EnemyRow[];
  readonly enabled?: boolean;
  readonly config?: Partial<CombatConfig>;
  readonly stage?: number;
  readonly fighters?: number;
  readonly seed?: number;
  readonly stageCount?: number;
}

/** `n` fighters in a row from x = 100, slots 0..n-1, ready to be stepped. */
export function party(n: number, fromX = 100): ScriptedFighter[] {
  return Array.from({ length: n }, (_, i) => ({
    slot: i,
    x: fromX + i * 12,
    y: 150,
    strike: 0,
    ability: 0,
  }));
}

export function makeCombat(options: CombatRigOptions = {}): CombatRig {
  const world = makeWorld();
  const reactions = new HitReactions(MAX_AGENTS);
  const progression = new Progression(options.stageCount ?? STAGES.length);
  const fighters = new FighterBuffer(MAX_AGENTS);
  const progressCalls: boolean[] = [];
  const errors: unknown[] = [];
  const state = { stageClears: 0 };
  const events: CombatEvents = {
    onStageClear: () => {
      state.stageClears += 1;
    },
    onProgress: (urgent) => {
      progressCalls.push(urgent);
    },
  };
  const combat = new Combat(
    options.rows ?? ENEMIES,
    mulberry32(options.seed ?? ENGINE_SEED),
    reactions,
    progression,
    events,
    options.enabled ?? true,
    (error) => {
      errors.push(error);
    },
  );
  const def = STAGES[(options.stage ?? 1) - 1];
  if (def === undefined) {
    throw new RangeError('no such stage');
  }
  combat.setStage(def);
  combat.configure({
    enabled: options.config?.enabled ?? true,
    killsPerStage: options.config?.killsPerStage ?? 30,
    maxEnemies: options.config?.maxEnemies ?? 6,
  });
  const rig: CombatRig = {
    combat,
    world,
    reactions,
    progression,
    fighters,
    progressCalls,
    get stageClears() {
      return state.stageClears;
    },
    set stageClears(value: number) {
      state.stageClears = value;
    },
    errors,
    party: party(options.fighters ?? 0),
    step(ms: number): void {
      const steps = Math.max(1, Math.round(ms / STEP_MS));
      for (let i = 0; i < steps; i++) {
        fighters.clear();
        for (const f of rig.party) {
          fighters.push(f.slot, f.x, f.y, f.strike, f.ability);
        }
        combat.update(STEP_MS, world.world, fighters);
        reactions.update(STEP_MS);
        world.particles.update(STEP_MS);
      }
    },
    hammer(ms: number, perStep = 2): void {
      const steps = Math.max(1, Math.round(ms / STEP_MS));
      for (let i = 0; i < steps; i++) {
        for (const f of rig.party) {
          f.strike += perStep;
        }
        rig.step(STEP_MS);
      }
    },
    until(done: () => boolean, limitMs: number): boolean {
      const steps = Math.round(limitMs / STEP_MS);
      for (let i = 0; i < steps; i++) {
        if (done()) {
          return true;
        }
        rig.step(STEP_MS);
      }
      return done();
    },
    enemies: () => combat.entities().filter((e): e is Enemy => e instanceof Enemy),
    regulars: () =>
      combat.entities().filter((e): e is Enemy => e instanceof Enemy && !(e instanceof Boss)),
    boss: () => combat.entities().find((e): e is Boss => e instanceof Boss),
  };
  return rig;
}

/** Steps until at least `count` enemies stand engaged (waits for the wave to walk in). */
export function untilEngaged(rig: CombatRig, count: number, limitMs = 20_000): boolean {
  return rig.until(() => rig.enemies().filter((e) => e.isEngaged).length >= count, limitMs);
}
