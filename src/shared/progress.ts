// Persisted game progress, schema version 1 (ADR 0012, data-model.md section 7).
//
// This is the only data the extension keeps. It is a closed, numeric shape: six integers and no
// string field, so no agent, session, tool, class, or transcript data can be stored by
// construction (Core invariants 2 and 7). The validator and the creator are total: they never
// throw and never return their input.
// Imports nothing (src/shared/ boundary, coding-standards.md section 3).

export const PROGRESS_SCHEMA_VERSION = 1;
/** The full game has ten stages; stages beyond the delivered count wrap in the engine. */
export const MAX_STAGE_INDEX = 10;
/** Upper bound for every counter. Assumption: a safety bound far above any real play. */
export const MAX_PROGRESS_COUNT = 1_000_000_000;

export interface Progress {
  readonly schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  /** 1..MAX_STAGE_INDEX: the stage being played. */
  readonly stageIndex: number;
  /** Regular kills toward this stage's boss. */
  readonly killsInStage: number;
  /** All regular kills ever; also the host's monotonic key. */
  readonly totalKills: number;
  readonly bossesDefeated: number;
  /** Completed passes through the delivered stages (E5: New Game+). */
  readonly cycle: number;
}

/** Exactly these keys, in this order. */
export const PROGRESS_KEYS = [
  'schemaVersion',
  'stageIndex',
  'killsInStage',
  'totalKills',
  'bossesDefeated',
  'cycle',
] as const;

export const DEFAULT_PROGRESS: Progress = Object.freeze({
  schemaVersion: PROGRESS_SCHEMA_VERSION,
  stageIndex: 1,
  killsInStage: 0,
  totalKills: 0,
  bossesDefeated: 0,
  cycle: 0,
});

function isCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PROGRESS_COUNT
  );
}

/** Plain object with exactly the PROGRESS_KEYS as own string keys and no symbol keys. */
function hasProgressShape(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    return false;
  }
  const own = Object.getOwnPropertyNames(value);
  if (own.length !== PROGRESS_KEYS.length) {
    return false;
  }
  for (const key of own) {
    if (!(PROGRESS_KEYS as readonly string[]).includes(key)) {
      return false;
    }
  }
  return true;
}

/** Exact keys, safe integers within range. Never throws. */
export function isProgress(value: unknown): value is Progress {
  try {
    if (!hasProgressShape(value)) {
      return false;
    }
    const stage = value['stageIndex'];
    return (
      value['schemaVersion'] === PROGRESS_SCHEMA_VERSION &&
      isCount(stage) &&
      stage >= 1 &&
      stage <= MAX_STAGE_INDEX &&
      isCount(value['killsInStage']) &&
      isCount(value['totalKills']) &&
      isCount(value['bossesDefeated']) &&
      isCount(value['cycle'])
    );
  } catch {
    // Throwing getters or Proxy traps (only reachable from tests).
    return false;
  }
}

/** Copies exactly the six keys into a new object; undefined if the copy is not valid. */
export function toProgress(source: Progress): Progress | undefined {
  try {
    const copy: Progress = {
      schemaVersion: source.schemaVersion,
      stageIndex: source.stageIndex,
      killsInStage: source.killsInStage,
      totalKills: source.totalKills,
      bossesDefeated: source.bossesDefeated,
      cycle: source.cycle,
    };
    return isProgress(copy) ? copy : undefined;
  } catch {
    return undefined;
  }
}
