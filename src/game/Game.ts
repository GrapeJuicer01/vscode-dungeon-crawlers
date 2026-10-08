// The engine entry point (ADR 0008, ADR 0009). The webview host calls frame() once per animation
// frame; host events arrive through enqueueAgent/enqueueSnapshot. Nothing here can reach the
// host: the engine has no channel, only an error callback. Every step and render is wrapped in
// try/catch, so an engine bug can never affect agents (Core invariant 4).
import type { AgentInfo, AgentState } from '../shared/protocol';
import { Ambience } from './Ambience';
import { Camera } from './Camera';
import { Campfire } from './entities/Campfire';
import { errorKey, guarded } from './entities/Entity';
import type { World } from './entities/Entity';
import { Hero } from './entities/Hero';
import type { HeroFactory } from './entities/Hero';
import { TimedEngagement } from './Engagement';
import type { StageDef } from './data/stages';
import {
  EVENT_QUEUE_CAP,
  MAX_FRAME_MS,
  MAX_STEPS_PER_FRAME,
  PARTICLE_CAPACITY,
  STEP_MS,
} from './data/tuning';
import { Particles } from './Particles';
import type { BitmapFactory, ErrorSink, Surface } from './ports';
import { Renderer } from './Renderer';
import { Roster } from './Roster';
import { mulberry32 } from './rng';
import { buildStage, validateStages } from './Stage';
import { SpriteCache } from './sprites/spriteFactory';
import type { ArtSet } from './sprites/spriteFactory';

export interface AgentEventSink {
  enqueueAgent(agent: AgentInfo): void;
  enqueueSnapshot(agents: readonly AgentInfo[]): void;
}

export interface GameDeps {
  readonly art: ArtSet;
  readonly stages: readonly StageDef[];
  readonly bitmaps: BitmapFactory;
  readonly onError: ErrorSink;
  readonly seed: number;
  /** The mirror's agents(), used only to resync after an event-queue overflow. */
  readonly agentSource: () => readonly AgentInfo[];
  /** Default creates Hero; tests and H1-H3 inject. */
  readonly heroFactory?: HeroFactory;
}

export interface HeroSnapshot {
  readonly id: string;
  readonly lifecycle: AgentState;
  readonly exiting: boolean;
}

/** Distinct (scope, message) pairs reported per game; a bound so a bug cannot grow the set. */
const MAX_REPORTED = 64;

export class Game implements AgentEventSink {
  readonly #deps: GameDeps;
  readonly #sink: ErrorSink;
  readonly #reported = new Set<string>();
  readonly #world: World;
  readonly #roster: Roster;
  readonly #renderer: Renderer;
  readonly #camera = new Camera();
  readonly #ambience = new Ambience();
  readonly #queue: (AgentInfo | undefined)[] = new Array<AgentInfo | undefined>(EVENT_QUEUE_CAP);
  #head = 0;
  #size = 0;
  #pendingSnapshot: readonly AgentInfo[] | null = null;
  #resync = false;
  #accumulatorMs = 0;
  #disposed = false;
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
    const cache = new SpriteCache(deps.bitmaps, deps.art);
    const rng = mulberry32(deps.seed);
    const campfireSprites = deps.art.campfire;
    const campfire = new Campfire({
      logs: cache.sheet(campfireSprites.logs),
      flameSmall: cache.sheet(campfireSprites.flameSmall),
      flameLarge: cache.sheet(campfireSprites.flameLarge),
    });
    this.#world = {
      stage: buildStage(def, deps.art, cache, deps.bitmaps),
      campfire,
      particles: new Particles(PARTICLE_CAPACITY, rng),
      engagement: new TimedEngagement(),
      rng,
      cache,
    };
    this.#roster = new Roster(deps.heroFactory ?? ((init) => new Hero(init)), this.#sink);
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
      world.engagement.update(STEP_MS, this.#roster.countFighting());
      this.#camera.advance(STEP_MS, world.engagement.scrollPxPerS);
      this.#roster.update(STEP_MS, world);
      world.campfire.setRestingCount(this.#roster.countResting());
      this.#dtHolder.ms = STEP_MS;
      guarded(world.campfire, 'update', this.#updateCampfire, this.#sink);
      this.#ambience.update(STEP_MS, world, this.#camera);
      world.particles.update(STEP_MS);
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
      this.#renderer.render(surface, this.#world, this.#roster.heroes(), this.#camera);
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
    return this.#roster
      .heroes()
      .map((hero) => ({ id: hero.id, lifecycle: hero.lifecycle, exiting: hero.exiting }));
  }

  /** Clears the queue and pools; later calls are no-ops. */
  dispose(): void {
    this.#disposed = true;
    this.#clearQueue();
    this.#pendingSnapshot = null;
    this.#resync = false;
    this.#world.particles.clear();
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
