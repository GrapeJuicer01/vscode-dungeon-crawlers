// Simulator source (agent-detection.md section 3.3): clearly labelled fake agents for a
// zero-configuration demo and for tests. Ids are `sim-<slot>-<generation>`, names `Sim <Name>`.
// The schedule is deterministic: a mulberry32 PRNG per slot from a fixed seed (no unseeded randomness).
// Simulated agents enter the registry with explicit states, through the same normalization,
// coalescing, and cap as real ones. They never model damage or health (Core invariant 1).
import { MAX_SIMULATED_AGENTS } from './AgentRegistry';
import type { AgentRegistry } from './AgentRegistry';
import { createSafeLogger, safeErrorCode } from './monitorLog';
import type { Clock, MonitorDisposable, MonitorLogger, TimerPort } from './ports';

export const DEFAULT_SIMULATOR_SEED = 0x5049584c;
export const SIMULATED_ID_PREFIX = 'sim-';
export const SIMULATOR_TOOLS: readonly string[] = Object.freeze([
  'Read',
  'Grep',
  'Edit',
  'Bash',
  'Write',
  'Glob',
  'WebFetch',
  'Task',
]);

const SIM_NAMES = ['Ada', 'Brom', 'Cyra', 'Dorn', 'Elin', 'Fenn', 'Gale', 'Hask'] as const;

/** Schedule (agent-detection.md section 3.3), in milliseconds. */
const SLOT_STAGGER_MS = 1500;
/** Assumption: a spawned simulated agent starts working after 1 s, like a short debounce. */
const SPAWN_TO_WORK_MS = 1000;
const WORK_PHASE_MS = [15_000, 30_000] as const;
const TOOL_CHANGE_MS = [2000, 5000] as const;
const IDLE_PHASE_MS = [6000, 15_000] as const;
const CYCLES = [2, 3] as const;
const RESPAWN_MS = [3000, 6000] as const;

export interface SimulatorSourceDeps {
  readonly clock: Clock;
  readonly timers: TimerPort;
  readonly registry: AgentRegistry;
  readonly logger: MonitorLogger;
  readonly seed: number;
}

interface Slot {
  readonly index: number;
  readonly name: string;
  readonly random: () => number;
  generation: number;
  liveId: string | null;
  tool: string | null;
  cyclesLeft: number;
  workEndsAt: number;
  cancel: (() => void) | null;
}

/** mulberry32: a tiny, well-known 32-bit PRNG. Returns floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: () => number, range: readonly [number, number]): number {
  const [low, high] = range;
  return low + Math.floor(random() * (high - low + 1));
}

function slotName(index: number): string {
  return 'Sim ' + (SIM_NAMES[index] ?? String(index + 1));
}

export class SimulatorSource implements MonitorDisposable {
  readonly #clock: Clock;
  readonly #timers: TimerPort;
  readonly #registry: AgentRegistry;
  readonly #log: MonitorLogger;
  readonly #seed: number;
  #slots: Slot[] = [];
  #count = 0;
  #running = false;
  #disposed = false;

  constructor(deps: SimulatorSourceDeps) {
    this.#clock = deps.clock;
    this.#timers = deps.timers;
    this.#registry = deps.registry;
    this.#log = createSafeLogger(deps.logger);
    this.#seed = deps.seed;
  }

  get running(): boolean {
    return this.#running;
  }

  /** Idempotent for the same count; a new count restarts. */
  start(agentCount: number): void {
    if (this.#disposed) {
      return;
    }
    const count = Math.min(MAX_SIMULATED_AGENTS, Math.max(1, Math.round(agentCount) || 1));
    if (this.#running && count === this.#count) {
      return;
    }
    if (this.#running) {
      this.stop();
    }
    this.#running = true;
    this.#count = count;
    this.#slots = [];
    for (let index = 0; index < count; index += 1) {
      const slot: Slot = {
        index,
        name: slotName(index),
        // Per-slot streams keep each slot's schedule independent of timer ordering.
        random: mulberry32((this.#seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0),
        generation: 0,
        liveId: null,
        tool: null,
        cyclesLeft: 0,
        workEndsAt: 0,
        cancel: null,
      };
      this.#slots.push(slot);
      this.#schedule(slot, SLOT_STAGGER_MS * index, () => this.#spawn(slot));
    }
  }

  /** Despawns every simulated agent (emits despawned) and cancels its timers. */
  stop(): void {
    const slots = this.#slots;
    this.#slots = [];
    this.#running = false;
    for (const slot of slots) {
      this.#cancel(slot);
      if (slot.liveId !== null && !this.#disposed) {
        this.#registry.upsert(slot.liveId, 'simulator', slot.name, 'despawned', slot.tool);
      }
      slot.liveId = null;
    }
  }

  /** Cancels timers; emits nothing. */
  dispose(): void {
    this.#disposed = true;
    this.#running = false;
    for (const slot of this.#slots) {
      this.#cancel(slot);
    }
    this.#slots = [];
  }

  #schedule(slot: Slot, delayMs: number, step: () => void): void {
    this.#cancel(slot);
    slot.cancel = this.#timers.setTimeout(() => {
      slot.cancel = null;
      if (this.#disposed || !this.#running || !this.#slots.includes(slot)) {
        return;
      }
      try {
        step();
      } catch (error: unknown) {
        this.#log.error('monitor: simulator step failed (' + safeErrorCode(error) + ')');
      }
    }, delayMs);
  }

  #cancel(slot: Slot): void {
    const cancel = slot.cancel;
    slot.cancel = null;
    if (cancel !== null) {
      cancel();
    }
  }

  #pickTool(slot: Slot): string {
    const choices = SIMULATOR_TOOLS.filter((tool) => tool !== slot.tool);
    return choices[Math.floor(slot.random() * choices.length)] ?? 'Read';
  }

  #spawn(slot: Slot): void {
    const id = SIMULATED_ID_PREFIX + String(slot.index) + '-' + String(slot.generation);
    slot.tool = null;
    if (!this.#registry.upsert(id, 'simulator', slot.name, 'spawned', null)) {
      slot.generation += 1;
      this.#schedule(slot, between(slot.random, RESPAWN_MS), () => this.#spawn(slot));
      return;
    }
    slot.liveId = id;
    slot.cyclesLeft = between(slot.random, CYCLES);
    this.#schedule(slot, SPAWN_TO_WORK_MS, () => this.#beginWork(slot));
  }

  #beginWork(slot: Slot): void {
    slot.workEndsAt = this.#clock.now() + between(slot.random, WORK_PHASE_MS);
    this.#changeTool(slot);
  }

  #changeTool(slot: Slot): void {
    const id = slot.liveId;
    if (id === null) {
      return;
    }
    slot.tool = this.#pickTool(slot);
    this.#registry.upsert(id, 'simulator', slot.name, 'working', slot.tool);
    const remaining = Math.max(0, slot.workEndsAt - this.#clock.now());
    const next = between(slot.random, TOOL_CHANGE_MS);
    if (next >= remaining) {
      this.#schedule(slot, remaining, () => this.#rest(slot));
    } else {
      this.#schedule(slot, next, () => this.#changeTool(slot));
    }
  }

  #rest(slot: Slot): void {
    const id = slot.liveId;
    if (id === null) {
      return;
    }
    this.#registry.upsert(id, 'simulator', slot.name, 'idle', slot.tool);
    slot.cyclesLeft -= 1;
    const delay = between(slot.random, IDLE_PHASE_MS);
    if (slot.cyclesLeft > 0) {
      this.#schedule(slot, delay, () => this.#beginWork(slot));
    } else {
      this.#schedule(slot, delay, () => this.#despawn(slot));
    }
  }

  #despawn(slot: Slot): void {
    const id = slot.liveId;
    if (id !== null) {
      this.#registry.upsert(id, 'simulator', slot.name, 'despawned', slot.tool);
    }
    slot.liveId = null;
    slot.generation += 1;
    this.#schedule(slot, between(slot.random, RESPAWN_MS), () => this.#spawn(slot));
  }
}
