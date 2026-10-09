// Game settings read from `pixelAgents.*` (E1, ADR 0012 / plan section 3.2). vscode-free and total:
// it never throws, falls back to the default on a wrong type, and clamps integers to range.
// GAME_SETTINGS mirrors package.json contributes.configuration (a test keeps them equal).
import {
  MAX_KILLS_PER_STAGE,
  MAX_MAX_ENEMIES,
  MIN_KILLS_PER_STAGE,
  MIN_MAX_ENEMIES,
} from '../shared/protocol';

export const GAME_SETTINGS_SECTION = 'pixelAgents';

export interface GameSettings {
  readonly enemiesEnabled: boolean;
  readonly killsPerStage: number;
  readonly maxEnemies: number;
}

export const DEFAULT_ENEMIES_ENABLED = true;
export const DEFAULT_KILLS_PER_STAGE = 30;
export const DEFAULT_MAX_ENEMIES = 6;

function clampInteger(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/** `get` receives the key without the section prefix (`enemies`, `killsPerStage`, `maxEnemies`). */
export function readGameSettings(get: (key: string) => unknown): GameSettings {
  const read = (key: string): unknown => {
    try {
      return get(key);
    } catch {
      return undefined;
    }
  };
  const enemies = read('enemies');
  return {
    enemiesEnabled: typeof enemies === 'boolean' ? enemies : DEFAULT_ENEMIES_ENABLED,
    killsPerStage: clampInteger(
      read('killsPerStage'),
      DEFAULT_KILLS_PER_STAGE,
      MIN_KILLS_PER_STAGE,
      MAX_KILLS_PER_STAGE,
    ),
    maxEnemies: clampInteger(
      read('maxEnemies'),
      DEFAULT_MAX_ENEMIES,
      MIN_MAX_ENEMIES,
      MAX_MAX_ENEMIES,
    ),
  };
}
