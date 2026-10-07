// Bundle boundary checks on the esbuild output (ADR 0004, M1 plan section 7.5).
// Requires `npm run build` first; every gate run and CI builds before testing.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { before, describe, it } from 'node:test';
import vm from 'node:vm';
import { newestMtime, repoPath } from '../support/repo';

const HOST = 'dist/extension.js';
const WEBVIEW = 'dist/webview.js';

function requiresIn(code: string): string[] {
  return [...code.matchAll(/\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map(
    (match) => match[1] ?? '',
  );
}

void describe('build output', () => {
  let host = '';
  let webview = '';

  before(() => {
    for (const bundle of [HOST, WEBVIEW]) {
      assert.ok(
        existsSync(repoPath(bundle)),
        `${bundle} is missing: run \`npm run build\` before \`npm run test\``,
      );
    }
    const newestSource = newestMtime('src');
    for (const bundle of [HOST, WEBVIEW]) {
      assert.ok(
        statSync(repoPath(bundle)).mtimeMs >= newestSource,
        `${bundle} is older than src/: run \`npm run build\` before \`npm run test\``,
      );
    }
    host = readFileSync(repoPath(HOST), 'utf8');
    webview = readFileSync(repoPath(WEBVIEW), 'utf8');
  });

  void it('dist/webview.js does not require vscode', () => {
    assert.ok(!/require\(\s*["'`]vscode["'`]\s*\)/.test(webview));
  });

  void it('dist/webview.js does not require any node: built-in', () => {
    assert.ok(!/require\(\s*["'`]node:/.test(webview));
  });

  void it('dist/webview.js requires nothing at all (browser IIFE)', () => {
    assert.deepEqual(requiresIn(webview), []);
    assert.ok(!/\bmodule\.exports\b/.test(webview), 'an IIFE has no CommonJS exports');
  });

  void it('dist/extension.js is CommonJS and exports activate and deactivate', () => {
    type CjsWrapper = (
      module: { exports: Record<string, unknown> },
      exports: Record<string, unknown>,
      require: (id: string) => unknown,
    ) => void;
    const nodeRequire = createRequire(repoPath(HOST));
    const fakeModule: { exports: Record<string, unknown> } = { exports: {} };
    const fakeRequire = (id: string): unknown =>
      id === 'vscode' ? { window: {}, Uri: {} } : nodeRequire(id);
    // Evaluating the bundle only defines its exports; activate is not called.
    const wrapper = vm.runInThisContext(`(function (module, exports, require) {\n${host}\n})`, {
      filename: HOST,
    }) as CjsWrapper;
    wrapper(fakeModule, fakeModule.exports, fakeRequire);
    assert.equal(typeof fakeModule.exports.activate, 'function');
    assert.equal(typeof fakeModule.exports.deactivate, 'function');
  });

  void it('dist/extension.js requires only vscode and node: built-ins (nothing bundled as external)', () => {
    const external = requiresIn(host).filter((id) => id !== 'vscode' && !id.startsWith('node:'));
    assert.deepEqual(external, []);
  });
});
