// Generated docs (H1 plan test note 11, E1 plan test note 12, gate G2): docs/design/classes.md holds
// the class table and docs/design/enemies-and-stages.md holds the enemy table, each between
// markers; each table equals what the generator produces now, --check detects a stale file, and
// the generator is pure data in, two docs files out.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { CLASSES } from '../../src/game/data/classes';
import type { ClassDef } from '../../src/game/data/classes';
import { ENEMIES, healthOf } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import {
  BEGIN_MARKER,
  CLASSES_DOC,
  END_MARKER,
  ENEMIES_DOC,
  ENEMY_BEGIN_MARKER,
  ENEMY_END_MARKER,
  applyClassTable,
  applyEnemyTable,
  main,
  renderClassTable,
  renderEnemyTable,
} from '../../scripts/generate-doc-tables';
import { REPO_ROOT, readJson, readText, repoPath } from '../support/repo';
import { code, importSpecifiers } from '../support/source';

const count = (text: string, needle: string): number => text.split(needle).length - 1;

const temps: string[] = [];
afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop() ?? '', { recursive: true, force: true });
  }
});

/**
 * A scratch repo root holding only the two generated docs (copies of the real ones); `transform`
 * edits classes.md and `transformEnemies` edits enemies-and-stages.md.
 */
function scratchRoot(
  transform: (doc: string) => string = (d) => d,
  transformEnemies: (doc: string) => string = (d) => d,
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pixel-agents-docs-'));
  temps.push(root);
  mkdirSync(path.join(root, 'docs', 'design'), { recursive: true });
  writeFileSync(path.join(root, CLASSES_DOC), transform(readText(CLASSES_DOC)));
  writeFileSync(path.join(root, ENEMIES_DOC), transformEnemies(readText(ENEMIES_DOC)));
  return root;
}

/** Runs fn with stderr muted (main reports setup errors there). */
function quietly<T>(fn: () => T): { result: T; stderr: string } {
  const original = process.stderr.write.bind(process.stderr);
  let stderr = '';
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    stderr += String(chunk);
    return true;
  };
  try {
    return { result: fn(), stderr };
  } finally {
    process.stderr.write = original;
  }
}

void describe('docs/design/classes.md', () => {
  const doc = readText(CLASSES_DOC);

  void it('contains the begin and end markers exactly once each, in order', () => {
    assert.equal(count(doc, BEGIN_MARKER), 1);
    assert.equal(count(doc, END_MARKER), 1);
    assert.ok(doc.indexOf(BEGIN_MARKER) < doc.indexOf(END_MARKER));
    assert.equal(BEGIN_MARKER, '<!-- BEGIN GENERATED: classes -->');
    assert.equal(END_MARKER, '<!-- END GENERATED: classes -->');
  });

  void it('the generated region equals what the generator produces now', () => {
    const begin = doc.indexOf(BEGIN_MARKER) + BEGIN_MARKER.length;
    const region = doc.slice(begin, doc.indexOf(END_MARKER));
    assert.equal(region, `\n${renderClassTable(CLASSES)}\n`);
  });

  void it('applying the current table to the committed file changes nothing', () => {
    assert.equal(applyClassTable(doc, renderClassTable(CLASSES)), doc);
  });

  void it('starts with a purpose line and links to related docs', () => {
    assert.match(doc, /^# .+\n\nPurpose: /);
    assert.match(doc, /\nRelated: .*\]\(/);
  });

  void it('says there is no health or damage, and names every class', () => {
    assert.match(doc, /invulnerable/i);
    for (const c of CLASSES) {
      assert.ok(doc.includes(c.name), c.name);
    }
  });
});

void describe('renderClassTable', () => {
  void it('is deterministic and has one row per class plus the delivered count', () => {
    const a = renderClassTable(CLASSES);
    assert.equal(a, renderClassTable(CLASSES));
    const lines = a.split('\n');
    assert.equal(lines[0], 'Delivered classes: 12 of 12.');
    assert.equal(CLASSES.length, 12);
    assert.equal(
      lines.filter((l) => l.startsWith('| ')).length,
      CLASSES.length + 1,
      'header + rows',
    );
    assert.match(a, /\n\|---\|---\|---\|---\|---\|---\|\n/, 'compact delimiter row');
  });

  void it('changing a class name changes the table', () => {
    const renamed: ClassDef[] = CLASSES.map((c) =>
      c.id === 'mage' ? { ...c, name: 'Wizard' } : c,
    );
    const changed = renderClassTable(renamed);
    assert.notEqual(changed, renderClassTable(CLASSES));
    assert.match(changed, /\| Wizard \|/);
    assert.doesNotMatch(changed, /\| Mage \|/);
  });

  void it('shows each shot list compactly: none, one effect, repeated effects as xN', () => {
    const table = renderClassTable(CLASSES);
    assert.match(table, /\| Warrior \| melee \|.*\| none \| Whirlwind \(`whirl`\) \|/);
    assert.match(table, /Volley \(`arrow` x3\)/);
    assert.match(table, /Dagger Flurry \(`smokePuff`, `dagger` x2\)/);
  });

  void it('summoner ability cells name their kind; no other row mentions a summon', () => {
    const rows = renderClassTable(CLASSES)
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| Class'));
    assert.equal(rows.length, 12);
    const kinds: Record<string, string> = {
      Necromancer: 'skeleton',
      Druid: 'beast',
      Artificer: 'turret',
    };
    for (const row of rows) {
      const name = /^\| ([A-Za-z]+) \|/.exec(row)?.[1] ?? '';
      assert.equal(/summon/i.test(row), name in kinds, row);
      const kind = kinds[name];
      if (kind !== undefined) {
        assert.match(row, new RegExp(`summons a ${kind}\\) \\|$`), row);
      }
    }
  });

  void it('puts the delivered count in the text', () => {
    assert.match(renderClassTable(CLASSES, 12), /^Delivered classes: 12 of 12\./);
  });
});

void describe('applyClassTable', () => {
  void it('replaces only the region between the markers', () => {
    const doc = `head\n${BEGIN_MARKER}\nold\n${END_MARKER}\ntail\n`;
    assert.equal(applyClassTable(doc, 'new'), `head\n${BEGIN_MARKER}\nnew\n${END_MARKER}\ntail\n`);
  });

  void it('throws a fixed message for missing, reversed, or duplicated markers', () => {
    const bad = [
      'no markers',
      `${BEGIN_MARKER}\nonly begin`,
      `${END_MARKER}\n${BEGIN_MARKER}`,
      `${BEGIN_MARKER}\n${BEGIN_MARKER}\n${END_MARKER}`,
      `${BEGIN_MARKER}\n${END_MARKER}\n${END_MARKER}`,
    ];
    for (const doc of bad) {
      assert.throws(
        () => applyClassTable(doc, 't'),
        (e: unknown) =>
          e instanceof Error &&
          e.message === 'classes.md needs exactly one BEGIN and one END marker, in order',
      );
    }
  });
});

void describe('main (the generator entry point)', () => {
  void it('--check returns 0 and writes nothing on the committed repo', () => {
    const before = readText(CLASSES_DOC);
    const { result, stderr } = quietly(() => main(['--check'], REPO_ROOT));
    assert.equal(result, 0);
    assert.equal(stderr, '');
    assert.equal(readText(CLASSES_DOC), before);
  });

  void it('--check returns 1 when a class name in the file is stale, and does not rewrite it', () => {
    const root = scratchRoot((d) => d.replace('| Mage |', '| Mage (old) |'));
    const stale = readFileSync(path.join(root, CLASSES_DOC), 'utf8');
    const { result, stderr } = quietly(() => main(['--check'], root));
    assert.equal(result, 1);
    assert.equal(stderr, '', 'prints nothing');
    assert.equal(readFileSync(path.join(root, CLASSES_DOC), 'utf8'), stale);
  });

  void it('--check returns 1 for a stale count line, a missing row, or an edited cell', () => {
    for (const edit of [
      (d: string): string =>
        d.replace('Delivered classes: 12 of 12.', 'Delivered classes: 7 of 12.'),
      (d: string): string => d.replace(/\| Bard \|.*\n/, ''),
      (d: string): string => d.replace('teal + magenta', 'teal + pink'),
      (d: string): string => d.replace('; summons a skeleton', ''),
      (d: string): string => d.replace(/\| Rogue \|.*\n/, ''),
      (d: string): string => d.replace('red + steel', 'crimson + steel'),
    ]) {
      const root = scratchRoot(edit);
      assert.equal(quietly(() => main(['--check'], root)).result, 1);
    }
  });

  void it('without --check it fixes the file, then --check returns 0 and a second run changes nothing', () => {
    const root = scratchRoot((d) => d.replace('| Mage |', '| Mage (old) |'));
    assert.equal(quietly(() => main([], root)).result, 0);
    const fixed = readFileSync(path.join(root, CLASSES_DOC), 'utf8');
    assert.equal(fixed, readText(CLASSES_DOC), 'matches the committed, fresh file');
    assert.equal(quietly(() => main(['--check'], root)).result, 0);
    assert.equal(quietly(() => main([], root)).result, 0);
    assert.equal(readFileSync(path.join(root, CLASSES_DOC), 'utf8'), fixed);
  });

  void it('writes only the two generated docs', () => {
    const root = scratchRoot((d) => d.replace('| Mage |', '| Mage (old) |'));
    writeFileSync(path.join(root, 'docs', 'other.md'), 'untouched');
    quietly(() => main([], root));
    assert.equal(readFileSync(path.join(root, 'docs', 'other.md'), 'utf8'), 'untouched');
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
      .sort();
    assert.deepEqual(files, [
      'docs/design/classes.md',
      'docs/design/enemies-and-stages.md',
      'docs/other.md',
    ]);
  });

  void it('returns 2 with a fixed message for a missing file or missing markers', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'pixel-agents-docs-'));
    temps.push(empty);
    const missing = quietly(() => main(['--check'], empty));
    assert.equal(missing.result, 2);
    assert.match(missing.stderr, /does not exist/);
    const onlyClasses = scratchRoot();
    rmSync(path.join(onlyClasses, ENEMIES_DOC));
    assert.equal(quietly(() => main(['--check'], onlyClasses)).result, 2, 'enemy doc missing');
    const noMarkers = scratchRoot(() => '# classes\n\nno markers here\n');
    const broken = quietly(() => main([], noMarkers));
    assert.equal(broken.result, 2);
    assert.match(broken.stderr, /exactly one BEGIN and one END marker/);
    assert.equal(
      readFileSync(path.join(noMarkers, CLASSES_DOC), 'utf8'),
      '# classes\n\nno markers here\n',
    );
  });
});

void describe('the generator source', () => {
  const file = 'scripts/generate-doc-tables.ts';
  const src = code(file);

  void it('imports only node:fs, node:path, and the pure class data (no vscode, DOM, art, or engine)', () => {
    assert.deepEqual([...new Set(importSpecifiers(src))].sort(), [
      '../src/game/data/classMap',
      '../src/game/data/classes',
      '../src/game/data/enemies',
      '../src/game/data/stages',
      'node:fs',
      'node:path',
    ]);
  });

  void it('has no network, process spawn, or eval, and one single write, to the file being regenerated', () => {
    assert.doesNotMatch(
      src,
      /\b(fetch|XMLHttpRequest|WebSocket|child_process|spawn|exec|eval|http|https|net)\b/,
    );
    assert.doesNotMatch(src, /\bnew\s+Function\b/);
    assert.equal(count(src, 'writeFileSync('), 1);
    assert.match(src, /writeFileSync\(file,/);
    assert.match(src, /const file = path\.join\(root, target\.doc\)/);
    // The only two targets are the class doc and the enemy doc.
    assert.deepEqual(
      [...src.matchAll(/\bdoc:\s*([A-Z_]+)\b/g)].map((m) => m[1]),
      ['CLASSES_DOC', 'ENEMIES_DOC'],
    );
  });

  void it('the class data files it imports are pure (no imports of art, engine, DOM, or node)', () => {
    for (const f of [
      'src/game/data/classes.ts',
      'src/game/data/classMap.ts',
      'src/game/data/effects.ts',
    ]) {
      for (const s of importSpecifiers(code(f))) {
        assert.ok(s.startsWith('./') || s === '../rng', `${f} imports ${s}`);
        assert.doesNotMatch(s, /sprites|Renderer|Game|entities|node:|vscode/);
      }
    }
  });
});

void describe('docs/design/enemies-and-stages.md', () => {
  const doc = readText(ENEMIES_DOC);

  void it('contains the enemy markers exactly once each, in order', () => {
    assert.equal(count(doc, ENEMY_BEGIN_MARKER), 1);
    assert.equal(count(doc, ENEMY_END_MARKER), 1);
    assert.ok(doc.indexOf(ENEMY_BEGIN_MARKER) < doc.indexOf(ENEMY_END_MARKER));
    assert.equal(ENEMY_BEGIN_MARKER, '<!-- BEGIN GENERATED: enemies -->');
    assert.equal(ENEMY_END_MARKER, '<!-- END GENERATED: enemies -->');
  });

  void it('the generated region equals what the generator produces now', () => {
    const begin = doc.indexOf(ENEMY_BEGIN_MARKER) + ENEMY_BEGIN_MARKER.length;
    const region = doc.slice(begin, doc.indexOf(ENEMY_END_MARKER));
    assert.equal(region, `\n${renderEnemyTable(ENEMIES, STAGES)}\n`);
    assert.equal(applyEnemyTable(doc, renderEnemyTable(ENEMIES, STAGES)), doc);
  });

  void it('starts with a purpose line and links to related docs', () => {
    assert.match(doc, /^# .+\n\nPurpose: /);
    assert.match(doc, /\nRelated: .*\]\(/);
  });
});

void describe('renderEnemyTable (E1 plan note 12)', () => {
  void it('is deterministic, says "Delivered enemies: 50 of 50.", and has one row per enemy', () => {
    const total: number = ENEMIES.length;
    const a = renderEnemyTable(ENEMIES, STAGES);
    assert.equal(a, renderEnemyTable(ENEMIES, STAGES));
    const lines = a.split('\n');
    assert.equal(lines[0], 'Delivered enemies: 50 of 50.');
    assert.equal(total, 50);
    assert.equal(lines.filter((l) => l.startsWith('| ')).length, total + 1, 'header + rows');
    assert.match(a, /\n\|---\|---\|---\|---\|---\|---\|---\|---\|\n/, 'compact delimiter row');
  });

  void it('the Health column equals healthOf(row, stage, cycle 0, party 1) for every row', () => {
    const rows = renderEnemyTable(ENEMIES, STAGES)
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| Stage'));
    assert.equal(rows.length, 50);
    for (const row of ENEMIES) {
      const line = rows.find((l) => l.includes(`\`${row.id}\``));
      assert.ok(line !== undefined, row.id);
      const cells = line.split('|').map((c) => c.trim());
      assert.equal(cells[1]?.startsWith(`${row.stage}.`), true, row.id);
      assert.equal(Number(cells[6]), healthOf(row, row.stage, 0, 1), `${row.id} health`);
      assert.equal(cells[4], row.tier);
      assert.equal(cells[8], row.drop);
    }
  });

  void it('changing an enemy row changes the table, and the count line follows the row count', () => {
    const changed: EnemyRow[] = ENEMIES.map((r) =>
      r.id === 'cellar-rat' ? { ...r, vigor: 2 } : r,
    );
    assert.notEqual(renderEnemyTable(changed, STAGES), renderEnemyTable(ENEMIES, STAGES));
    assert.match(renderEnemyTable(changed, STAGES), /\| Cellar Rat \| minion \| walk \| 20 \|/);
    assert.match(renderEnemyTable(ENEMIES.slice(0, 5), STAGES), /^Delivered enemies: 5 of 50\./);
  });

  void it('applyEnemyTable replaces only the region and throws a fixed message for bad markers', () => {
    const base = `head\n${ENEMY_BEGIN_MARKER}\nold\n${ENEMY_END_MARKER}\ntail\n`;
    assert.equal(
      applyEnemyTable(base, 'new'),
      `head\n${ENEMY_BEGIN_MARKER}\nnew\n${ENEMY_END_MARKER}\ntail\n`,
    );
    for (const bad of [
      'none',
      `${ENEMY_BEGIN_MARKER}\nonly`,
      `${ENEMY_END_MARKER}\n${ENEMY_BEGIN_MARKER}`,
      `${ENEMY_BEGIN_MARKER}\n${ENEMY_BEGIN_MARKER}\n${ENEMY_END_MARKER}`,
    ]) {
      assert.throws(
        () => applyEnemyTable(bad, 't'),
        (e: unknown) =>
          e instanceof Error &&
          e.message ===
            'enemies-and-stages.md needs exactly one BEGIN and one END marker, in order',
      );
    }
  });
});

void describe('main with the enemy doc (E1)', () => {
  void it('--check returns 1 for a stale count line, a changed health cell, or a missing row, and does not rewrite', () => {
    for (const edit of [
      (d: string): string =>
        d.replace(`Delivered enemies: ${ENEMIES.length} of 50.`, 'Delivered enemies: 9 of 50.'),
      (d: string): string =>
        d.replace('| Cellar Rat | minion | walk | 10 |', '| Cellar Rat | minion | walk | 11 |'),
      (d: string): string => d.replace(/\| 2\. Goblin Mine Shafts \| `rock-golem`.*\n/, ''),
    ]) {
      const root = scratchRoot(undefined, edit);
      const stale = readFileSync(path.join(root, ENEMIES_DOC), 'utf8');
      assert.notEqual(stale, readText(ENEMIES_DOC), 'the edit applied');
      const { result, stderr } = quietly(() => main(['--check'], root));
      assert.equal(result, 1);
      assert.equal(stderr, '');
      assert.equal(readFileSync(path.join(root, ENEMIES_DOC), 'utf8'), stale);
    }
  });

  void it('without --check it fixes a stale enemy table; a second run changes nothing; the class doc is untouched', () => {
    const root = scratchRoot(undefined, (d) =>
      d.replace(`Delivered enemies: ${ENEMIES.length} of 50.`, 'Delivered enemies: 3 of 50.'),
    );
    assert.equal(quietly(() => main([], root)).result, 0);
    assert.equal(readFileSync(path.join(root, ENEMIES_DOC), 'utf8'), readText(ENEMIES_DOC));
    assert.equal(readFileSync(path.join(root, CLASSES_DOC), 'utf8'), readText(CLASSES_DOC));
    assert.equal(quietly(() => main(['--check'], root)).result, 0);
    assert.equal(quietly(() => main([], root)).result, 0);
    assert.equal(readFileSync(path.join(root, ENEMIES_DOC), 'utf8'), readText(ENEMIES_DOC));
  });

  void it('returns 2 with a fixed message when the enemy doc has no markers', () => {
    const root = scratchRoot(undefined, () => '# enemies\n\nno markers\n');
    const result = quietly(() => main([], root));
    assert.equal(result.result, 2);
    assert.match(result.stderr, /exactly one BEGIN and one END marker/);
  });
});

void describe('npm run docs:tables', () => {
  void it('is wired in package.json to the runner', () => {
    const pkg = readJson('package.json') as { scripts: Record<string, string> };
    assert.equal(pkg.scripts['docs:tables'], 'node scripts/docs-tables.mjs');
  });

  void it('leaves no diff: running the real runner changes no committed doc and --check is silent', () => {
    const before = readText(CLASSES_DOC);
    const beforeEnemies = readText(ENEMIES_DOC);
    const write = spawnSync(process.execPath, [repoPath('scripts/docs-tables.mjs')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(write.status, 0, write.stderr);
    assert.equal(readText(CLASSES_DOC), before, 'running docs:tables changed classes.md');
    assert.equal(
      readText(ENEMIES_DOC),
      beforeEnemies,
      'running docs:tables changed enemies-and-stages.md',
    );
    const check = spawnSync(process.execPath, [repoPath('scripts/docs-tables.mjs'), '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, check.stderr);
    assert.equal(check.stdout, '');
    assert.equal(check.stderr, '');
  });

  void it('the runner bundles with esbuild into out/scripts and adds no dependency', () => {
    const runner = code('scripts/docs-tables.mjs');
    assert.match(runner, /from 'esbuild'/);
    assert.match(runner, /'out', 'scripts'/);
    assert.deepEqual([...new Set(importSpecifiers(runner))].sort(), [
      'esbuild',
      'node:module',
      'node:path',
    ]);
    const pkg = readJson('package.json') as { dependencies?: Record<string, string> };
    assert.deepEqual(pkg.dependencies ?? {}, {});
  });
});

void describe('the CI stale-docs step', () => {
  const ci = readText('.github/workflows/ci.yml');

  void it('exists, runs docs:tables then git diff --exit-code on docs, after Test', () => {
    assert.match(ci, /name: Check generated docs/);
    assert.match(ci, /npm run docs:tables\s*\n\s*git diff --exit-code -- docs/);
    assert.ok(ci.indexOf('name: Test') < ci.indexOf('name: Check generated docs'));
  });

  void it('keeps npm ci as the first run step', () => {
    const firstRun = ci.match(/run: (.+)/)?.[1];
    assert.equal(firstRun, 'npm ci');
  });
});
