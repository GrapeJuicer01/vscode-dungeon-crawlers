// What would ship in the .vsix, from vsce itself (M1 roadmap "done when": the package holds
// only the manifest, README, CHANGELOG, LICENSE, and the two bundles). `vsce ls` lists files
// after .vscodeignore and does not run vscode:prepublish, so it works on a development build.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { repoPath } from '../support/repo';

const EXPECTED = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/extension.js',
  'dist/webview.js',
  'package.json',
];

void describe('package contents (vsce ls)', () => {
  void it('lists exactly the manifest, README, CHANGELOG, LICENSE, and the two bundles', () => {
    const output = execFileSync(
      process.execPath,
      [repoPath('node_modules/@vscode/vsce/vsce'), 'ls', '--no-dependencies'],
      { cwd: repoPath('.'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const files = output
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter((line) => line.length > 0)
      .sort();
    assert.deepEqual(files, EXPECTED);
  });
});
