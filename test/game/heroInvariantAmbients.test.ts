// THE HERO-INVARIANT TEST, E3 to E5 extension (Core invariants 1, 2, and 4; E3 plan test note 7b,
// E4 plan test note 7b, E5 plan test note 7): with the stage fixed at Stage 5 (fireflies, glow blooms),
// Stage 6 (embers, lava lights), Stage 7 (snow, ice lamps), Stage 8 (murk, wisp torches), Stage 9 (heat
// shimmer, braziers, gold veins), and Stage 10 (void rifts, rift lights, rings), a run with
// the ambients and lights at full density and a run with the ambient emitter silenced produce the
// same heroSnapshot sequence. Decoration is cosmetic; only host agent-state events move a hero.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Ambience } from '../../src/game/Ambience';
import { STAGES } from '../../src/game/data/stages';
import { STEP_MS } from '../../src/game/data/tuning';
import { mulberry32 } from '../../src/game/rng';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import type { AgentState } from '../../src/shared/protocol';
import { agent, feed, gameRig, steps } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

function silenceAmbience(): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored as the same function
  const original = Ambience.prototype.update;
  Ambience.prototype.update = (): void => undefined;
  restores.push(() => {
    Ambience.prototype.update = original;
  });
}

function rigAt(stage: number, enemies: boolean): GameRig {
  const rig = gameRig({ seed: 41, record: true });
  rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stage });
  rig.game.applyConfig({ enemiesEnabled: enemies, killsPerStage: 5, maxEnemies: 12 });
  return rig;
}

function drive(rig: GameRig, seed: number, n: number): string[] {
  const rng = mulberry32(seed);
  const rows: string[] = [];
  let clock = 2;
  for (let i = 0; i < n; i++) {
    feed(
      rig,
      agent(`h${i}`, i % 3 === 2 ? 'idle' : 'working', i % 3 === 2 ? null : 'Edit', clock++),
    );
  }
  for (let second = 0; second < 60; second++) {
    if (rng() < 0.5) {
      const id = `h${Math.floor(rng() * (n + 2))}`;
      const roll = rng();
      const state: AgentState = roll < 0.2 ? 'spawned' : roll < 0.6 ? 'working' : 'idle';
      feed(rig, agent(id, state, state === 'working' ? 'Edit' : null, clock++));
    }
    steps(rig, 1000, 500);
    // Render so the lights and the full particle pool are exercised in both runs.
    for (let f = 0; f < 6; f++) {
      rig.surface.reset();
      rig.game.frame(STEP_MS, rig.surface);
    }
    rows.push(JSON.stringify(rig.game.heroSnapshot()));
  }
  assert.deepEqual(rig.errors, []);
  return rows;
}

/**
 * Counts the particle-sized fills of one frame. Particles are the only 1x1 fills; Stage 8 murk motes
 * are 2x2 (E4), Stage 9 shimmer streaks 1x3 and Stage 10 rift slits 3x1 (E5), so each stage counts its
 * own size (the silenced run is the control).
 */
function fills(rig: GameRig, w: number, h: number): number {
  rig.surface.reset();
  rig.game.frame(STEP_MS, rig.surface);
  return rig.surface.calls.filter(
    (c) => c.method === 'fillRect' && c.args[3] === w && c.args[4] === h,
  ).length;
}

/** The size of the stage's ambient particle, width by height. */
const AMBIENT_SIZE: Readonly<Record<number, readonly [number, number]>> = {
  5: [1, 1],
  6: [1, 1],
  7: [1, 1],
  8: [2, 2],
  9: [1, 3],
  10: [3, 1],
};

void describe('Stages 5 to 10: ambients and lights never change a hero', () => {
  for (const stage of [5, 6, 7, 8, 9, 10]) {
    for (const n of [1, 8, 32]) {
      void it(`stage ${stage}, ${n} heroes, enemies off: identical heroSnapshot every second with the ambient emitter live and silenced`, () => {
        assert.equal(STAGES[stage - 1]?.index, stage);
        const live = rigAt(stage, false);
        const seed = 500 + stage * 10 + n;
        const a = drive(live, seed, n);
        const [pw, ph] = AMBIENT_SIZE[stage]!;
        const liveParticles = fills(live, pw, ph);
        silenceAmbience();
        const quiet = rigAt(stage, false);
        const b = drive(quiet, seed, n);
        const quietParticles = fills(quiet, pw, ph);
        assert.deepEqual(a, b);
        assert.ok(
          liveParticles > quietParticles,
          `${liveParticles} live vs ${quietParticles} silenced`,
        );
        assert.ok(liveParticles >= 5, 'the ambient was on screen');
      });

      void it(`stage ${stage}, ${n} heroes: ambients at full density plus combat (enemies on) leave the same heroSnapshot as heroes only`, () => {
        const withEnemies = rigAt(stage, true);
        const seed = 700 + stage * 10 + n;
        const a = drive(withEnemies, seed, n);
        silenceAmbience();
        const b = drive(rigAt(stage, false), seed, n);
        assert.deepEqual(a, b);
      });
    }
  }
});
