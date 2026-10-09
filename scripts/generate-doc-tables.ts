// Regenerates the tables embedded in the docs from the source data tables (gate G2).
// Two generated regions: the class table in docs/design/classes.md, between
// `<!-- BEGIN GENERATED: classes -->` and `<!-- END GENERATED: classes -->` (H1), and the enemy table
// in docs/design/enemies-and-stages.md, between `<!-- BEGIN GENERATED: enemies -->` and
// `<!-- END GENERATED: enemies -->` (E1).
// Pure data in, Markdown out: this script imports only the class, enemy, and stage tables (no art,
// no vscode, no DOM) and writes only those two docs. Run it through `npm run docs:tables` (scripts/docs-tables.mjs
// bundles it with esbuild); `--check` prints nothing and exits 1 when the file would change.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DELIVERED_CLASSES } from '../src/game/data/classMap';
import { CLASSES } from '../src/game/data/classes';
import type { ClassDef, EffectShot } from '../src/game/data/classes';
import { ENEMIES, TIER_SPEED_PX_PER_S, healthOf } from '../src/game/data/enemies';
import type { EnemyRow } from '../src/game/data/enemies';
import { STAGES } from '../src/game/data/stages';
import type { StageDef } from '../src/game/data/stages';

export const CLASSES_DOC = path.join('docs', 'design', 'classes.md');
export const BEGIN_MARKER = '<!-- BEGIN GENERATED: classes -->';
export const END_MARKER = '<!-- END GENERATED: classes -->';
/** Classes planned across H1 to H3 (roadmap); the table says how many exist so far. */
const PLANNED_CLASS_COUNT = 12;

export const ENEMIES_DOC = path.join('docs', 'design', 'enemies-and-stages.md');
export const ENEMY_BEGIN_MARKER = '<!-- BEGIN GENERATED: enemies -->';
export const ENEMY_END_MARKER = '<!-- END GENERATED: enemies -->';
/** Enemies of the finished game (10 stages x 5); the table says how many exist so far. */
const PLANNED_ENEMY_COUNT = 50;

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

/**
 * The generated enemy region body (without the markers). Health is at cycle 0 and a party of one
 * (a boss grows with party size, see healthOf); pace is in px/s. Pure and deterministic.
 */
export function renderEnemyTable(
  rows: readonly EnemyRow[] = ENEMIES,
  stages: readonly StageDef[] = STAGES,
): string {
  const lines = [
    `Delivered enemies: ${rows.length} of ${PLANNED_ENEMY_COUNT}.`,
    '',
    '| Stage | Id | Name | Tier | Gait | Health | Pace (px/s) | Drop |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const stage = stages.find((def) => def.index === row.stage);
    const pace = Math.round(TIER_SPEED_PX_PER_S[row.tier] * row.pace * 10) / 10;
    lines.push(
      `| ${row.stage}. ${stage?.name ?? 'unknown'} | \`${row.id}\` | ${row.name} | ${row.tier} | ${row.gait} | ${healthOf(row, row.stage, 0, 1)} | ${pace} | ${row.drop} |`,
    );
  }
  return lines.join('\n');
}

/** Replaces the text between the enemy markers; throws a fixed-message Error when they are missing. */
export function applyEnemyTable(doc: string, table: string): string {
  const begin = doc.indexOf(ENEMY_BEGIN_MARKER);
  const end = doc.indexOf(ENEMY_END_MARKER);
  if (
    begin < 0 ||
    end < begin ||
    doc.indexOf(ENEMY_BEGIN_MARKER, begin + 1) >= 0 ||
    doc.indexOf(ENEMY_END_MARKER, end + 1) >= 0
  ) {
    throw new Error('enemies-and-stages.md needs exactly one BEGIN and one END marker, in order');
  }
  return `${doc.slice(0, begin + ENEMY_BEGIN_MARKER.length)}\n${table}\n${doc.slice(end)}`;
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
  const targets: readonly {
    readonly doc: string;
    readonly render: (current: string) => string;
  }[] = [
    { doc: CLASSES_DOC, render: (current) => applyClassTable(current, renderClassTable(CLASSES)) },
    {
      doc: ENEMIES_DOC,
      render: (current) => applyEnemyTable(current, renderEnemyTable(ENEMIES, STAGES)),
    },
  ];
  let stale = false;
  for (const target of targets) {
    const file = path.join(root, target.doc);
    if (!existsSync(file)) {
      process.stderr.write(`${target.doc} does not exist\n`);
      return 2;
    }
    const current = readFileSync(file, 'utf8');
    let next: string;
    try {
      next = target.render(current);
    } catch (error: unknown) {
      process.stderr.write(
        `${error instanceof Error ? error.message : `cannot update ${target.doc}`}\n`,
      );
      return 2;
    }
    if (next !== current) {
      stale = true;
      if (!check) {
        writeFileSync(file, next);
      }
    }
  }
  return check && stale ? 1 : 0;
}
