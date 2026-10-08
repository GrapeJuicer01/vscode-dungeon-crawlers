// Error description and logging helpers for the monitor (agent-detection.md section 7).
//
// Core invariant 7: V8 JSON.parse errors quote their input and Node fs errors embed paths, so
// monitor code describes an error only through safeErrorCode, which reads `code` and `name` and
// nothing else. Every logger the monitor uses swallows its own failures (Core invariant 4).
import type { Clock, MonitorLogger } from './ports';

/** Interval for repeated reason lines (agent-detection.md section 9). */
export const LOG_RATE_LIMIT_MS = 60_000;

const ERROR_CODE_PATTERN = /^E[A-Z0-9_]{1,31}$/;
const ERROR_NAME_PATTERN = /^[A-Za-z]{1,40}$/;
/** Bound on remembered reason lines; they are fixed strings, so this is only a safety net. */
const MAX_REMEMBERED_LINES = 256;

/**
 * error.code if /^E[A-Z0-9_]{1,31}$/, else error.name if /^[A-Za-z]{1,40}$/, else 'unknown'.
 * Never reads message or stack. Never throws.
 */
export function safeErrorCode(error: unknown): string {
  try {
    if ((typeof error !== 'object' && typeof error !== 'function') || error === null) {
      return 'unknown';
    }
    const fields = error as { readonly code?: unknown; readonly name?: unknown };
    const code = fields.code;
    if (typeof code === 'string' && ERROR_CODE_PATTERN.test(code)) {
      return code;
    }
    const name = fields.name;
    if (typeof name === 'string' && ERROR_NAME_PATTERN.test(name)) {
      return name;
    }
  } catch {
    // A throwing getter or Proxy trap: describe it as unknown.
  }
  return 'unknown';
}

/** Wraps a logger so a throwing logger never escapes into monitor code. */
export function createSafeLogger(inner: MonitorLogger): MonitorLogger {
  return {
    trace(line: string): void {
      try {
        inner.trace(line);
      } catch {
        // Nowhere left to report; nothing may escape.
      }
    },
    error(line: string): void {
      try {
        inner.error(line);
      } catch {
        // Nowhere left to report; nothing may escape.
      }
    },
  };
}

/** Drops a message identical to one it logged within intervalMs. For reason lines only, not state transitions. */
export class RateLimitedLogger implements MonitorLogger {
  readonly #inner: MonitorLogger;
  readonly #clock: Clock;
  readonly #intervalMs: number;
  readonly #lastLoggedAt = new Map<string, number>();

  constructor(inner: MonitorLogger, clock: Clock, intervalMs: number) {
    this.#inner = createSafeLogger(inner);
    this.#clock = clock;
    this.#intervalMs = intervalMs;
  }

  trace(line: string): void {
    if (this.#admit(line)) {
      this.#inner.trace(line);
    }
  }

  error(line: string): void {
    if (this.#admit(line)) {
      this.#inner.error(line);
    }
  }

  #admit(line: string): boolean {
    try {
      const now = this.#clock.now();
      const last = this.#lastLoggedAt.get(line);
      if (last !== undefined && now - last < this.#intervalMs && now >= last) {
        return false;
      }
      if (this.#lastLoggedAt.size >= MAX_REMEMBERED_LINES) {
        this.#lastLoggedAt.clear();
      }
      this.#lastLoggedAt.set(line, now);
      return true;
    } catch {
      // A throwing clock: let the line through rather than lose an error.
      return true;
    }
  }
}
