// Forward-only migrations for the persisted progress (ADR 0012). Pure and vscode-free.
//
// MIGRATIONS[i] upgrades a stored value of schema version i + 1 to version i + 2. The list is
// empty in E1 (version 1 is the first), but the runner exists from day one so a later version is
// a one-line addition. migrateProgress never throws: any junk becomes a fresh default.
import {
  DEFAULT_PROGRESS,
  PROGRESS_SCHEMA_VERSION,
  isProgress,
  toProgress,
} from '../shared/progress';
import type { Progress } from '../shared/progress';

export type MigrationStep = (raw: Readonly<Record<string, unknown>>) => Record<string, unknown>;

export const MIGRATIONS: readonly MigrationStep[] = [];

/**
 * fresh: nothing stored. stored: a valid current value. migrated: upgraded through at least one
 * step. invalid: junk, defaults used. future: written by a newer version (a downgrade), defaults
 * used in memory and the stored value must never be overwritten.
 */
export type LoadSource = 'fresh' | 'stored' | 'migrated' | 'invalid' | 'future';

export interface LoadOutcome {
  readonly progress: Progress;
  readonly source: LoadSource;
}

function fallback(source: LoadSource): LoadOutcome {
  return { progress: DEFAULT_PROGRESS, source };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Reads schemaVersion as an own data property; a positive safe integer or undefined. */
function versionOf(raw: Record<string, unknown>): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(raw, 'schemaVersion')) {
    return undefined;
  }
  const version = raw['schemaVersion'];
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 1
    ? version
    : undefined;
}

export function migrateProgress(
  raw: unknown,
  steps: readonly MigrationStep[] = MIGRATIONS,
  current: number = PROGRESS_SCHEMA_VERSION,
): LoadOutcome {
  try {
    if (raw === undefined) {
      return fallback('fresh');
    }
    if (!isRecord(raw)) {
      return fallback('invalid');
    }
    const version = versionOf(raw);
    if (version === undefined) {
      return fallback('invalid');
    }
    if (version > current) {
      return fallback('future');
    }
    let value: Record<string, unknown> = { ...raw };
    for (let v = version; v < current; v += 1) {
      const step = steps[v - 1];
      if (step === undefined) {
        return fallback('invalid');
      }
      const next = step(value);
      if (!isRecord(next)) {
        return fallback('invalid');
      }
      value = { ...next };
    }
    if (!isProgress(value)) {
      return fallback('invalid');
    }
    const copy = toProgress(value);
    if (copy === undefined) {
      return fallback('invalid');
    }
    return { progress: copy, source: version === current ? 'stored' : 'migrated' };
  } catch {
    // Hostile getters or a throwing step: never escape.
    return fallback('invalid');
  }
}
