// Known session files that are not tracked (agent-detection.md section 3.1, discovery): files
// silent for the session-end window, sessions that ended by silence, and files that could not be
// read or were refused by the agent cap. Holds name, path, and mtime only, never content.
// Re-checks are bounded: at most STALE_RECHECK_BATCH due entries per scan, each at most every
// STALE_RECHECK_MS, round-robin (a re-checked entry moves to the end).

export const STALE_RECHECK_MS = 10_000;
export const STALE_RECHECK_BATCH = 500;
/** Stale-entry mtime meaning "retry whenever the file is fresh" (refused or unreadable before). */
export const RETRY_MTIME = -1;

export interface StaleFile {
  readonly id: string;
  readonly dirName: string;
  readonly filePath: string;
  /** mtime when it was set aside; re-discovered only once the file's mtime differs. */
  readonly mtimeMs: number;
  readonly checkedAt: number;
}

export class StaleFiles {
  readonly #entries = new Map<string, StaleFile>();

  has(filePath: string): boolean {
    return this.#entries.has(filePath);
  }

  mark(id: string, dirName: string, filePath: string, mtimeMs: number, now: number): void {
    this.#entries.delete(filePath);
    this.#entries.set(filePath, { id, dirName, filePath, mtimeMs, checkedAt: now });
  }

  delete(filePath: string): void {
    this.#entries.delete(filePath);
  }

  clear(): void {
    this.#entries.clear();
  }

  /** Drops entries whose directory (by `key`) is not in `inScope`. */
  retainDirs(inScope: ReadonlySet<string>, key: (dirName: string) => string): void {
    for (const [filePath, entry] of [...this.#entries]) {
      if (!inScope.has(key(entry.dirName))) {
        this.#entries.delete(filePath);
      }
    }
  }

  /** Drops entries of one listed directory whose file is no longer listed. */
  pruneDir(dirKey: string, listed: ReadonlySet<string>, key: (dirName: string) => string): void {
    for (const [filePath, entry] of [...this.#entries]) {
      if (key(entry.dirName) === dirKey && !listed.has(filePath)) {
        this.#entries.delete(filePath);
      }
    }
  }

  /** Removes and returns up to STALE_RECHECK_BATCH entries due for a re-check; the caller re-marks what stays stale. */
  takeDue(now: number): readonly StaleFile[] {
    const due: StaleFile[] = [];
    for (const entry of this.#entries.values()) {
      if (due.length >= STALE_RECHECK_BATCH) {
        break;
      }
      if (now - entry.checkedAt >= STALE_RECHECK_MS || now < entry.checkedAt) {
        due.push(entry);
      }
    }
    for (const entry of due) {
      this.#entries.delete(entry.filePath);
    }
    return due;
  }
}
