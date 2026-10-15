// M4 plan test note 14: the engine ships in the webview bundle only; the host bundle stays free of
// it, and the webview bundle stays free of the host and monitor. Requires `npm run build`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { repoPath } from '../support/repo';

const webview = readFileSync(repoPath('dist/webview.js'), 'utf8');
const host = readFileSync(repoPath('dist/extension.js'), 'utf8');

/** esbuild emits `class X` or `var X = class`. */
function classDecl(name: string): RegExp {
  return new RegExp(`\\bclass ${name}\\b|\\b${name} = class\\b`);
}

void describe('engine bundle boundaries (M4)', () => {
  void it('dist/webview.js contains the engine classes', () => {
    for (const name of ['Game', 'Roster', 'Renderer', 'GameHost', 'SceneFeed', 'Campfire']) {
      assert.match(webview, classDecl(name), name);
    }
  });

  void it('dist/webview.js contains no host or monitor code', () => {
    for (const name of ['WebviewBridge', 'AgentMonitor', 'AgentRegistry', 'TranscriptSource']) {
      assert.doesNotMatch(webview, new RegExp(`\\b${name}\\b`), name);
    }
  });

  void it('dist/extension.js contains none of the game classes', () => {
    for (const name of [
      'Game',
      'Roster',
      'Renderer',
      'GameHost',
      'SceneFeed',
      'Campfire',
      'Hero',
      'Particles',
      'Lighting',
    ]) {
      assert.doesNotMatch(host, classDecl(name), name);
    }
  });

  void it('dist/webview.js has no eval and no new Function', () => {
    assert.doesNotMatch(webview, /\beval\s*\(/);
    assert.doesNotMatch(webview, /\bnew\s+Function\s*\(/);
  });

  void it('the webview bundle size is recorded (assumption: production under 300 KB)', (t) => {
    t.diagnostic(
      `dev dist/webview.js is ${(Buffer.byteLength(webview) / 1024).toFixed(1)} KB (inline sourcemap included)`,
    );
  });
});
