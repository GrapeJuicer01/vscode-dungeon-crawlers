// Runs scripts/generate-doc-tables.ts: bundles it with esbuild (already a devDependency) into
// out/scripts/ and calls its main(). Same pattern as test/run.mjs; no new package and no
// --experimental-strip-types. Usage: `npm run docs:tables` or `node scripts/docs-tables.mjs --check`.
import { createRequire } from 'node:module';
import path from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const outfile = path.join(ROOT, 'out', 'scripts', 'generate-doc-tables.cjs');

await esbuild.build({
  entryPoints: [path.join(ROOT, 'scripts', 'generate-doc-tables.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
});

const generator = createRequire(import.meta.url)(outfile);
process.exitCode = generator.main(process.argv.slice(2), ROOT);
