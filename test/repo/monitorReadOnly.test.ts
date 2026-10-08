// Structural guards for the M3 monitor (M3 plan test note 10): Core invariants 3 (read-only,
// reveal-only), 4 (crash isolation), and 7 (transcript privacy), enforced as text rules over
// src/monitor/**, src/extension.ts, and the bundles. Comments are stripped before matching.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readText, repoPath } from '../support/repo';
import { blockAt, code, filesMatching, importSpecifiers, srcFiles } from '../support/source';

const all = srcFiles();
const monitorFiles = all.filter((file) => file.startsWith('src/monitor/'));
const coreFiles = monitorFiles.filter((file) => !file.startsWith('src/monitor/adapters/'));
const adapterFiles = monitorFiles.filter((file) => file.startsWith('src/monitor/adapters/'));
const monitorAndExtension = [...monitorFiles, 'src/extension.ts'];

const TERMINAL_ADAPTER = 'src/monitor/adapters/vscodeTerminals.ts';
const FS_ADAPTER = 'src/monitor/adapters/nodeFileSystem.ts';

void describe('the monitor file set', () => {
  void it('is scanned in full: every file on disk under src/monitor is in the scan', () => {
    const onDisk = readdirSync(repoPath('src/monitor'), { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `src/monitor/${name}`)
      .sort();
    assert.deepEqual([...monitorFiles].sort(), onDisk);
    for (const expected of [
      'src/monitor/AgentMonitor.ts',
      'src/monitor/AgentRegistry.ts',
      'src/monitor/TranscriptSource.ts',
      'src/monitor/TerminalSource.ts',
      'src/monitor/SimulatorSource.ts',
      'src/monitor/sessionMachine.ts',
      'src/monitor/transcriptRecord.ts',
      'src/monitor/adapters/nodeFileSystem.ts',
      'src/monitor/adapters/nodeRuntime.ts',
      TERMINAL_ADAPTER,
    ]) {
      assert.ok(monitorFiles.includes(expected), `${expected} expected`);
    }
    assert.equal(adapterFiles.length, 3);
  });
});

void describe('monitor: nothing is written, created, watched, locked, or signalled', () => {
  const FORBIDDEN: readonly [string, RegExp][] = [
    ['fs.watch / watchFile', /\b(fs\.watch|watchFile|unwatchFile)\b|\bwatch\s*\(/],
    ['mkdir', /\bmkdir(Sync)?\b|\bmkdtemp(Sync)?\b/],
    ['rename', /\brename(Sync)?\b/],
    ['copyFile / cp', /\bcopyFile(Sync)?\b|\bcp(Sync)?\s*\(/],
    ['symlink( / link(', /\b(symlink|link)(Sync)?\s*\(/],
    ['chmod / chown', /\b(chmod|chown|lchmod|lchown)(Sync)?\b/],
    ['utimes / futimes', /\b(utimes|futimes|lutimes)(Sync)?\b/],
    ['truncate', /\b(truncate|ftruncate)(Sync)?\b/],
    ['fsync / fdatasync', /\b(fsync|fdatasync)(Sync)?\b/],
    [
      'write / append / unlink / rm / rmdir',
      /\b(writeFile|appendFile|write|writev|unlink|rmdir|rm)(Sync)?\s*\(/,
    ],
    [
      'O_CREAT / O_WRONLY / O_RDWR / O_APPEND / O_TRUNC / O_EXCL',
      /\bO_(CREAT|WRONLY|RDWR|APPEND|TRUNC|EXCL|SYNC|DSYNC)\b/,
    ],
    ['flock / lock', /\b(flock|lockfile|lock)\s*\(/],
    ['createWriteStream', /\bcreateWriteStream\b/],
    ['sendText / sendSequence', /\bsendText\b|\bsendSequence\b/],
    ['child_process', /child_process/],
    ['process.kill / .kill(', /\bprocess\.kill\b|\.kill\s*\(/],
    ['executeCommand', /\bexecuteCommand\b/],
    ['createTerminal', /\bcreateTerminal\b/],
    ['process.env / argv', /\bprocess\.(env|argv)\b/],
    ['terminal.dispose( / hide(', /\bterminal\w*\??\.(dispose|hide)\s*\(/i],
    [
      'network',
      /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|node:(http|https|net|dgram|dns|tls)\b/,
    ],
  ];

  for (const [label, pattern] of FORBIDDEN) {
    void it(`src/monitor/** and src/extension.ts use no ${label}`, () => {
      assert.deepEqual(filesMatching(monitorAndExtension, pattern), []);
    });
  }

  void it('no open() flag is a string literal (w, a, r+, wx, ...)', () => {
    assert.deepEqual(
      filesMatching(monitorFiles, /\bopen(Sync)?\s*\([^)]*,\s*['"`][a-z+]+['"`]/),
      [],
    );
  });

  void it('the Node file system adapter imports exactly open, lstat, readdir, realpath, constants, and homedir', () => {
    const source = code(FS_ADAPTER);
    assert.deepEqual(
      [...importSpecifiers(source)].sort(),
      ['../ports', 'node:fs', 'node:fs/promises', 'node:os'].sort(),
    );
    const named = (specifier: string): string[] => {
      const match = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${specifier}['"]`).exec(
        source,
      );
      return (match?.[1] ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .sort();
    };
    assert.deepEqual(named('node:fs/promises'), ['lstat', 'open', 'readdir', 'realpath']);
    assert.deepEqual(named('node:fs'), ['constants']);
    assert.deepEqual(named('node:os'), ['homedir']);
  });

  void it('the only open( call in the adapter passes READ_FLAGS, and READ_FLAGS is read-only', () => {
    const source = code(FS_ADAPTER);
    const calls = [...source.matchAll(/\bopen\s*\(([^)]*)\)/g)].map((match) =>
      (match[1] ?? '').trim(),
    );
    assert.deepEqual(calls, ['file, READ_FLAGS']);
    assert.match(
      source,
      /const READ_FLAGS: number = constants\.O_RDONLY \| \(constants\.O_NOFOLLOW \?\? 0\);/,
    );
  });

  void it('the adapter closes its handle in finally and uses zeroed buffers', () => {
    const source = code(FS_ADAPTER);
    assert.match(source, /finally\s*\{\s*await handle\.close\(\);?\s*\}/);
    assert.doesNotMatch(source, /allocUnsafe/);
  });

  void it('the ReadOnlyFileSystem port has exactly the five read members', () => {
    const ports = code('src/monitor/ports.ts');
    const start = ports.indexOf('export interface ReadOnlyFileSystem');
    const body = blockAt(ports, ports.indexOf('{', start));
    const members = [...body.matchAll(/^ {2}(\w+)\s*\(/gm)].map((match) => match[1]);
    assert.deepEqual(members, ['homedir', 'realpath', 'lstat', 'readdir', 'readRange']);
  });
});

void describe('monitor: terminals are reveal-only', () => {
  void it('the vscode terminal API (window.terminals, activeTerminal, events, exitStatus) is used only in the adapter', () => {
    const pattern =
      /\bwindow\.(terminals|activeTerminal|onDidOpenTerminal|onDidCloseTerminal|onDidChangeActiveTerminal)\b|\bexitStatus\b/;
    assert.deepEqual(filesMatching(all, pattern), [TERMINAL_ADAPTER]);
  });

  void it('Terminal.show() (a no-argument .show()) is called only in the adapter', () => {
    assert.deepEqual(filesMatching(all, /\.show\s*\(\s*\)/), [TERMINAL_ADAPTER]);
  });

  void it('the only method called on a terminal instance in the adapter is show()', () => {
    const source = code(TERMINAL_ADAPTER);
    const calls = [
      ...source.matchAll(/\b(target|instance|opened|closed|active)\s*\.\s*(\w+)\s*\(/g),
    ];
    assert.deepEqual(
      calls.map((match) => `${match[1]}.${match[2]}`),
      ['target.show'],
    );
  });

  void it('the adapter imports vscode types only (no runtime import) and no node module', () => {
    const source = code(TERMINAL_ADAPTER);
    assert.match(source, /import type \* as vscode from 'vscode';/);
    assert.deepEqual(importSpecifiers(source).sort(), ['../ports', 'vscode']);
  });

  void it('TerminalSource only ever calls show on the port, and never disposes the port', () => {
    const source = code('src/monitor/TerminalSource.ts');
    const portCalls = [...source.matchAll(/\bport\.(\w+)\s*\(/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(portCalls)].sort(), [
      'activeTerminal',
      'onDidCloseTerminal',
      'onDidOpenTerminal',
      'show',
    ]);
    assert.doesNotMatch(source, /\bport\.dispose\b|#port\.dispose|this\.#port\s*\.\s*dispose/);
  });

  void it('AgentMonitor does not dispose the terminal port (extension.ts owns it)', () => {
    const source = code('src/monitor/AgentMonitor.ts');
    assert.doesNotMatch(source, /terminals\.dispose|#terminals|deps\.terminals\.dispose/);
  });

  void it('focusAgent is wired exactly to monitor.revealAgentTerminal, with the null fallback', () => {
    const extension = code('src/extension.ts');
    const lines = extension.split('\n').filter((line) => line.includes('revealAgentTerminal'));
    assert.equal(lines.length, 2, JSON.stringify(lines));
    assert.match(lines[0] ?? '', /^\s*revealAgentTerminal:\s*$/);
    assert.match(
      lines[1] ?? '',
      /monitor === null \? null : \(agentId\) => monitor\.revealAgentTerminal\(agentId\),/,
    );
  });

  void it('the reveal path calls nothing but show() in the chain bridge, monitor, TerminalSource, port', () => {
    const chain = [
      code('src/monitor/AgentMonitor.ts').match(
        /revealAgentTerminal\(agentId: string\): void \{[\s\S]*?\n {2}\}/,
      )?.[0] ?? '',
      code('src/monitor/TerminalSource.ts').match(
        /reveal\(agentId: string\): void \{[\s\S]*?\n {2}\}\n/,
      )?.[0] ?? '',
    ].join('\n');
    assert.ok(chain.length > 100, 'reveal bodies found');
    const calls = [...chain.matchAll(/\.(\w+)\s*\(/g)].map((match) => match[1]);
    assert.deepEqual(
      [...new Set(calls)].sort(),
      ['error', 'get', 'reveal', 'show', 'trace'].sort(),
    );
  });
});

void describe('monitor: error hygiene (invariant 7)', () => {
  const HYGIENE: readonly [string, RegExp][] = [
    ['.message access', /\.\s*message\b/],
    ['.stack access', /\.\s*stack\b/],
    ['String( of a caught value', /\bString\s*\(\s*(e|err|error|cause|reason)\b/],
    ['JSON.stringify', /\bJSON\.stringify\b/],
    ['template interpolation of a caught value', /\$\{\s*(e|err|error|cause)\s*[}.]/],
    ['console.', /\bconsole\./],
    [
      'string concatenation of a caught value',
      /\+\s*(e|err|error|cause)\b(?!\w)|\b(e|err|error|cause)\s*\+\s*['"`]/,
    ],
  ];
  for (const [label, pattern] of HYGIENE) {
    void it(`src/monitor/** has no ${label}`, () => {
      assert.deepEqual(filesMatching(monitorFiles, pattern), []);
    });
  }

  void it('every catch binding is `unknown` and is described only through safeErrorCode (or ignored)', () => {
    for (const file of monitorFiles) {
      const source = code(file);
      for (const match of source.matchAll(/catch\s*\(\s*(\w+)\s*:\s*unknown\s*\)\s*\{/g)) {
        const name = match[1] ?? '';
        const body = blockAt(source, (match.index ?? 0) + match[0].length - 1);
        const uses = [...body.matchAll(new RegExp(`(?<![.\\w])${name}\\b`, 'g'))].length;
        const allowed = [...body.matchAll(new RegExp(`safeErrorCode\\(\\s*${name}\\s*\\)`, 'g'))]
          .length;
        // SessionDiscovery hands the error to #reportUnreadable, which only calls safeErrorCode.
        const delegated = [
          ...body.matchAll(new RegExp(`#reportUnreadable\\([^)]*,\\s*${name}\\)`, 'g')),
        ].length;
        assert.equal(
          uses,
          allowed + delegated,
          `${file}: catch (${name}) used outside safeErrorCode`,
        );
      }
    }
  });

  void it('the one error-delegating helper (SessionDiscovery.#reportUnreadable) only calls safeErrorCode', () => {
    const source = code('src/monitor/transcriptDiscovery.ts');
    const start = source.indexOf('#reportUnreadable(reason: string, error: unknown)');
    assert.ok(start > 0);
    const body = blockAt(source, source.indexOf('{', start));
    const uses = [...body.matchAll(/(?<![.\w])error\b/g)].length;
    assert.equal(uses, 1, 'the parameter is used exactly once');
    assert.match(body, /safeErrorCode\(error\)/);
  });

  void it('src/extension.ts also describes errors only through safeErrorCode', () => {
    const source = code('src/extension.ts');
    for (const match of source.matchAll(/catch\s*\(\s*(\w+)\s*:\s*unknown\s*\)\s*\{/g)) {
      const name = match[1] ?? '';
      const body = blockAt(source, (match.index ?? 0) + match[0].length - 1);
      const uses = [...body.matchAll(new RegExp(`(?<![.\\w])${name}\\b`, 'g'))].length;
      const allowed = [
        ...body.matchAll(new RegExp(`(safeErrorCode|logMonitorError)\\([^)]*\\b${name}\\b`, 'g')),
      ].length;
      assert.equal(uses, allowed, `extension.ts: catch (${name})`);
    }
  });
});

void describe('monitor: module boundaries', () => {
  void it('core monitor files import only src/shared and sibling core files', () => {
    for (const file of coreFiles) {
      for (const specifier of importSpecifiers(code(file))) {
        const ok = /^\.\/\w+$/.test(specifier) || /^\.\.\/shared\/\w+$/.test(specifier);
        assert.ok(ok, `${file} imports ${specifier}`);
      }
    }
  });

  void it('adapters import only their allowed modules', () => {
    const allowed: Record<string, readonly string[]> = {
      'src/monitor/adapters/nodeFileSystem.ts': [
        '../ports',
        'node:fs',
        'node:fs/promises',
        'node:os',
      ],
      'src/monitor/adapters/nodeRuntime.ts': ['../ports', 'node:path'],
      [TERMINAL_ADAPTER]: ['../ports', 'vscode'],
    };
    for (const file of adapterFiles) {
      assert.deepEqual(
        [...importSpecifiers(code(file))].sort(),
        [...(allowed[file] ?? [])].sort(),
        file,
      );
    }
  });

  void it('src/host, src/webview, src/game, and src/shared import nothing from src/monitor', () => {
    const others = all.filter((file) => /^src\/(host|webview|game|shared)\//.test(file));
    assert.ok(others.length > 5);
    for (const file of others) {
      for (const specifier of importSpecifiers(code(file))) {
        assert.ok(!/monitor/.test(specifier), `${file} imports ${specifier}`);
      }
    }
  });

  void it('only src/extension.ts imports from src/monitor', () => {
    const importers = all.filter(
      (file) =>
        !file.startsWith('src/monitor/') &&
        importSpecifiers(code(file)).some((specifier) => /(^|\/)monitor\//.test(specifier)),
    );
    assert.deepEqual(importers, ['src/extension.ts']);
  });

  void it('src/shared imports nothing outside src/shared', () => {
    for (const file of all.filter((f) => f.startsWith('src/shared/'))) {
      for (const specifier of importSpecifiers(code(file))) {
        assert.ok(/^\.\/\w+$/.test(specifier), `${file} imports ${specifier}`);
      }
    }
  });
});

void describe('monitor: storage and persistence', () => {
  void it('no src file touches globalState, workspaceState, globalStorageUri, storageUri, logUri, or secrets (M3 persists nothing)', () => {
    assert.deepEqual(
      filesMatching(
        all,
        /\b(globalState|workspaceState|globalStorageUri|storageUri|logUri|secrets)\b/,
      ),
      [],
    );
  });
});

void describe('monitor: exhaustive switches (note 1 extended)', () => {
  void it('every switch on .type, .kind, .state, or a mode ends in a default that calls assertNever', () => {
    let found = 0;
    for (const file of monitorFiles) {
      const source = code(file);
      for (const match of source.matchAll(/\bswitch\s*\(([^)]*)\)\s*\{/g)) {
        const discriminant = (match[1] ?? '').trim();
        if (!/(\.(type|kind|state)|^(kind|mode|state))$/.test(discriminant)) {
          continue;
        }
        found += 1;
        const body = blockAt(source, (match.index ?? 0) + match[0].length - 1);
        assert.match(
          body,
          /\bdefault\s*:[\s\S]*\bassertNever\s*\(/,
          `${file}: switch (${discriminant})`,
        );
      }
    }
    assert.ok(found >= 6, `found only ${found} discriminated switches`);
  });

  void it('no switch in src/monitor is left without a default', () => {
    for (const file of monitorFiles) {
      const source = code(file);
      for (const match of source.matchAll(/\bswitch\s*\(([^)]*)\)\s*\{/g)) {
        const body = blockAt(source, (match.index ?? 0) + match[0].length - 1);
        assert.match(body, /\bdefault\s*:/, `${file}: switch (${match[1] ?? ''})`);
      }
    }
  });
});

void describe('monitor: crash isolation (invariant 4)', () => {
  void it('every timer callback in the monitor wraps its work or is a plain state hand-off', () => {
    // The poll loop, registry emission, simulator steps, and resume timer each catch their errors.
    for (const [file, marker] of [
      ['src/monitor/AgentRegistry.ts', 'monitor: emission failed'],
      ['src/monitor/SimulatorSource.ts', 'monitor: simulator step failed'],
      ['src/monitor/AgentMonitor.ts', 'monitor: simulator resume failed'],
      ['src/monitor/TranscriptSource.ts', 'monitor: transcript poll failed'],
    ] as const) {
      assert.ok(
        readText(file).includes(marker),
        `${file} should catch and report with "${marker}"`,
      );
    }
  });

  void it('no core monitor file throws or rethrows (the fs adapter rejects with EIDENTITY by design)', () => {
    assert.deepEqual(filesMatching(coreFiles, /\bthrow\b/), []);
    assert.deepEqual(filesMatching(adapterFiles, /\bthrow\b/), [FS_ADAPTER]);
  });

  void it('extension.ts wraps monitor creation, start, and both event handlers in try/catch', () => {
    const source = code('src/extension.ts');
    assert.ok((source.match(/\btry\s*\{/g) ?? []).length >= 4);
    assert.match(source, /logMonitorError\(log, 'monitor failed to start', error\)/);
  });

  void it('the monitor never reads the clock or timers from globals directly in core files (injected ports only)', () => {
    const portFree = coreFiles.filter((file) => file !== 'src/monitor/ports.ts');
    assert.deepEqual(
      filesMatching(
        portFree,
        /\bDate\.now\b|\bperformance\.now\b|(?<![.\w])(setTimeout|setInterval|clearTimeout|clearInterval)\s*\(/,
      ),
      [],
    );
    assert.deepEqual(
      filesMatching(coreFiles, /\bMath\.random\b/),
      [],
      'the simulator is seeded, never random',
    );
  });
});

void describe('monitor: bundle boundaries', () => {
  void it('dist/webview.js contains no monitor code', () => {
    const webview = readText('dist/webview.js');
    for (const name of [
      'AgentMonitor',
      'TranscriptSource',
      'classifyTranscriptLine',
      'SimulatorSource',
      'createNodeFileSystem',
    ]) {
      assert.ok(!webview.includes(name), `${name} must not be in the webview bundle`);
    }
  });

  void it('dist/extension.js contains the monitor and only read-only fs imports', () => {
    const host = readText('dist/extension.js');
    assert.ok(host.includes('AgentMonitor'));
    assert.ok(
      !/\b(writeFile|appendFile|createWriteStream|unlink)\b/.test(
        host.replace(/\/\/# sourceMappingURL.*$/m, ''),
      ),
    );
  });
});
