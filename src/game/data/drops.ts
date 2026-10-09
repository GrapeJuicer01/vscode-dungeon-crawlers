// Drop kinds (enemy side, E1 plan section 3.3). Drops are decoration (decision E1-12): one pops
// out of a defeated enemy on a short arc, rests, and fades. Nothing collects it, it has no value,
// no inventory exists, and no hero field, count, or state depends on it.
import type { EnemyTier } from './enemies';

export const DROP_KINDS = ['coin', 'gem', 'ore', 'chest'] as const;
export type DropKind = (typeof DROP_KINDS)[number];

/** Chance that a defeated enemy of the tier drops its row's main drop. */
export const DROP_CHANCE: Readonly<Record<EnemyTier, number>> = {
  minion: 0.6,
  elite: 1,
  boss: 1,
};

/** A boss drops a chest plus this many coins. */
export const BOSS_COIN_BURST = 5;

/** Live drops at once. Assumption: 16 covers a wave of 12 plus a boss burst. */
export const DROP_CAPACITY = 16;
/** A drop rests this long after its arc, then fades. */
export const DROP_REST_MS = 900;
export const DROP_FADE_MS = 300;
/** Arc: a short hop out of the defeated enemy. */
export const DROP_ARC_MS = 360;
export const DROP_ARC_HEIGHT_PX = 14;
