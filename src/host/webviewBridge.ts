// Host side of the host <-> webview protocol (ADR 0007, host-webview-protocol.md section 5).
// vscode-free: the real webview, output channel, and terminal reveal arrive as narrow
// interfaces from extension.ts, so this module is unit-testable under node:test.
//
// Core invariant 3: the only outward capability is `revealAgentTerminal`, called at most once
// per valid focusAgent and only for a live agent in the host's own list. Core invariant 4:
// every entry point catches and logs; nothing is rethrown across the event boundary.
// Logs are fixed reason strings (plus error name and message); never a payload (invariant 7).
import { assertNever } from '../shared/assertNever';
import {
  createAgentListMessage,
  createAgentStateMessage,
  createConfigMessage,
  parseWebviewMessage,
} from '../shared/protocol';
import type { AgentInfo, ConfigSnapshot, HostToWebviewMessage } from '../shared/protocol';

/** Narrow view of vscode.Webview. vscode's Thenable<boolean> is structurally a PromiseLike<boolean>. */
export interface WebviewPort {
  postMessage(message: HostToWebviewMessage): PromiseLike<boolean>;
}

/** Subset of vscode.LogOutputChannel. Messages never contain payload data. */
export interface BridgeLogger {
  trace(message: string): void;
  error(message: string): void;
}

/** Reveal-only capability: must only show the agent's terminal. */
export type RevealAgentTerminal = (agentId: string) => void;

export interface WebviewBridgeDeps {
  readonly getAgents: () => readonly AgentInfo[];
  readonly getConfig: () => ConfigSnapshot;
  /** null until M3 wires TerminalSource; focusAgent is then dropped. */
  readonly revealAgentTerminal: RevealAgentTerminal | null;
  readonly logger: BridgeLogger;
}

export type BridgeState = 'detached' | 'loading' | 'ready';

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'non-error thrown';
}

export class WebviewBridge {
  readonly #deps: WebviewBridgeDeps;
  #state: BridgeState = 'detached';
  #port: WebviewPort | null = null;

  constructor(deps: WebviewBridgeDeps) {
    this.#deps = deps;
  }

  get state(): BridgeState {
    return this.#state;
  }

  /** A view was resolved: store the port, state = 'loading'. Replaces any previous port. */
  attach(port: WebviewPort): void {
    this.#port = port;
    this.#state = 'loading';
  }

  /** The view became hidden (its document is destroyed): state = 'loading' if attached. */
  markHidden(): void {
    if (this.#state !== 'detached') {
      this.#state = 'loading';
    }
  }

  /** The view was disposed: drop the port, state = 'detached'. */
  detach(): void {
    this.#port = null;
    this.#state = 'detached';
  }

  /** Entry point for onDidReceiveMessage. Never throws. */
  handleMessage(raw: unknown): void {
    try {
      if (this.#state === 'detached') {
        return;
      }
      const message = parseWebviewMessage(raw);
      if (message === undefined) {
        this.#deps.logger.trace('dropped webview message: invalid');
        return;
      }
      switch (message.type) {
        case 'ready':
          // Every ready is answered (idempotent; covers "Developer: Reload Webviews").
          this.#state = 'ready';
          this.#post(createConfigMessage(this.#deps.getConfig()));
          this.#post(createAgentListMessage(this.#deps.getAgents()));
          return;
        case 'focusAgent':
          this.#focusAgent(message.agentId);
          return;
        default:
          assertNever(message);
      }
    } catch (error: unknown) {
      this.#logError(error);
    }
  }

  /** Push one agent-state event. Dropped unless state === 'ready'. Used by M3. Never throws. */
  postAgentState(agent: AgentInfo): void {
    try {
      if (this.#state !== 'ready') {
        return;
      }
      const message = createAgentStateMessage(agent);
      if (message === undefined) {
        this.#deps.logger.error('refused to post agent: invalid fields');
        return;
      }
      this.#post(message);
    } catch (error: unknown) {
      this.#logError(error);
    }
  }

  /** Reveal only, and only for a live agent the host itself lists. Nothing is posted back. */
  #focusAgent(agentId: string): void {
    const reveal = this.#deps.revealAgentTerminal;
    if (reveal === null) {
      this.#deps.logger.trace('dropped focusAgent: reveal unavailable');
      return;
    }
    const live = this.#deps
      .getAgents()
      .some((agent) => agent.id === agentId && agent.state !== 'despawned');
    if (!live) {
      this.#deps.logger.trace('dropped focusAgent: unknown agent');
      return;
    }
    reveal(agentId);
  }

  #post(message: HostToWebviewMessage): void {
    const port = this.#port;
    if (port === null) {
      return;
    }
    // A failed post (view gone) is recovered by the next ready's snapshot. PromiseLike has no
    // .catch, so the rejection handler goes in .then; it must not throw (no unhandled rejection).
    void port.postMessage(message).then(undefined, () => {
      try {
        this.#deps.logger.trace('post failed: view gone');
      } catch {
        // The logger itself failed; nothing may escape into an unhandled rejection.
      }
    });
  }

  #logError(error: unknown): void {
    try {
      this.#deps.logger.error(`webview bridge error: ${describeError(error)}`);
    } catch {
      // The logger itself failed; there is nowhere left to report, and nothing may escape.
    }
  }
}
