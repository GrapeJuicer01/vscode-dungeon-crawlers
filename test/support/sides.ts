// The two sides of the E1 seam (ADR 0013, E1 plan section 2.1), as literal arrays so a forgotten
// new file lands on the strict hero side by default. Enemy-side files may name health (only
// enemies have it); every other file under src/game/** keeps the original, stricter vocabulary
// ban. Used by the structural suites.

/** The eight enemy-side files (plan 2.1). */
export const ENEMY_SIDE: readonly string[] = [
  'src/game/Combat.ts',
  'src/game/entities/Enemy.ts',
  'src/game/entities/Boss.ts',
  'src/game/Drops.ts',
  'src/game/Progression.ts',
  'src/game/StageDirector.ts',
  'src/game/data/enemies.ts',
  'src/game/data/drops.ts',
];

/** Words that stay banned on the enemy side too: an enemy is "defeated" and "dissolves". */
export const ENEMY_SIDE_BANNED =
  /\b(mana|dead|downed|retreat|hurt|dying|gauge|heal|regen|restore|revive|resurrect)\b/i;

/** The original hero-side ban (M4 plus H1), applied to every file that is not enemy side. */
export const HERO_SIDE_BANNED = /\b(hp|health|mana|dead|downed|retreat|damage|gauge|hurt|dying)\b/i;

/** Enemy-side code names none of these (it has no path to a hero, a roster, or a lifecycle). */
export const ENEMY_SIDE_FORBIDDEN_IDENTIFIERS =
  /\b(Hero|ClassHero|Roster|Summon\w*|Effects|EffectPool|AgentInfo|AgentState|applyAgentState|lifecycle|exiting)\b/;

/**
 * Game files that wire both sides and may import enemy-side files: Game builds everything,
 * Renderer draws the foes, Engagement holds the one type-only import of Combat, the art validator
 * reads the enemy table rows to check the art against them (tests and tooling only), and the
 * sprite cache maps an enemy id to its stage palette (a data-only import, asserted separately).
 */
export const BOTH_SIDES_WIRING: readonly string[] = [
  'src/game/Game.ts',
  'src/game/Renderer.ts',
  'src/game/Engagement.ts',
  'src/game/sprites/spriteValidator.ts',
  // The sprite cache reads ENEMIES only to learn which stage palette an enemy id belongs to.
  'src/game/sprites/spriteFactory.ts',
];
