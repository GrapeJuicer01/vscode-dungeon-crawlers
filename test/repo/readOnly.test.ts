// Early structural guards for Core invariants 3 (read-only monitor), 4 (crash isolation), and
// 7 (transcript privacy), sized for M1. M3 replaces the source scan with the full monitor
// suite; M2 replaces the "no message channel" checks when the protocol lands.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listFiles, readText } from '../support/repo';

/** Process control, terminal input, and file-write APIs that no src/ file may use. */
const FORBIDDEN_IN_SRC: readonly [string, RegExp][] = [
  ['child_process', /child_process/],
  ['process.kill', /process\.kill\b/],
  ['.kill(', /\.kill\s*\(/],
  ['sendText', /\bsendText\b/],
  ['sendSequence', /workbench\.action\.terminal\.sendSequence/],
  ['writeFile', /\bwriteFile(Sync)?\b/],
  ['appendFile', /\bappendFile(Sync)?\b/],
  ['createWriteStream', /\bcreateWriteStream\b/],
  ['unlink', /\bunlink(Sync)?\b/],
  ['rmSync / fs.rm', /\b(rmSync|rmdirSync|fs\.rm|fs\.rmdir)\b/],
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['eval', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\s*\(/],
];

const srcFiles = listFiles('src').filter((file) => file.endsWith('.ts'));

void describe('src/** is observe-only (invariants 3 and 7)', () => {
  void it('scans at least the M1 source files', () => {
    for (const file of ['src/extension.ts', 'src/webview/index.html.ts', 'src/webview/main.ts']) {
      assert.ok(srcFiles.includes(file), `${file} expected in the scan`);
    }
  });

  for (const [label, pattern] of FORBIDDEN_IN_SRC) {
    void it(`uses no ${label}`, () => {
      const offenders = srcFiles.filter((file) => pattern.test(readText(file)));
      assert.deepEqual(offenders, []);
    });
  }
});

void describe('M1: the webview has no message channel and no animation loop', () => {
  const main = readText('src/webview/main.ts');

  for (const api of ['acquireVsCodeApi', 'postMessage', 'requestAnimationFrame']) {
    void it(`src/webview/main.ts does not use ${api}`, () => {
      assert.ok(!main.includes(api));
    });
  }

  void it('src/extension.ts registers no message handler and posts nothing', () => {
    const host = readText('src/extension.ts');
    assert.ok(!host.includes('onDidReceiveMessage'));
    assert.ok(!host.includes('postMessage'));
  });
});

void describe('webview crash isolation (invariant 4)', () => {
  void it('src/webview/main.ts wraps boot and the resize handler in try/catch', () => {
    const main = readText('src/webview/main.ts');
    // One try/catch around boot(), one inside the resize handler.
    assert.ok((main.match(/\btry\s*\{/g) ?? []).length >= 2, 'expected two try blocks');
    assert.ok(/try\s*\{\s*boot\(\);?\s*\}\s*catch/.test(main), 'boot() must be inside try');
    assert.ok(!/\bthrow\b/.test(main), 'the webview entry must not rethrow');
  });
});
