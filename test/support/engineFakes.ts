// Fakes and builders for the engine suites (M4 plan section 7). The engine is DOM-free, so every
// test drives it through these: a RecordingSurface that logs and counts draw calls, a FakeBitmaps
// factory whose bitmaps remember their RGBA, a FakeScheduler for GameHost, and small builders for
// agents and games. Games use the shipped art (SHIPPED_ART) on fake bitmaps, so the tests cover
// the real data; the validators are exercised separately in spriteValidator.test.ts.
import { Game } from '../../src/game/Game';
import type { GameDeps } from '../../src/game/Game';
import { STAGES } from '../../src/game/data/stages';
import { ENGINE_SEED, STEP_MS } from '../../src/game/data/tuning';
import { Hero } from '../../src/game/entities/Hero';
import type { HeroFactory, HeroInit } from '../../src/game/entities/Hero';
import type {
  Bitmap,
  BitmapFactory,
  Composite,
  ErrorScope,
  OffscreenSurface,
  Surface,
} from '../../src/game/ports';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import type { AgentInfo, AgentState } from '../../src/shared/protocol';

export interface DrawCall {
  readonly method: string;
  readonly args: readonly unknown[];
  /** The composite and alpha in force when the call was made. */
  readonly composite: Composite;
  readonly alpha: number;
}

/** Logs every call in order (optionally), counts per method, and can be told to throw. */
export class RecordingSurface implements Surface {
  readonly width: number;
  readonly height: number;
  readonly calls: DrawCall[] = [];
  readonly counts = new Map<string, number>();
  composite: Composite = 'source-over';
  alpha = 1;
  /** When false, only counts are kept (long runs). */
  record = true;
  /** Throws from the next matching call(s); `count` Infinity throws forever. */
  failure: { readonly method: string; remaining: number; readonly message: string } | null = null;

  constructor(width = 320, height = 180) {
    this.width = width;
    this.height = height;
  }

  #log(method: string, args: readonly unknown[]): void {
    if (this.failure !== null && this.failure.method === method && this.failure.remaining > 0) {
      this.failure.remaining -= 1;
      throw new Error(this.failure.message);
    }
    this.counts.set(method, (this.counts.get(method) ?? 0) + 1);
    if (this.record) {
      this.calls.push({ method, args, composite: this.composite, alpha: this.alpha });
    }
  }

  count(method: string): number {
    return this.counts.get(method) ?? 0;
  }

  /** drawBitmap + drawBitmapRegion calls (the engine's "bitmap draws"). */
  get bitmapDraws(): number {
    return this.count('drawBitmap') + this.count('drawBitmapRegion');
  }

  /** Forget everything logged so far (keeps `failure`). */
  reset(): void {
    this.calls.length = 0;
    this.counts.clear();
  }

  failOn(method: string, message: string, times = 1): void {
    this.failure = { method, remaining: times, message };
  }

  clear(color: string): void {
    this.#log('clear', [color]);
  }

  fillRect(color: string, x: number, y: number, w: number, h: number): void {
    this.#log('fillRect', [color, x, y, w, h]);
  }

  drawBitmap(bitmap: Bitmap, dx: number, dy: number, flipX: boolean): void {
    this.#log('drawBitmap', [bitmap, dx, dy, flipX]);
  }

  drawBitmapRegion(
    bitmap: Bitmap,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    this.#log('drawBitmapRegion', [bitmap, sx, sy, sw, sh, dx, dy, dw, dh]);
  }

  setComposite(op: Composite): void {
    this.#log('setComposite', [op]);
    this.composite = op;
  }

  setAlpha(alpha: number): void {
    this.#log('setAlpha', [alpha]);
    this.alpha = alpha;
  }
}

export class FakeBitmap implements Bitmap {
  readonly width: number;
  readonly height: number;
  /** Present for fromRgba bitmaps. */
  readonly rgba: Uint8ClampedArray | null;
  /** Present for offscreen bitmaps: the surface that was drawn on. */
  readonly surface: RecordingSurface | null;

  constructor(
    width: number,
    height: number,
    rgba: Uint8ClampedArray | null,
    surface: RecordingSurface | null,
  ) {
    this.width = width;
    this.height = height;
    this.rgba = rgba;
    this.surface = surface;
  }

  /** The [r, g, b, a] of one pixel. */
  pixel(x: number, y: number): [number, number, number, number] {
    const rgba = this.rgba;
    if (rgba === null) {
      throw new TypeError('not an RGBA bitmap');
    }
    const i = (y * this.width + x) * 4;
    return [rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0, rgba[i + 3] ?? 0];
  }
}

export class FakeBitmaps implements BitmapFactory {
  readonly fromRgbaBitmaps: FakeBitmap[] = [];
  readonly offscreens: (OffscreenSurface & { readonly surface: RecordingSurface })[] = [];
  /** Offscreen surfaces keep full logs only when asked (strips log hundreds of calls). */
  recordOffscreen = true;

  fromRgba(width: number, height: number, rgba: Uint8ClampedArray): FakeBitmap {
    const bitmap = new FakeBitmap(width, height, rgba.slice(), null);
    this.fromRgbaBitmaps.push(bitmap);
    return bitmap;
  }

  createOffscreen(width: number, height: number): OffscreenSurface & { surface: RecordingSurface } {
    const surface = new RecordingSurface(width, height);
    surface.record = this.recordOffscreen;
    const bitmap = new FakeBitmap(width, height, null, surface);
    const offscreen = Object.assign(surface, { bitmap, surface });
    this.offscreens.push(offscreen);
    return offscreen;
  }
}

export class FakeScheduler {
  readonly pending = new Map<number, (nowMs: number) => void>();
  readonly requested: number[] = [];
  readonly cancelled: number[] = [];
  /** Makes request() throw this many times before working again. */
  throwOnRequest = 0;
  #next = 1;

  request = (cb: (nowMs: number) => void): number => {
    if (this.throwOnRequest > 0) {
      this.throwOnRequest -= 1;
      throw new Error('scheduler request failed');
    }
    const handle = this.#next++;
    this.pending.set(handle, cb);
    this.requested.push(handle);
    return handle;
  };

  cancel = (handle: number): void => {
    this.cancelled.push(handle);
    this.pending.delete(handle);
  };

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Runs the callbacks pending right now at `nowMs`. */
  tick(nowMs: number): void {
    const due = [...this.pending.values()];
    this.pending.clear();
    for (const callback of due) {
      callback(nowMs);
    }
  }
}

export function agent(
  id: string,
  state: AgentState,
  toolName: string | null = null,
  timestamp = 1,
): AgentInfo {
  return { id, name: `Agent ${id}`, state, toolName, timestamp };
}

export interface GameRig {
  readonly game: Game;
  readonly surface: RecordingSurface;
  readonly bitmaps: FakeBitmaps;
  /** Every (error, scope) the game reported to onError. */
  readonly errors: { readonly error: unknown; readonly scope: ErrorScope }[];
  /** The list the game reads after a queue overflow; tests keep it in step with the events. */
  mirror: AgentInfo[];
}

export interface GameRigOptions {
  readonly heroFactory?: HeroFactory;
  readonly seed?: number;
  readonly onError?: GameDeps['onError'];
  readonly record?: boolean;
  /** Defaults to SHIPPED_ART; class suites pass a variant (for example without class layers). */
  readonly art?: ArtSet;
}

/** A Game over SHIPPED_ART and Stage 1 on fake bitmaps and a recording surface. */
export function gameRig(options: GameRigOptions = {}): GameRig {
  const bitmaps = new FakeBitmaps();
  bitmaps.recordOffscreen = false;
  const surface = new RecordingSurface();
  surface.record = options.record ?? false;
  const errors: GameRig['errors'] = [];
  const rig: GameRig = { game: undefined as unknown as Game, surface, bitmaps, errors, mirror: [] };
  const deps: GameDeps = {
    art: options.art ?? SHIPPED_ART,
    stages: STAGES,
    bitmaps,
    onError:
      options.onError ??
      ((error, scope) => {
        errors.push({ error, scope });
      }),
    seed: options.seed ?? ENGINE_SEED,
    agentSource: () => rig.mirror,
    ...(options.heroFactory === undefined ? {} : { heroFactory: options.heroFactory }),
  };
  return Object.assign(rig, { game: new Game(deps) });
}

/** Feeds an event to the game the way SceneFeed does: the mirror first, then the queue. */
export function feed(rig: GameRig, info: AgentInfo): void {
  if (info.state === 'despawned') {
    rig.mirror = rig.mirror.filter((a) => a.id !== info.id);
  } else {
    const at = rig.mirror.findIndex((a) => a.id === info.id);
    rig.mirror =
      at < 0 ? [...rig.mirror, info] : rig.mirror.map((a) => (a.id === info.id ? info : a));
  }
  rig.game.enqueueAgent(info);
}

/** Runs `ms` of game time as 60 Hz frames (each exactly one step). */
export function run(rig: GameRig, ms: number): void {
  const frames = Math.round(ms / STEP_MS);
  for (let i = 0; i < frames; i++) {
    rig.game.frame(STEP_MS, rig.surface);
  }
}

/** Convenience: id/lifecycle/exiting of the running game as one comparable string. */
export function describeHeroes(rig: GameRig): string {
  return JSON.stringify(
    rig.game
      .heroSnapshot()
      .map((h) => [h.id, h.lifecycle, h.exiting])
      .sort(),
  );
}

/** A hero factory that remembers every hero it made (creation order), for phase access. */
export interface HeroLog<H extends Hero = Hero> {
  readonly factory: HeroFactory;
  /** Every hero ever created, including removed ones. */
  readonly made: H[];
  /** The live hero for an id (the most recently created one). */
  byId(id: string): H;
}

export function heroLog<H extends Hero = Hero>(make?: (init: HeroInit) => H): HeroLog<H> {
  const made: H[] = [];
  return {
    made,
    factory: (init) => {
      const hero = make === undefined ? (new Hero(init) as H) : make(init);
      made.push(hero);
      return hero;
    },
    byId(id: string): H {
      for (let i = made.length - 1; i >= 0; i--) {
        const hero = made[i];
        if (hero !== undefined && hero.id === id) {
          return hero;
        }
      }
      throw new Error(`no hero ${id}`);
    },
  };
}

/** Advance by calling step() only (no render), rendering once per `renderEveryMs`. */
export function steps(rig: GameRig, ms: number, renderEveryMs = 1000): void {
  const count = Math.round(ms / STEP_MS);
  const renderEvery = Math.max(1, Math.round(renderEveryMs / STEP_MS));
  for (let i = 0; i < count; i++) {
    rig.game.step();
    if (i % renderEvery === renderEvery - 1) {
      rig.game.render(rig.surface);
    }
  }
}
