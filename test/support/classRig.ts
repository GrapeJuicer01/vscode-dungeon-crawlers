// Fixtures for the H1 class suites: a hand-built World with a controllable engagement, so a
// single hero (or a Roster) can be driven update by update, plus art-set variants and helpers
// that pick session ids of a given class. Shipped art on fake bitmaps; no DOM.
import { classFor } from '../../src/game/data/classMap';
import { CLASS_IDS } from '../../src/game/data/classes';
import type { ClassId } from '../../src/game/data/classes';
import { STAGES } from '../../src/game/data/stages';
import {
  EFFECT_CAPACITY,
  ENGINE_SEED,
  PARTICLE_CAPACITY,
  STEP_MS,
  SUMMON_CAPACITY,
} from '../../src/game/data/tuning';
import { EffectPool } from '../../src/game/Effects';
import { HitReactions } from '../../src/game/HitReactions';
import { Camera } from '../../src/game/Camera';
import { MAX_AGENTS } from '../../src/shared/protocol';
import type { DrawContext } from '../../src/game/entities/Entity';
import type { Surface } from '../../src/game/ports';
import { Campfire } from '../../src/game/entities/Campfire';
import type { World } from '../../src/game/entities/Entity';
import type { Engagement } from '../../src/game/Engagement';
import { Particles } from '../../src/game/Particles';
import { SummonPool } from '../../src/game/Summons';
import { mulberry32 } from '../../src/game/rng';
import { lookFor } from '../../src/game/Roster';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import { buildStage } from '../../src/game/Stage';
import type { AgentInfo, AgentState } from '../../src/shared/protocol';
import { FakeBitmaps } from './engineFakes';

/** An engagement the test flips by hand. */
export class ManualEngagement implements Engagement {
  engaged = false;
  update(): void {
    // Driven by the test.
  }
  get scrollPxPerS(): number {
    return 0;
  }
  get isEngaged(): boolean {
    return this.engaged;
  }
}

export interface SpawnRecord {
  readonly effect: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly lifeMs: number;
  readonly flipX: boolean;
  readonly accepted: boolean;
}

export interface ClassWorld {
  readonly world: World;
  readonly bitmaps: FakeBitmaps;
  readonly engagement: ManualEngagement;
  readonly effects: EffectPool;
  readonly particles: Particles;
  readonly summons: SummonPool;
  /** The cosmetic reaction board Hero.draw reads (E1); empty unless a test flashes a slot. */
  readonly reactions: HitReactions;
  /** Every EffectPool.spawn call on this world, in order. */
  readonly spawns: SpawnRecord[];
}

/** Art identical to the shipped art but with no class layers or class palettes (fallback look). */
export function artWithoutClasses(): ArtSet {
  return { ...SHIPPED_ART, classLayers: {}, classPalettes: {} };
}

/** Shipped art with no effect templates (effect draws are skipped). */
export function artWithoutEffects(): ArtSet {
  return { ...SHIPPED_ART, effects: {} };
}

/** `stageIndex` is 1-based (E2: the same world, built for any shipped stage). */
export function makeWorld(
  art: ArtSet = SHIPPED_ART,
  seed: number = ENGINE_SEED,
  stageIndex = 1,
): ClassWorld {
  const bitmaps = new FakeBitmaps();
  bitmaps.recordOffscreen = false;
  const cache = new SpriteCache(bitmaps, art);
  const rng = mulberry32(seed);
  const stage = STAGES[stageIndex - 1];
  if (stage === undefined) {
    throw new Error('no stage');
  }
  const sheets = art.campfire;
  const campfire = new Campfire({
    logs: cache.sheet(sheets.logs),
    flameSmall: cache.sheet(sheets.flameSmall),
    flameLarge: cache.sheet(sheets.flameLarge),
  });
  const particles = new Particles(PARTICLE_CAPACITY, rng);
  const effects = new EffectPool(EFFECT_CAPACITY);
  const summons = new SummonPool(SUMMON_CAPACITY);
  const spawns: SpawnRecord[] = [];
  const original = effects.spawn.bind(effects);
  effects.spawn = (effect, x, y, vx, vy, lifeMs, flipX): boolean => {
    const accepted = original(effect, x, y, vx, vy, lifeMs, flipX);
    spawns.push({ effect, x, y, vx, vy, lifeMs, flipX, accepted });
    return accepted;
  };
  const engagement = new ManualEngagement();
  const world: World = {
    stage: buildStage(stage, art, cache, bitmaps),
    campfire,
    particles,
    effects,
    summons,
    engagement,
    rng,
    cache,
  };
  return {
    world,
    bitmaps,
    engagement,
    effects,
    particles,
    summons,
    reactions: new HitReactions(MAX_AGENTS),
    spawns,
  };
}

/** The context Renderer hands every entity's draw (E1 added the reaction board). */
export function drawContext(
  surface: Surface,
  w: ClassWorld,
  camera: Camera = new Camera(),
): DrawContext {
  return { surface, camera, world: w.world, reactions: w.reactions };
}

/** One 60 Hz step of the pieces a hero test needs besides the hero itself. */
export function stepWorld(w: ClassWorld): void {
  w.effects.update(STEP_MS, w.particles);
  w.summons.update(STEP_MS, w.world);
  w.particles.update(STEP_MS);
}

export function info(id: string, state: AgentState, timestamp = 1): AgentInfo {
  return { id, name: `Agent ${id}`, state, toolName: null, timestamp };
}

/** The first `count` ids of the form `${prefix}${n}` whose class is `classId`. */
export function idsOfClass(classId: ClassId, count: number, prefix = 'c-'): string[] {
  const out: string[] = [];
  for (let n = 0; out.length < count; n++) {
    const id = `${prefix}${n}`;
    if (classFor(id) === classId) {
      out.push(id);
    }
  }
  return out;
}

/** `n` ids whose classes cycle through all twelve classes, so every class appears once n >= 8. */
export function mixedIds(n: number, prefix = 'm-'): string[] {
  const perClass = CLASS_IDS.map((c) => idsOfClass(c, Math.ceil(n / CLASS_IDS.length), prefix));
  return Array.from(
    { length: n },
    (_, i) => perClass[i % CLASS_IDS.length]?.[Math.floor(i / CLASS_IDS.length)] ?? '',
  );
}

/**
 * Agent state for the i-th hero of a mixed party. The class cycle has period 12, a multiple of 3,
 * so a plain `i % 3` would tie every class to one state and only four classes would ever fight.
 * Round 0 uses `p % 3`, round 1 makes all but every third class work, round 2 shifts by one; so
 * with 32 or more heroes every class has at least one working hero and all three states appear.
 */
export function partyState(i: number): AgentState {
  const states: readonly AgentState[] = ['working', 'spawned', 'idle'];
  const p = i % CLASS_IDS.length;
  const round = Math.floor(i / CLASS_IDS.length) % 3;
  if (round === 0) return states[p % 3] ?? 'idle';
  if (round === 1) return p % 3 === 0 ? 'idle' : 'working';
  return states[(p + 1) % 3] ?? 'idle';
}

export { lookFor };

export interface BitmapTracker {
  /** Every frame bitmap SpriteCache.hero returned (heroes of any look). */
  readonly hero: Set<unknown>;
  /** Every frame bitmap SpriteCache.effect returned. */
  readonly effect: Set<unknown>;
  restore(): void;
}

/**
 * Patches SpriteCache so a test can tell hero and effect bitmaps apart in a draw log (counting
 * "every fromRgba after the first frame" would also count lazily built effect sheets). The caller
 * must call restore(), normally from afterEach.
 */
export function trackBitmaps(): BitmapTracker {
  const hero = new Set<unknown>();
  const effect = new Set<unknown>();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const originalHero = SpriteCache.prototype.hero;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wrapped and applied with `this`
  const originalEffect = SpriteCache.prototype.effect;
  SpriteCache.prototype.hero = function (
    this: SpriteCache,
    ...args: Parameters<typeof originalHero>
  ) {
    const sprites = originalHero.apply(this, args);
    for (const set of Object.values(sprites)) {
      for (const frame of set.frames) {
        hero.add(frame);
      }
    }
    return sprites;
  };
  SpriteCache.prototype.effect = function (
    this: SpriteCache,
    ...args: Parameters<typeof originalEffect>
  ) {
    const set = originalEffect.apply(this, args);
    if (set !== null) {
      for (const frame of set.frames) {
        effect.add(frame);
      }
    }
    return set;
  };
  return {
    hero,
    effect,
    restore(): void {
      SpriteCache.prototype.hero = originalHero;
      SpriteCache.prototype.effect = originalEffect;
    },
  };
}
