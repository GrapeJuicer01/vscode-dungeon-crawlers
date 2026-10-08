// Which project directories are in scope (agent-detection.md section 3.1, scope table).
// `workspace`: the encoded names of this window's `file:` folders, for both the folder path and
// its realpath, never a listing of the root. `all`: every directory directly under the root,
// re-listed at most every ALL_SCOPE_RESCAN_MS. Used only by TranscriptSource.
import type { ProjectScope } from './monitorConfig';
import type { MonitorLogger, ReadOnlyFileSystem, WorkspaceFolderRef } from './ports';
import { encodeProjectDir, isProjectDirName } from './projectPaths';
import { safeErrorCode } from './monitorLog';

export const ALL_SCOPE_RESCAN_MS = 5000;

export interface FolderLabel {
  readonly name: string;
  readonly encodedNames: readonly string[];
}

function sameFolders(a: readonly WorkspaceFolderRef[], b: readonly WorkspaceFolderRef[]): boolean {
  return (
    a.length === b.length &&
    a.every((folder, i) => folder.name === b[i]?.name && folder.fsPath === b[i]?.fsPath)
  );
}

export class ScopeResolver {
  readonly #fs: ReadOnlyFileSystem;
  readonly #caseInsensitive: boolean;
  /** Logger for repeated reason lines (rate-limited by the caller). */
  readonly #limited: MonitorLogger;
  #folders: readonly WorkspaceFolderRef[];
  readonly #folderRealpaths = new Map<string, string | null>();
  #rootListing: { readonly at: number; readonly names: readonly string[] } | null = null;

  constructor(
    fs: ReadOnlyFileSystem,
    caseInsensitive: boolean,
    limited: MonitorLogger,
    folders: readonly WorkspaceFolderRef[],
  ) {
    this.#fs = fs;
    this.#caseInsensitive = caseInsensitive;
    this.#limited = limited;
    this.#folders = [...folders];
  }

  get hasFolders(): boolean {
    return this.#folders.length > 0;
  }

  /** Returns true if the folder list changed (caches are then dropped). */
  setFolders(folders: readonly WorkspaceFolderRef[]): boolean {
    if (sameFolders(folders, this.#folders)) {
      return false;
    }
    this.#folders = [...folders];
    this.#folderRealpaths.clear();
    this.#rootListing = null;
    return true;
  }

  /** Forget the cached root listing (root or scope changed). */
  invalidate(): void {
    this.#rootListing = null;
  }

  /** Comparison key for directory names: lower-cased on case-insensitive file systems. */
  key(dirName: string): string {
    return this.#caseInsensitive ? dirName.toLowerCase() : dirName;
  }

  /** Folder names with their encoded directory names (path and, when it resolves, realpath). */
  async folderLabels(isLive: () => boolean): Promise<readonly FolderLabel[]> {
    const labels: FolderLabel[] = [];
    for (const folder of this.#folders) {
      let real = this.#folderRealpaths.get(folder.fsPath);
      if (real === undefined) {
        try {
          real = await this.#fs.realpath(folder.fsPath);
        } catch {
          real = null;
        }
        if (!isLive()) {
          return labels;
        }
        this.#folderRealpaths.set(folder.fsPath, real);
      }
      const encodedNames = [encodeProjectDir(folder.fsPath)];
      if (real !== null) {
        encodedNames.push(encodeProjectDir(real));
      }
      labels.push({ name: folder.name, encodedNames });
    }
    return labels;
  }

  /** In-scope project directory names (each passes isProjectDirName), deduplicated by key. */
  async projectDirs(
    root: string,
    scope: ProjectScope,
    now: number,
    isLive: () => boolean,
  ): Promise<readonly string[]> {
    const names =
      scope === 'workspace'
        ? (await this.folderLabels(isLive)).flatMap((label) => label.encodedNames)
        : await this.#listRoot(root, now);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of names) {
      const key = this.key(name);
      if (isProjectDirName(name) && !seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
    return out;
  }

  async #listRoot(root: string, now: number): Promise<readonly string[]> {
    const cached = this.#rootListing;
    if (cached !== null && now - cached.at < ALL_SCOPE_RESCAN_MS && now >= cached.at) {
      return cached.names;
    }
    try {
      const entries = await this.#fs.readdir(root);
      // Directory entries only; a symbolic link to a directory reports as 'symlink' and is skipped.
      const names = entries
        .filter((entry) => entry.kind === 'directory')
        .map((entry) => entry.name);
      this.#rootListing = { at: now, names };
      return names;
    } catch (error: unknown) {
      this.#limited.error('monitor: transcript root unreadable (' + safeErrorCode(error) + ')');
      return cached?.names ?? [];
    }
  }
}
