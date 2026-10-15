// The wave director and the only code that reduces enemy health (enemy side, ADR 0013). It reads a
// FighterBuffer of plain numbers and writes enemy state, drops, and cosmetic reactions on the
// HitReactions board. It has no hero reference, imports nothing from the hero side, and never
// changes a hero: an enemy attack becomes one flash(slot, ...) call and nothing else. Allied summons
// are not in the buffer, so they are never targets. All randomness is the engine's seeded generator.
// Steady state allocates nothing: pools, a reused list, and typed scratch arrays.
import {
  ABILITY_POWER,
  ABILITY_TARGETS,
  ATTACK_JITTER,
  STRIKE_POWER,
  TIER_ATTACK_MS,
  healthOf,
} from './data/enemies';
import type { EnemyRow } from './data/enemies';
import { BOSS_COIN_BURST, DROP_CHANCE } from './data/drops';
import {
  BOSS_GAP_PX,
  BOSS_SLAM_TARGETS,
  BOSS_STAND_MAX_X,
  COMBAT_FAULT_LIMIT,
  ELITE_WEIGHT,
  ENEMY_CAPACITY,
  ENEMY_GAP_PX,
  ENEMY_LANE_COUNT,
  ENEMY_LANE_FOOT_Y,
  ENEMY_LANE_STEP_PX,
  ENEMY_SPAWN_X,
  ENEMY_STAND_MAX_X,
  HIT_SPARKS,
  MAX_SERIAL_DELTA,
  MINION_WEIGHT,
  STAGE_CLEAR_HOLD_MS,
  WAVE_GAP_MS,
  WITHDRAW_AFTER_MS,
} from './data/tuning';
import type { StageDef } from './data/stages';
import { Boss } from './entities/Boss';
import { Enemy } from './entities/Enemy';
import { guarded } from './entities/Entity';
import type { Entity, World } from './entities/Entity';
import { Drops } from './Drops';
import type { FighterBuffer } from './Fighters';
import type { HitReactions } from './HitReactions';
import type { ErrorSink, Surface } from './ports';
import type { Progression } from './Progression';
import type { Rng } from './rng';

export interface CombatConfig {
  readonly enabled: boolean;
  readonly killsPerStage: number;
  readonly maxEnemies: number;
}

/** Plain callbacks into Game; numbers and flags only. */
export interface CombatEvents {
  /** The boss was defeated and the hold elapsed. */
  onStageClear(): void;
  /** A kill (false) or a boss defeat (true). */
  onProgress(urgent: boolean): void;
}

/** Slots above this are ignored by the strike bookkeeping (slots stay far below it). */
const SLOT_TRACK = 256;
const DEFAULT_KILLS_PER_STAGE = 30;
const DEFAULT_MAX_ENEMIES = 6;

export class Combat {
  readonly #rows: readonly EnemyRow[];
  readonly #rng: Rng;
  readonly #reactions: HitReactions;
  readonly #progression: Progression;
  readonly #events: CombatEvents;
  readonly #onError: ErrorSink;
  readonly #constructEnabled: boolean;
  readonly #pool: Enemy[] = [];
  readonly #boss = new Boss();
  readonly #drops = new Drops();
  readonly #live: Entity[] = [];
  readonly #seenStrike = new Int32Array(SLOT_TRACK);
  readonly #seenAbility = new Int32Array(SLOT_TRACK);
  /** 1 once the slot has been seen in the current stretch of fighting (baseline taken). */
  readonly #tracked = new Uint8Array(SLOT_TRACK);
  readonly #presentNow = new Uint8Array(SLOT_TRACK);
  readonly #picked: Enemy[] = [];
  readonly #victims = new Int32Array(BOSS_SLAM_TARGETS);

  #userEnabled = true;
  #killsPerStage = DEFAULT_KILLS_PER_STAGE;
  #maxEnemies = DEFAULT_MAX_ENEMIES;
  #faults = 0;
  #stage: StageDef | null = null;
  #regularRows: readonly EnemyRow[] = [];
  #bossRow: EnemyRow | null = null;
  #transitioning = false;
  #waveGapMs = 0;
  #noFightersMs = 0;
  #clearing = false;
  #holdMs = 0;
  #current: Enemy | null = null;
  #currentWorld: World | null = null;
  #currentDt = 0;
  readonly #updateCurrent = (): void => {
    if (this.#current !== null && this.#currentWorld !== null) {
      this.#current.update(this.#currentDt, this.#currentWorld);
    }
  };

  constructor(
    rows: readonly EnemyRow[],
    rng: Rng,
    reactions: HitReactions,
    progression: Progression,
    events: CombatEvents,
    enabled: boolean,
    onError: ErrorSink = () => undefined,
  ) {
    this.#rows = rows;
    this.#rng = rng;
    this.#reactions = reactions;
    this.#progression = progression;
    this.#events = events;
    this.#constructEnabled = enabled;
    this.#onError = onError;
    for (let i = 0; i < ENEMY_CAPACITY; i++) {
      this.#pool.push(new Enemy());
    }
  }

  configure(config: CombatConfig): void {
    this.#userEnabled = config.enabled;
    this.#killsPerStage = Math.max(1, Math.floor(config.killsPerStage));
    this.#maxEnemies = Math.max(1, Math.min(ENEMY_CAPACITY, Math.floor(config.maxEnemies)));
    if (this.disabled) {
      this.#disableClear();
    }
  }

  /**
   * Disabling combat during the stage-clear hold would drop the pending transition after
   * Progression already advanced the stage, leaving the scene on the old stage. Complete it
   * now (the same onStageClear path; touches no hero state), then clear.
   */
  #disableClear(): void {
    const pending = this.#clearing;
    this.clear();
    if (pending) {
      this.#events.onStageClear();
    }
  }

  /** Picks the stage's rows; clears live enemies and drops. */
  setStage(def: StageDef): void {
    this.#stage = def;
    this.#regularRows = this.#rows.filter((r) => r.stage === def.index && r.tier !== 'boss');
    this.#bossRow = this.#rows.find((r) => r.stage === def.index && r.tier === 'boss') ?? null;
    this.clear();
  }

  /** Game: true while a stage fade runs, so nothing spawns across the swap. */
  setTransitioning(on: boolean): void {
    this.#transitioning = on;
  }

  /** Game: records an exception from update(); the third disables combat for the page load. */
  recordFault(): void {
    this.#faults += 1;
    if (this.#faults >= COMBAT_FAULT_LIMIT) {
      this.#disableClear();
    }
  }

  /** Disabled by the setting, an invalid table, or three faults. */
  get disabled(): boolean {
    return !this.#constructEnabled || !this.#userEnabled || this.#faults >= COMBAT_FAULT_LIMIT;
  }

  /** At least one enemy is standing in front of the party (engaged and not dissolving). */
  get inContact(): boolean {
    if (this.disabled) {
      return false;
    }
    for (const enemy of this.#pool) {
      if (enemy.inUse && enemy.isEngaged) {
        return true;
      }
    }
    return this.#boss.inUse && this.#boss.isEngaged;
  }

  /** Live enemies for the renderer's y-sort (a reused array). */
  entities(): readonly Entity[] {
    return this.#live;
  }

  drawDrops(surface: Surface, cache: World['cache']): void {
    this.#drops.draw(surface, cache);
  }

  clear(): void {
    for (const enemy of this.#pool) {
      enemy.release();
    }
    this.#boss.release();
    this.#drops.clear();
    this.#live.length = 0;
    this.#picked.length = 0;
    this.#seenStrike.fill(0);
    this.#seenAbility.fill(0);
    this.#tracked.fill(0);
    this.#waveGapMs = 0;
    this.#noFightersMs = 0;
    this.#clearing = false;
    this.#holdMs = 0;
  }

  update(dtMs: number, world: World, fighters: FighterBuffer): void {
    if (this.disabled) {
      if (this.#live.length > 0 || this.#clearing) {
        this.#disableClear();
      }
      return;
    }
    if (!(dtMs > 0)) {
      return;
    }
    this.#resolveStrikes(world, fighters);
    this.#attackAndAnimate(dtMs, world, fighters);
    this.#drops.update(dtMs);
    this.#direct(dtMs, fighters);
    this.#refreshLive();
  }

  // ---- strikes ----

  #resolveStrikes(world: World, fighters: FighterBuffer): void {
    this.#presentNow.fill(0);
    for (let i = 0; i < fighters.count; i++) {
      const slot = fighters.slot[i] ?? -1;
      if (slot < 0 || slot >= SLOT_TRACK) {
        continue;
      }
      this.#presentNow[slot] = 1;
      const strike = fighters.strikeSerial[i] ?? 0;
      const ability = fighters.abilitySerial[i] ?? 0;
      if (this.#tracked[slot] !== 1) {
        // First sight in this stretch of fighting (also slot reuse): take a baseline, count nothing.
        this.#tracked[slot] = 1;
        this.#seenStrike[slot] = strike;
        this.#seenAbility[slot] = ability;
        continue;
      }
      const strikes = serialDelta(strike, this.#seenStrike[slot] ?? 0);
      const abilities = serialDelta(ability, this.#seenAbility[slot] ?? 0);
      this.#seenStrike[slot] = strike;
      this.#seenAbility[slot] = ability;
      for (let k = 0; k < strikes; k++) {
        this.#hit(world, STRIKE_POWER, 1);
      }
      for (let k = 0; k < abilities; k++) {
        this.#hit(world, ABILITY_POWER, ABILITY_TARGETS);
      }
    }
    for (let slot = 0; slot < SLOT_TRACK; slot++) {
      if (this.#presentNow[slot] !== 1 && this.#tracked[slot] === 1) {
        this.#tracked[slot] = 0;
        this.#seenStrike[slot] = 0;
        this.#seenAbility[slot] = 0;
      }
    }
  }

  /** Strikes the `count` nearest engaged enemies (smallest x first). No engaged enemy: a no-op. */
  #hit(world: World, power: number, count: number): void {
    const picked = this.#picked;
    picked.length = 0;
    for (let n = 0; n < count; n++) {
      let best: Enemy | null = null;
      for (const enemy of this.#pool) {
        if (enemy.isTargetable && !picked.includes(enemy) && (best === null || enemy.x < best.x)) {
          best = enemy;
        }
      }
      const boss = this.#boss;
      if (boss.isTargetable && !picked.includes(boss) && (best === null || boss.x < best.x)) {
        best = boss;
      }
      if (best === null) {
        break;
      }
      picked.push(best);
    }
    for (const enemy of picked) {
      const row = enemy.row;
      const x = enemy.x;
      const footY = enemy.sortY;
      this.#sparks(world, x, footY);
      if (enemy.strike(power) && row !== null) {
        this.#onDefeated(row, x, footY);
      }
    }
    picked.length = 0;
  }

  #sparks(world: World, x: number, footY: number): void {
    for (let k = 0; k < HIT_SPARKS; k++) {
      world.particles.emit(
        'spark',
        x + (this.#rng() - 0.5) * 8,
        footY - 6 - this.#rng() * 8,
        (this.#rng() - 0.5) * 50,
        -(10 + this.#rng() * 30),
        180 + this.#rng() * 140,
      );
    }
  }

  /** `strike` returned true exactly once for this enemy. */
  #onDefeated(row: EnemyRow, x: number, footY: number): void {
    if (row.tier === 'boss') {
      this.#drops.spawn('chest', x, footY, 0);
      for (let k = 0; k < BOSS_COIN_BURST; k++) {
        this.#drops.spawn(
          'coin',
          x,
          footY,
          (k - (BOSS_COIN_BURST - 1) / 2) * 9 + (this.#rng() - 0.5) * 4,
        );
      }
      this.#progression.onBossDefeated();
      this.#events.onProgress(true);
      this.#clearing = true;
      this.#holdMs = STAGE_CLEAR_HOLD_MS;
      return;
    }
    if (this.#rng() < DROP_CHANCE[row.tier]) {
      this.#drops.spawn(row.drop, x, footY, (this.#rng() - 0.5) * 20);
    }
    this.#progression.onKill();
    this.#events.onProgress(false);
  }

  // ---- enemy attacks and per-enemy updates ----

  #attackAndAnimate(dtMs: number, world: World, fighters: FighterBuffer): void {
    this.#currentWorld = world;
    this.#currentDt = dtMs;
    for (const enemy of this.#pool) {
      this.#stepEnemy(enemy, dtMs, fighters);
    }
    this.#stepEnemy(this.#boss, dtMs, fighters);
    this.#current = null;
    this.#currentWorld = null;
  }

  #stepEnemy(enemy: Enemy, dtMs: number, fighters: FighterBuffer): void {
    if (!enemy.inUse) {
      return;
    }
    const row = enemy.row;
    if (row !== null && enemy.tickAttack(dtMs)) {
      enemy.beginAttack();
      enemy.armAttack(this.#attackInterval(row, enemy));
    }
    this.#current = enemy;
    guarded(enemy, 'update', this.#updateCurrent, this.#onError);
    if (enemy.frozen) {
      // A quarantined enemy is removed with no credit; the wave director replaces it.
      enemy.release();
      return;
    }
    if (enemy.takeAttackFrame()) {
      this.#landAttack(fighters, row !== null && row.tier === 'boss');
    }
    if (enemy.finished) {
      enemy.release();
    }
  }

  #attackInterval(row: EnemyRow, enemy: Enemy): number {
    const jitter = 1 + (this.#rng() * 2 - 1) * ATTACK_JITTER;
    return TIER_ATTACK_MS[row.tier] * enemy.attackIntervalFactor * jitter;
  }

  /**
   * An attack frame landed: flash the party members nearest the enemies (largest x). The only
   * place the enemy side names a hero slot, and only to write the cosmetic board.
   */
  #landAttack(fighters: FighterBuffer, slam: boolean): void {
    const want = Math.min(BOSS_SLAM_TARGETS, fighters.count);
    let found = 0;
    for (let n = 0; n < want; n++) {
      let best = -1;
      let bestX = -Infinity;
      for (let i = 0; i < fighters.count; i++) {
        let taken = false;
        for (let k = 0; k < found; k++) {
          if (this.#victims[k] === i) {
            taken = true;
          }
        }
        const x = fighters.x[i] ?? 0;
        if (!taken && x > bestX) {
          best = i;
          bestX = x;
        }
      }
      if (best < 0) {
        break;
      }
      this.#victims[found] = best;
      found += 1;
    }
    if (found === 0) {
      return;
    }
    if (slam) {
      for (let k = 0; k < found; k++) {
        this.#reactions.flash(fighters.slot[this.#victims[k] ?? 0] ?? 0, -1, true);
      }
      return;
    }
    const pick = Math.min(found - 1, Math.floor(this.#rng() * found));
    this.#reactions.flash(fighters.slot[this.#victims[pick] ?? 0] ?? 0, -1, false);
  }

  // ---- waves, boss, withdrawal ----

  #direct(dtMs: number, fighters: FighterBuffer): void {
    if (this.#clearing) {
      this.#holdMs -= dtMs;
      if (this.#holdMs <= 0) {
        this.#clearing = false;
        this.#events.onStageClear();
      }
      return;
    }
    if (fighters.count === 0) {
      this.#noFightersMs += dtMs;
      this.#waveGapMs = 0;
      if (this.#noFightersMs >= WITHDRAW_AFTER_MS) {
        this.#withdrawAll();
      }
      return;
    }
    this.#noFightersMs = 0;
    if (this.#stage === null || this.#transitioning) {
      return;
    }
    const liveRegular = this.#liveRegularCount();
    if (this.#progression.killsInStage >= this.#killsPerStage) {
      // The boss is pending: no more regular enemies; it walks in once the field is empty.
      if (liveRegular === 0 && !this.#boss.inUse && this.#bossRow !== null) {
        this.#spawnBoss(this.#bossRow, fighters);
      }
      return;
    }
    if (this.#boss.inUse) {
      return;
    }
    if (liveRegular > 0) {
      this.#waveGapMs = 0;
      return;
    }
    this.#waveGapMs += dtMs;
    if (this.#waveGapMs >= WAVE_GAP_MS && this.#regularRows.length > 0) {
      this.#waveGapMs = 0;
      this.#spawnWave(fighters);
    }
  }

  #liveRegularCount(): number {
    let n = 0;
    for (const enemy of this.#pool) {
      if (enemy.inUse) {
        n++;
      }
    }
    return n;
  }

  #withdrawAll(): void {
    for (const enemy of this.#pool) {
      if (enemy.inUse) {
        enemy.beginWithdraw();
      }
    }
    if (this.#boss.inUse) {
      this.#boss.beginWithdraw();
    }
  }

  #frontX(fighters: FighterBuffer): number {
    let front = 0;
    for (let i = 0; i < fighters.count; i++) {
      front = Math.max(front, fighters.x[i] ?? 0);
    }
    return front;
  }

  #spawnWave(fighters: FighterBuffer): void {
    const stage = this.#stage;
    if (stage === null) {
      return;
    }
    const size = Math.min(this.#maxEnemies, 1 + Math.floor(fighters.count / 2));
    const front = this.#frontX(fighters);
    let spawned = 0;
    for (const enemy of this.#pool) {
      if (spawned >= size) {
        break;
      }
      if (enemy.inUse) {
        continue;
      }
      const row = this.#pickRow();
      if (row === null) {
        return;
      }
      const lane = spawned % ENEMY_LANE_COUNT;
      enemy.begin(
        row,
        healthOf(row, stage.index, this.#progression.cycle, fighters.count),
        ENEMY_SPAWN_X + spawned * 12,
        ENEMY_LANE_FOOT_Y - ENEMY_LANE_STEP_PX * lane,
      );
      enemy.setStand(Math.min(front + ENEMY_GAP_PX, ENEMY_STAND_MAX_X) + (lane % 2) * 8);
      enemy.armAttack(this.#attackInterval(row, enemy));
      spawned += 1;
    }
  }

  #spawnBoss(row: EnemyRow, fighters: FighterBuffer): void {
    const stage = this.#stage;
    if (stage === null) {
      return;
    }
    const boss = this.#boss;
    // Health is frozen at spawn: it does not follow the party size afterwards.
    boss.begin(
      row,
      healthOf(row, stage.index, this.#progression.cycle, fighters.count),
      ENEMY_SPAWN_X,
      ENEMY_LANE_FOOT_Y,
    );
    boss.setStand(Math.min(this.#frontX(fighters) + BOSS_GAP_PX, BOSS_STAND_MAX_X));
    boss.armAttack(this.#attackInterval(row, boss));
  }

  /** A weighted pick: minions three times as likely as the elite. */
  #pickRow(): EnemyRow | null {
    let total = 0;
    for (const row of this.#regularRows) {
      total += row.tier === 'elite' ? ELITE_WEIGHT : MINION_WEIGHT;
    }
    if (total <= 0) {
      return null;
    }
    let roll = this.#rng() * total;
    for (const row of this.#regularRows) {
      roll -= row.tier === 'elite' ? ELITE_WEIGHT : MINION_WEIGHT;
      if (roll < 0) {
        return row;
      }
    }
    return this.#regularRows[this.#regularRows.length - 1] ?? null;
  }

  #refreshLive(): void {
    const live = this.#live;
    live.length = 0;
    for (const enemy of this.#pool) {
      if (enemy.inUse) {
        live.push(enemy);
      }
    }
    if (this.#boss.inUse) {
      live.push(this.#boss);
    }
  }
}

/**
 * How many new strikes a slot made since the last step: serial >= seen gives the difference; a
 * serial that went backwards (wrapped) counts as a restart. Capped at MAX_SERIAL_DELTA.
 */
function serialDelta(serial: number, seen: number): number {
  const delta = serial >= seen ? serial - seen : serial;
  return Math.min(MAX_SERIAL_DELTA, delta);
}
