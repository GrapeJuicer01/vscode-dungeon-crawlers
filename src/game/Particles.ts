// Fixed-capacity particle pool in parallel typed arrays plus a free list. emit() returns false
// when the pool is full (the emission is dropped). Nothing is allocated in emit, update, or draw.
import type { Rng } from './rng';
import type { Surface } from './ports';
import { DRIP_GRAVITY_PX_PER_S2 } from './data/tuning';

export type ParticleKind =
  'ember' | 'spark' | 'drip' | 'splash' | 'mote' | 'bubble' | 'wisp' | 'firefly' | 'snow' | 'murk';
/** Kind -> CSS colour ramp, bright to dim by age. */
export type ParticleColors = Readonly<Record<ParticleKind, readonly string[]>>;

const KIND_NAMES: readonly ParticleKind[] = [
  'ember',
  'spark',
  'drip',
  'splash',
  'mote',
  'bubble',
  'wisp',
  'firefly',
  'snow',
  'murk',
];
const KIND_EMBER = 0;
const KIND_DRIP = 2;
const KIND_SPLASH = 3;
const KIND_MOTE = 4;
const KIND_BUBBLE = 5;
const KIND_WISP = 6;
const KIND_FIREFLY = 7;
const KIND_SNOW = 8;
const KIND_MURK = 9;

function kindIndex(kind: ParticleKind): number {
  return KIND_NAMES.indexOf(kind);
}

export class Particles {
  readonly #capacity: number;
  readonly #rng: Rng;
  readonly #x: Float32Array;
  readonly #y: Float32Array;
  readonly #vx: Float32Array;
  readonly #vy: Float32Array;
  readonly #age: Float32Array;
  readonly #life: Float32Array;
  readonly #kind: Uint8Array;
  readonly #alive: Uint8Array;
  readonly #free: Int32Array;
  #freeCount: number;
  #count = 0;

  constructor(capacity: number, rng: Rng) {
    this.#capacity = capacity;
    this.#rng = rng;
    this.#x = new Float32Array(capacity);
    this.#y = new Float32Array(capacity);
    this.#vx = new Float32Array(capacity);
    this.#vy = new Float32Array(capacity);
    this.#age = new Float32Array(capacity);
    this.#life = new Float32Array(capacity);
    this.#kind = new Uint8Array(capacity);
    this.#alive = new Uint8Array(capacity);
    this.#free = new Int32Array(capacity);
    this.#freeCount = capacity;
    for (let i = 0; i < capacity; i++) {
      this.#free[i] = capacity - 1 - i;
    }
  }

  get count(): number {
    return this.#count;
  }

  /** Velocities are px/s, life is ms. Returns false when the pool is full. */
  emit(kind: ParticleKind, x: number, y: number, vx: number, vy: number, lifeMs: number): boolean {
    return this.#emitIndexed(kindIndex(kind), x, y, vx, vy, lifeMs);
  }

  #emitIndexed(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    lifeMs: number,
  ): boolean {
    if (this.#freeCount === 0 || kind < 0 || !(lifeMs > 0)) {
      return false;
    }
    this.#freeCount--;
    const i = this.#free[this.#freeCount] ?? 0;
    this.#x[i] = x;
    this.#y[i] = y;
    this.#vx[i] = vx;
    this.#vy[i] = vy;
    this.#age[i] = 0;
    this.#life[i] = lifeMs;
    this.#kind[i] = kind;
    this.#alive[i] = 1;
    this.#count++;
    return true;
  }

  update(dtMs: number): void {
    if (!(dtMs > 0)) {
      return;
    }
    const dt = dtMs / 1000;
    for (let i = 0; i < this.#capacity; i++) {
      if (this.#alive[i] !== 1) {
        continue;
      }
      const age = (this.#age[i] ?? 0) + dtMs;
      const kind = this.#kind[i] ?? 0;
      if (age >= (this.#life[i] ?? 0)) {
        this.#alive[i] = 0;
        this.#free[this.#freeCount] = i;
        this.#freeCount++;
        this.#count--;
        if (kind === KIND_DRIP) {
          this.#splash(this.#x[i] ?? 0, this.#y[i] ?? 0);
        }
        continue;
      }
      this.#age[i] = age;
      if (kind === KIND_DRIP) {
        this.#vy[i] = (this.#vy[i] ?? 0) + DRIP_GRAVITY_PX_PER_S2 * dt;
      } else if (kind === KIND_SPLASH) {
        this.#vy[i] = (this.#vy[i] ?? 0) + DRIP_GRAVITY_PX_PER_S2 * dt;
      } else if (kind === KIND_MOTE) {
        // Dust motes wander gently in both axes (Stage 2 ambient).
        this.#vx[i] = (this.#vx[i] ?? 0) + (this.#rng() - 0.5) * 20 * dt;
        this.#vy[i] = (this.#vy[i] ?? 0) + (this.#rng() - 0.5) * 20 * dt;
      } else if (kind === KIND_BUBBLE) {
        // Bubbles rise (vy stays negative as emitted) and wobble sideways (Stage 3 ambient).
        this.#vx[i] = (this.#vx[i] ?? 0) + (this.#rng() - 0.5) * 30 * dt;
      } else if (kind === KIND_WISP) {
        // Fog wisps drift slowly sideways with a small vertical wander (Stage 4 ambient).
        this.#vy[i] = (this.#vy[i] ?? 0) + (this.#rng() - 0.5) * 6 * dt;
      } else if (kind === KIND_FIREFLY) {
        // Fireflies wander slowly in both axes (Stage 5 ambient); the blink is the colour ramp.
        this.#vx[i] = (this.#vx[i] ?? 0) + (this.#rng() - 0.5) * 48 * dt;
        this.#vy[i] = (this.#vy[i] ?? 0) + (this.#rng() - 0.5) * 48 * dt;
      } else if (kind === KIND_SNOW) {
        // Snow drifts sideways while falling slowly; vy stays as emitted (Stage 7 ambient).
        this.#vx[i] = (this.#vx[i] ?? 0) + (this.#rng() - 0.5) * 24 * dt;
      } else if (kind === KIND_MURK) {
        // Murk motes wander in both axes while rising as emitted (Stage 8 ambient).
        this.#vx[i] = (this.#vx[i] ?? 0) + (this.#rng() - 0.5) * 16 * dt;
        this.#vy[i] = (this.#vy[i] ?? 0) + (this.#rng() - 0.5) * 16 * dt;
      } else if (kind === KIND_EMBER) {
        // Slow sideways wander so embers do not rise in straight lines.
        this.#vx[i] = (this.#vx[i] ?? 0) + (this.#rng() - 0.5) * 60 * dt;
      }
      this.#x[i] = (this.#x[i] ?? 0) + (this.#vx[i] ?? 0) * dt;
      this.#y[i] = (this.#y[i] ?? 0) + (this.#vy[i] ?? 0) * dt;
    }
  }

  #splash(x: number, y: number): void {
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1;
      this.#emitIndexed(
        KIND_SPLASH,
        x,
        y,
        side * (8 + this.#rng() * 14),
        -(40 + this.#rng() * 30),
        200 + this.#rng() * 100,
      );
    }
  }

  draw(surface: Surface, colors: ParticleColors): void {
    for (let i = 0; i < this.#capacity; i++) {
      if (this.#alive[i] !== 1) {
        continue;
      }
      const kind = KIND_NAMES[this.#kind[i] ?? 0] ?? 'ember';
      const ramp = colors[kind];
      const t = (this.#age[i] ?? 0) / (this.#life[i] ?? 1);
      const color = ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
      if (color === undefined) {
        continue;
      }
      const w = kind === 'bubble' || kind === 'murk' ? 2 : kind === 'wisp' ? 6 : 1;
      const h = kind === 'drip' || kind === 'bubble' || kind === 'wisp' || kind === 'murk' ? 2 : 1;
      surface.fillRect(color, Math.floor(this.#x[i] ?? 0), Math.floor(this.#y[i] ?? 0), w, h);
    }
  }

  clear(): void {
    this.#alive.fill(0);
    this.#count = 0;
    this.#freeCount = this.#capacity;
    for (let i = 0; i < this.#capacity; i++) {
      this.#free[i] = this.#capacity - 1 - i;
    }
  }
}
