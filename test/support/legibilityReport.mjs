// Legibility feedback for the pixel-artist, usable BEFORE a stage palette is wired in.
//
//   node test/support/legibilityReport.mjs [<file.ts>:<PaletteExport>:<FloorBackExport>:<FloorFrontExport>[:<stage 9|10>] ...]
//
// With no args it prints, for Stages 1 to 8, the floor luminance after the g multiply, the mean floor
// colour, the WCAG contrast of each of the twelve hero cloths (plus the base hero), and the rules
// calibrated from them (E5 plan section 7, note 8). Each argument names a TypeScript file and three
// exports: a Record<char, '#rrggbb'> stage palette (partial over the master palette, with `g`) and the
// floorBack and floorFront SpriteTemplates. The candidate is measured and judged without being wired.
// Give the stage (9 or 10) as the optional 5th part: rule 2 binds Stage 9, rule 3 Stage 10 (otherwise
// they are printed as info). The exit code is 1 when a binding rule fails. Run from the repo root.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const specs = process.argv.slice(2).map((arg) => {
  const [file, pal, back, front, stage] = arg.split(':');
  if (!file || !pal || !back || !front)
    throw new Error(
      `bad argument "${arg}", want file.ts:PaletteExport:FloorBackExport:FloorFrontExport`,
    );
  return { file: path.resolve(ROOT, file), pal, back, front, stage: Number(stage ?? 0) };
});
const reportTs = JSON.stringify(path.join(ROOT, 'test', 'support', 'legibilityReport.ts'));
const entry = [
  `import { report } from ${reportTs};`,
  ...specs.map((s, i) => `import * as m${i} from ${JSON.stringify(s.file)};`),
  `report([${specs
    .map(
      (s, i) =>
        `{ name: ${JSON.stringify(`${path.basename(s.file)}:${s.pal}`)}, palette: m${i}[${JSON.stringify(s.pal)}], floorBack: m${i}[${JSON.stringify(s.back)}], floorFront: m${i}[${JSON.stringify(s.front)}], stage: ${s.stage} }`,
    )
    .join(', ')}]);`,
].join('\n');
const outfile = path.join(ROOT, 'out', 'legibility', 'report.cjs');
await esbuild.build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
