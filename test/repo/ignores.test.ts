// .vscode-test/ (the VS Code builds and profiles @vscode/test-electron downloads) is ignored by
// every tool that walks the repo: git, vsce, Prettier, ESLint, markdownlint (ADR 0006
// amendment). Prettier and ESLint are asked directly; git and markdownlint configs are read.
// .vscodeignore patterns are checked in vscodeignore.test.ts and the real package in package.test.ts.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { readText, repoPath } from '../support/repo';

const SAMPLE = '.vscode-test/vscode-darwin-arm64-1.140.0/sample.md';
const SAMPLE_JS = '.vscode-test/vscode-darwin-arm64-1.140.0/sample.js';

function lines(relative: string): string[] {
  return readText(relative)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function node(args: string[]): string {
  return execFileSync(process.execPath, args, {
    cwd: repoPath('.'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Parses the JSONC markdownlint config: drops full-line `//` comments and trailing commas. */
function markdownlintConfig(): { ignores?: unknown } {
  const text = readText('.markdownlint-cli2.jsonc')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(text) as { ignores?: unknown };
}

void describe('.vscode-test/ is ignored everywhere', () => {
  void it('by git (.gitignore)', () => {
    assert.ok(lines('.gitignore').includes('.vscode-test/'));
  });

  void it('by vsce (.vscodeignore)', () => {
    assert.ok(lines('.vscodeignore').includes('.vscode-test/**'));
  });

  void it('by Prettier (.prettierignore and prettier --file-info)', () => {
    assert.ok(lines('.prettierignore').includes('.vscode-test/'));
    const info = JSON.parse(
      node([repoPath('node_modules/prettier/bin/prettier.cjs'), '--file-info', SAMPLE]),
    ) as { ignored?: unknown };
    assert.equal(info.ignored, true);
  });

  void it('by ESLint (ESLint#isPathIgnored with the repo config)', () => {
    const script = [
      "import('eslint').then(async ({ ESLint }) => {",
      '  const eslint = new ESLint();',
      `  const ignored = await eslint.isPathIgnored(${JSON.stringify(SAMPLE_JS)});`,
      "  const control = await eslint.isPathIgnored('src/extension.ts');",
      '  process.stdout.write(JSON.stringify({ ignored, control }));',
      '});',
    ].join('\n');
    const result = JSON.parse(node(['--input-type=module', '-e', script])) as {
      ignored: boolean;
      control: boolean;
    };
    assert.deepEqual(result, { ignored: true, control: false });
  });

  void it('by markdownlint (.markdownlint-cli2.jsonc ignores)', () => {
    const { ignores } = markdownlintConfig();
    assert.ok(Array.isArray(ignores), 'ignores must be an array');
    assert.ok((ignores as unknown[]).includes('.vscode-test/**'));
  });
});
