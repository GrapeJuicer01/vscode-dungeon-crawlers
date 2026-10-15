// A stage boss (enemy side, ADR 0013): an Enemy with an intro pose, a 2-frame telegraph before
// each attack, and two phases (a palette shift and faster attacks below half health). A boss
// slam reaches heroes only as the same cosmetic flash and slide as any enemy attack; there is no
// stun, slow, or knock-down state anywhere. One pooled instance.
import {
  BOSS_PHASE2_FRACTION,
  BOSS_PHASE2_INTERVAL_FACTOR,
  ENEMY_INTRO_MS,
  ENEMY_TELEGRAPH_MS,
} from '../data/tuning';
import { Enemy } from './Enemy';

export type BossStage = 1 | 2;

export class Boss extends Enemy {
  /** 2 below half health (palette shift, attack interval x BOSS_PHASE2_INTERVAL_FACTOR). */
  get bossStage(): BossStage {
    return this.healthFraction < BOSS_PHASE2_FRACTION ? 2 : 1;
  }

  /** The 2-frame wind-up before an attack is playing. */
  get telegraphing(): boolean {
    return this.isWindingUp;
  }

  /** The intro pose finished. */
  get introduced(): boolean {
    return this.isEngaged && this.introLeftMs <= 0;
  }

  override get attackIntervalFactor(): number {
    return this.bossStage === 2 ? BOSS_PHASE2_INTERVAL_FACTOR : 1;
  }

  override get spritePhase(): number {
    return this.bossStage;
  }

  protected override get introTotalMs(): number {
    return ENEMY_INTRO_MS;
  }

  protected override get telegraphTotalMs(): number {
    return ENEMY_TELEGRAPH_MS;
  }
}
