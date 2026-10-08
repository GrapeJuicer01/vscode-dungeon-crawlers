// The set of heroes and the only caller of Hero.applyAgentState (ADR 0009). Roster turns host
// agent events and snapshots into hero creation, lifecycle updates, and removal; nothing else in
// the engine reaches it. Removal happens only for a hero whose lifecycle is despawned and whose
// exit finished (or whose exit stalled past EXIT_FAILSAFE_MS); never for any other reason.
import type { AgentInfo } from '../shared/protocol';
import { assertNever } from '../shared/assertNever';
import { EXIT_FAILSAFE_MS, HAIR_COLOR_COUNT, SKIN_TONE_COUNT } from './data/tuning';
import { guarded } from './entities/Entity';
import type { World } from './entities/Entity';
import type { Hero, HeroFactory } from './entities/Hero';
import type { ErrorSink } from './ports';
import { hashId } from './rng';
import type { HeroLook } from './sprites/spriteFactory';

/** The look is a pure function of the id: stable across reloads. */
export function lookFor(id: string): HeroLook {
  const h = hashId(id);
  return { skin: h % SKIN_TONE_COUNT, hair: (h >>> 8) % HAIR_COLOR_COUNT, accent: null };
}

export class Roster {
  readonly #factory: HeroFactory;
  readonly #onError: ErrorSink;
  readonly #byId = new Map<string, Hero>();
  readonly #list: Hero[] = [];
  readonly #slots: boolean[] = [];
  // Reused so the per-hero guard allocates no closure per step.
  #current: Hero | null = null;
  #currentWorld: World | null = null;
  #currentDt = 0;
  readonly #updateCurrent = (): void => {
    if (this.#current !== null && this.#currentWorld !== null) {
      this.#current.update(this.#currentDt, this.#currentWorld);
    }
  };

  constructor(factory: HeroFactory, onError: ErrorSink) {
    this.#factory = factory;
    this.#onError = onError;
  }

  /** One host agent event. See docs/architecture/game-engine.md section 5. */
  apply(agent: AgentInfo, _world: World): void {
    const existing = this.#byId.get(agent.id);
    switch (agent.state) {
      case 'spawned':
        if (existing === undefined) {
          this.#create(agent, false);
        } else if (existing.exiting) {
          this.#remove(existing);
          this.#create(agent, false);
        } else {
          existing.applyAgentState(agent);
        }
        return;
      case 'working':
      case 'idle':
        if (existing === undefined) {
          // A missed `spawned` is tolerated, as in the mirror: no warp-in.
          this.#create(agent, true);
        } else {
          existing.applyAgentState(agent);
        }
        return;
      case 'despawned':
        // An unknown id is ignored.
        existing?.applyAgentState(agent);
        return;
      default:
        assertNever(agent.state);
    }
  }

  /** A host snapshot: instant rebuild. Heroes missing from the list get the despawned treatment. */
  reconcile(agents: readonly AgentInfo[], _world: World): void {
    const listed = new Set<string>();
    for (const agent of agents) {
      listed.add(agent.id);
      const existing = this.#byId.get(agent.id);
      if (existing === undefined) {
        if (agent.state !== 'despawned') {
          this.#create(agent, true);
        }
      } else if (existing.exiting && agent.state !== 'despawned') {
        this.#remove(existing);
        this.#create(agent, true);
      } else {
        existing.applyAgentState(agent);
      }
    }
    for (const hero of this.#list) {
      if (!listed.has(hero.id) && !hero.exiting) {
        // Absent from the host's list means the host no longer has the agent.
        hero.applyAgentState({
          id: hero.id,
          name: hero.name,
          state: 'despawned',
          toolName: null,
          timestamp: 0,
        });
      }
    }
  }

  /** Updates every hero under the per-entity guard, then removes finished exits. */
  update(dtMs: number, world: World): void {
    this.#currentWorld = world;
    this.#currentDt = dtMs;
    for (const hero of this.#list) {
      this.#current = hero;
      guarded(hero, 'update', this.#updateCurrent, this.#onError);
      hero.advanceExitClock(dtMs);
    }
    this.#current = null;
    this.#currentWorld = null;
    for (let i = this.#list.length - 1; i >= 0; i--) {
      const hero = this.#list[i];
      if (
        hero !== undefined &&
        hero.exiting &&
        (hero.removable || hero.exitClockMs >= EXIT_FAILSAFE_MS)
      ) {
        this.#remove(hero);
      }
    }
  }

  /** Stable order (creation order). The same array is returned each call; do not mutate it. */
  heroes(): readonly Hero[] {
    return this.#list;
  }

  /** Heroes that are in the corridor fighting (drives the engagement rhythm). */
  countFighting(): number {
    let n = 0;
    for (const hero of this.#list) {
      if (hero.phase === 'advance' || hero.phase === 'attack') {
        n++;
      }
    }
    return n;
  }

  /** Heroes resting at the fire (drives the campfire size). */
  countResting(): number {
    let n = 0;
    for (const hero of this.#list) {
      if (hero.phase === 'rest') {
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this.#byId.clear();
    this.#list.length = 0;
    this.#slots.length = 0;
  }

  #create(agent: AgentInfo, instant: boolean): void {
    let slot = this.#slots.indexOf(false);
    if (slot < 0) {
      slot = this.#slots.length;
    }
    this.#slots[slot] = true;
    const hero = this.#factory({ info: agent, slot, instant, look: lookFor(agent.id) });
    this.#byId.set(agent.id, hero);
    this.#list.push(hero);
  }

  #remove(hero: Hero): void {
    this.#byId.delete(hero.id);
    const i = this.#list.indexOf(hero);
    if (i >= 0) {
      this.#list.splice(i, 1);
    }
    this.#slots[hero.slot] = false;
  }
}
