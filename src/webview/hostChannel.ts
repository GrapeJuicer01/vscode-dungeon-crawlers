// Webview-to-host sending side of the protocol (ADR 0007). DOM-free so tests can import it;
// main.ts passes in the object returned by acquireVsCodeApi().
// The only messages it can send are WebviewToHostMessage: `ready` and reveal-only `focusAgent`.
import type { WebviewToHostMessage } from '../shared/protocol';

/**
 * The part of the object returned by acquireVsCodeApi() that we use. getState/setState are
 * deliberately not typed: the webview is never a source of truth.
 */
export interface VsCodeWebviewApi {
  postMessage(message: unknown): void;
}

export interface HostChannel {
  send(message: WebviewToHostMessage): void;
}

export function createHostChannel(api: VsCodeWebviewApi): HostChannel {
  return {
    send(message: WebviewToHostMessage): void {
      api.postMessage(message);
    },
  };
}
