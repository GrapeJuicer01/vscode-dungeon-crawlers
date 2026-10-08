// Structural guards for Core invariants 3 (read-only, reveal-only), 4 (crash isolation), and
// 7 (transcript privacy). M1 banned every message API; M2 (plan test note 9) replaces that with
// "each messaging API lives in exactly one planned place". M3 (test/repo/monitorReadOnly.test.ts)
// extends the scan to src/monitor/** and pins the terminal and reveal wiring.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readText } from '../support/repo';
import { code, filesMatching, srcFiles } from '../support/source';

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
  // M2 additions (invariant 3): no terminal creation or control, no command execution, no
  // process signalling or exit.
  ['createTerminal', /\bcreateTerminal\b/],
  ['executeCommand', /\bexecuteCommand\b/],
  ['process.exit / abort', /\bprocess\.(exit|abort)\b/],
  ['terminal dispose', /\bterminal\w*\??\.dispose\s*\(/i],
];

const files = srcFiles();

void describe('src/** is observe-only (invariants 3 and 7)', () => {
  void it('scans every M1 and M2 source file', () => {
    for (const file of [
      'src/extension.ts',
      'src/host/webviewBridge.ts',
      'src/shared/assertNever.ts',
      'src/shared/protocol.ts',
      'src/webview/index.html.ts',
      'src/webview/main.ts',
      'src/webview/hostChannel.ts',
      'src/webview/hostMessages.ts',
      'src/webview/hostState.ts',
    ]) {
      assert.ok(files.includes(file), `${file} expected in the scan`);
    }
  });

  for (const [label, pattern] of FORBIDDEN_IN_SRC) {
    void it(`uses no ${label}`, () => {
      const offenders = files.filter((file) => pattern.test(readText(file)));
      assert.deepEqual(offenders, []);
    });
  }

  void it('the vscode terminal API is used only in the M3 terminal adapter', () => {
    // The vscode API forms: window.terminals / activeTerminal, the two events, and exitStatus.
    const vscodeForms =
      /\bwindow\.(terminals|activeTerminal|onDidOpenTerminal|onDidCloseTerminal|onDidChangeActiveTerminal)\b|\bexitStatus\b|\bvscode\.Terminal\b/;
    assert.deepEqual(filesMatching(files, vscodeForms), [
      'src/monitor/adapters/vscodeTerminals.ts',
    ]);
  });

  void it('wires focusAgent only to monitor.revealAgentTerminal, with the null fallback (M3)', () => {
    assert.match(
      code('src/extension.ts'),
      /revealAgentTerminal:\s*monitor === null \? null : \(agentId\) => monitor\.revealAgentTerminal\(agentId\),/,
    );
  });
});

void describe('M2: each messaging API lives in exactly one planned place', () => {
  void it('acquireVsCodeApi is used only in src/webview/main.ts', () => {
    assert.deepEqual(filesMatching(files, /\bacquireVsCodeApi\b/), ['src/webview/main.ts']);
  });

  void it('acquireVsCodeApi is called exactly once in main.ts', () => {
    // Excludes the `declare function acquireVsCodeApi()` signature; counts call sites only.
    assert.equal(
      (code('src/webview/main.ts').match(/(?<!function\s)\bacquireVsCodeApi\s*\(\s*\)/g) ?? [])
        .length,
      1,
    );
  });

  void it('postMessage appears only in webview hostChannel.ts, host webviewBridge.ts, and the extension.ts port adapter', () => {
    assert.deepEqual(filesMatching(files, /\bpostMessage\b/).sort(), [
      'src/extension.ts',
      'src/host/webviewBridge.ts',
      'src/webview/hostChannel.ts',
    ]);
  });

  void it('in src/webview/** and src/game/**, only hostChannel.ts posts to the host', () => {
    const webviewFiles = files.filter(
      (file) => file.startsWith('src/webview/') || file.startsWith('src/game/'),
    );
    assert.deepEqual(filesMatching(webviewFiles, /\bpostMessage\b/), [
      'src/webview/hostChannel.ts',
    ]);
  });

  void it('extension.ts uses postMessage only as the one-line port adapter passed to bridge.attach', () => {
    const lines = code('src/extension.ts')
      .split('\n')
      .filter((line) => line.includes('postMessage'));
    assert.equal(lines.length, 1, `postMessage lines: ${JSON.stringify(lines)}`);
    assert.match(
      lines[0] ?? '',
      /^\s*bridge\.attach\(\{\s*postMessage:\s*\((\w+)\)\s*=>\s*webviewView\.webview\.postMessage\(\1\)\s*\}\);\s*$/,
    );
  });

  void it('onDidReceiveMessage is subscribed only in src/extension.ts, exactly once, into the bridge', () => {
    assert.deepEqual(filesMatching(files, /\bonDidReceiveMessage\b/), ['src/extension.ts']);
    const uses = code('src/extension.ts').match(/\bonDidReceiveMessage\b.*$/gm) ?? [];
    assert.equal(uses.length, 1);
    assert.match(
      uses[0] ?? '',
      /onDidReceiveMessage\(\((\w+): unknown\) => bridge\.handleMessage\(\1\)\)/,
    );
  });

  void it('requestAnimationFrame is still absent everywhere in src/ (no loop until M4)', () => {
    assert.deepEqual(filesMatching(files, /\brequestAnimationFrame\b/), []);
  });

  void it('the webview never persists state (no getState / setState): it is not a source of truth', () => {
    assert.deepEqual(filesMatching(files, /\b(getState|setState)\s*\(/), []);
  });
});

void describe('webview crash isolation (invariant 4)', () => {
  void it('src/webview/main.ts wraps boot, the resize handler, and the message handler in try/catch', () => {
    const main = code('src/webview/main.ts');
    // One try/catch around boot(), one inside the resize handler, one inside the message handler.
    assert.ok((main.match(/\btry\s*\{/g) ?? []).length >= 3, 'expected three try blocks');
    assert.ok(/try\s*\{\s*boot\(\);?\s*\}\s*catch/.test(main), 'boot() must be inside try');
    assert.ok(
      /try\s*\{\s*handleHostMessage\(event\.data, \w+\);?\s*\}\s*catch/.test(main),
      'handleHostMessage must be inside try',
    );
    assert.ok(!/\bthrow\b/.test(main), 'the webview entry must not rethrow');
  });
});
