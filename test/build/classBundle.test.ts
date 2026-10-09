// H1 bundle boundaries (H1 plan test note 12): the class engine ships in the webview bundle only,
// and the host bundle carries no class table text. Requires `npm run build`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { CLASSES } from '../../src/game/data/classes';
import { readJson, repoPath } from '../support/repo';

const webview = readFileSync(repoPath('dist/webview.js'), 'utf8');
const host = readFileSync(repoPath('dist/extension.js'), 'utf8');

function classDecl(name: string): RegExp {
  return new RegExp(`\\bclass ${name}\\b|\\b${name} = class\\b`);
}

void describe('class code in the bundles (H1)', () => {
  void it('dist/webview.js contains ClassHero and EffectPool', () => {
    assert.match(webview, classDecl('ClassHero'));
    assert.match(webview, classDecl('EffectPool'));
    assert.match(webview, /\bclassFor\b/);
    assert.match(webview, /\bcreateHero\b/);
  });

  void it('dist/webview.js carries the class table (names and ability ids)', () => {
    for (const c of CLASSES) {
      assert.ok(webview.includes(`"${c.name}"`) || webview.includes(`'${c.name}'`), c.name);
      assert.ok(webview.includes(c.ability.id), c.ability.id);
    }
  });

  void it('dist/extension.js has no class table text, class engine, or effect pool', () => {
    for (const c of CLASSES) {
      assert.ok(!host.includes(c.silhouette), `${c.id} silhouette`);
      assert.ok(!host.includes(c.colors), `${c.id} colors`);
      assert.ok(!host.includes(c.ability.id), `${c.id} ability id`);
      assert.ok(!host.includes(c.ability.name), `${c.id} ability name`);
    }
    for (const name of ['ClassHero', 'EffectPool', 'SpriteCache']) {
      assert.doesNotMatch(host, classDecl(name), name);
    }
    assert.doesNotMatch(
      host,
      /\b(classFor|createHero|DELIVERED_CLASSES|orbBolt|arcaneBurst|smokePuff)\b/,
    );
  });

  void it('dist/webview.js has no eval, no new Function, no data: URI image, and no external URL', () => {
    assert.doesNotMatch(webview, /\beval\s*\(/);
    assert.doesNotMatch(webview, /\bnew\s+Function\s*\(/);
    assert.doesNotMatch(webview, /data:image/);
    assert.doesNotMatch(
      webview,
      /https?:\/\/(?!www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}\/[^\s"']*\.(png|gif|jpe?g|webp|svg|wav|mp3|ogg)/i,
    );
  });

  void it('dist/webview.js contains SummonPool and the skeleton template; dist/extension.js has neither (H2)', () => {
    assert.match(webview, classDecl('SummonPool'));
    assert.match(webview, classDecl('Summon'));
    assert.ok(webview.includes('summons/skeleton'));
    assert.ok(webview.includes('Bone Call'));
    assert.doesNotMatch(host, classDecl('SummonPool'));
    assert.doesNotMatch(host, classDecl('Summon'));
    assert.ok(!host.includes('summons/skeleton'));
    assert.ok(!host.includes('Bone Call'));
    assert.doesNotMatch(host, /\b(SUMMON_IDS|SUMMON_CAPACITY|summonFrameIndex)\b/);
  });

  void it('package.json has no runtime dependencies', () => {
    const pkg = readJson('package.json') as { dependencies?: Record<string, string> };
    assert.deepEqual(pkg.dependencies ?? {}, {});
  });

  void it('the webview bundle size is recorded (assumption: production under 300 KB)', (t) => {
    t.diagnostic(
      `dev dist/webview.js is ${(Buffer.byteLength(webview) / 1024).toFixed(1)} KB (inline sourcemap included)`,
    );
  });
});
