// Transcript root resolution, project directory encoding, containment, and session file names
// (agent-detection.md section 3.1). Pure functions over an injected PathOps, so posix and win32
// behaviour are both testable on any platform.
import type { PathOps } from './ports';

export type TranscriptRoot =
  | { readonly ok: true; readonly root: string; readonly custom: boolean }
  | { readonly ok: false; readonly reason: 'notAbsolute' };

const SESSION_FILE_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const MAX_DIR_NAME_LENGTH = 255;
/** Fallback label when a directory name has no alphanumeric part. */
const FALLBACK_LABEL = 'Project';
/** Number of trailing name segments the tail heuristic keeps. */
const LABEL_TAIL_SEGMENTS = 2;

/**
 * '' gives <home>/.claude/projects; '~/' or '~\' expands; otherwise must be absolute; result is
 * path.resolve'd.
 * Assumption: `~\` expands only where the path separator is a backslash (Windows); on POSIX a
 * backslash is an ordinary file name character, so `~\x` there is a relative path. A bare `~`
 * means the home directory itself.
 */
export function resolveTranscriptRoot(
  setting: string,
  homedir: string,
  path: PathOps,
): TranscriptRoot {
  if (setting === '') {
    return {
      ok: true,
      root: path.resolve(path.join(homedir, '.claude', 'projects')),
      custom: false,
    };
  }
  if (setting === '~') {
    return { ok: true, root: path.resolve(homedir), custom: true };
  }
  if (setting.startsWith('~/') || (path.sep === '\\' && setting.startsWith('~\\'))) {
    return { ok: true, root: path.resolve(homedir, setting.slice(2)), custom: true };
  }
  if (!path.isAbsolute(setting)) {
    return { ok: false, reason: 'notAbsolute' };
  }
  return { ok: true, root: path.resolve(setting), custom: true };
}

/**
 * Every character outside [A-Za-z0-9] becomes '-'. Works on UTF-16 code units (no `u` flag),
 * so a character outside the BMP becomes two dashes, matching Claude Code's layout as observed.
 */
export function encodeProjectDir(folderPath: string): string {
  return folderPath.replace(/[^A-Za-z0-9]/g, '-');
}

/** True if candidate is root itself or below it (path.relative is neither absolute nor '..'-prefixed). */
export function isContained(root: string, candidate: string, path: PathOps): boolean {
  const relative = path.relative(root, candidate);
  if (relative === '') {
    return true;
  }
  if (path.isAbsolute(relative)) {
    return false;
  }
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !relative.startsWith('../');
}

/** Lower-cased UUID for '<uuid>.jsonl', else null (agent-*.jsonl and everything else). */
export function sessionIdFromFileName(fileName: string): string | null {
  const match = SESSION_FILE_PATTERN.exec(fileName);
  const id = match?.[1];
  return id === undefined ? null : id.toLowerCase();
}

/** Not '.', '..', empty, longer than 255, or containing '/' or '\'. */
export function isProjectDirName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_DIR_NAME_LENGTH &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\')
  );
}

/**
 * Label for a project directory: the matching workspace folder name, else the tail heuristic.
 * Assumption (tail heuristic): the encoded name is split on '-', empty parts are dropped, and the
 * last two parts are joined with '-' (for example `-Users-me-My-Repo` gives `My-Repo`). Encoding
 * loses the original separators, so this is a readable hint, never a path. Never empty.
 */
export function projectLabel(
  dirName: string,
  folders: readonly { readonly name: string; readonly encodedNames: readonly string[] }[],
  caseInsensitive: boolean,
): string {
  const wanted = caseInsensitive ? dirName.toLowerCase() : dirName;
  for (const folder of folders) {
    for (const encoded of folder.encodedNames) {
      const candidate = caseInsensitive ? encoded.toLowerCase() : encoded;
      if (candidate === wanted && folder.name.trim().length > 0) {
        return folder.name;
      }
    }
  }
  const parts = dirName.split('-').filter((part) => part.length > 0);
  const tail = parts.slice(-LABEL_TAIL_SEGMENTS).join('-');
  return tail.length > 0 ? tail : FALLBACK_LABEL;
}
