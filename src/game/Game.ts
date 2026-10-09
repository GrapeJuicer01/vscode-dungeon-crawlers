// The engine entry point (ADR 0008, ADR 0009). The webview host calls frame() once per animation
// frame; host events arrive through enqueueAgent/enqueueSnapshot. Nothing here can reach the
// host: the engine has no channel, only an error callback. Every step and render is wrapped in
// try/catch, so an engine bug can never affect agents (Core invariant 4).
import { isProgress } from '../shared/progress';
import type { Progress } from '../shared/progress';
import type { AgentInfo, AgentState } from '../shared/protocol';
import { Ambience } from './Ambience';
import { EffectPool } from './Effects';
import { Camera } from './Camera';
import { Combat } from './Combat';
import { ENEMIES, validateEnemies } from './data/enemies';
import type { EnemyRow } from './data/enemies';
import { FighterBuffer } from './Fighters';
import { HitReactions } from './HitReactions';
import { Progression } from './Progression';
import { StageDirector } from './StageDirector';
import { Campfire } from './entities/Campfire';
import { errorKey, guarded } from './entities/Entity';
import type { World } from './entities/Entity';
import { createHero } from './entities/ClassHero';
import type { HeroFactory } from './entities/Hero';
import { CombatEngagement, TimedEngagement } from './Engagement';
import type { StageDef } from './data/stages';
import {
  EVENT_QUEUE_CAP,
  EFFECT_CAPACITY,
  SUMMON_CAPACITY,
  MAX_FRAME_MS,
  MAX_STEPS_PER_FRAME,
  PARTICLE_CAPACITY,
  PROGRESS_WAIT_MS,
  STEP_MS,
} from './data/tuning';
import { Particles } from './Particles';
import type { BitmapFactory, ErrorSink, Surface } from './ports';
import { Renderer } from './Renderer';
import type { RenderExtras } from './Renderer';
import { Roster } from './Roster';
import { SummonPool } from './Summons';
import { mulberry32 } from './rng';
import { buildStage, validateStages } from './Stage';
import { SpriteCache } from './sprites/spriteFactory';
import type { ArtSet } from './sprites/spriteFactory';
import { MAX_AGENTS } from '../shared/protocol';

export interface AgentEventSink {
  enqueueAgent(agent: AgentInfo): void;
  enqueueSnapshot(agents: readonly AgentInfo[]): void;
}

/** The game settings the engine reads (a subset of the host's ConfigSnapshot). */
export interface GameConfig {
  readonly enemiesEnabled: boolean;
  readonly killsPerStage: number;
  readonly maxEnemies: number;
}

/** What SceneFeed hands the engine besides agent events (E1): the stored progress and settings. */
export interface GameSink extends AgentEventSink {
  /** Applied once per Game; later calls are ignored. */
  applyProgress(progress: Progress): void;
  applyConfig(config: GameConfig): void;
}

export interface GameDeps {
  readonly art: ArtSet;
  readonly stages: readonly StageDef[];
  readonly bitmaps: BitmapFactory;
  readonly onError: ErrorSink;
  readonly seed: number;
  /** The mirror's agents(), used only to resync after an event-queue overflow. */
  readonly agentSource: () => readonly AgentInfo[];
  /** Default is createHero (class heroes, H1); tests inject their own. */
  readonly heroFactory?: HeroFactory;
  /** Numbers only; called on a kill (urgent false) and a boss defeat (urgent true). Caught here. */
  readonly onProgress?: (progress: Progress, urgent: boolean) => void;
  /** True in the webview: draw nothing but the clear colour until progress arrives (or time runs out). */
  readonly awaitProgress?: boolean;
  /** The enemy table; default ENEMIES. Tests inject tables. */
  readonly enemies?: readonly EnemyRow[];
}

export interface HeroSnapshot {
  readonly id: string;
  readonly lifecycle: AgentState;
  readonly exiting: boolean;
  /** The cosmetic class; never changes for an id (H1). */
  readonly classId: string | null;
}

/** Distinct (scope, message) pairs reported per game; a bound so a bug cannot grow the set. */
const MAX_REPORTED = 64;

export class Game implements GameSink {
  readonly #deps: GameDeps;
  readonly #sink: ErrorSink;
  readonly #reported = new Set<string>();
  readonly #world: World;
  readonly #roster: Roster;
  readonly #renderer: Renderer;
  readonly #camera = new Camera();
  readonly #director: StageDirector;
  readonly #combat: Combat;
  readonly #progression: Progression;
  readonly #reactions = new HitReactions(MAX_AGENTS);
  readonly #fighters = new FighterBuffer(MAX_AGENTS);
  readonly #extras: RenderExtras;
  readonly #ambience = new Ambience();
  readonly #queue: (AgentInfo | undefined)[] = new Array<AgentInfo | undefined>(EVENT_QUEUE_CAP);
  #head = 0;
  #size = 0;
  #pendingSnapshot: readonly AgentInfo[] | null = null;
  #resync = false;
  #accumulatorMs = 0;
  #disposed = false;
  #awaiting: boolean;
  #gateMs = 0;
  #progressApplied = false;
  readonly #updateCampfire: () => void;
  readonly #dtHolder = { ms: 0 };

  /** Throws only on a boot failure (invalid stage data or missing art); the caller reports it. */
  constructor(deps: GameDeps) {
    this.#deps = deps;
    this.#sink = (error, scope) => {
      try {
        const key = `${scope}:${errorKey(error)}`;
        if (this.#reported.has(key) || this.#reported.size >= MAX_REPORTED) {
          return;
        }
        this.#reported.add(key);
        deps.onError(error, scope);
      } catch {
        // A failing reporter must never escape (Core invariant 4).
      }
    };
    if (validateStages(deps.stages, deps.art).length > 0) {
      throw new RangeError('Stage data is invalid');
    }
    const def = deps.stages[0];
    if (def === undefined) {
      throw new RangeError('No stages are defined');
    }
    this.#awaiting = deps.awaitProgress === true;
    const enemyRows = deps.enemies ?? ENEMIES;
    // An invalid enemy table never stops the game: report once, run with combat disabled.
    const enemiesValid = validateEnemies(enemyRows, deps.stages).length === 0;
    if (!enemiesValid) {
      this.#sink(new RangeError('Enemy data is invalid'), 'boot');
    }
    const cache = new SpriteCache(deps.bitmaps, deps.art);
    const rng = mulberry32(deps.seed);
    const campfireSprites = deps.art.campfire;
    const campfire = new Campfire({
      logs: cache.sheet(campfireSprites.logs),
      flameSmall: cache.sheet(campfireSprites.flameSmall),
      flameLarge: cache.sheet(campfireSprites.flameLarge),
    });
    this.#director = new StageDirector(
      (stageDef) => buildStage(stageDef, deps.art, cache, deps.bitmaps),
      deps.stages,
      (swapped) => this.#combat.setStage(swapped),
    );
    const director = this.#director;
    this.#progression = new Progression(deps.stages.length);
    this.#combat = new Combat(
      enemyRows,
      rng,
      this.#reactions,
      this.#progression,
      {
        onStageClear: () => director.begin(this.#progression.stageIndex),
        onProgress: (urgent) => this.#reportProgress(urgent),
      },
      enemiesValid,
      this.#sink,
    );
    this.#combat.setStage(def);
    this.#extras = {
      foes: this.#combat.entities(),
      reactions: this.#reactions,
      drops: (surface, spriteCache) => this.#combat.drawDrops(surface, spriteCache),
      fadeAlpha: 0,
    };
    this.#world = {
      // A getter, so the live stage follows the director (World keeps one readonly `stage`).
      get stage() {
        return director.runtime;
      },
      campfire,
      particles: new Particles(PARTICLE_CAPACITY, rng),
      effects: new EffectPool(EFFECT_CAPACITY),
      summons: new SummonPool(SUMMON_CAPACITY),
      engagement: new CombatEngagement(this.#combat, new TimedEngagement()),
      rng,
      cache,
    };
    this.#roster = new Roster(deps.heroFactory ?? createHero, this.#sink);
    this.#renderer = new Renderer(deps.bitmaps, deps.art, this.#sink);
    this.#updateCampfire = (): void => {
      this.#world.campfire.update(this.#dtHolder.ms, this.#world);
    };
  }

  /** Queues one host agent event for the next step. */
  enqueueAgent(agent: AgentInfo): void {
    if (this.#disposed) {
      return;
    }
    if (this.#size >= EVENT_QUEUE_CAP) {
      // Overflow: drop the backlog and rebuild from the mirror's list (which already holds
      // every event, since SceneFeed updates the mirror first).
      this.#clearQueue();
      this.#pendingSnapshot = null;
      this.#resync = true;
      return;
    }
    this.#queue[(this.#head + this.#size) % EVENT_QUEUE_CAP] = agent;
    this.#size++;
  }

  /** Replaces the backlog with one snapshot marker; applied as an instant rebuild. */
  enqueueSnapshot(agents: readonly AgentInfo[]): void {
    if (this.#disposed) {
      return;
    }
    this.#clearQueue();
    this.#resync = false;
    this.#pendingSnapshot = agents.slice();
  }

  /**
   * Loads the stored progress: stage, counters, and the matching stage runtime. Applied once per
   * Game; later calls are ignored. Assumption: a progress message arriving after the boot gate
   * timed out is still its first application, so it is applied (restoring the stored stage beats
   * playing on defaults). Neither this nor applyConfig touches the roster.
   */
  applyProgress(progress: Progress): void {
    if (this.#disposed || this.#progressApplied || !isProgress(progress)) {
      return;
    }
    this.#progressApplied = true;
    this.#awaiting = false;
    try {
      this.#progression.load(progress);
      this.#director.show(this.#progression.stageIndex);
      this.#combat.setStage(this.#director.runtime.def);
    } catch (error: unknown) {
      this.#sink(error, 'step');
    }
  }

  /** Applies the game settings (enemies on or off, kills per stage, enemy cap). */
  applyConfig(config: GameConfig): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.#combat.configure({
        enabled: config.enemiesEnabled,
        killsPerStage: config.killsPerStage,
        maxEnemies: config.maxEnemies,
      });
    } catch (error: unknown) {
      this.#sink(error, 'step');
    }
  }

  /** Accumulates, steps (at most MAX_STEPS_PER_FRAME), renders. Never throws. */
  frame(deltaMs: number, surface: Surface): void {
    if (this.#disposed) {
      return;
    }
    try {
      // NaN and negative deltas count as 0; Infinity and huge deltas clamp to MAX_FRAME_MS.
      const delta = deltaMs > 0 ? Math.min(deltaMs, MAX_FRAME_MS) : 0;
      this.#accumulatorMs += delta;
      let steps = 0;
      while (this.#accumulatorMs >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        this.step();
        this.#accumulatorMs -= STEP_MS;
        steps++;
      }
      if (this.#accumulatorMs >= STEP_MS) {
        // A long stall must not cause a burst of catch-up: drop the rest.
        this.#accumulatorMs = 0;
      }
    } catch (error: unknown) {
      this.#sink(error, 'step');
    }
    this.render(surface);
  }

  /** One fixed step (STEP_MS). Never throws. */
  step(): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.#drain();
      const world = this.#world;
      if (this.#awaiting) {
        this.#gateMs += STEP_MS;
        if (this.#gateMs >= PROGRESS_WAIT_MS) {
          // No progress arrived in time: run on the defaults.
          this.#awaiting = false;
        }
      }
      world.engagement.update(STEP_MS, this.#roster.countFighting());
      this.#camera.advance(STEP_MS, world.engagement.scrollPxPerS);
      this.#roster.update(STEP_MS, world);
      this.#updateCombat(world);
      this.#reactions.update(STEP_MS);
      world.campfire.setRestingCount(this.#roster.countResting());
      this.#dtHolder.ms = STEP_MS;
      guarded(world.campfire, 'update', this.#updateCampfire, this.#sink);
      this.#ambience.update(STEP_MS, world, this.#camera);
      world.particles.update(STEP_MS);
      this.#updateEffects(world);
      this.#updateSummons(world);
      this.#updateDirector();
      this.#renderer.advanceClock(STEP_MS);
    } catch (error: unknown) {
      this.#sink(error, 'step');
    }
  }

  /** Draws the current state. Never throws. */
  render(surface: Surface): void {
    if (this.#disposed) {
      return;
    }
    try {
      if (this.#awaiting) {
        // Boot gate: no one-frame flash of Stage 1 while the stored stage is still unknown.
        surface.setComposite('source-over');
        surface.setAlpha(1);
        surface.clear(this.#world.stage.clearColor);
        return;
      }
      this.#extras.fadeAlpha = this.#director.fadeAlpha;
      this.#renderer.render(
        surface,
        this.#world,
        this.#roster.heroes(),
        this.#camera,
        this.#extras,
      );
    } catch (error: unknown) {
      this.#sink(error, 'render');
      try {
        surface.setComposite('source-over');
        surface.setAlpha(1);
      } catch (inner: unknown) {
        this.#sink(inner, 'render');
      }
    }
  }

  /** Read-only observation of every hero, for tests and dev tooling. */
  heroSnapshot(): readonly HeroSnapshot[] {
    return this.#roster.heroes().map((hero) => ({
      id: hero.id,
      lifecycle: hero.lifecycle,
      exiting: hero.exiting,
      classId: hero.classId,
    }));
  }

  /** Clears the queue and pools; later calls are no-ops. */
  dispose(): void {
    this.#disposed = true;
    this.#clearQueue();
    this.#pendingSnapshot = null;
    this.#resync = false;
    this.#world.particles.clear();
    this.#world.effects.clear();
    this.#world.summons.clear();
    this.#combat.clear();
    this.#reactions.clear();
  }

  /**
   * Combat has its own guard: a fault is counted (three disable it for the page load, and the
   * timed rhythm takes over) and never reaches a hero, the roster, or the loop.
   */
  #updateCombat(world: World): void {
    if (this.#awaiting) {
      return;
    }
    try {
      this.#combat.setTransitioning(this.#director.transitioning);
      this.#roster.collectFighters(this.#fighters);
      this.#combat.update(STEP_MS, world, this.#fighters);
    } catch (error: unknown) {
      this.#sink(error, 'update');
      this.#combat.recordFault();
    }
  }

  /** The stage fade has its own guard: a fault ends the fade and shows the current stage. */
  #updateDirector(): void {
    try {
      this.#director.update(STEP_MS);
    } catch (error: unknown) {
      this.#sink(error, 'update');
      try {
        this.#director.show(this.#progression.stageIndex);
        this.#combat.setStage(this.#director.runtime.def);
      } catch (inner: unknown) {
        this.#sink(inner, 'update');
      }
    }
  }

  /** Hands the counters to the webview glue. A throwing callback is caught and reported. */
  #reportProgress(urgent: boolean): void {
    try {
      this.#deps.onProgress?.(this.#progression.snapshot(), urgent);
    } catch (error: unknown) {
      this.#sink(error, 'update');
    }
  }

  /** Effects get their own guard: a fault here must not stop heroes, the campfire, or the loop. */
  #updateEffects(world: World): void {
    try {
      world.effects.update(STEP_MS, world.particles);
    } catch (error: unknown) {
      this.#sink(error, 'update');
      world.effects.clear();
    }
  }

  /** Summons get their own guard too; a fault clears the pool and never touches a hero. */
  #updateSummons(world: World): void {
    try {
      world.summons.update(STEP_MS, world);
    } catch (error: unknown) {
      this.#sink(error, 'update');
      world.summons.clear();
    }
  }

  #clearQueue(): void {
    this.#queue.fill(undefined);
    this.#head = 0;
    this.#size = 0;
  }

  #drain(): void {
    const world = this.#world;
    if (this.#resync) {
      this.#resync = false;
      try {
        this.#roster.reconcile(this.#deps.agentSource(), world);
      } catch (error: unknown) {
        this.#sink(error, 'step');
      }
    }
    if (this.#pendingSnapshot !== null) {
      const snapshot = this.#pendingSnapshot;
      this.#pendingSnapshot = null;
      try {
        this.#roster.reconcile(snapshot, world);
      } catch (error: unknown) {
        this.#sink(error, 'step');
      }
    }
    while (this.#size > 0) {
      const agent = this.#queue[this.#head];
      this.#queue[this.#head] = undefined;
      this.#head = (this.#head + 1) % EVENT_QUEUE_CAP;
      this.#size--;
      if (agent !== undefined) {
        try {
          this.#roster.apply(agent, world);
        } catch (error: unknown) {
          this.#sink(error, 'step');
        }
      }
    }
  }
}
