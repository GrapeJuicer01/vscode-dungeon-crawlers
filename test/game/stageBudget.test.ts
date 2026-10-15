// E2 plan test notes 5 and 9: the E1 draw ceilings (200 bitmap draws, 520 fills) and the node CPU
// benchmark, run once per stage. The engineered worst case fills every pool at once in that
// stage's world with that stage's enemies and all twelve particle kinds; the real-game runs use
// hard combat from the stage's stored progress. Real numbers are printed as diagnostics.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Camera } from '../../src/game/Camera';
import { DROP_CAPACITY } from '../../src/game/data/drops';
import { EFFECT_IDS } from '../../src/game/data/effects';
import { ENEMIES } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import {
  EFFECT_CAPACITY,
  ENEMY_CAPACITY,
  PARTICLE_CAPACITY,
  STEP_MS,
  SUMMON_CAPACITY,
} from '../../src/game/data/tuning';
import { Hero } from '../../src/game/entities/Hero';
import { Enemy } from '../../src/game/entities/Enemy';
import { Drops } from '../../src/game/Drops';
import { HitReactions } from '../../src/game/HitReactions';
import type { ParticleKind } from '../../src/game/Particles';
import { Renderer } from '../../src/game/Renderer';
import type { RenderExtras } from '../../src/game/Renderer';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { DEFAULT_PROGRESS } from '../../src/shared/progress';
import { info, lookFor, makeWorld, mixedIds } from '../support/classRig';
import { RecordingSurface, agent, feed, gameRig, run } from '../support/engineFakes';
import type { GameRig } from '../support/engineFakes';

const MAX_BITMAPS = 200;
const MAX_FILLS = 520;
const KINDS: ParticleKind[] = [
  'ember',
  'spark',
  'drip',
  'splash',
  'mote',
  'bubble',
  'wisp',
  'firefly',
  'snow',
  'murk',
  'shimmer',
  'rift',
];

function worstFrame(stage: number): { bitmaps: number; fills: number } {
  const w = makeWorld(SHIPPED_ART, undefined, stage);
  const renderer = new Renderer(w.bitmaps, SHIPPED_ART, () => undefined);
  const heroes: Hero[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `h${i}`;
    const hero = new Hero({
      info: info(id, i % 2 === 0 ? 'working' : 'idle'),
      slot: i,
      instant: true,
      look: lookFor(id),
    });
    hero.update(STEP_MS, w.world);
    heroes.push(hero);
  }
  const mine = ENEMIES.filter((r) => r.stage === stage && r.tier !== 'boss');
  const foes: Enemy[] = [];
  for (let i = 0; i < ENEMY_CAPACITY; i++) {
    const row = mine[i % mine.length] as EnemyRow;
    const e = new Enemy();
    e.begin(row, stage, 200 + i * 5, 156 - 5 * (i % 4));
    e.setStand(200 + i * 5);
    e.update(STEP_MS, w.world);
    e.strike(1);
    foes.push(e);
  }
  const drops = new Drops();
  for (let i = 0; i < DROP_CAPACITY; i++) {
    drops.spawn(['coin', 'gem', 'ore', 'chest'][i % 4] as 'coin', 150 + i * 6, 150, 3);
  }
  for (let i = 0; i < EFFECT_CAPACITY; i++) {
    w.effects.spawn(
      EFFECT_IDS[i % EFFECT_IDS.length] as never,
      100 + i * 4,
      120,
      0,
      0,
      5000,
      false,
    );
  }
  for (let i = 0; i < SUMMON_CAPACITY; i++) {
    w.summons.raise(
      i,
      (['skeleton', 'beast', 'turret'] as const)[i % 3] as 'skeleton',
      120 + i * 10,
      150,
      true,
    );
  }
  for (let i = 0; i < PARTICLE_CAPACITY; i++) {
    w.particles.emit(KINDS[i % KINDS.length]!, 100 + (i % 200), 100 + (i % 50), 0, 0, 5000);
  }
  for (let i = 0; i < 20; i++) {
    w.effects.update(STEP_MS, w.particles);
    w.summons.update(STEP_MS, w.world);
  }
  const extras: RenderExtras = {
    foes,
    reactions: new HitReactions(64),
    drops: (surface, cache) => drops.draw(surface, cache),
    fadeAlpha: 0.5,
  };
  for (let i = 0; i < 8; i++) extras.reactions.flash(i, -1, true);
  const surface = new RecordingSurface();
  surface.record = true;
  renderer.render(surface, w.world, heroes, new Camera(), extras);
  assert.equal(w.particles.count, PARTICLE_CAPACITY, 'the particle pool is full');
  return { bitmaps: surface.bitmapDraws, fills: surface.count('fillRect') };
}

function stageParty(stage: number, n: number): GameRig {
  const rig = gameRig();
  rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stage });
  rig.game.applyConfig({ enemiesEnabled: true, killsPerStage: 5, maxEnemies: 12 });
  mixedIds(n).forEach((id) => feed(rig, agent(id, 'working')));
  return rig;
}

void describe('per-stage draw ceilings: 200 bitmap draws and 520 fills', () => {
  for (const def of STAGES) {
    void it(`stage ${def.index} (${def.id}): the engineered worst case fits`, (t) => {
      const worst = worstFrame(def.index);
      t.diagnostic(`stage ${def.index} engineered worst case: ${JSON.stringify(worst)}`);
      assert.ok(worst.bitmaps <= MAX_BITMAPS, `${worst.bitmaps} bitmap draws`);
      assert.ok(worst.fills <= MAX_FILLS, `${worst.fills} fills`);
    });

    void it(`stage ${def.index}: 8 heroes under hard combat (waves, boss, ambient) stay within the ceilings over 90 simulated seconds`, (t) => {
      const rig = stageParty(def.index, 8);
      run(rig, 12_000);
      const worst = { bitmaps: 0, fills: 0 };
      for (let i = 0; i < 60 * 90; i++) {
        rig.surface.reset();
        rig.game.frame(STEP_MS, rig.surface);
        worst.bitmaps = Math.max(worst.bitmaps, rig.surface.bitmapDraws);
        worst.fills = Math.max(worst.fills, rig.surface.count('fillRect'));
      }
      t.diagnostic(`stage ${def.index}, 8 heroes, hard combat: ${JSON.stringify(worst)}`);
      assert.ok(worst.bitmaps <= MAX_BITMAPS, `${worst.bitmaps} bitmap draws`);
      assert.ok(worst.fills <= MAX_FILLS, `${worst.fills} fills`);
      assert.deepEqual(rig.errors, []);
    });
  }
});

void describe('the ambients reach the screen through the renderer colour map', () => {
  /** Colours of every fillRect of a given size over 12 simulated seconds. */
  function colorsOfSize(stage: number, w: number, h: number): Set<string> {
    const rig = gameRig({ record: true });
    rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stage });
    rig.game.applyConfig({ enemiesEnabled: false, killsPerStage: 5, maxEnemies: 6 });
    feed(rig, agent('solo', 'working'));
    const out = new Set<string>();
    for (let i = 0; i < 60 * 12; i++) {
      rig.surface.reset();
      rig.game.frame(STEP_MS, rig.surface);
      for (const c of rig.surface.calls) {
        if (c.method === 'fillRect' && c.args[3] === w && c.args[4] === h)
          out.add(String(c.args[0]));
      }
    }
    return out;
  }
  const css = (kind: 'bubble' | 'wisp'): string[] =>
    SHIPPED_ART.particlePalette[kind].map((ch) => SHIPPED_ART.palette[ch] ?? '#ffffff');

  void it('Stage 3 draws 2x2 rects in the bubble ramp; Stage 4 draws 6x2 rects in the wisp ramp', () => {
    const bubbles = colorsOfSize(3, 2, 2);
    assert.ok(bubbles.size > 0, 'bubbles were drawn');
    for (const c of bubbles) assert.ok(css('bubble').includes(c), c);
    const wisps = colorsOfSize(4, 6, 2);
    assert.ok(wisps.size > 0, 'wisps were drawn');
    for (const c of wisps) assert.ok(css('wisp').includes(c), c);
  });

  void it('Stage 1 and Stage 2 draw no bubble or wisp rectangles', () => {
    for (const stage of [1, 2]) {
      const fills = colorsOfSize(stage, 6, 2);
      for (const c of fills) assert.ok(!css('wisp').includes(c), `stage ${stage}: ${c}`);
    }
  });
});

void describe('the E3 ambients reach the screen through the renderer colour map', () => {
  const lime = SHIPPED_ART.palette[SHIPPED_ART.particlePalette.firefly[2]!];

  /** Whether any 1x1 fillRect of the colour is drawn in 12 simulated seconds. */
  function draws1x1(stage: number, color: string | undefined): boolean {
    const rig = gameRig({ record: true });
    rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stage });
    rig.game.applyConfig({ enemiesEnabled: false, killsPerStage: 5, maxEnemies: 6 });
    feed(rig, agent('solo', 'working'));
    for (let i = 0; i < 60 * 12; i++) {
      rig.surface.reset();
      rig.game.frame(STEP_MS, rig.surface);
      for (const c of rig.surface.calls) {
        if (c.method === 'fillRect' && c.args[3] === 1 && c.args[4] === 1 && c.args[0] === color) {
          return true;
        }
      }
    }
    return false;
  }

  void it('Stage 5 draws 1x1 rects in the firefly ramp (lime step); no other stage does', () => {
    assert.ok(lime !== undefined);
    assert.equal(draws1x1(5, lime), true, 'fireflies were drawn');
    for (const stage of [1, 2, 3, 4, 6])
      assert.equal(draws1x1(stage, lime), false, `stage ${stage}`);
  });

  void it('Stage 6 draws 1x1 rects in the ember ramp (dark red step) and no firefly colour', () => {
    const ember = SHIPPED_ART.palette[SHIPPED_ART.particlePalette.ember[3]!];
    assert.equal(draws1x1(6, ember), true, 'embers were drawn');
    assert.equal(draws1x1(6, lime), false);
  });
});

void describe('the E4 ambients reach the screen through the renderer colour map', () => {
  const css = (kind: 'snow' | 'murk'): string[] =>
    SHIPPED_ART.particlePalette[kind].map((ch) => SHIPPED_ART.palette[ch] ?? '#ffffff');

  /** Colours of every fillRect of a given size in 15 simulated seconds on one stage (no enemies). */
  function colorsOfSize(stage: number, side: number): Set<string> {
    const rig = gameRig({ record: true });
    rig.game.applyProgress({ ...DEFAULT_PROGRESS, stageIndex: stage });
    rig.game.applyConfig({ enemiesEnabled: false, killsPerStage: 5, maxEnemies: 6 });
    feed(rig, agent('solo', 'working'));
    const out = new Set<string>();
    for (let i = 0; i < 60 * 15; i++) {
      rig.surface.reset();
      rig.game.frame(STEP_MS, rig.surface);
      for (const c of rig.surface.calls) {
        if (c.method === 'fillRect' && c.args[3] === side && c.args[4] === side)
          out.add(String(c.args[0]));
      }
    }
    return out;
  }

  void it('Stage 7 draws 1x1 rects in every step of the snow ramp', () => {
    const drawn = colorsOfSize(7, 1);
    for (const c of css('snow')) assert.ok(drawn.has(c), `snow step ${c} was drawn`);
  });

  void it('Stage 8 draws 2x2 rects, all of them in the murk ramp, and every murk step appears', () => {
    const drawn = colorsOfSize(8, 2);
    assert.ok(drawn.size > 0, 'murk motes were drawn');
    for (const c of drawn) assert.ok(css('murk').includes(c), `unexpected 2x2 colour ${c}`);
    for (const c of css('murk')) assert.ok(drawn.has(c), `murk step ${c} was drawn`);
  });

  void it('no stage before Stage 8 draws a 2x2 rect in a murk-only colour', () => {
    const others = new Set<string>(
      (['bubble', 'ember', 'spark', 'drip', 'splash', 'mote', 'wisp', 'firefly', 'snow'] as const)
        .flatMap((k) => SHIPPED_ART.particlePalette[k])
        .map((ch) => SHIPPED_ART.palette[ch] ?? '#ffffff'),
    );
    const murkOnly = css('murk').filter((c) => !others.has(c));
    assert.ok(murkOnly.length >= 1, 'the murk ramp has at least one step of its own');
    for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
      const drawn = colorsOfSize(stage, 2);
      for (const c of murkOnly) assert.ok(!drawn.has(c), `stage ${stage} drew ${c}`);
    }
  });
});

void describe('engine CPU cost per stage (counting surface, node; soft: fail above 4 ms average)', () => {
  for (const def of STAGES) {
    void it(`stage ${def.index}: 8 heroes with waves and a boss average under 4 ms per frame over 3 simulated minutes (target under 1 ms)`, (t) => {
      const rig = stageParty(def.index, 8);
      const frames = 60 * 180;
      let worst = 0;
      const start = process.hrtime.bigint();
      for (let i = 0; i < frames; i++) {
        const frameStart = process.hrtime.bigint();
        rig.game.frame(STEP_MS, rig.surface);
        const ms = Number(process.hrtime.bigint() - frameStart) / 1e6;
        if (i > 600 && ms > worst) worst = ms;
      }
      const avg = Number(process.hrtime.bigint() - start) / 1e6 / frames;
      t.diagnostic(
        `stage ${def.index}: average ${avg.toFixed(3)} ms per frame; worst steady frame ${worst.toFixed(2)} ms`,
      );
      assert.ok(avg < 4, `average ${avg} ms`);
      assert.deepEqual(rig.errors, []);
    });
  }
});
