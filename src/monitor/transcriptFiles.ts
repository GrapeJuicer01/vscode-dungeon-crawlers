// Reading one tracked transcript file (agent-detection.md section 3.1, polling steps 1 to 5):
// identity and size checks, bounded incremental reads, the discovery tail summary, and turning
// complete lines into session inputs. Used only by TranscriptSource.
//
// Core invariant 7: bytes are handed to scanLines and classifyTranscriptLine and then dropped;
// a TrackedFile holds only an offset, an identity, and the session snapshot, never text.
import { assertNever } from '../shared/assertNever';
import { safeErrorCode } from './monitorLog';
import type { EntryStat, ReadOnlyFileSystem } from './ports';
import { nextSession } from './sessionMachine';
import type { ActivityKind, SessionSnapshot, SessionTimings } from './sessionMachine';
import { MAX_LINE_BYTES, scanLines } from './transcriptLines';
import { classifyTranscriptLine } from './transcriptRecord';

/** Limits (agent-detection.md section 9). */
export const INITIAL_TAIL_BYTES = 64 * 1024;
export const MAX_READ_BYTES_PER_POLL = 1024 * 1024;

const NEWLINE = 0x0a;

export interface TrackedFile {
  readonly id: string;
  readonly dirName: string;
  readonly filePath: string;
  readonly name: string;
  ino: number;
  dev: number;
  offset: number;
  /** Inside a line being skipped (tail start or oversized line): drop bytes up to the next newline. */
  skipping: boolean;
  /** readRange reported EIDENTITY: restart from the tail on the next poll. */
  rotated: boolean;
  mtimeMs: number;
  session: SessionSnapshot;
}

/** The file is gone (or became a link) for the purpose of tracking it. */
export function isGoneCode(code: string): boolean {
  return code === 'ENOENT' || code === 'ELOOP' || code === 'ENOTDIR';
}

/** Where a first read (or a read after rotation) starts. */
export function tailStart(size: number): number {
  return size > INITIAL_TAIL_BYTES ? size - INITIAL_TAIL_BYTES : 0;
}

export interface TailSummary {
  readonly offset: number;
  readonly skipping: boolean;
  readonly toolName: string | null;
  readonly toolPending: boolean;
  readonly turnEnded: boolean;
}

/** Replays the discovery tail (read from `start`) into the last tool and turn flags. */
export function summarizeTail(bytes: Uint8Array, start: number): TailSummary {
  const scan = scanLines(bytes, start > 0, MAX_LINE_BYTES);
  let toolName: string | null = null;
  let toolPending = false;
  let turnEnded = false;
  for (const line of scan.lines) {
    const signal = classifyTranscriptLine(line);
    switch (signal.kind) {
      case 'toolUse':
        toolPending = true;
        turnEnded = false;
        toolName = signal.toolName ?? toolName;
        break;
      case 'prompt':
      case 'toolResult':
        toolPending = false;
        turnEnded = false;
        break;
      case 'assistant':
        turnEnded = false;
        break;
      case 'turnEnd':
        toolPending = false;
        turnEnded = true;
        break;
      case 'ignored':
      case 'unparseable':
        break;
      default:
        assertNever(signal.kind);
    }
  }
  return {
    offset: start + scan.consumedBytes,
    skipping: scan.skipRemainder,
    toolName,
    toolPending,
    turnEnded,
  };
}

export type FileRead =
  | { readonly kind: 'removed' }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'failed'; readonly code: string }
  | { readonly kind: 'read'; readonly bytes: Uint8Array };

const REMOVED: FileRead = { kind: 'removed' };
const UNCHANGED: FileRead = { kind: 'unchanged' };

/**
 * One poll of a tracked file: lstat, identity and size checks (rotation resets the offset to the
 * tail, the session continues), and a read of at most MAX_READ_BYTES_PER_POLL appended bytes.
 * `isLive` is checked after every await; when it turns false the result is 'unchanged'.
 * Updates the file's identity, offset, and mtime; never throws.
 */
export async function readTrackedFile(
  fs: ReadOnlyFileSystem,
  file: TrackedFile,
  isLive: () => boolean,
): Promise<FileRead> {
  let stat: EntryStat;
  try {
    stat = await fs.lstat(file.filePath);
  } catch (error: unknown) {
    if (!isLive()) {
      return UNCHANGED;
    }
    const code = safeErrorCode(error);
    return isGoneCode(code) ? REMOVED : { kind: 'failed', code };
  }
  if (!isLive()) {
    return UNCHANGED;
  }
  if (stat.kind !== 'file') {
    return REMOVED;
  }
  file.mtimeMs = stat.mtimeMs;
  const identityChanged =
    (file.ino !== 0 && stat.ino !== 0 && file.ino !== stat.ino) ||
    (file.dev !== 0 && stat.dev !== 0 && file.dev !== stat.dev);
  if (file.rotated || identityChanged || stat.size < file.offset) {
    // Rotated, replaced, or shortened: restart from the tail; the session continues.
    file.ino = stat.ino;
    file.dev = stat.dev;
    file.offset = tailStart(stat.size);
    file.skipping = file.offset > 0;
    file.rotated = false;
  }
  if (stat.size <= file.offset) {
    return UNCHANGED;
  }
  const length = Math.min(stat.size - file.offset, MAX_READ_BYTES_PER_POLL);
  try {
    const bytes = await fs.readRange(file.filePath, file.offset, length, {
      ino: file.ino,
      dev: file.dev,
    });
    return isLive() ? { kind: 'read', bytes } : UNCHANGED;
  } catch (error: unknown) {
    if (!isLive()) {
      return UNCHANGED;
    }
    const code = safeErrorCode(error);
    if (code === 'EIDENTITY') {
      file.rotated = true;
      return UNCHANGED;
    }
    return isGoneCode(code) ? REMOVED : { kind: 'failed', code };
  }
}

export interface ConsumeResult {
  readonly session: SessionSnapshot;
  readonly unparseableLines: number;
  readonly oversized: boolean;
}

/**
 * Turns appended bytes into session inputs, in order. Advances the file's offset past complete
 * lines only (a trailing partial line is re-read next poll) and tracks skip mode for oversized
 * lines, each of which counts as one `assistant` activity and is never parsed.
 */
export function consumeBytes(
  file: TrackedFile,
  bytes: Uint8Array,
  now: number,
  timings: SessionTimings,
): ConsumeResult {
  let session = file.session;
  let view = bytes;
  if (file.skipping) {
    const newline = view.indexOf(NEWLINE);
    if (newline < 0) {
      file.offset += view.length;
      return { session, unparseableLines: 0, oversized: false };
    }
    file.offset += newline + 1;
    view = view.subarray(newline + 1);
    file.skipping = false;
  }
  const scan = scanLines(view, false, MAX_LINE_BYTES);
  file.offset += scan.consumedBytes;
  const activity = (kind: ActivityKind, toolName: string | null): void => {
    session = nextSession(session, { type: 'activity', now, kind, toolName }, timings);
  };
  for (let i = 0; i < scan.oversizedLines; i += 1) {
    activity('assistant', null);
  }
  let unparseableLines = 0;
  for (const line of scan.lines) {
    const signal = classifyTranscriptLine(line);
    switch (signal.kind) {
      case 'ignored':
        break;
      case 'unparseable':
        unparseableLines += 1;
        break;
      case 'prompt':
      case 'assistant':
      case 'toolUse':
      case 'toolResult':
      case 'turnEnd':
        activity(signal.kind, signal.toolName);
        break;
      default:
        assertNever(signal.kind);
    }
  }
  if (scan.skipRemainder) {
    // An oversized line still being written: counted once, never parsed.
    activity('assistant', null);
    file.skipping = true;
  }
  return {
    session,
    unparseableLines,
    oversized: scan.oversizedLines > 0 || scan.skipRemainder,
  };
}
