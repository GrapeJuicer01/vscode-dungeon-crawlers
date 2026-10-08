// Minimal fake browser globals for running the webview bundle (dist/webview.js) in a node:vm
// context. Implements only what src/webview/main.ts and canvasSurface.ts touch:
// document.querySelector('canvas'), document.createElement('canvas') (offscreen canvases),
// document.hidden and its visibilitychange listeners, a canvas with a recording 2d context
// (fillRect, drawImage, putImageData, setTransform), window size / devicePixelRatio / listeners
// with event dispatch, a manually stepped requestAnimationFrame / cancelAnimationFrame (M4),
// ImageData, console.error, and (M2) the global acquireVsCodeApi that VS Code injects.
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
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  readonly fills: { x: number; y: number; w: number; h: number; style: string }[] = [];
  /** Every drawImage call: the source canvas and the numeric arguments that followed it. */
  readonly draws: { source: unknown; args: number[]; composite: string; alpha: number }[] = [];
  /** Every putImageData call: the image's size and the destination. */
  readonly puts: { width: number; height: number; x: number; y: number }[] = [];
  /** Every setTransform call, in order. */
  readonly transforms: number[][] = [];

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fills.push({ x, y, w, h, style: this.fillStyle });
  }

  drawImage(source: unknown, ...args: number[]): void {
    this.draws.push({
      source,
      args,
      composite: this.globalCompositeOperation,
      alpha: this.globalAlpha,
    });
  }

  putImageData(image: { width: number; height: number }, x: number, y: number): void {
    this.puts.push({ width: image.width, height: image.height, x, y });
  }

  setTransform(...matrix: number[]): void {
    this.transforms.push(matrix);
  }
}

/** The ImageData global the bundle uses to turn RGBA into canvases. */
export class FakeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    if (data.length !== width * height * 4) {
      throw new RangeError('ImageData size mismatch');
    }
    this.data = data;
    this.width = width;
    this.height = height;
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
  /** Animation frame callbacks waiting to run, by handle. Nothing runs until runFrame(). */
  readonly pendingFrames = new Map<number, (nowMs: number) => void>();
  /** Every requestAnimationFrame handle ever issued, and every cancelled handle. */
  readonly frameRequests: number[] = [];
  readonly frameCancels: number[] = [];
  #nextFrameHandle = 1;

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

  requestAnimationFrame(callback: (nowMs: number) => void): number {
    const handle = this.#nextFrameHandle++;
    this.pendingFrames.set(handle, callback);
    this.frameRequests.push(handle);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.frameCancels.push(handle);
    this.pendingFrames.delete(handle);
  }

  /** Runs every callback pending right now (callbacks that re-request wait for the next call). */
  runFrame(nowMs: number): void {
    const due = [...this.pendingFrames.entries()];
    this.pendingFrames.clear();
    for (const [, callback] of due) {
      callback(nowMs);
    }
  }

  /** Runs `count` frames spaced `stepMs` apart, starting at `startMs`; returns the last time. */
  runFrames(count: number, startMs = 1000, stepMs = 1000 / 60): number {
    let now = startMs;
    for (let i = 0; i < count; i++) {
      this.runFrame(now);
      now += stepMs;
    }
    return now;
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

/** The document global: the main canvas, offscreen canvases, visibility, and its listeners. */
export class FakeDocument {
  hidden = false;
  readonly listeners = new Map<string, Set<Listener>>();
  /** Canvases made by createElement('canvas'), in order (sprites, strips, the light map). */
  readonly created: FakeCanvas[] = [];
  readonly #canvas: FakeCanvas | null;

  constructor(canvas: FakeCanvas | null) {
    this.#canvas = canvas;
  }

  querySelector(selector: string): FakeCanvas | null {
    return selector === 'canvas' ? this.#canvas : null;
  }

  createElement(tag: string): FakeCanvas {
    if (tag !== 'canvas') {
      throw new TypeError(`FakeDocument cannot create <${tag}>`);
    }
    const canvas = new FakeCanvas();
    this.created.push(canvas);
    return canvas;
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

  /** Sets `hidden` and fires visibilitychange, as the browser does. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of [...(this.listeners.get('visibilitychange') ?? [])]) {
      listener({ type: 'visibilitychange' });
    }
  }
}

export interface WebviewRun {
  readonly window: FakeWindow;
  readonly document: FakeDocument;
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
  options: { readonly hidden?: boolean; readonly failOffscreenContext?: boolean } = {},
): WebviewRun {
  const errors: string[] = [];
  const document = new FakeDocument(canvas);
  document.hidden = options.hidden ?? false;
  if (options.failOffscreenContext === true) {
    // Offscreen canvases (sprites, strips) cannot get a 2d context: the engine cannot boot.
    const create = document.createElement.bind(document);
    document.createElement = (tag: string): FakeCanvas => {
      const made = create(tag);
      made.context = null;
      return made;
    };
  }
  const console = {
    error: (...args: unknown[]): void => {
      errors.push(args.map(String).join(' '));
    },
  };
  const api: FakeVsCodeApi = { acquireCalls: 0, posted: [] };
  const sandbox: Record<string, unknown> = {
    window,
    document,
    console,
    ImageData: FakeImageData,
  };
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
  return { window, document, canvas, errors, api, context };
}

/** Evaluates `expression` inside the bundle's realm, so its objects use that realm's prototypes. */
export function runInBundleRealm(run: WebviewRun, expression: string): unknown {
  return vm.runInContext(`(${expression})`, run.context);
}
