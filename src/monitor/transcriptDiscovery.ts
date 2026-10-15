// Discovery of session files (agent-detection.md section 3.1, discovery): lists in-scope project
// directories, sets aside stale files, re-checks them in bounded batches, and returns fresh,
// untracked session files as candidates. Used only by TranscriptSource, which reads and tracks
// them. Below the root only entries that lstat as a directory or regular file are used; links
// are skipped, never followed (Core invariant 3). Holds names, paths, and mtimes only.
import { safeErrorCode } from './monitorLog';
import type { ProjectScope } from './monitorConfig';
import type {
  Clock,
  DirEntry,
  EntryStat,
  MonitorLogger,
  PathOps,
  ReadOnlyFileSystem,
} from './ports';
import { sessionIdFromFileName } from './projectPaths';
import { StaleFiles } from './staleFiles';
import { isGoneCode } from './transcriptFiles';

export interface Candidate {
  readonly id: string;
  readonly dirName: string;
  readonly filePath: string;
  readonly stat: EntryStat;
}

export interface DiscoveryDeps {
  readonly fs: ReadOnlyFileSystem;
  readonly path: PathOps;
  readonly clock: Clock;
  /** Rate-limited logger for reason lines. */
  readonly limited: MonitorLogger;
  /** Directory-name comparison key (case rule of the file system). */
  readonly key: (dirName: string) => string;
}

export interface DiscoveryRound {
  readonly root: string;
  readonly dirs: readonly string[];
  readonly scope: ProjectScope;
  readonly sessionEndTimeoutMs: number;
  readonly isTracked: (id: string) => boolean;
  readonly isLive: () => boolean;
}

export class SessionDiscovery {
  readonly #fs: ReadOnlyFileSystem;
  readonly #path: PathOps;
  readonly #clock: Clock;
  readonly #limited: MonitorLogger;
  readonly #key: (dirName: string) => string;
  readonly #stale = new StaleFiles();
  /** `all` scope: project directory mtimes at their last listing. */
  readonly #dirMtimes = new Map<string, number>();

  constructor(deps: DiscoveryDeps) {
    this.#fs = deps.fs;
    this.#path = deps.path;
    this.#clock = deps.clock;
    this.#limited = deps.limited;
    this.#key = deps.key;
  }

  /** Fresh, untracked session files of the in-scope directories, most recently modified first. */
  async findCandidates(round: DiscoveryRound): Promise<readonly Candidate[]> {
    const candidates: Candidate[] = [];
    for (const dirName of round.dirs) {
      await this.#scanDir(round, dirName, candidates);
      if (!round.isLive()) {
        return [];
      }
    }
    await this.#recheckStale(round, candidates);
    return round.isLive() ? candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs) : [];
  }

  /** Remember a file as not tracked (name and mtime only); re-checked in bounded batches. */
  setAside(id: string, dirName: string, filePath: string, mtimeMs: number): void {
    this.#stale.mark(id, dirName, filePath, mtimeMs, this.#clock.now());
  }

  forget(filePath: string): void {
    this.#stale.delete(filePath);
  }

  /** Drops everything about directories that left the scope. */
  retainDirs(dirs: readonly string[]): void {
    const inScope = new Set(dirs.map(this.#key));
    this.#stale.retainDirs(inScope, this.#key);
    for (const dirName of [...this.#dirMtimes.keys()]) {
      if (!inScope.has(this.#key(dirName))) {
        this.#dirMtimes.delete(dirName);
      }
    }
  }

  /** Root or scope changed: re-list every directory on the next round. */
  relistAll(): void {
    this.#dirMtimes.clear();
  }

  reset(): void {
    this.#stale.clear();
    this.#dirMtimes.clear();
  }

  #isFresh(mtimeMs: number, round: DiscoveryRound): boolean {
    return this.#clock.now() - mtimeMs < round.sessionEndTimeoutMs;
  }

  #reportUnreadable(reason: string, error: unknown): void {
    const code = safeErrorCode(error);
    if (!isGoneCode(code)) {
      this.#limited.error('monitor: ' + reason + ' unreadable (' + code + ')');
    }
  }

  async #scanDir(round: DiscoveryRound, dirName: string, candidates: Candidate[]): Promise<void> {
    const dirPath = this.#path.join(round.root, dirName);
    let entries: readonly DirEntry[];
    try {
      const dirStat = await this.#fs.lstat(dirPath);
      if (!round.isLive() || dirStat.kind !== 'directory') {
        return;
      }
      // `all` scope re-lists a directory only when its mtime changed (new or removed files).
      if (round.scope === 'all' && this.#dirMtimes.get(dirName) === dirStat.mtimeMs) {
        return;
      }
      entries = await this.#fs.readdir(dirPath);
      if (!round.isLive()) {
        return;
      }
      this.#dirMtimes.set(dirName, dirStat.mtimeMs);
    } catch (error: unknown) {
      if (round.isLive()) {
        this.#reportUnreadable('project directory', error);
      }
      return;
    }
    const listed = new Set<string>();
    for (const entry of entries) {
      const id = entry.kind === 'file' ? sessionIdFromFileName(entry.name) : null;
      if (id === null) {
        continue;
      }
      const filePath = this.#path.join(dirPath, entry.name);
      listed.add(filePath);
      if (
        round.isTracked(id) ||
        this.#stale.has(filePath) ||
        candidates.some((candidate) => candidate.id === id)
      ) {
        continue;
      }
      await this.#firstSight(round, id, dirName, filePath, candidates);
      if (!round.isLive()) {
        return;
      }
    }
    this.#stale.pruneDir(this.#key(dirName), listed, this.#key);
  }

  async #firstSight(
    round: DiscoveryRound,
    id: string,
    dirName: string,
    filePath: string,
    candidates: Candidate[],
  ): Promise<void> {
    let stat: EntryStat;
    try {
      stat = await this.#fs.lstat(filePath);
    } catch (error: unknown) {
      if (round.isLive()) {
        this.#reportUnreadable('transcript', error);
      }
      return;
    }
    if (!round.isLive() || stat.kind !== 'file') {
      return;
    }
    if (this.#isFresh(stat.mtimeMs, round)) {
      candidates.push({ id, dirName, filePath, stat });
    } else {
      this.setAside(id, dirName, filePath, stat.mtimeMs);
    }
  }

  /** A set-aside file becomes a candidate again only if it is fresh and its mtime changed. */
  async #recheckStale(round: DiscoveryRound, candidates: Candidate[]): Promise<void> {
    for (const entry of this.#stale.takeDue(this.#clock.now())) {
      let stat: EntryStat;
      try {
        stat = await this.#fs.lstat(entry.filePath);
      } catch (error: unknown) {
        if (!round.isLive()) {
          return;
        }
        if (!isGoneCode(safeErrorCode(error))) {
          this.setAside(entry.id, entry.dirName, entry.filePath, entry.mtimeMs);
        }
        continue;
      }
      if (!round.isLive()) {
        return;
      }
      if (stat.kind !== 'file') {
        continue;
      }
      const wanted =
        this.#isFresh(stat.mtimeMs, round) &&
        stat.mtimeMs !== entry.mtimeMs &&
        !round.isTracked(entry.id) &&
        !candidates.some((candidate) => candidate.id === entry.id);
      if (wanted) {
        candidates.push({ id: entry.id, dirName: entry.dirName, filePath: entry.filePath, stat });
      } else {
        this.setAside(entry.id, entry.dirName, entry.filePath, stat.mtimeMs);
      }
    }
  }
}
