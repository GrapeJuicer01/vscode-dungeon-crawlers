// Regenerates the tables embedded in the docs from the source data tables (gate G2).
// H1 generates one region: the class table in docs/design/classes.md, between
// `<!-- BEGIN GENERATED: classes -->` and `<!-- END GENERATED: classes -->`. E1 adds the enemy table.
// Pure data in, Markdown out: this script imports only the class tables (no art, no vscode, no DOM)
// and writes only docs/design/classes.md. Run it through `npm run docs:tables` (scripts/docs-tables.mjs
// bundles it with esbuild); `--check` prints nothing and exits 1 when the file would change.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DELIVERED_CLASSES } from '../src/game/data/classMap';
import { CLASSES } from '../src/game/data/classes';
import type { ClassDef, EffectShot } from '../src/game/data/classes';

export const CLASSES_DOC = path.join('docs', 'design', 'classes.md');
export const BEGIN_MARKER = '<!-- BEGIN GENERATED: classes -->';
export const END_MARKER = '<!-- END GENERATED: classes -->';
/** Classes planned across H1 to H3 (roadmap); the table says how many exist so far. */
const PLANNED_CLASS_COUNT = 12;

function shotsText(shots: readonly EffectShot[]): string {
  if (shots.length === 0) {
    return 'none';
  }
  const counts = new Map<string, number>();
  for (const shot of shots) {
    counts.set(shot.effect, (counts.get(shot.effect) ?? 0) + 1);
  }
  return [...counts]
    .map(([effect, n]) => (n > 1 ? `\`${effect}\` x${n}` : `\`${effect}\``))
    .join(', ');
}

/** "; summons a skeleton" for a class that raises a cosmetic ally (H2), else empty. */
function summonText(def: ClassDef): string {
  return def.summon === null ? '' : `; summons a ${def.summon.kind}`;
}

/** The generated region body (without the markers). Pure and deterministic. */
export function renderClassTable(
  classes: readonly ClassDef[],
  delivered: number = DELIVERED_CLASSES.length,
): string {
  const lines = [
    `Delivered classes: ${delivered} of ${PLANNED_CLASS_COUNT}.`,
    '',
    '| Class | Role | Colors | Silhouette | Strike effect | Ability (effects) |',
    '|---|---|---|---|---|---|',
  ];
  for (const def of classes) {
    lines.push(
      `| ${def.name} | ${def.role} | ${def.colors} | ${def.silhouette} | ${shotsText(def.strike)} | ${def.ability.name} (${shotsText(def.ability.shots)}${summonText(def)}) |`,
    );
  }
  return lines.join('\n');
}

/** Replaces the text between the markers; throws a fixed-message Error when they are missing. */
export function applyClassTable(doc: string, table: string): string {
  const begin = doc.indexOf(BEGIN_MARKER);
  const end = doc.indexOf(END_MARKER);
  if (
    begin < 0 ||
    end < begin ||
    doc.indexOf(BEGIN_MARKER, begin + 1) >= 0 ||
    doc.indexOf(END_MARKER, end + 1) >= 0
  ) {
    throw new Error('classes.md needs exactly one BEGIN and one END marker, in order');
  }
  return `${doc.slice(0, begin + BEGIN_MARKER.length)}\n${table}\n${doc.slice(end)}`;
}

/**
 * Entry point used by scripts/docs-tables.mjs. Returns the process exit code: 0 on success
 * (or an unchanged file with --check), 1 when --check finds a stale file, 2 on a setup error.
 */
export function main(argv: readonly string[], root: string): number {
  const check = argv.includes('--check');
  const file = path.join(root, CLASSES_DOC);
  if (!existsSync(file)) {
    process.stderr.write(`${CLASSES_DOC} does not exist\n`);
    return 2;
  }
  const current = readFileSync(file, 'utf8');
  let next: string;
  try {
    next = applyClassTable(current, renderClassTable(CLASSES));
  } catch (error: unknown) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'cannot update classes.md'}\n`,
    );
    return 2;
  }
  if (next === current) {
    return 0;
  }
  if (check) {
    return 1;
  }
  writeFileSync(file, next);
  return 0;
}
