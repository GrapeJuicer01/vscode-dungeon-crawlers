// Pixel Agents extension-host integration runner (ADR 0006 amendment): `npm run test:integration`.
//
// 1. Checks that dist/ holds a build newer than src/ (run `npm run build` first, as for F5).
// 2. Bundles test/integration/suite/index.ts with esbuild (platform node, format cjs, `vscode`
//    external) into out/integration/index.js. The output sits inside the extension development
//    path, so the suite shares the extension's `vscode` API object (see support/providerSpy.ts).
// 3. Downloads VS Code into .vscode-test/ on first run (network needed) and launches it with
//    --disable-extensions, a fresh temp user-data-dir and extensions-dir, and an empty temp
//    workspace, so only the development build of Pixel Agents loads.
// 4. Exits 1 if the build is stale, the suite fails to compile, or any test fails.
//
// PIXEL_AGENTS_VSCODE_VERSION selects the VS Code build (default `stable`; for example `1.90.0`
// tests the engines.vscode minimum). Electron needs a display: on headless Linux use xvfb-run -a.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'out', 'integration');
const ENTRY = path.join(ROOT, 'test', 'integration', 'suite', 'index.ts');
const BUNDLES = ['dist/extension.js', 'dist/webview.js'];

/** @param {string} dir @returns {number} newest mtime (ms) of any file under dir */
function newestMtime(dir) {
  return Math.max(
    ...readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .map((relative) => statSync(path.join(dir, relative)))
      .filter((stats) => stats.isFile())
      .map((stats) => stats.mtimeMs),
  );
}

function assertFreshBuild() {
  const newestSource = newestMtime(path.join(ROOT, 'src'));
  for (const bundle of BUNDLES) {
    const file = path.join(ROOT, bundle);
    if (!existsSync(file) || statSync(file).mtimeMs < newestSource) {
      throw new Error(`${bundle} is missing or older than src/: run \`npm run build\` first.`);
    }
  }
}

async function main() {
  assertFreshBuild();

  await rm(OUT_DIR, { recursive: true, force: true });
  await esbuild.build({
    entryPoints: [ENTRY],
    outfile: path.join(OUT_DIR, 'index.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: 'inline',
    logLevel: 'warning',
    external: ['vscode'],
  });

  // A terminal inside VS Code can export this, which would start Electron as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE;

  const temp = await mkdtemp(path.join(os.tmpdir(), 'pa-it-'));
  const userDataDir = path.join(temp, 'user-data');
  const extensionsDir = path.join(temp, 'extensions');
  const workspace = path.join(temp, 'workspace');
  await Promise.all([userDataDir, extensionsDir, workspace].map((dir) => mkdir(dir)));

  try {
    await runTests({
      version: process.env.PIXEL_AGENTS_VSCODE_VERSION ?? 'stable',
      extensionDevelopmentPath: ROOT,
      extensionTestsPath: path.join(OUT_DIR, 'index.js'),
      launchArgs: [
        workspace,
        '--disable-extensions',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        '--disable-telemetry',
      ],
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  // esbuild has already printed compile errors; print anything else.
  if (!(error instanceof Error && 'errors' in error)) {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
