// Pure path, name, and config helpers of the monitor core (M3 plan test notes 1 and 5).
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildAgentName, normalizeToolName } from '../../src/monitor/agentNames';
import {
  DEFAULT_MONITOR_CONFIG,
  MONITOR_SETTINGS,
  readMonitorConfig,
} from '../../src/monitor/monitorConfig';
import {
  encodeProjectDir,
  isContained,
  isProjectDirName,
  projectLabel,
  resolveTranscriptRoot,
  sessionIdFromFileName,
} from '../../src/monitor/projectPaths';
import {
  isAgentId,
  MAX_AGENT_NAME_LENGTH,
  MAX_TOOL_NAME_LENGTH,
  toAgentInfo,
} from '../../src/shared/protocol';
import { asRecord, readJson } from '../support/repo';

const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

void describe('resolveTranscriptRoot', () => {
  void it('empty setting gives <home>/.claude/projects and is not custom', () => {
    assert.deepEqual(resolveTranscriptRoot('', '/home/u', path.posix), {
      ok: true,
      root: '/home/u/.claude/projects',
      custom: false,
    });
  });

  void it('~/x expands against home (posix) and ~\\x expands on win32', () => {
    assert.deepEqual(resolveTranscriptRoot('~/x', '/home/u', path.posix), {
      ok: true,
      root: '/home/u/x',
      custom: true,
    });
    assert.deepEqual(resolveTranscriptRoot('~\\x', 'C:\\Users\\u', path.win32), {
      ok: true,
      root: 'C:\\Users\\u\\x',
      custom: true,
    });
  });

  void it('relative paths are rejected as notAbsolute', () => {
    for (const setting of ['relative/x', './x', '../x', 'x']) {
      assert.deepEqual(resolveTranscriptRoot(setting, '/home/u', path.posix), {
        ok: false,
        reason: 'notAbsolute',
      });
    }
  });

  void it('an absolute path is normalized: /a/../b resolves to /b', () => {
    assert.deepEqual(resolveTranscriptRoot('/a/../b', '/home/u', path.posix), {
      ok: true,
      root: '/b',
      custom: true,
    });
  });
});

void describe('encodeProjectDir', () => {
  const cases: readonly [string, string][] = [
    ['/Users/me/My Repo', '-Users-me-My-Repo'],
    ['/a/b.c/d_e', '-a-b-c-d-e'],
    ['/work/ünï', '-work--n-'],
    ['C:\\Users\\me\\proj', 'C--Users-me-proj'],
    ['/trailing/', '-trailing-'],
    ['/emoji/😀', '-emoji---'],
  ];
  for (const [input, expected] of cases) {
    void it(`${JSON.stringify(input)} gives ${expected}`, () => {
      assert.equal(encodeProjectDir(input), expected);
    });
  }
});

void describe('isContained', () => {
  void it('posix: the root itself, a child, and a deep child are contained', () => {
    assert.ok(isContained('/r', '/r', path.posix));
    assert.ok(isContained('/r', '/r/a', path.posix));
    assert.ok(isContained('/r', '/r/a/b/c.jsonl', path.posix));
  });

  void it('posix: .. escapes, siblings with a shared prefix, and parents are not contained', () => {
    assert.ok(!isContained('/r', '/r/../x', path.posix));
    assert.ok(!isContained('/r', '/root-evil', path.posix));
    assert.ok(!isContained('/r', '/r-evil/a', path.posix));
    assert.ok(!isContained('/r/a', '/r', path.posix));
    assert.ok(!isContained('/r', '/', path.posix));
  });

  void it('win32: same drive child contained, other drive and sibling prefix not', () => {
    assert.ok(isContained('C:\\root', 'C:\\root', path.win32));
    assert.ok(isContained('C:\\root', 'C:\\root\\p\\f.jsonl', path.win32));
    assert.ok(!isContained('C:\\root', 'D:\\root\\p', path.win32));
    assert.ok(!isContained('C:\\root', 'C:\\root-evil\\p', path.win32));
    assert.ok(!isContained('C:\\root', 'C:\\root\\..\\x', path.win32));
  });

  void it('win32: drive letter and path case differences still compare as contained', () => {
    assert.ok(isContained('C:\\Root', 'c:\\root\\p', path.win32));
  });
});

void describe('sessionIdFromFileName', () => {
  void it('accepts a UUID .jsonl in either case and lower-cases it; ids pass isAgentId', () => {
    assert.equal(sessionIdFromFileName(`${UUID}.jsonl`), UUID);
    assert.equal(sessionIdFromFileName(`${UUID.toUpperCase()}.jsonl`), UUID);
    assert.ok(isAgentId(sessionIdFromFileName(`${UUID.toUpperCase()}.jsonl`)));
  });

  void it('rejects subagent files, non-UUID names, and other extensions', () => {
    for (const name of [
      'agent-1a2b.jsonl',
      'x.jsonl',
      `${UUID}.json`,
      `${UUID}.jsonl.bak`,
      `${UUID}`,
      `x${UUID}.jsonl`,
      `${UUID}.jsonl `,
      '',
    ]) {
      assert.equal(sessionIdFromFileName(name), null, name);
    }
  });
});

void describe('isProjectDirName', () => {
  void it('rejects ., .., empty, separators, and over-long names', () => {
    for (const name of ['.', '..', '', 'a/b', 'a\\b', 'x'.repeat(256)]) {
      assert.equal(isProjectDirName(name), false, JSON.stringify(name));
    }
  });

  void it('accepts ordinary encoded names', () => {
    assert.ok(isProjectDirName('-Users-me-repo'));
    assert.ok(isProjectDirName('x'.repeat(255)));
  });
});

void describe('projectLabel', () => {
  const folders = [{ name: 'My Repo', encodedNames: ['-work-My-Repo', '-real-My-Repo'] }];

  void it('a workspace folder match wins (path or realpath encoding)', () => {
    assert.equal(projectLabel('-work-My-Repo', folders, false), 'My Repo');
    assert.equal(projectLabel('-real-My-Repo', folders, false), 'My Repo');
  });

  void it('matching is case-insensitive only when asked', () => {
    assert.equal(projectLabel('-WORK-my-repo', folders, true), 'My Repo');
    assert.notEqual(projectLabel('-WORK-my-repo', folders, false), 'My Repo');
  });

  void it('unmatched names use the tail heuristic and are never empty', () => {
    assert.equal(projectLabel('-Users-me-Other-Thing', folders, false), 'Other-Thing');
    for (const dir of ['---', '-', 'x']) {
      assert.ok(projectLabel(dir, [], false).length > 0, dir);
    }
  });
});

void describe('normalizeToolName', () => {
  void it('accepts names matching the protocol pattern, including mcp__ names', () => {
    for (const name of ['Bash', 'mcp__x__y', 'a.b:c-d', '_x', 'x'.repeat(MAX_TOOL_NAME_LENGTH)]) {
      assert.equal(normalizeToolName(name), name);
    }
  });

  void it('rejects without repair: spaces, empty, too long, non-strings', () => {
    for (const name of [
      'Bash tool',
      '',
      'x'.repeat(MAX_TOOL_NAME_LENGTH + 1),
      '-x',
      42,
      null,
      undefined,
      {},
      ['Bash'],
    ]) {
      assert.equal(normalizeToolName(name), null, JSON.stringify(name));
    }
  });
});

void describe('buildAgentName', () => {
  const id = UUID;

  void it('is label plus the first four id characters', () => {
    assert.equal(buildAgentName('My Repo', id), 'My Repo aaaa');
  });

  void it('replaces forbidden characters, collapses whitespace, and falls back for a blank label', () => {
    assert.equal(buildAgentName('a\u0000\u202eb\n\tc', id), 'a b c aaaa');
    assert.equal(buildAgentName('   ', id), 'Agent aaaa');
    assert.equal(buildAgentName('', id), 'Agent aaaa');
  });

  void it('always passes the protocol name rule, even for long and surrogate-pair labels', () => {
    const labels = ['x'.repeat(500), '😀'.repeat(100), `${'y'.repeat(58)}😀`, '\u202e'.repeat(80)];
    for (const label of labels) {
      const name = buildAgentName(label, id);
      assert.ok(name.length <= MAX_AGENT_NAME_LENGTH, `${name.length}`);
      assert.ok(
        toAgentInfo({ id, name, state: 'working', toolName: null, timestamp: 1 }) !== undefined,
        JSON.stringify(name),
      );
      // Never a lone high surrogate.
      assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(name), JSON.stringify(name));
    }
  });
});

void describe('readMonitorConfig', () => {
  const read = (values: Record<string, unknown>): ReturnType<typeof readMonitorConfig> =>
    readMonitorConfig((key) => values[key]);

  void it('empty input gives the defaults', () => {
    assert.deepEqual(read({}), DEFAULT_MONITOR_CONFIG);
  });

  void it('converts units: seconds and minutes become milliseconds', () => {
    const config = read({
      idleTimeoutSeconds: 10,
      toolTimeoutSeconds: 100,
      sessionEndTimeoutMinutes: 5,
    });
    assert.equal(config.idleTimeoutMs, 10_000);
    assert.equal(config.toolTimeoutMs, 100_000);
    assert.equal(config.sessionEndTimeoutMs, 300_000);
  });

  void it('clamps every integer at both bounds and rounds floats', () => {
    for (const spec of MONITOR_SETTINGS) {
      if (spec.kind !== 'integer') {
        continue;
      }
      const low = read({ [spec.key]: spec.minimum - 1000 });
      const high = read({ [spec.key]: spec.maximum + 1000 });
      assert.notDeepEqual(low, high, spec.key);
    }
    assert.equal(read({ debounceMs: -5 }).debounceMs, 0);
    assert.equal(read({ debounceMs: 99_999 }).debounceMs, 10_000);
    assert.equal(read({ pollIntervalMs: 1 }).pollIntervalMs, 250);
    assert.equal(read({ pollIntervalMs: 99_999 }).pollIntervalMs, 10_000);
    assert.equal(read({ simulatorAgentCount: 0 }).simulatorAgentCount, 1);
    assert.equal(read({ simulatorAgentCount: 99 }).simulatorAgentCount, 16);
    assert.equal(read({ simulatorAgentCount: 2.6 }).simulatorAgentCount, 3);
  });

  void it('falls back to defaults for strings, NaN, infinity, objects, and null', () => {
    for (const bad of ['5', Number.NaN, Number.POSITIVE_INFINITY, {}, [], null, true]) {
      assert.equal(read({ debounceMs: bad }).debounceMs, 750, JSON.stringify(bad));
    }
  });

  void it('falls back for invalid enums and a non-string transcriptPath', () => {
    assert.equal(read({ simulator: 'maybe' }).simulator, 'auto');
    assert.equal(read({ simulator: 3 }).simulator, 'auto');
    assert.equal(read({ projectScope: 'everything' }).projectScope, 'workspace');
    assert.equal(read({ transcriptPath: 7 }).transcriptPath, '');
  });

  void it('enforces toolTimeout >= idleTimeout and sessionEndTimeout >= toolTimeout', () => {
    const config = read({
      idleTimeoutSeconds: 600,
      toolTimeoutSeconds: 60,
      sessionEndTimeoutMinutes: 1,
    });
    assert.ok(config.toolTimeoutMs >= config.idleTimeoutMs);
    assert.ok(config.sessionEndTimeoutMs >= config.toolTimeoutMs);
  });

  void it('a throwing getter counts as unset and never throws', () => {
    assert.doesNotThrow(() =>
      readMonitorConfig(() => {
        throw new Error('settings unavailable');
      }),
    );
  });
});

void describe('package.json contributes.configuration matches MONITOR_SETTINGS', () => {
  const manifest = asRecord(readJson('package.json'), 'package.json');
  const configuration = asRecord(
    asRecord(manifest.contributes, 'contributes').configuration,
    'configuration',
  );
  const properties = asRecord(configuration.properties, 'properties');

  void it('has exactly the nine pixelAgents.* keys', () => {
    assert.deepEqual(
      Object.keys(properties).sort(),
      MONITOR_SETTINGS.map((spec) => `pixelAgents.${spec.key}`).sort(),
    );
    assert.equal(MONITOR_SETTINGS.length, 9);
  });

  for (const spec of MONITOR_SETTINGS) {
    void it(`pixelAgents.${spec.key}: type, default, range, enum, scope, description`, () => {
      const property = asRecord(properties[`pixelAgents.${spec.key}`], spec.key);
      assert.equal(property.default, spec.default);
      assert.equal(property.scope, spec.scope);
      assert.ok(
        typeof property.markdownDescription === 'string' &&
          property.markdownDescription.length > 20,
        'markdownDescription',
      );
      if (spec.kind === 'integer') {
        assert.equal(property.type, 'integer');
        assert.equal(property.minimum, spec.minimum);
        assert.equal(property.maximum, spec.maximum);
      } else if (spec.kind === 'enum') {
        assert.equal(property.type, 'string');
        assert.deepEqual(property.enum, spec.values);
        assert.ok(Array.isArray(property.enumDescriptions));
      } else {
        assert.equal(property.type, 'string');
      }
    });
  }

  void it('projectScope and transcriptPath are machine-scoped', () => {
    for (const key of ['projectScope', 'transcriptPath']) {
      assert.equal(asRecord(properties[`pixelAgents.${key}`], key).scope, 'machine');
    }
  });
});
