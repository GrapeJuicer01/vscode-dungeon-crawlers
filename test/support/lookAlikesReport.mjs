// Look-alike feedback for the pixel-artist, usable BEFORE templates are wired in.
//
//   node test/support/lookAlikesReport.mjs [<file.ts>:<ExportName>[:<stage>[:<id>]] ...]
//
// With no args it prints the matrix for the wired art. Each arg names a TypeScript file and an
// exported Record<id, SpriteTemplate> (for example src/game/sprites/enemiesStage5.ts:ENEMIES_STAGE5:5)
// OR a single SpriteTemplate such as a boss (src/game/sprites/glacierMammothTemplate.ts:GLACIER_MAMMOTH:7).
// A single template takes its id from the optional 4th part, else from the export name lower-cased
// with _ turned into - (GLACIER_MAMMOTH -> glacier-mammoth). Those templates are added to (or
// replace, by id) the wired set, and only pairs involving them are printed with the policy verdict. Exits 1 when the policy is violated. Run from the repo root.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const specs = process.argv.slice(2).map((arg) => {
  const [file, name, stage, id] = arg.split(':');
  if (!file || !name)
    throw new Error(`bad argument "${arg}", want file.ts:ExportName[:stage[:id]]`);
  return { file: path.resolve(ROOT, file), name, stage: Number(stage ?? 0), id };
});

// A tiny generated entry that gathers the extras into the __EXTRAS__ constant the report reads.
const gather = [
  ...specs.map((s, i) => `import * as m${i} from ${JSON.stringify(s.file)};`),
  `const isTemplate = (v) => typeof v === 'object' && v !== null && typeof v.w === 'number' && typeof v.h === 'number';`,
  `const idOf = (name) => name.toLowerCase().replace(/_/g, '-');`,
  `export const extras = [${specs
    .map(
      (s, i) =>
        `...(isTemplate(m${i}[${JSON.stringify(s.name)}]) ? [{ id: ${JSON.stringify(s.id)} ?? idOf(${JSON.stringify(s.name)}), stage: ${s.stage}, template: m${i}[${JSON.stringify(s.name)}] }] : Object.entries(m${i}[${JSON.stringify(s.name)}]).map(([id, template]) => ({ id, stage: ${s.stage}, template })))`,
    )
    .join(', ')}];`,
].join('\n');

const outfile = path.join(ROOT, 'out', 'lookAlikes', 'report.cjs');
await esbuild.build({
  stdin: { contents: gather, resolveDir: ROOT, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(ROOT, 'out', 'lookAlikes', 'extras.cjs'),
  logLevel: 'warning',
});
const { extras } = createRequire(import.meta.url)(
  path.join(ROOT, 'out', 'lookAlikes', 'extras.cjs'),
);
await esbuild.build({
  entryPoints: [path.join(ROOT, 'test', 'support', 'lookAlikesReport.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'warning',
  define: { __EXTRAS__: JSON.stringify(extras) },
});
const result = await new Promise((resolve) => {
  const p = spawn(process.execPath, [outfile], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  p.stdout.on('data', (d) => {
    out += d;
    process.stdout.write(d);
  });
  p.on('close', () => resolve(out));
});
if (!/policy holds/.test(result)) process.exitCode = 1;
