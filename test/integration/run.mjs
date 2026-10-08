// Pixel Agents extension-host integration runner (ADR 0006 amendment): `npm run test:integration`.
//
// 1. Checks that dist/ holds a build newer than src/ (run `npm run build` first, as for F5).
// 2. Bundles test/integration/suite/index.ts with esbuild (platform node, format cjs, `vscode`
//    external) into out/integration/index.js. The output sits inside the extension development
//    path, so the suite shares the extension's `vscode` API object (see support/providerSpy.ts).
// 3. Downloads VS Code into .vscode-test/ on first run (network needed) and launches it with
//    --disable-extensions, a fresh temp user-data-dir and extensions-dir, and an empty temp
//    workspace, so only the development build of Pixel Agents loads.
//    Our extension's log level is trace, and the in-host suite gets the temp user-data-dir in
//    PIXEL_AGENTS_IT_USER_DATA_DIR so it can read the "Pixel Agents" log channel's file.
//    M3: the monitor reads transcripts, so the run never touches the real ~/.claude. A temp
//    <temp>/claude/projects is the transcript root (pixelAgents.transcriptPath in the temp
//    user-data-dir's settings.json), the simulator is off, and polling and the debounce are
//    short. The root is also passed to the in-host suite in PIXEL_AGENTS_IT_TRANSCRIPT_ROOT
//    (test-side only; the extension reads no environment variable). HOME is deliberately NOT
//    overridden: on macOS an empty HOME stops the real webview from ever sending `ready`
//    (observed with VS Code 1.141), which fails the M1 and M2 suites. USERPROFILE (the Windows
//    home) is pointed at an empty <temp>/home, but that is effective on Windows only: on
//    macOS and Linux os.homedir() reads HOME, so the override does nothing there. The real guard
//    is the temp pixelAgents.transcriptPath in the temp settings.json, which monitor.itest.ts
//    asserts took effect.
// 4. Exits 1 if the build is stale, the suite fails to compile, or any test fails.
//
// PIXEL_AGENTS_VSCODE_VERSION selects the VS Code build (default `stable`; for example `1.90.0`
// tests the engines.vscode minimum). Electron needs a display: on headless Linux use xvfb-run -a.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'out', 'integration');
const ENTRY = path.join(ROOT, 'test', 'integration', 'suite', 'index.ts');
const BUNDLES = ['dist/extension.js', 'dist/webview.js'];
/** publisher.name from package.json, for the per-extension --log level. */
const EXTENSION_ID = 'pixel-agents.pixel-agents';

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
  const fakeHome = path.join(temp, 'home');
  const transcriptRoot = path.join(temp, 'claude', 'projects');
  await Promise.all([userDataDir, extensionsDir, workspace, fakeHome].map((dir) => mkdir(dir)));
  await mkdir(transcriptRoot, { recursive: true });
  // User settings written before VS Code starts; machine-scoped settings are read from here.
  await mkdir(path.join(userDataDir, 'User'), { recursive: true });
  await writeFile(
    path.join(userDataDir, 'User', 'settings.json'),
    JSON.stringify(
      {
        'pixelAgents.transcriptPath': transcriptRoot,
        'pixelAgents.simulator': 'off',
        'pixelAgents.pollIntervalMs': 250,
        'pixelAgents.debounceMs': 100,
        'pixelAgents.idleTimeoutSeconds': 5,
      },
      null,
      2,
    ),
  );

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
        // Trace level for our extension's log channel, so protocol.itest.ts can assert that no
        // "dropped webview message" trace or error line is written (M2 plan task 10).
        '--log',
        `${EXTENSION_ID}:trace`,
      ],
      // Test-side only: tells the in-host suite where this run's logs are. Production code
      // reads no environment variable (security-and-safety.md section 5).
      extensionTestsEnv: {
        PIXEL_AGENTS_IT_USER_DATA_DIR: userDataDir,
        PIXEL_AGENTS_IT_TRANSCRIPT_ROOT: transcriptRoot,
        USERPROFILE: fakeHome,
      },
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
