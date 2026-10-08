// AgentMonitor (agent-detection.md section 2, M3 plan section 3.10): composes the registry and
// the transcript, terminal, and simulator sources into the one object extension.ts uses.
//
// Core invariant 2: agent state comes only from the sources; the only call that arrives from
// the webview side (revealAgentTerminal) cannot change state. Core invariant 3: reveal only.
// Core invariant 4: getAgents and revealAgentTerminal never throw; every listener and timer
// callback catches its own errors. No I/O and no timers before start().
import { assertNever } from '../shared/assertNever';
import type { AgentInfo } from '../shared/protocol';
import { AgentRegistry } from './AgentRegistry';
import type { MonitorConfig } from './monitorConfig';
import { createSafeLogger, safeErrorCode } from './monitorLog';
import type {
  Clock,
  MonitorDisposable,
  MonitorLogger,
  PathOps,
  ReadOnlyFileSystem,
  TerminalPort,
  TimerPort,
  WorkspaceFolderRef,
} from './ports';
import { SIMULATED_ID_PREFIX, SimulatorSource } from './SimulatorSource';
import { TerminalSource } from './TerminalSource';
import { TranscriptSource } from './TranscriptSource';

/** `auto` mode restart delay after the last real agent leaves (agent-detection.md section 9). */
export const SIMULATOR_RESUME_MS = 10_000;

export interface AgentMonitorDeps {
  readonly fs: ReadOnlyFileSystem;
  readonly path: PathOps;
  readonly clock: Clock;
  readonly timers: TimerPort;
  readonly terminals: TerminalPort | null;
  readonly logger: MonitorLogger;
  readonly caseInsensitive: boolean;
  readonly simulatorSeed: number;
}

const NO_AGENTS: readonly AgentInfo[] = Object.freeze([]);

export class AgentMonitor implements MonitorDisposable {
  readonly #timers: TimerPort;
  readonly #log: MonitorLogger;
  readonly #registry: AgentRegistry;
  readonly #transcripts: TranscriptSource;
  /** Session-to-terminal links (TerminalSource); named so no `terminal*.dispose(` call exists. */
  readonly #linker: TerminalSource;
  readonly #simulator: SimulatorSource;
  readonly #subscriptions: MonitorDisposable[] = [];
  #config: MonitorConfig;
  #folders: readonly WorkspaceFolderRef[];
  #lastAgents: readonly AgentInfo[] = NO_AGENTS;
  #cancelResume: (() => void) | null = null;
  #firstScanDone = false;
  #started = false;
  #disposed = false;

  /** No I/O and no timers until start(). */
  constructor(
    deps: AgentMonitorDeps,
    config: MonitorConfig,
    folders: readonly WorkspaceFolderRef[],
  ) {
    this.#timers = deps.timers;
    this.#log = createSafeLogger(deps.logger);
    this.#config = config;
    this.#folders = [...folders];
    this.#registry = new AgentRegistry(
      { clock: deps.clock, timers: deps.timers, logger: deps.logger },
      config.debounceMs,
    );
    this.#transcripts = new TranscriptSource(
      {
        fs: deps.fs,
        path: deps.path,
        clock: deps.clock,
        timers: deps.timers,
        logger: deps.logger,
        registry: this.#registry,
        caseInsensitive: deps.caseInsensitive,
      },
      config,
      folders,
    );
    this.#linker = new TerminalSource(deps.terminals, deps.clock, deps.logger);
    this.#simulator = new SimulatorSource({
      clock: deps.clock,
      timers: deps.timers,
      registry: this.#registry,
      logger: deps.logger,
      seed: deps.simulatorSeed,
    });
  }

  start(): void {
    if (this.#started || this.#disposed) {
      return;
    }
    this.#started = true;
    this.#subscriptions.push(
      // Registered after any listener added before start(), so outside listeners see a real
      // agent's spawn before the simulated agents leave.
      this.#registry.onDidChange((agent) => this.#onAgentChange(agent)),
      this.#transcripts.onDidDiscoverNewSession((agentId) => this.#linker.linkNewSession(agentId)),
      this.#transcripts.onDidFinishFirstScan(() => {
        this.#firstScanDone = true;
        this.#evaluateSimulator();
      }),
    );
    this.#transcripts.start();
    this.#evaluateSimulator();
  }

  /** The registry snapshot. Never throws (falls back to the last good snapshot, else []). */
  getAgents(): readonly AgentInfo[] {
    try {
      this.#lastAgents = this.#registry.snapshot();
    } catch (error: unknown) {
      this.#log.error('monitor: snapshot failed (' + safeErrorCode(error) + ')');
    }
    return this.#lastAgents;
  }

  onDidChangeAgent(listener: (agent: AgentInfo) => void): MonitorDisposable {
    return this.#registry.onDidChange(listener);
  }

  /** Reveal only, via TerminalSource. Never throws. */
  revealAgentTerminal(agentId: string): void {
    try {
      this.#linker.reveal(agentId);
    } catch (error: unknown) {
      this.#log.error('monitor: reveal failed (' + safeErrorCode(error) + ')');
    }
  }

  updateConfig(config: MonitorConfig): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.#config = config;
      this.#registry.setDebounce(config.debounceMs);
      this.#transcripts.update(config, this.#folders);
      if (this.#started) {
        this.#evaluateSimulator();
      }
    } catch (error: unknown) {
      this.#log.error('monitor: configuration update failed (' + safeErrorCode(error) + ')');
    }
  }

  updateWorkspaceFolders(folders: readonly WorkspaceFolderRef[]): void {
    if (this.#disposed) {
      return;
    }
    try {
      this.#folders = [...folders];
      this.#transcripts.update(this.#config, this.#folders);
    } catch (error: unknown) {
      this.#log.error('monitor: workspace update failed (' + safeErrorCode(error) + ')');
    }
  }

  /** Idempotent. Stops every timer and source, emits nothing afterwards. Does not dispose the TerminalPort (extension.ts owns it). */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#stopResume();
    const steps: (() => void)[] = [
      () => this.#registry.dispose(),
      () => this.#simulator.dispose(),
      () => this.#transcripts.dispose(),
      () => this.#linker.dispose(),
      ...this.#subscriptions.splice(0).map((subscription) => () => subscription.dispose()),
    ];
    for (const step of steps) {
      try {
        step();
      } catch (error: unknown) {
        this.#log.error('monitor: dispose failed (' + safeErrorCode(error) + ')');
      }
    }
  }

  #onAgentChange(agent: AgentInfo): void {
    if (agent.state === 'despawned') {
      this.#linker.dropLink(agent.id);
    }
    if (agent.id.startsWith(SIMULATED_ID_PREFIX) || this.#config.simulator !== 'auto') {
      return;
    }
    if (!this.#firstScanDone) {
      return;
    }
    if (agent.state === 'despawned') {
      if (this.#registry.count('transcript') === 0 && this.#cancelResume === null) {
        this.#cancelResume = this.#timers.setTimeout(() => {
          this.#cancelResume = null;
          try {
            this.#evaluateSimulator();
          } catch (error: unknown) {
            this.#log.error('monitor: simulator resume failed (' + safeErrorCode(error) + ')');
          }
        }, SIMULATOR_RESUME_MS);
      }
      return;
    }
    // A real agent is live: simulated agents leave in auto mode.
    this.#stopResume();
    if (this.#simulator.running) {
      this.#simulator.stop();
    }
  }

  #evaluateSimulator(): void {
    if (this.#disposed) {
      return;
    }
    const mode = this.#config.simulator;
    const count = this.#config.simulatorAgentCount;
    switch (mode) {
      case 'off':
        this.#stopResume();
        this.#simulator.stop();
        return;
      case 'on':
        this.#stopResume();
        this.#simulator.start(count);
        return;
      case 'auto':
        if (!this.#firstScanDone) {
          return;
        }
        if (this.#registry.count('transcript') > 0) {
          this.#stopResume();
          this.#simulator.stop();
          return;
        }
        if (this.#cancelResume === null) {
          this.#simulator.start(count);
        }
        return;
      default:
        assertNever(mode);
    }
  }

  #stopResume(): void {
    const cancel = this.#cancelResume;
    this.#cancelResume = null;
    if (cancel !== null) {
      cancel();
    }
  }
}
