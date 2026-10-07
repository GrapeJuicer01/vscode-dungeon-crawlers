// Minimal fake browser globals for running the webview bundle (dist/webview.js) in a node:vm
// context. Implements only what src/webview/main.ts touches: document.querySelector('canvas'),
// a canvas with a 2d context, window size / devicePixelRatio / listeners with event dispatch,
// console.error, and (M2) the global acquireVsCodeApi that VS Code injects.
//
// Realms: the bundle runs in its own vm context, so an object built in the test realm has the
// test realm's Object.prototype and fails the protocol's plain-object check inside the bundle.
// In a real webview, postMessage data is structured-cloned into the page's realm, so this never
// happens there. Use `runInBundleRealm` to build payloads that must look same-realm to the bundle.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { repoPath } from './repo';

export class FakeContext2d {
  imageSmoothingEnabled = true;
  fillStyle = '';
  readonly fills: { x: number; y: number; w: number; h: number; style: string }[] = [];

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({ x, y, w, h, style: this.fillStyle });
  }
}

export class FakeCanvas {
  width = 300;
  height = 150;
  readonly style: { width: string; height: string } = { width: '', height: '' };
  readonly contextRequests: { type: string; options: unknown }[] = [];
  context: FakeContext2d | null = new FakeContext2d();

  getContext(type: string, options?: unknown): FakeContext2d | null {
    this.contextRequests.push({ type, options });
    return this.context;
  }
}

type Listener = (event: unknown) => void;

export class FakeWindow {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  readonly listeners = new Map<string, Set<Listener>>();
  /** Ordered record of listener changes and host posts: `add:<type>`, `remove:<type>`, `post`. */
  readonly timeline: string[] = [];

  constructor(innerWidth: number, innerHeight: number, devicePixelRatio: number) {
    this.innerWidth = innerWidth;
    this.innerHeight = innerHeight;
    this.devicePixelRatio = devicePixelRatio;
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
    this.timeline.push(`add:${type}`);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
    this.timeline.push(`remove:${type}`);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /** Calls every listener for `type`; a listener that throws propagates, as in a test it should not. */
  dispatch(type: string, event: unknown = { type }): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  /** Dispatches a `message` event, as the host's webview.postMessage would. */
  dispatchMessage(event: unknown): void {
    this.dispatch('message', event);
  }
}

/** How the injected acquireVsCodeApi global behaves for one run. */
export type VsCodeApiMode = 'present' | 'missing' | 'throws' | 'postThrows';

export interface FakeVsCodeApi {
  acquireCalls: number;
  /** Messages the webview posted to the host, as received (objects from the bundle's realm). */
  readonly posted: unknown[];
}

export interface WebviewRun {
  readonly window: FakeWindow;
  readonly canvas: FakeCanvas | null;
  readonly errors: string[];
  readonly api: FakeVsCodeApi;
  readonly context: vm.Context;
}

let cachedBundle: string | undefined;

function webviewBundle(): string {
  cachedBundle ??= readFileSync(repoPath('dist/webview.js'), 'utf8');
  return cachedBundle;
}

/**
 * Evaluates dist/webview.js once in a fresh vm context against the given fakes, as the webview
 * would on load. `canvas: null` simulates a document without a canvas. `apiMode` controls the
 * acquireVsCodeApi global (default: present and recording).
 */
export function runWebviewBundle(
  window: FakeWindow,
  canvas: FakeCanvas | null,
  apiMode: VsCodeApiMode = 'present',
): WebviewRun {
  const errors: string[] = [];
  const document = {
    querySelector(selector: string): FakeCanvas | null {
      return selector === 'canvas' ? canvas : null;
    },
  };
  const console = {
    error: (...args: unknown[]): void => {
      errors.push(args.map(String).join(' '));
    },
  };
  const api: FakeVsCodeApi = { acquireCalls: 0, posted: [] };
  const sandbox: Record<string, unknown> = { window, document, console };
  if (apiMode !== 'missing') {
    sandbox.acquireVsCodeApi = (): { postMessage(message: unknown): void } => {
      api.acquireCalls += 1;
      if (apiMode === 'throws') {
        throw new Error('acquireVsCodeApi failed');
      }
      return {
        postMessage(message: unknown): void {
          window.timeline.push('post');
          if (apiMode === 'postThrows') {
            throw new Error('postMessage failed');
          }
          api.posted.push(message);
        },
      };
    };
  }
  const context = vm.createContext(sandbox);
  vm.runInContext(webviewBundle(), context, { filename: 'webview.js' });
  return { window, canvas, errors, api, context };
}

/** Evaluates `expression` inside the bundle's realm, so its objects use that realm's prototypes. */
export function runInBundleRealm(run: WebviewRun, expression: string): unknown {
  return vm.runInContext(`(${expression})`, run.context);
}
