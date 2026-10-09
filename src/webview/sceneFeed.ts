// The HostMessageTarget that connects host messages to the engine (docs/architecture/game-engine.md
// section 5). Each message reaches the mirror first, then the engine's event queue. `config`
// (game settings) and `progress` (the stored stage counters, E1) also reach the engine, but only
// as plain numbers. DOM-free so tests can import it. It has no HostChannel: the
// engine never talks to the host (Core invariant 3).
import type { GameSink } from '../game/Game';
import type { Progress } from '../shared/progress';
import type { AgentInfo, ConfigSnapshot } from '../shared/protocol';
import type { HostMessageTarget } from './hostMessages';
import type { HostStateMirror } from './hostState';

export class SceneFeed implements HostMessageTarget {
  readonly #mirror: HostStateMirror;
  readonly #sink: GameSink | null;
  readonly #onProgressLoaded: () => void;

  /**
   * `sink` is null when the engine failed to boot: the mirror keeps working. `onProgressLoaded`
   * fires after the stored progress was applied; main.ts uses it to allow saving (fail closed).
   */
  constructor(mirror: HostStateMirror, sink: GameSink | null, onProgressLoaded: () => void) {
    this.#mirror = mirror;
    this.#sink = sink;
    this.#onProgressLoaded = onProgressLoaded;
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
    this.#sink?.applyConfig({
      enemiesEnabled: config.enemiesEnabled,
      killsPerStage: config.killsPerStage,
      maxEnemies: config.maxEnemies,
    });
  }

  applyProgress(progress: Progress): void {
    this.#mirror.applyProgress(progress);
    this.#sink?.applyProgress(progress);
    this.#onProgressLoaded();
  }
}
