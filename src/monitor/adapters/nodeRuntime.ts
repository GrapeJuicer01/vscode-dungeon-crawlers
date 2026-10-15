// Node runtime adapters for the monitor core: the system clock, unref'd timers, node:path, and
// the platform's file-name case rule. Reads process.platform only, never the environment.
import * as path from 'node:path';
import type { Clock, PathOps, TimerPort } from '../ports';

export const NODE_CLOCK: Clock = {
  now: () => Date.now(),
};

/** Timers are unref'd so a missed dispose can never keep a process alive. */
export const NODE_TIMERS: TimerPort = {
  setTimeout(callback: () => void, delayMs: number): () => void {
    const handle = setTimeout(callback, Math.max(0, delayMs));
    handle.unref();
    return () => clearTimeout(handle);
  },
};

export const NODE_PATH: PathOps = {
  sep: path.sep,
  isAbsolute: (target) => path.isAbsolute(target),
  resolve: (...segments) => path.resolve(...segments),
  join: (...segments) => path.join(...segments),
  relative: (from, to) => path.relative(from, to),
};

/** Windows and (usually) macOS file systems compare names case-insensitively. */
export const CASE_INSENSITIVE_FS: boolean =
  process.platform === 'win32' || process.platform === 'darwin';
