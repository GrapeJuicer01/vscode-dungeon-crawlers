// Pixel Agents test runner (ADR 0006): Node's built-in node:test, TypeScript compiled by esbuild.
//
// 1. Finds every test/**/*.test.ts.
// 2. Bundles each one with esbuild (platform node, format cjs, inline sourcemaps) into out/test/.
//    The `vscode` module does not exist outside an extension host, so it is aliased to the
//    in-memory fake in test/support/fakeVscode.ts.
// 3. Runs the bundles through node:test run() with the spec reporter.
// 4. Exits 1 if any test fails, any file fails to compile, or no test file is found.
//
// Run from the repo root: `npm run test`. Tests read repo files relative to process.cwd().
import { readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, 'test');
const OUT_DIR = path.join(ROOT, 'out', 'test');
const FAKE_VSCODE = path.join(TEST_DIR, 'support', 'fakeVscode.ts');

/** @returns {string[]} absolute paths of test/**\/*.test.ts, sorted for a stable order */
function findTestFiles() {
  return readdirSync(TEST_DIR, { recursive: true, encoding: 'utf8' })
    .filter((relative) => relative.endsWith('.test.ts'))
    .map((relative) => path.join(TEST_DIR, relative))
    .sort();
}

async function main() {
  const entryPoints = findTestFiles();
  if (entryPoints.length === 0) {
    console.error('No test files found under test/**/*.test.ts.');
    process.exitCode = 1;
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await esbuild.build({
    entryPoints,
    outdir: OUT_DIR,
    outbase: TEST_DIR,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: 'inline',
    logLevel: 'warning',
    alias: { vscode: FAKE_VSCODE },
  });

  const files = entryPoints.map((entry) =>
    path.join(OUT_DIR, path.relative(TEST_DIR, entry)).replace(/\.ts$/, '.js'),
  );

  const stream = run({ files });
  stream.on('test:fail', () => {
    process.exitCode = 1;
  });
  stream.compose(new spec()).pipe(process.stdout);
}

main().catch((error) => {
  // esbuild has already printed compile errors; print anything else.
  if (!(error instanceof Error && 'errors' in error)) {
    console.error(error);
  }
  process.exitCode = 1;
});
