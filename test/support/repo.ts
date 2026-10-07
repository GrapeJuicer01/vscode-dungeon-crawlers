// Helpers for tests that read repo files. Paths are relative to the repo root (process.cwd()),
// which is where `npm run test` runs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = process.cwd();

/**
 * Directories never walked: installed packages, VCS data, build output, and the VS Code builds
 * and profiles @vscode/test-electron downloads (all git-ignored, never repo content).
 */
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.vscode-test']);

export function repoPath(relative: string): string {
  return path.join(REPO_ROOT, relative);
}

export function readText(relative: string): string {
  return readFileSync(repoPath(relative), 'utf8');
}

export function readJson(relative: string): unknown {
  return JSON.parse(readText(relative)) as unknown;
}

/**
 * Returns every file under `relativeDir` as a POSIX-style path relative to the repo root,
 * including dot-directories such as .github and .vscode, skipping SKIPPED_DIRS at any depth.
 */
export function listFiles(relativeDir = '.'): string[] {
  const results: string[] = [];
  const visit = (relative: string): void => {
    for (const entry of readdirSync(repoPath(relative), { withFileTypes: true })) {
      const child = relative === '.' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) {
          visit(child);
        }
      } else if (entry.isFile()) {
        results.push(child);
      }
    }
  };
  visit(relativeDir);
  return results.sort();
}

/** Newest modification time (ms) of any file under `relativeDir`. */
export function newestMtime(relativeDir: string): number {
  return Math.max(...listFiles(relativeDir).map((file) => statSync(repoPath(file)).mtimeMs));
}

/** Narrows an unknown JSON value to a plain object, failing loudly otherwise. */
export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${what} is not a JSON object`);
  }
  return value as Record<string, unknown>;
}
