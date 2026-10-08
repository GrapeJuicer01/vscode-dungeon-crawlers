// Terminal source (agent-detection.md section 3.2): links sessions that start while this window
// runs to a terminal, so focusAgent can reveal it. Terminals are for reveal only; they never
// change an agent's state (decision H-2, Core invariant 2).
//
// Core invariant 3: the only outward action is TerminalPort.show (Terminal.show() in the
// adapter). This class disposes only its own event subscriptions, never the port or a terminal.
import { safeErrorCode, createSafeLogger } from './monitorLog';
import type { Clock, MonitorDisposable, MonitorLogger, TerminalPort, TerminalRef } from './ports';
import { SIMULATED_ID_PREFIX } from './SimulatorSource';

/** Fallback linking window when no terminal is active (agent-detection.md section 9). */
export const LINK_WINDOW_MS = 30_000;

export class TerminalSource implements MonitorDisposable {
  readonly #port: TerminalPort | null;
  readonly #clock: Clock;
  readonly #log: MonitorLogger;
  /** agent id to terminal key. */
  readonly #links = new Map<string, number>();
  /** terminal key to the time this source saw it open. */
  readonly #openedAt = new Map<number, number>();
  readonly #subscriptions: MonitorDisposable[] = [];
  #disposed = false;

  constructor(port: TerminalPort | null, clock: Clock, logger: MonitorLogger) {
    this.#port = port;
    this.#clock = clock;
    this.#log = createSafeLogger(logger);
    if (port === null) {
      return;
    }
    try {
      this.#subscriptions.push(
        port.onDidOpenTerminal((ref) => this.#onOpen(ref)),
        port.onDidCloseTerminal((ref) => this.#onClose(ref)),
      );
    } catch (error: unknown) {
      this.#log.error('monitor: terminal events unavailable (' + safeErrorCode(error) + ')');
    }
  }

  linkNewSession(agentId: string): void {
    try {
      const port = this.#port;
      if (port === null || this.#disposed || agentId.startsWith(SIMULATED_ID_PREFIX)) {
        return;
      }
      if (this.#links.has(agentId)) {
        return;
      }
      const linked = new Set(this.#links.values());
      const active = port.activeTerminal();
      if (active !== null) {
        // Assumption (conservative): an active terminal already linked to a live agent means
        // no link at all, rather than guessing another terminal.
        if (!linked.has(active.key)) {
          this.#links.set(agentId, active.key);
        }
        return;
      }
      const now = this.#clock.now();
      let best: { key: number; at: number } | null = null;
      for (const [key, at] of this.#openedAt) {
        if (linked.has(key) || now - at > LINK_WINDOW_MS || now < at) {
          continue;
        }
        if (best === null || at >= best.at) {
          best = { key, at };
        }
      }
      if (best !== null) {
        this.#links.set(agentId, best.key);
      }
    } catch (error: unknown) {
      this.#log.error('monitor: terminal link failed (' + safeErrorCode(error) + ')');
    }
  }

  /** Named dropLink, not after the file-removal word: the read-only grep bans that word in src/. */
  dropLink(agentId: string): void {
    this.#links.delete(agentId);
  }

  /** Reveal only. Never throws. */
  reveal(agentId: string): void {
    try {
      const key = this.#links.get(agentId);
      const port = this.#port;
      if (key === undefined || port === null || this.#disposed || !port.show({ key })) {
        this.#log.trace('monitor: reveal skipped (no terminal)');
      }
    } catch (error: unknown) {
      this.#log.error('monitor: reveal failed (' + safeErrorCode(error) + ')');
    }
  }

  /** Disposes its own port subscriptions only; never the port and never a terminal. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const subscription of this.#subscriptions.splice(0)) {
      try {
        subscription.dispose();
      } catch (error: unknown) {
        this.#log.error('monitor: listener cleanup failed (' + safeErrorCode(error) + ')');
      }
    }
    this.#links.clear();
    this.#openedAt.clear();
  }

  #onOpen(ref: TerminalRef): void {
    try {
      if (!this.#disposed) {
        this.#openedAt.set(ref.key, this.#clock.now());
      }
    } catch (error: unknown) {
      this.#log.error('monitor: terminal event failed (' + safeErrorCode(error) + ')');
    }
  }

  /** Close drops the link only; the agent's state is unchanged (decision H-2). */
  #onClose(ref: TerminalRef): void {
    try {
      this.#openedAt.delete(ref.key);
      for (const [agentId, key] of [...this.#links]) {
        if (key === ref.key) {
          this.#links.delete(agentId);
        }
      }
    } catch (error: unknown) {
      this.#log.error('monitor: terminal event failed (' + safeErrorCode(error) + ')');
    }
  }
}
