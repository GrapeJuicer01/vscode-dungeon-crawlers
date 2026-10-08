// The HostMessageTarget that connects host messages to the engine (docs/architecture/game-engine.md
// section 5). Each message reaches the mirror first, then the engine's event queue. `config`
// never reaches the engine in M4. DOM-free so tests can import it. It has no HostChannel: the
// engine never talks to the host (Core invariant 3).
import type { AgentEventSink } from '../game/Game';
import type { AgentInfo, ConfigSnapshot } from '../shared/protocol';
import type { HostMessageTarget } from './hostMessages';
import type { HostStateMirror } from './hostState';

export class SceneFeed implements HostMessageTarget {
  readonly #mirror: HostStateMirror;
  readonly #sink: AgentEventSink | null;

  /** `sink` is null when the engine failed to boot: the mirror keeps working. */
  constructor(mirror: HostStateMirror, sink: AgentEventSink | null) {
    this.#mirror = mirror;
    this.#sink = sink;
  }

  replaceAgents(agents: readonly AgentInfo[]): void {
    this.#mirror.replaceAgents(agents);
    this.#sink?.enqueueSnapshot(agents);
  }

  applyAgent(agent: AgentInfo): void {
    this.#mirror.applyAgent(agent);
    this.#sink?.enqueueAgent(agent);
  }

  applyConfig(config: ConfigSnapshot): void {
    this.#mirror.applyConfig(config);
  }
}
