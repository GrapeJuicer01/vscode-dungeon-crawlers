// Builds the two Pixel Agents bundles (ADR 0004):
//   host:    src/extension.ts   -> dist/extension.js (Node, CommonJS)
//   webview: src/webview/main.ts -> dist/webview.js  (browser, IIFE)
// Flags: --watch (incremental rebuilds), --production (minify, no sourcemaps).
// Development sourcemaps: external .map for the host, inline for the webview (CSP).
import { rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const production = args.has('--production');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  legalComments: 'none',
};

/** @type {import('esbuild').BuildOptions} */
const hostOptions = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  outfile: 'dist/extension.js',
};

/**
 * No externals: a stray `vscode` or `node:*` import in webview code fails to
 * resolve, which is the bundle-boundary backstop.
 * @type {import('esbuild').BuildOptions}
 */
const webviewOptions = {
  ...shared,
  // Inline in development: the webview CSP is `default-src 'none'`, so DevTools may not fetch
  // a separate dist/webview.js.map. Inlining keeps the CSP strict. Production has none.
  sourcemap: production ? false : 'inline',
  entryPoints: ['src/webview/main.ts'],
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/webview.js',
};

async function main() {
  if (watch) {
    const contexts = await Promise.all([
      esbuild.context(hostOptions),
      esbuild.context(webviewOptions),
    ]);
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    return;
  }

  // Remove dist/ first so stale sourcemaps from a development build never reach the package.
  await rm('dist', { recursive: true, force: true });
  await Promise.all([esbuild.build(hostOptions), esbuild.build(webviewOptions)]);
}

main().catch((error) => {
  // esbuild has already printed build errors (logLevel 'info'); print anything else.
  if (!(error instanceof Error && 'errors' in error)) {
    console.error(error);
  }
  process.exit(1);
});
