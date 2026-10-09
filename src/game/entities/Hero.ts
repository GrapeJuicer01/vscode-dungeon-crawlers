// The base hero (ADR 0002, ADR 0009). A hero stores exactly one fact about its agent, `lifecycle`,
// and it changes only in applyAgentState, which only Roster calls, fed by host agent-state
// events. `phase` is cosmetic and derived: update() compares the stored lifecycle with the phase
// it should be in. Nothing in the world (engagement, camera, particles, pathfinding, faults) can
// reach lifecycle. Drawing uses only bitmap draws; no number or bar is ever drawn on a hero.
import { assertNever } from '../../shared/assertNever';
import type { AgentInfo, AgentState } from '../../shared/protocol';
import { ABILITY_TOTAL_MS, HERO_FRAME_MS, heroFrameIndex } from '../data/animations';
import {
  ABILITY_RELEASE_FRAME,
  ATTACK_STAGGER_MAX_MS,
  ATTACK_STRIKE_FRAME,
  HERO_SHADOW_WIDTH_PX,
  PATH_RETRY_MS,
  REST_POSE_MAX_MS,
  REST_POSE_MIN_MS,
  SLEEP_AFTER_REST_MS,
  VICTORY_MS,
  WALK_PX_PER_S,
  WARP_IN_MS,
  WARP_OUT_MS,
  WARP_SPARKS_PER_S,
} from '../data/tuning';
import { CAMPFIRE_X, entrancePosition, formationPosition, seatPosition } from '../layout';
import type { Point } from '../layout';
import { PathBuffer, findPath } from '../Pathfinding';
import { hashId } from '../rng';
import type { HeroLook, HeroSprites } from '../sprites/spriteFactory';
import type { HeroLayerSet } from '../sprites/spriteTypes';
import { GuardedEntity } from './Entity';
import type { DrawContext, World } from './Entity';

export type HeroPhase =
  | 'warpIn'
  | 'standby'
  | 'travel'
  | 'advance'
  | 'attack'
  | 'ability'
  | 'rest'
  | 'victory'
  | 'warpOut';

export interface HeroInit {
  readonly info: AgentInfo;
  readonly slot: number;
  /** True for a rebuild from a snapshot or a missed `spawned`: no warp-in, placed by lifecycle. */
  readonly instant: boolean;
  readonly look: HeroLook;
}

type GoalKind = 'entrance' | 'formation' | 'seat';

const REST_POSES = ['sit', 'eat', 'polish', 'read', 'warmHands', 'sleep'] as const;
const SLEEP_POSE = 'sleep';
const PATH_CAPACITY = 160;
const MAX_MOVES_PER_UPDATE = 8;
const ATTACK_FRAME_COUNT = HERO_FRAME_MS['attack']?.length ?? 3;
const ABILITY_FRAME_COUNT = HERO_FRAME_MS['ability']?.length ?? 3;

export class Hero extends GuardedEntity {
  readonly id: string;
  readonly slot: number;
  readonly look: HeroLook;
  readonly shadowWidth = HERO_SHADOW_WIDTH_PX;

  #name: string;
  #lifecycle: AgentState;
  #phase: HeroPhase;
  #phaseMs = 0;
  #animMs = 0;
  #x = 0;
  #y = 0;
  #faceRight = true;
  #removable = false;
  #exitMs = 0;
  #sprites: HeroSprites | null = null;

  readonly #path = new PathBuffer(PATH_CAPACITY);
  #pathIndex = 0;
  #goalKind: GoalKind | null = null;
  readonly #goal: Point = { x: 0, y: 0 };
  #retryMs = 0;

  #restPose: string;
  #restMs = 0;
  #poseClockMs = 0;
  #nextPoseMs: number;

  readonly #stagger: number;
  #engageMs = 0;
  #attackFrame = -1;
  #abilityReleased = false;
  #strikeSerial = 0;
  #abilitySerial = 0;
  #sparkDebt = 0;

  constructor(init: HeroInit) {
    super();
    this.id = init.info.id;
    this.#name = init.info.name;
    this.slot = init.slot;
    this.look = init.look;
    this.#lifecycle = init.info.state;
    const h = hashId(init.info.id);
    this.#stagger = h % (ATTACK_STAGGER_MAX_MS + 1);
    this.#restPose = REST_POSES[h % (REST_POSES.length - 1)] ?? 'sit';
    this.#nextPoseMs = REST_POSE_MIN_MS + (h % (REST_POSE_MAX_MS - REST_POSE_MIN_MS));
    this.#phase = 'standby';
    this.#placeEntrance();
    if (!init.instant) {
      this.#phase = 'warpIn';
    } else {
      switch (init.info.state) {
        case 'working':
          this.#snapTo('formation');
          this.#phase = 'advance';
          this.#faceRight = true;
          break;
        case 'idle':
          this.#snapTo('seat');
          this.#phase = 'rest';
          this.#faceRight = this.#x < CAMPFIRE_X;
          break;
        case 'spawned':
        case 'despawned':
          this.#phase = 'standby';
          break;
        default:
          assertNever(init.info.state);
      }
    }
  }

  get name(): string {
    return this.#name;
  }

  get lifecycle(): AgentState {
    return this.#lifecycle;
  }

  get phase(): HeroPhase {
    return this.#phase;
  }

  /** Lifecycle despawned: the exit animation is playing or done. */
  get exiting(): boolean {
    return this.#lifecycle === 'despawned';
  }

  /** The exit animation finished; the roster may drop the hero. */
  get removable(): boolean {
    return this.#removable;
  }

  get x(): number {
    return this.#x;
  }

  get y(): number {
    return this.#y;
  }

  /** The cosmetic class, or null for the base hero. Set once from the id; never changes. */
  get classId(): string | null {
    return this.look.classId;
  }

  /** Counts strikes released; read by Roster.collectFighters. Never read for lifecycle or phase. */
  get strikeSerial(): number {
    return this.#strikeSerial;
  }

  /** Counts abilities released; read by Roster.collectFighters. */
  get abilitySerial(): number {
    return this.#abilitySerial;
  }

  get faceRight(): boolean {
    return this.#faceRight;
  }

  get sortY(): number {
    return Math.floor(this.#y);
  }

  /** 0 outside the warp phases; otherwise 0..1..0 over the warp (drives the renderer's beam). */
  get warpBeam(): number {
    if (this.#phase === 'warpIn') {
      return Math.sin(Math.PI * Math.min(1, this.#phaseMs / WARP_IN_MS));
    }
    if (this.#phase === 'warpOut') {
      return Math.sin(Math.PI * Math.min(1, this.#phaseMs / WARP_OUT_MS));
    }
    return 0;
  }

  /** Game time since the despawned event, kept by the roster for the exit failsafe. */
  get exitClockMs(): number {
    return this.#exitMs;
  }

  advanceExitClock(dtMs: number): void {
    if (this.exiting) {
      this.#exitMs += dtMs;
    }
  }

  /**
   * The ONLY writer of lifecycle. Called only from Roster, from a host agent-state event (or a
   * host snapshot). A host event also lifts any fault quarantine.
   */
  applyAgentState(info: AgentInfo): void {
    if (info.id !== this.id) {
      return;
    }
    this.#name = info.name;
    if (info.state === 'despawned' && this.#lifecycle !== 'despawned') {
      this.#exitMs = 0;
    }
    this.#lifecycle = info.state;
    this.clearFaults();
  }

  /** The layers this hero is drawn from. Class subclasses (H1-H3) override this. */
  protected heroLayers(world: World): HeroLayerSet {
    return world.cache.baseHero;
  }

  /**
   * Cosmetic hooks (H1). They receive only the World, which has no roster, so a hook has no path
   * to applyAgentState. The base hero does nothing and never casts.
   */
  /** Fires once each time the attack animation enters ATTACK_STRIKE_FRAME. */
  protected onAttackStrike(_world: World): void {
    // Base hero: nothing to play.
  }

  /** Asked each update while the phase is `attack` and the party is engaged. */
  protected shouldCastAbility(_dtMs: number, _world: World): boolean {
    return false;
  }

  /** Fires once per ability on animation frame ABILITY_RELEASE_FRAME. */
  protected onAbilityRelease(_world: World): void {
    // Base hero: nothing to play.
  }

  update(dtMs: number, world: World): void {
    this.#phaseMs += dtMs;
    this.#animMs += dtMs;
    switch (this.#phase) {
      case 'warpOut':
        this.#sparks(dtMs, world);
        if (this.#phaseMs >= WARP_OUT_MS) {
          this.#removable = true;
        }
        return;
      case 'victory':
        if (this.#phaseMs >= VICTORY_MS) {
          this.#enter('warpOut');
        }
        return;
      case 'warpIn':
      case 'standby':
      case 'travel':
      case 'advance':
      case 'attack':
      case 'ability':
      case 'rest':
        break;
      default:
        assertNever(this.#phase);
    }
    if (this.#lifecycle === 'despawned') {
      this.#faceRight = true;
      this.#enter('victory');
      return;
    }
    switch (this.#phase) {
      case 'warpIn':
        this.#sparks(dtMs, world);
        if (this.#phaseMs >= WARP_IN_MS) {
          this.#afterWarpIn(world);
        }
        return;
      case 'standby':
        this.#updateStandby(dtMs, world);
        return;
      case 'travel':
        this.#updateTravel(dtMs, world);
        return;
      case 'advance':
      case 'attack':
      case 'ability':
        this.#updateFighting(dtMs, world);
        return;
      case 'rest':
        this.#updateRest(dtMs, world);
        return;
      default:
        assertNever(this.#phase);
    }
  }

  draw(ctx: DrawContext): void {
    const world = ctx.world;
    this.#sprites ??= world.cache.hero(this.look, this.heroLayers(world));
    // A brief white silhouette after an enemy attack (cosmetic; ADR 0013). Warp phases ignore it.
    // Only how the hero is drawn changes: x, y, phase, and lifecycle are never written here.
    const warping = this.#phase === 'warpIn' || this.#phase === 'warpOut';
    const flashing = !warping && ctx.reactions.flashing(this.slot);
    const sprites = flashing
      ? world.cache.heroFlash(this.look, this.heroLayers(world))
      : this.#sprites;
    const set = sprites[this.#animationName()];
    if (set === undefined) {
      return;
    }
    const frame =
      set.frames[heroFrameIndex(this.#animationName(), this.#animMs, set.frames.length)];
    if (frame === undefined) {
      return;
    }
    const x = Math.floor(this.#x);
    const y = Math.floor(this.#y);
    const dy = y - set.anchor.y;
    if (this.#phase === 'warpIn' || this.#phase === 'warpOut') {
      // The warp reveals (in) or hides (out) the sprite from the top. Warp phases always face
      // right, so region draws need no mirroring.
      const p =
        this.#phase === 'warpIn' ? this.#phaseMs / WARP_IN_MS : 1 - this.#phaseMs / WARP_OUT_MS;
      const rows = Math.min(set.h, Math.max(0, Math.ceil(set.h * Math.min(1, Math.max(0, p)))));
      if (rows > 0) {
        const sy = set.h - rows;
        ctx.surface.drawBitmapRegion(
          frame,
          0,
          sy,
          set.w,
          rows,
          x - set.anchor.x,
          dy + sy,
          set.w,
          rows,
        );
      }
      return;
    }
    const flip = !this.#faceRight;
    const slide = ctx.reactions.offsetPx(this.slot);
    const dx = (flip ? x - (set.w - 1 - set.anchor.x) : x - set.anchor.x) + slide;
    ctx.surface.drawBitmap(frame, dx, dy, flip);
  }

  // ---- internals ----

  #animationName(): string {
    switch (this.#phase) {
      case 'warpIn':
      case 'standby':
        return 'idle';
      case 'travel':
      case 'advance':
        return 'walk';
      case 'attack':
        return 'attack';
      case 'ability':
        return 'ability';
      case 'rest':
        return this.#restPose;
      case 'victory':
      case 'warpOut':
        return 'victory';
      default:
        return assertNever(this.#phase);
    }
  }

  #enter(phase: HeroPhase): void {
    if (phase === 'attack') {
      this.#attackFrame = -1;
    } else if (phase === 'ability') {
      this.#abilityReleased = false;
    }
    this.#phase = phase;
    this.#phaseMs = 0;
    this.#animMs = 0;
  }

  #placeEntrance(): void {
    entrancePosition(this.slot, this.#goal);
    this.#x = this.#goal.x;
    this.#y = this.#goal.y;
  }

  #goalFor(kind: GoalKind): void {
    switch (kind) {
      case 'entrance':
        entrancePosition(this.slot, this.#goal);
        return;
      case 'formation':
        formationPosition(this.slot, this.#goal);
        return;
      case 'seat':
        seatPosition(this.slot, this.#goal);
        return;
      default:
        assertNever(kind);
    }
  }

  #snapTo(kind: GoalKind): void {
    this.#goalFor(kind);
    this.#goalKind = kind;
    this.#x = this.#goal.x;
    this.#y = this.#goal.y;
  }

  #desiredGoal(): GoalKind {
    switch (this.#lifecycle) {
      case 'working':
        return 'formation';
      case 'idle':
        return 'seat';
      case 'spawned':
      case 'despawned':
        return 'entrance';
      default:
        return assertNever(this.#lifecycle);
    }
  }

  #afterWarpIn(world: World): void {
    if (this.#lifecycle === 'spawned') {
      this.#enter('standby');
    } else {
      this.#startTravel(world);
    }
  }

  /** Plans a path to the goal for the current lifecycle; unreachable leaves the hero standing. */
  #startTravel(world: World): void {
    const kind = this.#desiredGoal();
    this.#goalFor(kind);
    const count = findPath(
      world.stage.nav,
      this.#x,
      this.#y,
      this.#goal.x,
      this.#goal.y,
      this.#path,
    );
    if (count === 0) {
      // Stay where we are and try again later: never an error, never a removal.
      this.#goalKind = null;
      this.#retryMs = PATH_RETRY_MS;
      this.#enter('standby');
      return;
    }
    this.#goalKind = kind;
    this.#pathIndex = 0;
    this.#enter('travel');
  }

  #updateStandby(dtMs: number, world: World): void {
    if (this.#lifecycle === 'spawned') {
      return;
    }
    if (this.#retryMs > 0) {
      this.#retryMs -= dtMs;
      return;
    }
    this.#startTravel(world);
  }

  #updateTravel(dtMs: number, world: World): void {
    if (this.#goalKind !== this.#desiredGoal()) {
      this.#startTravel(world);
      if (this.#phase !== 'travel') {
        return;
      }
    }
    let budget = (WALK_PX_PER_S * dtMs) / 1000;
    for (let guard = 0; guard < MAX_MOVES_PER_UPDATE && budget > 0; guard++) {
      const onPath = this.#pathIndex < this.#path.length;
      const tx = onPath ? (this.#path.xs[this.#pathIndex] ?? this.#goal.x) : this.#goal.x;
      const ty = onPath ? (this.#path.ys[this.#pathIndex] ?? this.#goal.y) : this.#goal.y;
      const dx = tx - this.#x;
      const dy = ty - this.#y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001 && Math.abs(dx) > 0.001) {
        this.#faceRight = dx > 0;
      }
      if (dist <= budget) {
        this.#x = tx;
        this.#y = ty;
        budget -= dist;
        if (onPath) {
          this.#pathIndex++;
          continue;
        }
        this.#arrive();
        return;
      }
      this.#x += (dx / dist) * budget;
      this.#y += (dy / dist) * budget;
      return;
    }
  }

  #arrive(): void {
    switch (this.#lifecycle) {
      case 'working':
        this.#faceRight = true;
        this.#engageMs = 0;
        this.#enter('advance');
        return;
      case 'idle':
        this.#faceRight = this.#x < CAMPFIRE_X;
        this.#restMs = 0;
        this.#poseClockMs = 0;
        this.#restPose = 'sit';
        this.#enter('rest');
        return;
      case 'spawned':
      case 'despawned':
        this.#enter('standby');
        return;
      default:
        assertNever(this.#lifecycle);
    }
  }

  #updateFighting(dtMs: number, world: World): void {
    if (this.#lifecycle !== 'working') {
      this.#startTravel(world);
      return;
    }
    if (this.#phase === 'ability') {
      this.#updateAbility(world);
      return;
    }
    if (world.engagement.isEngaged) {
      this.#engageMs += dtMs;
      if (this.#phase === 'advance' && this.#engageMs >= this.#stagger) {
        this.#enter('attack');
      } else if (this.#phase === 'attack') {
        this.#updateAttack(dtMs, world);
      }
    } else {
      this.#engageMs = 0;
      if (this.#phase === 'attack') {
        this.#enter('advance');
      }
    }
  }

  /** Strike detection (once per attack cycle) and the ability trigger. */
  #updateAttack(dtMs: number, world: World): void {
    const frame = heroFrameIndex('attack', this.#animMs, ATTACK_FRAME_COUNT);
    if (frame !== this.#attackFrame) {
      this.#attackFrame = frame;
      if (frame === ATTACK_STRIKE_FRAME) {
        this.#strikeSerial++;
        this.onAttackStrike(world);
      }
    }
    if (this.shouldCastAbility(dtMs, world)) {
      this.#enter('ability');
    }
  }

  /** Plays the 3-frame ability in place, releases its effects once, then resumes fighting. */
  #updateAbility(world: World): void {
    if (
      !this.#abilityReleased &&
      heroFrameIndex('ability', this.#animMs, ABILITY_FRAME_COUNT) >= ABILITY_RELEASE_FRAME
    ) {
      this.#abilityReleased = true;
      this.#abilitySerial++;
      this.onAbilityRelease(world);
    }
    if (this.#phaseMs >= ABILITY_TOTAL_MS) {
      this.#enter(world.engagement.isEngaged ? 'attack' : 'advance');
    }
  }

  #updateRest(dtMs: number, world: World): void {
    if (this.#lifecycle !== 'idle') {
      this.#startTravel(world);
      return;
    }
    this.#restMs += dtMs;
    this.#poseClockMs += dtMs;
    if (this.#poseClockMs >= this.#nextPoseMs) {
      this.#poseClockMs = 0;
      this.#nextPoseMs = REST_POSE_MIN_MS + world.rng() * (REST_POSE_MAX_MS - REST_POSE_MIN_MS);
      // Pick a different pose; sleep only after a long rest.
      for (let tries = 0; tries < 6; tries++) {
        const pick = REST_POSES[Math.floor(world.rng() * REST_POSES.length)] ?? 'sit';
        if (
          pick === this.#restPose ||
          (pick === SLEEP_POSE && this.#restMs < SLEEP_AFTER_REST_MS)
        ) {
          continue;
        }
        this.#restPose = pick;
        this.#animMs = 0;
        break;
      }
    }
  }

  #sparks(dtMs: number, world: World): void {
    this.#sparkDebt += (WARP_SPARKS_PER_S * dtMs) / 1000;
    while (this.#sparkDebt >= 1) {
      this.#sparkDebt -= 1;
      world.particles.emit(
        'spark',
        this.#x + (world.rng() - 0.5) * 12,
        this.#y - world.rng() * 22,
        (world.rng() - 0.5) * 16,
        -(10 + world.rng() * 30),
        300 + world.rng() * 300,
      );
    }
  }
}

export type HeroFactory = (init: HeroInit) => Hero;
