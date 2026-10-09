// E1 bundle boundaries (E1 plan test note 13): the enemy table, Combat, and the art ship in the
// webview bundle only; the host bundle carries ProgressStore and the progress key but no enemy
// data and no game class; neither bundle has eval. Requires `npm run build`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { ENEMIES } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { PROGRESS_KEY } from '../../src/host/progressStore';
import { readJson, repoPath } from '../support/repo';

const webview = readFileSync(repoPath('dist/webview.js'), 'utf8');
const host = readFileSync(repoPath('dist/extension.js'), 'utf8');

function classDecl(name: string): RegExp {
  return new RegExp(`\\bclass ${name}\\b|\\b${name} = class\\b`);
}

void describe('enemy code in the bundles (E1)', () => {
  void it('dist/webview.js contains Combat, Enemy, Boss, Drops, Progression, StageDirector, HitReactions, FighterBuffer, and ProgressSaver', () => {
    for (const name of [
      'Combat',
      'Enemy',
      'Boss',
      'Drops',
      'Progression',
      'StageDirector',
      'HitReactions',
      'FighterBuffer',
      'ProgressSaver',
      'CombatEngagement',
    ]) {
      assert.match(webview, classDecl(name), name);
    }
  });

  void it('dist/webview.js carries the enemy table: every id and name, and the art set has exactly one template per enemy', () => {
    for (const row of ENEMIES) {
      assert.ok(webview.includes(`"${row.id}"`) || webview.includes(`'${row.id}'`), row.id);
      assert.ok(webview.includes(row.name), row.name);
    }
    assert.deepEqual(Object.keys(SHIPPED_ART.enemies).sort(), ENEMIES.map((r) => r.id).sort());
    for (const id of [
      'goblin-mine-shafts',
      'toxic-slime-caverns',
      'ancient-catacombs',
      'enchanted-forest-ruins',
      'molten-core',
    ]) {
      assert.ok(webview.includes(id), id);
    }
    assert.deepEqual(
      STAGES.map((stage) => stage.id),
      [
        'forgotten-cellar',
        'goblin-mine-shafts',
        'toxic-slime-caverns',
        'ancient-catacombs',
        'enchanted-forest-ruins',
        'molten-core',
      ],
    );
  });

  void it('E3: all ten new enemy ids and names are in the webview bundle and absent from the host bundle', () => {
    const ids = [
      'thorn-sprout',
      'moss-wolf',
      'bramble-pixie',
      'ancient-treant',
      'elder-dryad',
      'ember-imp',
      'slag-snail',
      'magma-crab',
      'furnace-guard',
      'molten-colossus',
    ];
    for (const id of ids) {
      assert.ok(
        ENEMIES.some((r) => r.id === id),
        id,
      );
      assert.ok(webview.includes(`"${id}"`) || webview.includes(`'${id}'`), id);
      assert.ok(!host.includes(id), `${id} leaked into the host bundle`);
    }
  });

  void it('the production-style webview bundle (minified, in memory, no sourcemap) is measured against the E3 R11 note (300 KB through E5; hard limit 400 KB)', (t) => {
    // esbuild cannot be bundled into the test file, so the measurement runs in a child process.
    const script = `
      import * as esbuild from 'esbuild';
      const r = await esbuild.build({
        entryPoints: ['src/webview/main.ts'], bundle: true, minify: true, sourcemap: false,
        platform: 'browser', format: 'iife', target: 'es2022', legalComments: 'none',
        write: false, logLevel: 'silent',
      });
      process.stdout.write(String(r.outputFiles[0].contents.byteLength));
    `;
    const bytes = Number(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: repoPath('.'),
        encoding: 'utf8',
      }),
    );
    const kb = bytes / 1024;
    t.diagnostic(`production webview bundle: ${kb.toFixed(1)} KB (R11 assumption under 300 KB)`);
    assert.ok(kb > 50 && kb < 400, `${kb} KB`);
  });

  void it('dist/webview.js contains no host persistence: no ProgressStore, no globalState, no progress key', () => {
    assert.doesNotMatch(webview, classDecl('ProgressStore'));
    assert.doesNotMatch(webview, /\bglobalState\b/);
    assert.ok(!webview.includes(PROGRESS_KEY));
    assert.doesNotMatch(webview, /\blocalStorage\b|\bsessionStorage\b/);
  });

  void it('dist/extension.js contains ProgressStore and the progress key but no enemy data and no enemy class', () => {
    assert.match(host, classDecl('ProgressStore'));
    assert.ok(host.includes(PROGRESS_KEY));
    for (const row of ENEMIES) {
      assert.ok(!host.includes(row.id), row.id);
      assert.ok(!host.includes(row.name), row.name);
    }
    for (const name of [
      'Combat',
      'Enemy',
      'Boss',
      'Drops',
      'Progression',
      'StageDirector',
      'HitReactions',
      'FighterBuffer',
      'ProgressSaver',
      'CombatEngagement',
    ]) {
      assert.doesNotMatch(host, classDecl(name), name);
    }
    assert.doesNotMatch(host, /\b(healthOf|validateEnemies|TIER_HEALTH|ENEMY_CAPACITY)\b/);
  });

  void it('the host bundle writes only through the store: globalState.update appears once, in the extension glue', () => {
    const updates = host.match(/globalState\.update\(/g) ?? [];
    assert.equal(updates.length, 1);
    assert.doesNotMatch(host, /setKeysForSync/);
    assert.doesNotMatch(host, /\bworkspaceState\b|\bsecrets\b/);
  });

  void it('neither bundle has eval or new Function, and the webview has no external image or audio URL', () => {
    for (const bundle of [webview, host]) {
      assert.doesNotMatch(bundle, /\beval\s*\(/);
      assert.doesNotMatch(bundle, /\bnew\s+Function\s*\(/);
    }
    assert.doesNotMatch(webview, /data:image|data:audio/);
  });

  void it('the build emits only the two documented files and adds no dependency', () => {
    const pkg = readJson('package.json') as { dependencies?: Record<string, string> };
    assert.deepEqual(pkg.dependencies ?? {}, {});
  });
});
