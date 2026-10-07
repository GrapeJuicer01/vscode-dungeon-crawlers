// Minimal in-host test harness for the extension-host integration suite (ADR 0006 amendment).
//
// node:test's run() spawns child processes with process.execPath, which inside the extension
// host is the Electron binary without the `vscode` module, so it cannot run these tests. This
// harness keeps the node:test shape (`describe` / `it`, node:assert/strict) and runs every test
// in order, in-process, with a per-test timeout. Order matters: the lazy-activation checks must
// run before anything opens the view. It never skips a test and fails the run if any test fails.

type TestFn = () => void | Promise<void>;

interface RegisteredTest {
  readonly name: string;
  readonly fn: TestFn;
  readonly timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const registered: RegisteredTest[] = [];
const suiteStack: string[] = [];

/** Groups tests under a name prefix. The body runs synchronously at registration time. */
export function describe(name: string, body: () => void): void {
  suiteStack.push(name);
  try {
    body();
  } finally {
    suiteStack.pop();
  }
}

export function it(name: string, fn: TestFn, timeoutMs = DEFAULT_TIMEOUT_MS): void {
  registered.push({ name: [...suiteStack, name].join(' > '), fn, timeoutMs });
}

function withTimeout(promise: Promise<void>, timeoutMs: number, name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs} ms: ${name}`));
    }, timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export interface RunSummary {
  readonly passed: number;
  readonly failed: readonly string[];
}

/** Runs every registered test in registration order and prints a TAP-like report. */
export async function runRegistered(): Promise<RunSummary> {
  let passed = 0;
  const failed: string[] = [];
  console.log(`TAP version 13\n1..${registered.length}`);
  for (const [index, test] of registered.entries()) {
    const started = Date.now();
    try {
      await withTimeout(Promise.resolve().then(test.fn), test.timeoutMs, test.name);
      passed += 1;
      console.log(`ok ${index + 1} - ${test.name} (${Date.now() - started} ms)`);
    } catch (error: unknown) {
      failed.push(test.name);
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.log(`not ok ${index + 1} - ${test.name}`);
      console.log(
        detail
          .split('\n')
          .map((line) => `  # ${line}`)
          .join('\n'),
      );
    }
  }
  console.log(`# tests ${registered.length}\n# pass ${passed}\n# fail ${failed.length}`);
  return { passed, failed };
}

/** Polls `predicate` every 50 ms until it returns true, or throws `message` after `timeoutMs`. */
export async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs} ms: ${message}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

/** Resolves after `ms`, for letting the workbench settle when there is no event to wait on. */
export function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
