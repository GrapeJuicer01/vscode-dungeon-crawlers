// Webview receiving side of the protocol (ADR 0007). DOM-free so tests can import it.
// Every host message is parsed with the shared total validator first; anything invalid is
// dropped and the target is left untouched (host-webview-protocol.md section 6.6).
import { assertNever } from '../shared/assertNever';
import { parseHostMessage } from '../shared/protocol';
import type { Progress } from '../shared/progress';
import type { AgentInfo, ConfigSnapshot } from '../shared/protocol';

/** Anything that consumes host state. HostStateMirror now; the M4 Game reads the mirror. */
export interface HostMessageTarget {
  replaceAgents(agents: readonly AgentInfo[]): void;
  applyAgent(agent: AgentInfo): void;
  applyConfig(config: ConfigSnapshot): void;
  /** The stored progress (E1); arrives after `config` and `agentList` on every `ready`. */
  applyProgress(progress: Progress): void;
}

/**
 * Parses and dispatches one host message. Returns false if dropped. Parse never throws; errors
 * thrown by the target propagate to the caller's try/catch.
 */
export function handleHostMessage(raw: unknown, target: HostMessageTarget): boolean {
  const message = parseHostMessage(raw);
  if (message === undefined) {
    return false;
  }
  switch (message.type) {
    case 'config':
      target.applyConfig(message.config);
      return true;
    case 'agentList':
      target.replaceAgents(message.agents);
      return true;
    case 'agentState':
      target.applyAgent(message.agent);
      return true;
    case 'progress':
      target.applyProgress(message.progress);
      return true;
    default:
      return assertNever(message);
  }
}
