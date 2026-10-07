// Sourcemap shape of both build modes (esbuild.mjs; the webview map is inline in development
// because the webview CSP is `default-src 'none'` and DevTools could not fetch a .map file).
//
// esbuild.mjs writes to `dist/` relative to the working directory and deletes it first, so each
// mode runs in its own temp directory whose `src` is a symlink to the repo's src/. The repo's
// dist/ is never touched and stays the development build F5 and the integration tests use.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { repoPath } from '../support/repo';

const INLINE_MAP = /\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/;

function buildInTemp(production: boolean): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pa-build-'));
  symlinkSync(repoPath('src'), path.join(dir, 'src'), 'dir');
  const args = [repoPath('esbuild.mjs'), ...(production ? ['--production'] : [])];
  execFileSync(process.execPath, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  return dir;
}

function read(dir: string, file: string): string {
  return readFileSync(path.join(dir, 'dist', file), 'utf8');
}

void describe('development build sourcemaps', () => {
  let dir = '';
  before(() => {
    dir = buildInTemp(false);
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  void it('inlines the webview sourcemap as a data: URI and writes no dist/webview.js.map', () => {
    assert.match(read(dir, 'webview.js'), INLINE_MAP);
    assert.equal(existsSync(path.join(dir, 'dist', 'webview.js.map')), false);
  });

  void it('the inline webview map is valid and maps back to src/webview/main.ts', () => {
    const base64 = INLINE_MAP.exec(read(dir, 'webview.js'))?.[1] ?? '';
    const map = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as {
      version: number;
      sources: string[];
    };
    assert.equal(map.version, 3);
    assert.ok(
      map.sources.some((source) => source.replace(/\\/g, '/').endsWith('src/webview/main.ts')),
      `sources: ${map.sources.join(', ')}`,
    );
  });

  void it('writes an external host map, dist/extension.js.map, referenced by the host bundle', () => {
    assert.ok(existsSync(path.join(dir, 'dist', 'extension.js.map')));
    assert.match(read(dir, 'extension.js'), /\n\/\/# sourceMappingURL=extension\.js\.map\s*$/);
    const map = JSON.parse(read(dir, 'extension.js.map')) as { sources: string[] };
    assert.ok(
      map.sources.some((source) => source.replace(/\\/g, '/').endsWith('src/extension.ts')),
    );
  });

  void it('produces exactly extension.js, extension.js.map, and webview.js', () => {
    assert.deepEqual(readdirSync(path.join(dir, 'dist')).sort(), [
      'extension.js',
      'extension.js.map',
      'webview.js',
    ]);
  });
});

void describe('production build sourcemaps', () => {
  let dir = '';
  before(() => {
    dir = buildInTemp(true);
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  void it('writes no .map file', () => {
    const maps = readdirSync(path.join(dir, 'dist')).filter((file) => file.endsWith('.map'));
    assert.deepEqual(maps, []);
  });

  void it('produces exactly extension.js and webview.js', () => {
    assert.deepEqual(readdirSync(path.join(dir, 'dist')).sort(), ['extension.js', 'webview.js']);
  });

  for (const bundle of ['extension.js', 'webview.js']) {
    void it(`dist/${bundle} has no sourceMappingURL`, () => {
      assert.ok(!read(dir, bundle).includes('sourceMappingURL'));
    });
  }
});
