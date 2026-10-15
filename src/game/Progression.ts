// Stage progress by cumulative work (enemy side, E1 plan section 3.4.5). Pure counters: kills
// happen only while heroes are working and fighting, and there is no wall-clock time, so a stopped
// or idle agent adds nothing. After the last delivered stage progression wraps to Stage 1 and the
// cycle count rises (E5 turns that into New Game+). It holds only numbers and never sees a hero.
import { DEFAULT_PROGRESS, MAX_PROGRESS_COUNT, PROGRESS_SCHEMA_VERSION } from '../shared/progress';
import type { Progress } from '../shared/progress';

export class Progression {
  readonly #stageCount: number;
  #stageIndex = 1;
  #killsInStage = 0;
  #totalKills = 0;
  #bossesDefeated = 0;
  #cycle = 0;

  /** `stageCount` is the number of delivered stages (at least 1). */
  constructor(stageCount: number) {
    this.#stageCount = Math.max(1, Math.floor(stageCount));
  }

  /** Clamps stageIndex into 1..stageCount by wrapping; keeps the other counters. */
  load(progress: Progress): void {
    this.#stageIndex = ((Math.max(1, progress.stageIndex) - 1) % this.#stageCount) + 1;
    this.#killsInStage = progress.killsInStage;
    this.#totalKills = progress.totalKills;
    this.#bossesDefeated = progress.bossesDefeated;
    this.#cycle = progress.cycle;
  }

  get stageIndex(): number {
    return this.#stageIndex;
  }

  get killsInStage(): number {
    return this.#killsInStage;
  }

  get cycle(): number {
    return this.#cycle;
  }

  /** One regular kill. Counters saturate at MAX_PROGRESS_COUNT so a snapshot stays valid. */
  onKill(): void {
    this.#killsInStage = Math.min(MAX_PROGRESS_COUNT, this.#killsInStage + 1);
    this.#totalKills = Math.min(MAX_PROGRESS_COUNT, this.#totalKills + 1);
  }

  /** The stage boss fell: next stage, kills reset, wrap and cycle + 1 after the last stage. */
  onBossDefeated(): void {
    this.#bossesDefeated = Math.min(MAX_PROGRESS_COUNT, this.#bossesDefeated + 1);
    this.#killsInStage = 0;
    if (this.#stageIndex >= this.#stageCount) {
      this.#stageIndex = 1;
      this.#cycle = Math.min(MAX_PROGRESS_COUNT, this.#cycle + 1);
    } else {
      this.#stageIndex += 1;
    }
  }

  /** A new frozen object. Called on events only (a kill or a boss defeat), never per frame. */
  snapshot(): Progress {
    return Object.freeze({
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      stageIndex: this.#stageIndex,
      killsInStage: this.#killsInStage,
      totalKills: this.#totalKills,
      bossesDefeated: this.#bossesDefeated,
      cycle: this.#cycle,
    });
  }

  /** Back to the defaults (used when the engine resets). */
  reset(): void {
    this.load(DEFAULT_PROGRESS);
  }
}
