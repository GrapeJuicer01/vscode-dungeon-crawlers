// Generated docs (H1 plan test note 11, gate G2): docs/design/classes.md holds the class table
// between markers, the table equals what the generator produces now, --check detects a stale
// file, and the generator is pure data in, one docs file out.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { CLASSES } from '../../src/game/data/classes';
import type { ClassDef } from '../../src/game/data/classes';
import {
  BEGIN_MARKER,
  CLASSES_DOC,
  END_MARKER,
  applyClassTable,
  main,
  renderClassTable,
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

/** A scratch repo root holding only docs/design/classes.md (a copy of the real one). */
function scratchRoot(transform: (doc: string) => string = (d) => d): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pixel-agents-docs-'));
  temps.push(root);
  mkdirSync(path.join(root, 'docs', 'design'), { recursive: true });
  writeFileSync(path.join(root, CLASSES_DOC), transform(readText(CLASSES_DOC)));
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
    assert.equal(lines[0], 'Delivered classes: 4 of 12.');
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
        d.replace('Delivered classes: 4 of 12.', 'Delivered classes: 3 of 12.'),
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

  void it('writes only docs/design/classes.md', () => {
    const root = scratchRoot((d) => d.replace('| Mage |', '| Mage (old) |'));
    writeFileSync(path.join(root, 'docs', 'other.md'), 'untouched');
    quietly(() => main([], root));
    assert.equal(readFileSync(path.join(root, 'docs', 'other.md'), 'utf8'), 'untouched');
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
      .sort();
    assert.deepEqual(files, ['docs/design/classes.md', 'docs/other.md']);
  });

  void it('returns 2 with a fixed message for a missing file or missing markers', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'pixel-agents-docs-'));
    temps.push(empty);
    const missing = quietly(() => main(['--check'], empty));
    assert.equal(missing.result, 2);
    assert.match(missing.stderr, /does not exist/);
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
      'node:fs',
      'node:path',
    ]);
  });

  void it('has no network, process spawn, or eval, and one single write to the classes file', () => {
    assert.doesNotMatch(
      src,
      /\b(fetch|XMLHttpRequest|WebSocket|child_process|spawn|exec|eval|http|https|net)\b/,
    );
    assert.doesNotMatch(src, /\bnew\s+Function\b/);
    assert.equal(count(src, 'writeFileSync('), 1);
    assert.match(src, /writeFileSync\(file,/);
    assert.match(src, /const file = path\.join\(root, CLASSES_DOC\)/);
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

void describe('npm run docs:tables', () => {
  void it('is wired in package.json to the runner', () => {
    const pkg = readJson('package.json') as { scripts: Record<string, string> };
    assert.equal(pkg.scripts['docs:tables'], 'node scripts/docs-tables.mjs');
  });

  void it('leaves no diff: running the real runner changes no committed doc and --check is silent', () => {
    const before = readText(CLASSES_DOC);
    const write = spawnSync(process.execPath, [repoPath('scripts/docs-tables.mjs')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(write.status, 0, write.stderr);
    assert.equal(readText(CLASSES_DOC), before, 'running docs:tables changed classes.md');
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
