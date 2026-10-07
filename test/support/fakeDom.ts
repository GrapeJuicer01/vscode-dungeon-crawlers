// Minimal fake browser globals for running the webview bundle (dist/webview.js) in a node:vm
// context. Implements only what src/webview/main.ts touches: document.querySelector('canvas'),
// a canvas with a 2d context, window size / devicePixelRatio / listeners, and console.error.
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

type Listener = () => void;

export class FakeWindow {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  readonly listeners = new Map<string, Set<Listener>>();

  constructor(innerWidth: number, innerHeight: number, devicePixelRatio: number) {
    this.innerWidth = innerWidth;
    this.innerHeight = innerHeight;
    this.devicePixelRatio = devicePixelRatio;
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /** Calls every listener for `type`; a listener that throws propagates, as in a test it should not. */
  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }
}

export interface WebviewRun {
  readonly window: FakeWindow;
  readonly canvas: FakeCanvas | null;
  readonly errors: string[];
}

let cachedBundle: string | undefined;

function webviewBundle(): string {
  cachedBundle ??= readFileSync(repoPath('dist/webview.js'), 'utf8');
  return cachedBundle;
}

/**
 * Evaluates dist/webview.js once in a fresh vm context against the given fakes, as the webview
 * would on load. `canvas: null` simulates a document without a canvas.
 */
export function runWebviewBundle(window: FakeWindow, canvas: FakeCanvas | null): WebviewRun {
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
  vm.runInNewContext(webviewBundle(), { window, document, console }, { filename: 'webview.js' });
  return { window, canvas, errors };
}
