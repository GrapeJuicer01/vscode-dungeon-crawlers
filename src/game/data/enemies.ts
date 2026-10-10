// The compact enemy table and its scaling formulas (enemy side, E1 plan section 3.3,
// data-model.md section 6). Each enemy is one small row; health, speed, and attack timing come from
// the tier base and the formulas below, so the 50 enemies of the finished game are never 50
// hand-written objects. E1 delivered ten rows (stages 1 and 2), E2 ten more (stages 3 and 4), E3 ten more (stages 5 and 6), E4 ten more (stages 7 and 8); the validator runs in the
// incremental mode of roadmap A3: five rows and exactly one boss per delivered stage. E5 pins the
// full contract (ten stages, 50 unique ids) and removes the incremental mode.
//
// This is enemy-side data: only enemies have health. Nothing on the hero side has such a number
// (ADR 0013). Names here are what the pixel-artist mirrors in the enemy templates.
import { DROP_KINDS } from './drops';
import type { DropKind } from './drops';
import type { StageDef } from './stages';

export type EnemyTier = 'minion' | 'elite' | 'boss';
/** Cosmetic draw motion only: it never changes where an enemy stands or when it is struck. */
export type EnemyGait = 'walk' | 'hop' | 'float';

export interface EnemyRow {
  /** Kebab-case, globally unique. */
  readonly id: string;
  readonly name: string;
  /** 1-based, must exist in STAGES. */
  readonly stage: number;
  readonly tier: EnemyTier;
  readonly gait: EnemyGait;
  /** Health multiplier on the tier base, 0.5 to 2. */
  readonly vigor: number;
  /** Walking speed multiplier on the tier base, 0.5 to 1.6. */
  readonly pace: number;
  /** The main drop (data/drops.ts). */
  readonly drop: DropKind;
}

export const ENEMY_TIERS: readonly EnemyTier[] = ['minion', 'elite', 'boss'];
export const ENEMY_GAITS: readonly EnemyGait[] = ['walk', 'hop', 'float'];

export const VIGOR_MIN = 0.5;
export const VIGOR_MAX = 2;
export const PACE_MIN = 0.5;
export const PACE_MAX = 1.6;

/**
 * Stage 1: Forgotten Cellar. Stage 2: Goblin Mine Shafts. Stage 3: Toxic Slime Caverns. Stage 4:
 * Ancient Catacombs (E2). Stage 5: Enchanted Forest Ruins. Stage 6: Molten Core (E3; the two late
 * bosses use a vigor below 1.0 so the fights do not drag, decision E3-7). Stage 7: Frozen Citadel.
 * Stage 8: Shadow Realm (E4; the bosses use 0.6 and 0.5, the validator floor, decision E4-7). Numbers are first
 * guesses (decision E1-11) tuned by eye in the manual benchmark.
 */
export const ENEMIES = [
  {
    id: 'cellar-rat',
    name: 'Cellar Rat',
    stage: 1,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.0,
    pace: 1.1,
    drop: 'coin',
  },
  {
    id: 'cave-bat',
    name: 'Cave Bat',
    stage: 1,
    tier: 'minion',
    gait: 'float',
    vigor: 0.8,
    pace: 1.3,
    drop: 'coin',
  },
  {
    id: 'web-spider',
    name: 'Web Spider',
    stage: 1,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.1,
    pace: 1.0,
    drop: 'coin',
  },
  {
    id: 'crate-mimic',
    name: 'Crate Mimic',
    stage: 1,
    tier: 'elite',
    gait: 'hop',
    vigor: 1.0,
    pace: 0.8,
    drop: 'gem',
  },
  {
    id: 'rat-king',
    name: 'Rat King',
    stage: 1,
    tier: 'boss',
    gait: 'walk',
    vigor: 1.0,
    pace: 0.6,
    drop: 'chest',
  },
  {
    id: 'goblin-miner',
    name: 'Goblin Miner',
    stage: 2,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.0,
    pace: 1.0,
    drop: 'ore',
  },
  {
    id: 'goblin-scout',
    name: 'Goblin Scout',
    stage: 2,
    tier: 'minion',
    gait: 'walk',
    vigor: 0.8,
    pace: 1.3,
    drop: 'ore',
  },
  {
    id: 'ore-beetle',
    name: 'Ore Beetle',
    stage: 2,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.3,
    pace: 0.8,
    drop: 'ore',
  },
  {
    id: 'rock-golem',
    name: 'Rock Golem',
    stage: 2,
    tier: 'elite',
    gait: 'walk',
    vigor: 1.2,
    pace: 0.6,
    drop: 'gem',
  },
  {
    id: 'goblin-foreman',
    name: 'Goblin Foreman',
    stage: 2,
    tier: 'boss',
    gait: 'walk',
    vigor: 1.0,
    pace: 0.6,
    drop: 'chest',
  },
  {
    id: 'green-slime',
    name: 'Green Slime',
    stage: 3,
    tier: 'minion',
    gait: 'hop',
    vigor: 1.0,
    pace: 0.9,
    drop: 'coin',
  },
  {
    id: 'spore-shroom',
    name: 'Spore Shroom',
    stage: 3,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.2,
    pace: 0.8,
    drop: 'coin',
  },
  {
    id: 'toxic-toad',
    name: 'Toxic Toad',
    stage: 3,
    tier: 'minion',
    gait: 'hop',
    vigor: 0.9,
    pace: 1.2,
    drop: 'coin',
  },
  {
    id: 'jelly-cube',
    name: 'Jelly Cube',
    stage: 3,
    tier: 'elite',
    gait: 'walk',
    vigor: 1.3,
    pace: 0.5,
    drop: 'gem',
  },
  {
    id: 'ooze-queen',
    name: 'Ooze Queen',
    stage: 3,
    tier: 'boss',
    gait: 'walk',
    vigor: 1.0,
    pace: 0.6,
    drop: 'chest',
  },
  {
    id: 'bone-soldier',
    name: 'Bone Soldier',
    stage: 4,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.0,
    pace: 1.0,
    drop: 'coin',
  },
  {
    id: 'wailing-ghost',
    name: 'Wailing Ghost',
    stage: 4,
    tier: 'minion',
    gait: 'float',
    vigor: 0.8,
    pace: 1.2,
    drop: 'coin',
  },
  {
    id: 'tomb-scarab',
    name: 'Tomb Scarab',
    stage: 4,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.1,
    pace: 0.9,
    drop: 'ore',
  },
  {
    id: 'crypt-mummy',
    name: 'Crypt Mummy',
    stage: 4,
    tier: 'elite',
    gait: 'walk',
    vigor: 1.2,
    pace: 0.6,
    drop: 'gem',
  },
  {
    id: 'tomb-lich',
    name: 'Tomb Lich',
    stage: 4,
    tier: 'boss',
    gait: 'walk',
    vigor: 1.0,
    pace: 0.6,
    drop: 'chest',
  },
  {
    id: 'thorn-sprout',
    name: 'Thorn Sprout',
    stage: 5,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.0,
    pace: 0.9,
    drop: 'coin',
  },
  {
    id: 'moss-wolf',
    name: 'Moss Wolf',
    stage: 5,
    tier: 'minion',
    gait: 'walk',
    vigor: 0.9,
    pace: 1.3,
    drop: 'coin',
  },
  {
    id: 'bramble-pixie',
    name: 'Bramble Pixie',
    stage: 5,
    tier: 'minion',
    gait: 'float',
    vigor: 0.8,
    pace: 1.1,
    drop: 'ore',
  },
  {
    id: 'ancient-treant',
    name: 'Ancient Treant',
    stage: 5,
    tier: 'elite',
    gait: 'walk',
    vigor: 1.3,
    pace: 0.5,
    drop: 'gem',
  },
  {
    id: 'elder-dryad',
    name: 'Elder Dryad',
    stage: 5,
    tier: 'boss',
    gait: 'walk',
    vigor: 0.9,
    pace: 0.6,
    drop: 'chest',
  },
  {
    id: 'ember-imp',
    name: 'Ember Imp',
    stage: 6,
    tier: 'minion',
    gait: 'hop',
    vigor: 1.0,
    pace: 1.2,
    drop: 'coin',
  },
  {
    id: 'slag-snail',
    name: 'Slag Snail',
    stage: 6,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.3,
    pace: 0.5,
    drop: 'ore',
  },
  {
    id: 'magma-crab',
    name: 'Magma Crab',
    stage: 6,
    tier: 'minion',
    gait: 'walk',
    vigor: 1.1,
    pace: 1.0,
    drop: 'ore',
  },
  {
    id: 'furnace-guard',
    name: 'Furnace Guard',
    stage: 6,
    tier: 'elite',
    gait: 'walk',
    vigor: 1.2,
    pace: 0.5,
    drop: 'gem',
  },
  {
    id: 'molten-colossus',
    name: 'Molten Colossus',
    stage: 6,
    tier: 'boss',
    gait: 'walk',
    vigor: 0.8,
    pace: 0.6,
    drop: 'chest',
  },
  {
    id: 'rime-penguin',
    name: 'Rime Penguin',
    stage: 7,
    tier: 'minion',
    gait: 'walk',
    vigor: 0.8,
    pace: 0.8,
    drop: 'coin',
  },
  {
    id: 'frost-hare',
    name: 'Frost Hare',
    stage: 7,
    tier: 'minion',
    gait: 'hop',
    vigor: 0.7,
    pace: 1.4,
    drop: 'coin',
  },
  {
    id: 'snow-sentry',
    name: 'Snow Sentry',
    stage: 7,
    tier: 'minion',
    gait: 'walk',
    vigor: 0.9,
    pace: 0.7,
    drop: 'ore',
  },
  {
    id: 'snow-yeti',
    name: 'Snow Yeti',
    stage: 7,
    tier: 'elite',
    gait: 'walk',
    vigor: 1.0,
    pace: 0.6,
    drop: 'gem',
  },
  {
    id: 'glacier-mammoth',
    name: 'Glacier Mammoth',
    stage: 7,
    tier: 'boss',
    gait: 'walk',
    vigor: 0.6,
    pace: 0.5,
    drop: 'chest',
  },
  {
    id: 'lantern-wraith',
    name: 'Lantern Wraith',
    stage: 8,
    tier: 'minion',
    gait: 'float',
    vigor: 0.6,
    pace: 1.0,
    drop: 'coin',
  },
  {
    id: 'shard-cluster',
    name: 'Shard Cluster',
    stage: 8,
    tier: 'minion',
    gait: 'float',
    vigor: 0.5,
    pace: 1.3,
    drop: 'ore',
  },
  {
    id: 'mirror-mimic',
    name: 'Mirror Mimic',
    stage: 8,
    tier: 'minion',
    gait: 'walk',
    vigor: 0.7,
    pace: 0.8,
    drop: 'coin',
  },
  {
    id: 'gloom-stag',
    name: 'Gloom Stag',
    stage: 8,
    tier: 'elite',
    gait: 'walk',
    vigor: 0.8,
    pace: 0.8,
    drop: 'gem',
  },
  {
    id: 'eclipse-warden',
    name: 'Eclipse Warden',
    stage: 8,
    tier: 'boss',
    gait: 'float',
    vigor: 0.5,
    pace: 0.6,
    drop: 'chest',
  },
] as const satisfies readonly EnemyRow[];

export const ENEMY_IDS: readonly string[] = ENEMIES.map((row) => row.id);

/** The regular (non-boss) rows of a stage; at most the four the validator allows. */
export function enemiesForStage(stage: number): readonly EnemyRow[] {
  return ENEMIES.filter((row) => row.stage === stage && row.tier !== 'boss');
}

/** The boss row of a stage, if the stage has been delivered. */
export function bossFor(stage: number): EnemyRow | undefined {
  return ENEMIES.find((row) => row.stage === stage && row.tier === 'boss');
}

// ---- Scaling formulas (pure; every constant is here) ----

export const TIER_HEALTH: Readonly<Record<EnemyTier, number>> = {
  minion: 10,
  elite: 24,
  boss: 120,
};
/** Health growth per stage index. */
export const HEALTH_GROWTH = 1.35;
/** Health growth per completed cycle (E5 New Game+), capped at CYCLE_CAP cycles. */
export const CYCLE_HEALTH_GROWTH = 0.25;
export const CYCLE_CAP = 8;
/** Boss health growth per fighting hero beyond the first, with the party capped at PARTY_CAP. */
export const PARTY_BOSS_GROWTH = 0.35;
export const PARTY_CAP = 8;

/** Health at spawn. Pure, monotone in stageIndex, cycle, and (bosses only) party; never below 1. */
export function healthOf(row: EnemyRow, stageIndex: number, cycle: number, party: number): number {
  const stageFactor = Math.pow(HEALTH_GROWTH, Math.max(0, stageIndex - 1));
  const cycleFactor = 1 + CYCLE_HEALTH_GROWTH * Math.min(Math.max(0, cycle), CYCLE_CAP);
  const partyFactor =
    row.tier === 'boss' ? 1 + PARTY_BOSS_GROWTH * (Math.min(Math.max(1, party), PARTY_CAP) - 1) : 1;
  return Math.max(
    1,
    Math.round(TIER_HEALTH[row.tier] * row.vigor * stageFactor * cycleFactor * partyFactor),
  );
}

/** Walking speed in px/s, multiplied by the row's pace. */
export const TIER_SPEED_PX_PER_S: Readonly<Record<EnemyTier, number>> = {
  minion: 26,
  elite: 20,
  boss: 14,
};
/** Mean time between attacks in ms (plus or minus ATTACK_JITTER, seeded). */
export const TIER_ATTACK_MS: Readonly<Record<EnemyTier, number>> = {
  minion: 1800,
  elite: 2200,
  boss: 2600,
};
export const ATTACK_JITTER = 0.2;

/** Strike amounts: every hero strike is the same, whatever the class (decision E1-1). */
export const STRIKE_POWER = 1;
export const ABILITY_POWER = 2;
/** One ability hit reaches up to this many nearest engaged enemies. */
export const ABILITY_TARGETS = 3;

// ---- Validator ----

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function inRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Fixed-text errors for an enemy table (empty means valid). Incremental mode (roadmap A3): for
 * every stage in `stages` exactly five rows with exactly one boss, ids kebab-case and globally
 * unique, every row's stage exists, the total is 5 x stages. Never throws on junk input.
 */
export function validateEnemies(
  rows: readonly EnemyRow[],
  stages: readonly StageDef[],
): readonly string[] {
  const errors: string[] = [];
  try {
    const ids = new Set<string>();
    const stageIds = new Set<number>(stages.map((stage) => stage.index));
    const perStage = new Map<number, { total: number; bosses: number; minions: number }>();
    rows.forEach((row, i) => {
      const tag = `enemy ${i + 1}`;
      if (typeof row !== 'object' || row === null) {
        errors.push(`${tag}: not an object`);
        return;
      }
      if (typeof row.id !== 'string' || !KEBAB.test(row.id)) {
        errors.push(`${tag}: id is not kebab-case`);
      } else if (ids.has(row.id)) {
        errors.push(`${tag}: duplicate id`);
      } else {
        ids.add(row.id);
      }
      if (typeof row.name !== 'string' || row.name.trim().length === 0) {
        errors.push(`${tag}: name is empty`);
      }
      if (!ENEMY_TIERS.includes(row.tier)) {
        errors.push(`${tag}: unknown tier`);
      }
      if (!ENEMY_GAITS.includes(row.gait)) {
        errors.push(`${tag}: unknown gait`);
      }
      if (!inRange(row.vigor, VIGOR_MIN, VIGOR_MAX)) {
        errors.push(`${tag}: vigor is out of range`);
      }
      if (!inRange(row.pace, PACE_MIN, PACE_MAX)) {
        errors.push(`${tag}: pace is out of range`);
      }
      if (!(DROP_KINDS as readonly unknown[]).includes(row.drop)) {
        errors.push(`${tag}: unknown drop`);
      }
      if (!stageIds.has(row.stage)) {
        errors.push(`${tag}: stage does not exist`);
        return;
      }
      const entry = perStage.get(row.stage) ?? { total: 0, bosses: 0, minions: 0 };
      entry.total += 1;
      if (row.tier === 'boss') {
        entry.bosses += 1;
      } else if (row.tier === 'minion') {
        entry.minions += 1;
      }
      perStage.set(row.stage, entry);
    });
    for (const stage of stages) {
      const entry = perStage.get(stage.index) ?? { total: 0, bosses: 0, minions: 0 };
      const tag = `stage ${stage.index}`;
      if (entry.total !== 5) {
        errors.push(`${tag}: expected exactly 5 enemies, found ${entry.total}`);
      }
      if (entry.bosses !== 1) {
        errors.push(`${tag}: expected exactly 1 boss, found ${entry.bosses}`);
      }
      if (entry.minions < 1) {
        errors.push(`${tag}: needs at least 1 minion`);
      }
    }
    if (rows.length !== 5 * stages.length) {
      errors.push(`expected ${5 * stages.length} enemies for ${stages.length} stages`);
    }
  } catch {
    errors.push('enemy table is malformed');
  }
  return errors;
}

/** Flat shadow width in px per tier (drawn by the renderer from Entity.shadowWidth). */
export const TIER_SHADOW_PX: Readonly<Record<EnemyTier, number>> = {
  minion: 10,
  elite: 14,
  boss: 30,
};
