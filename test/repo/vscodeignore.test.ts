// .vscodeignore keeps source, tests, docs, tooling, and sourcemaps out of the .vsix (M1 plan
// sections 5.9 and 7.3). test/build/package.test.ts checks the real `vsce ls` output; this suite
// checks the patterns themselves so a failure points at the right line.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readText } from '../support/repo';

const patterns = readText('.vscodeignore')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

/**
 * Minimal gitignore-style glob to RegExp: `**\/` matches any directory prefix, `**` anything,
 * `*` anything within one segment, `?` one character. Enough for the patterns in this file;
 * the vsce ls test is the authority on what really ships.
 */
function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob.charAt(i);
    if (glob.startsWith('**/', i)) {
      source += '(?:.*/)?';
      i += 2;
    } else if (glob.startsWith('**', i)) {
      source += '.*';
      i += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function isExcluded(file: string): boolean {
  let excluded = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    const glob = negated ? pattern.slice(1) : pattern;
    if (globToRegExp(glob).test(file)) {
      excluded = !negated;
    }
  }
  return excluded;
}

void describe('.vscodeignore', () => {
  for (const required of ['src/**', 'test/**', 'docs/**', 'tools/**', '**/*.map']) {
    void it(`contains the pattern ${required}`, () => {
      assert.ok(patterns.includes(required), `${required} must be listed`);
    });
  }

  for (const file of [
    'src/extension.ts',
    'src/webview/main.ts',
    'test/run.mjs',
    'test/webview/indexHtml.test.ts',
    'docs/index.md',
    'tools/preview.html',
    'scripts/generate-doc-tables.ts',
    'out/test/repo/manifest.test.js',
    'out/integration/index.js',
    'test/integration/run.mjs',
    '.vscode-test/vscode-darwin-arm64-1.140.0/Visual Studio Code.app/Contents/Info.plist',
    '.vscode-test/user-data/User/settings.json',
    'dist/extension.js.map',
    'dist/webview.js.map',
    '.github/workflows/ci.yml',
    '.vscode/launch.json',
    '.claude/agents/tester.md',
    'node_modules/esbuild/package.json',
    'CLAUDE.md',
    'SPEC.md',
    'tsconfig.json',
    'tsconfig.webview.json',
    'esbuild.mjs',
    'eslint.config.mjs',
  ]) {
    void it(`excludes ${file}`, () => {
      assert.ok(isExcluded(file), `${file} would be packaged`);
    });
  }

  for (const file of [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'dist/extension.js',
    'dist/webview.js',
  ]) {
    void it(`keeps ${file} in the package`, () => {
      assert.ok(!isExcluded(file), `${file} must ship`);
    });
  }
});
