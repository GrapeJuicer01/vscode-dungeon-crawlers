// In-memory mirror of host-provided state (ADR 0007). DOM-free so tests can import it.
// The webview is never a source of truth: the mirror starts empty on every document load and
// is rebuilt from the host's `agentList` snapshot (Core invariant 4). Only host messages change
// it (Core invariant 2).
import { assertNever } from '../shared/assertNever';
import type { Progress } from '../shared/progress';
import type { AgentInfo, ConfigSnapshot } from '../shared/protocol';
import type { HostMessageTarget } from './hostMessages';

/** In-memory mirror of host-provided state. Rebuilt from scratch on every webview load. */
export class HostStateMirror implements HostMessageTarget {
  readonly #agents = new Map<string, AgentInfo>();
  #config: ConfigSnapshot | null = null;
  #progress: Progress | null = null;

  /** Clears, then inserts all (the snapshot is authoritative). */
  replaceAgents(agents: readonly AgentInfo[]): void {
    this.#agents.clear();
    for (const agent of agents) {
      this.#agents.set(agent.id, agent);
    }
  }

  /** 'despawned' deletes; any other state upserts (a missed 'spawned' is tolerated). */
  applyAgent(agent: AgentInfo): void {
    switch (agent.state) {
      case 'despawned':
        this.#agents.delete(agent.id);
        return;
      case 'spawned':
      case 'working':
      case 'idle':
        // Map.set keeps the original insertion position for an existing id.
        this.#agents.set(agent.id, agent);
        return;
      default:
        assertNever(agent.state);
    }
  }

  /** Stores the latest snapshot. */
  applyConfig(config: ConfigSnapshot): void {
    this.#config = config;
  }

  /** Stores the stored progress; the mirror holds a read-only copy and never changes it. */
  applyProgress(progress: Progress): void {
    this.#progress = progress;
  }

  get progress(): Progress | null {
    return this.#progress;
  }

  get config(): ConfigSnapshot | null {
    return this.#config;
  }

  get agentCount(): number {
    return this.#agents.size;
  }

  getAgent(id: string): AgentInfo | undefined {
    return this.#agents.get(id);
  }

  /** Insertion order. Returns a new array, so callers cannot mutate the mirror. */
  agents(): readonly AgentInfo[] {
    return [...this.#agents.values()];
  }
}
