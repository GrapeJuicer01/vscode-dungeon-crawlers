// Structural checks for the M2 protocol (plan test notes 1 and 6, security-and-safety.md
// sections 3, 5, and 7). Source is read as text with comments stripped.
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HOST_TO_WEBVIEW_TYPES, WEBVIEW_TO_HOST_TYPES } from '../../src/shared/protocol';
import { asRecord, readJson } from '../support/repo';
import { blockAt, code, filesMatching, importSpecifiers, srcFiles } from '../support/source';

const files = srcFiles();
const PROTOCOL = 'src/shared/protocol.ts';
const BANNED_WORDS = [
  'kill',
  'stop',
  'terminate',
  'signal',
  'send',
  'write',
  'input',
  'exec',
  'run',
  'command',
  'dispose',
  'close',
];

/** Every `type: '...'` string-literal discriminant declared in protocol.ts interfaces. */
function declaredMessageTypes(): string[] {
  return [...code(PROTOCOL).matchAll(/readonly\s+type:\s*'([^']+)'/g)].map(
    (match) => match[1] ?? '',
  );
}

/** Bodies of interfaces and type aliases in protocol.ts. */
function typeDeclarations(source: string): string[] {
  const bodies: string[] = [];
  for (const match of source.matchAll(/\b(?:export\s+)?interface\s+\w+[^{]*\{/g)) {
    bodies.push(blockAt(source, (match.index ?? 0) + match[0].length - 1));
  }
  for (const match of source.matchAll(/\b(?:export\s+)?type\s+\w+(?:<[^=]*>)?\s*=[^;]*;/g)) {
    bodies.push(match[0]);
  }
  return bodies;
}

void describe('no controlling message types (note 6, invariant 3)', () => {
  void it('the webview-to-host list is exactly ready, focusAgent, and saveProgress', () => {
    assert.deepEqual([...WEBVIEW_TO_HOST_TYPES], ['ready', 'focusAgent', 'saveProgress']);
  });

  void it('saveProgress carries only a progress value, and Progress holds numbers only', () => {
    const progress = code('src/shared/progress.ts');
    const body = blockAt(
      progress,
      progress.indexOf('{', progress.indexOf('export interface Progress')),
    );
    const fields = [...body.matchAll(/readonly\s+(\w+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]]);
    assert.equal(fields.length, 6);
    for (const [name, type] of fields) {
      assert.match(String(type), /^(number|typeof PROGRESS_SCHEMA_VERSION)$/, String(name));
    }
    const protocol = code(PROTOCOL);
    const save = blockAt(
      protocol,
      protocol.indexOf('{', protocol.indexOf('export interface SaveProgressMessage')),
    );
    assert.deepEqual(
      [...save.matchAll(/readonly\s+(\w+)\s*:/g)].map((m) => m[1]),
      ['type', 'progress'],
    );
  });

  void it('protocol.ts declares exactly the seven planned message types', () => {
    assert.deepEqual(
      declaredMessageTypes().sort(),
      [...HOST_TO_WEBVIEW_TYPES, ...WEBVIEW_TO_HOST_TYPES].sort(),
    );
  });

  void it('no message type literal contains a controlling word (case-insensitive)', () => {
    const types = [...declaredMessageTypes(), ...HOST_TO_WEBVIEW_TYPES, ...WEBVIEW_TO_HOST_TYPES];
    assert.ok(types.length >= 5, 'the scan found the message types');
    const offenders = types.filter((type) =>
      BANNED_WORDS.some((word) => type.toLowerCase().includes(word)),
    );
    assert.deepEqual(offenders, []);
  });

  void it('no message field name is a controlling word either (matched as whole camelCase words)', () => {
    // E1: the progress counters killsInStage, killsPerStage, and totalKills contain the letters
    // "kill" but are nouns for game scores. The scan therefore compares whole camelCase words
    // ("kills" is not "kill"); every other substring-only match must be a number-typed counter.
    const protocol = typeDeclarations(code(PROTOCOL))
      .filter((body) => body.includes('readonly'))
      .flatMap((body) =>
        [...body.matchAll(/readonly\s+(\w+)\s*:\s*([^;]+);/g)].map((match): [string, string] => [
          match[1] ?? '',
          (match[2] ?? '').trim(),
        ]),
      );
    const progress = typeDeclarations(code('src/shared/progress.ts'))
      .filter((body) => body.includes('readonly'))
      .flatMap((body) =>
        [...body.matchAll(/readonly\s+(\w+)\s*:\s*([^;]+);/g)].map((match): [string, string] => [
          match[1] ?? '',
          (match[2] ?? '').trim(),
        ]),
      );
    const fields = [...protocol, ...progress];
    assert.ok(
      fields.some(([name]) => name === 'agentId'),
      'the scan found the message fields',
    );
    const words = (name: string): string[] =>
      name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(' ');
    const offenders = fields.filter(([name]) =>
      words(name).some((word) => BANNED_WORDS.includes(word)),
    );
    assert.deepEqual(offenders, []);
    const substringOnly = fields.filter(
      ([name]) =>
        !words(name).some((word) => BANNED_WORDS.includes(word)) &&
        BANNED_WORDS.some((word) => name.toLowerCase().includes(word)),
    );
    assert.deepEqual(
      substringOnly.map(([name, type]) => `${name}:${type}`).sort(),
      ['killsInStage:number', 'killsPerStage:number', 'totalKills:number'],
      'the only substring matches are numeric score counters',
    );
  });

  void it('src/host/** and src/extension.ts use no terminal-input, process, command, or file-write API', () => {
    const hostFiles = files.filter(
      (file) => file.startsWith('src/host/') || file === 'src/extension.ts',
    );
    assert.ok(hostFiles.includes('src/host/webviewBridge.ts'));
    const banned = [
      /\bsendText\b/,
      /\bsendSequence\b/,
      /child_process/,
      /\bprocess\.kill\b/,
      /\bexecuteCommand\b/,
      /\bterminal\w*\??\.dispose\s*\(/i,
      /\bfs\.(write|append|unlink|rm)/,
      /\b(writeFile|appendFile|createWriteStream|unlink)(Sync)?\b/,
    ];
    for (const pattern of banned) {
      assert.deepEqual(filesMatching(hostFiles, pattern), [], String(pattern));
    }
  });
});

void describe('bundle boundaries for the new folders', () => {
  void it('src/host/** imports only src/shared/** and its own sibling files (no vscode, node:, monitor, game, or webview)', () => {
    const hostFiles = files.filter((file) => file.startsWith('src/host/'));
    assert.ok(hostFiles.includes('src/host/progressStore.ts'));
    assert.ok(hostFiles.includes('src/host/progressMigrations.ts'));
    assert.ok(hostFiles.includes('src/host/gameConfig.ts'));
    for (const file of hostFiles) {
      for (const specifier of importSpecifiers(code(file))) {
        assert.ok(specifier.startsWith('.'), `${file} imports the package ${specifier}`);
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        assert.ok(
          resolved.startsWith('src/shared/') || /^src\/host\/\w+$/.test(resolved),
          `${file} imports ${specifier}`,
        );
      }
    }
  });

  void it('src/shared/** imports nothing outside src/shared/', () => {
    for (const file of files.filter((candidate) => candidate.startsWith('src/shared/'))) {
      for (const specifier of importSpecifiers(code(file))) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        assert.ok(
          specifier.startsWith('.') && resolved.startsWith('src/shared/'),
          `${file} imports ${specifier}`,
        );
      }
    }
  });

  void it('the DOM-free webview modules touch no window, document, or acquireVsCodeApi', () => {
    for (const file of [
      'src/webview/hostChannel.ts',
      'src/webview/hostMessages.ts',
      'src/webview/hostState.ts',
      'src/webview/sceneFeed.ts',
      'src/webview/gameHost.ts',
    ]) {
      assert.doesNotMatch(code(file), /\b(window|document|acquireVsCodeApi|globalThis)\b/, file);
    }
  });

  void it('webview code does not import src/host/** (the bridge stays out of the browser bundle)', () => {
    const webviewFiles = files.filter(
      (file) => file.startsWith('src/webview/') || file.startsWith('src/game/'),
    );
    for (const file of webviewFiles) {
      for (const specifier of importSpecifiers(code(file))) {
        assert.ok(!/(^|\/)host(\/|$)/.test(specifier), `${file} imports ${specifier}`);
      }
    }
  });
});

void describe('protocol types have no optional properties', () => {
  void it('no `name?:` member and no `| undefined` in any protocol interface or type', () => {
    const declarations = typeDeclarations(code(PROTOCOL));
    assert.ok(declarations.length >= 10, `found ${declarations.length} declarations`);
    for (const body of declarations) {
      assert.doesNotMatch(body, /\w\s*\?\s*:/, body);
      assert.doesNotMatch(body, /\|\s*undefined\b|\bundefined\s*\|/, body);
    }
  });
});

void describe('exhaustive switches (note 1)', () => {
  const scanned = files.filter(
    (file) =>
      file.startsWith('src/shared/') ||
      file.startsWith('src/host/') ||
      /^src\/webview\/host\w*\.ts$/.test(file),
  );

  void it('every switch on `.type` or `.state` ends in a default that calls assertNever', () => {
    let found = 0;
    for (const file of scanned) {
      const source = code(file);
      for (const match of source.matchAll(/\bswitch\s*\(([^)]*)\)\s*\{/g)) {
        const discriminant = (match[1] ?? '').trim();
        if (!/\.(type|state)$/.test(discriminant)) {
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
    // webviewBridge (message.type), hostMessages (message.type), hostState (agent.state).
    assert.ok(found >= 3, `found only ${found} discriminated switches`);
  });

  void it('the parse* switches on raw strings are the documented exception and default to undefined', () => {
    const source = code(PROTOCOL);
    const switches = [...source.matchAll(/\bswitch\s*\(\s*type\s*\)\s*\{/g)];
    assert.equal(switches.length, 2);
    for (const match of switches) {
      const body = blockAt(source, (match.index ?? 0) + match[0].length - 1);
      assert.match(body, /\bdefault\s*:\s*return undefined;/);
    }
  });

  void it('assertNever is defined once, in src/shared/assertNever.ts, and never redefined', () => {
    assert.deepEqual(filesMatching(files, /\bfunction\s+assertNever\b/), [
      'src/shared/assertNever.ts',
    ]);
  });
});

void describe('no HTML injection sinks in the webview (security T9)', () => {
  void it('src/webview/** and src/game/** use no innerHTML, outerHTML, insertAdjacentHTML, or document.write', () => {
    const webviewFiles = files.filter(
      (file) =>
        (file.startsWith('src/webview/') || file.startsWith('src/game/')) &&
        file !== 'src/webview/index.html.ts',
    );
    assert.ok(webviewFiles.includes('src/webview/main.ts'));
    assert.deepEqual(
      filesMatching(
        webviewFiles,
        /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write(ln)?|createContextualFragment)\b/,
      ),
      [],
    );
  });
});

void describe('no test-only surface in production (security section 5)', () => {
  void it('no environment-variable switch in src/', () => {
    assert.deepEqual(filesMatching(files, /\bprocess\.env\b|\bprocess\.argv\b/), []);
  });

  void it('no command is registered and none is contributed (M2)', () => {
    assert.deepEqual(filesMatching(files, /\bregisterCommand\b|\bregisterTextEditorCommand\b/), []);
    const contributes = asRecord(
      asRecord(readJson('package.json'), 'package.json').contributes,
      'contributes',
    );
    assert.equal(contributes.commands, undefined);
  });

  void it('no test hook names in src/', () => {
    assert.deepEqual(
      filesMatching(
        files,
        /\b\w*(ForTest|ForTesting|TestOnly|testHook|__test\w*|_test_)\b|\bisTest\b|\bNODE_ENV\b/i,
      ),
      [],
    );
  });

  void it('activate is declared to return void', () => {
    assert.match(
      code('src/extension.ts'),
      /export function activate\(context: vscode\.ExtensionContext\): void\b/,
    );
  });

  void it('the bridge exposes only the planned public members', () => {
    const source = code('src/host/webviewBridge.ts');
    const classBody = blockAt(
      source,
      source.indexOf('{', source.indexOf('export class WebviewBridge')),
    );
    const publicMembers = [
      ...classBody.matchAll(
        /^ {2}(?!#|private\b|readonly #|constructor\b|\/\/)(?:get\s+)?(\w+)\s*[(:]/gm,
      ),
    ].map((match) => match[1] ?? '');
    assert.deepEqual(
      publicMembers.sort(),
      [
        'attach',
        'detach',
        'handleMessage',
        'markHidden',
        'postAgentState',
        'postConfig',
        'state',
      ].sort(),
    );
  });
});
