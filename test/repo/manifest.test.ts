// Structural checks on package.json and package-lock.json (M1 plan sections 5.2 and 7.2;
// Core invariants 5 and 6).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asRecord, readJson } from '../support/repo';

const manifest = asRecord(readJson('package.json'), 'package.json');

/**
 * Dev-only tooling approved by invariant 6 and the M1 plan section 5 task 2, plus
 * @vscode/test-electron (human-approved at the M1 review, ADR 0006 amendment).
 */
const DEV_DEPENDENCY_ALLOW_LIST = new Set([
  'esbuild',
  'typescript',
  '@types/vscode',
  '@types/node',
  'eslint',
  '@eslint/js',
  'typescript-eslint',
  'prettier',
  'markdownlint-cli2',
  '@vscode/vsce',
  '@vscode/test-electron',
]);

/** An exact semver version: no ^, ~, ranges, tags, URLs, or workspace links. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const RUNTIME_DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundledDependencies',
  'bundleDependencies',
] as const;

function devDependencies(): Record<string, string> {
  return asRecord(manifest.devDependencies, 'devDependencies') as Record<string, string>;
}

function scripts(): Record<string, string> {
  return asRecord(manifest.scripts, 'scripts') as Record<string, string>;
}

function contributes(): Record<string, unknown> {
  return asRecord(manifest.contributes, 'contributes');
}

void describe('package.json: dependencies (invariant 6)', () => {
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    void it(`has no ${field}`, () => {
      const value = manifest[field];
      const empty =
        value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && value !== null && Object.keys(value).length === 0);
      assert.ok(empty, `${field} must be absent or empty, got ${JSON.stringify(value)}`);
    });
  }

  void it('lists only allow-listed devDependencies', () => {
    const extra = Object.keys(devDependencies()).filter(
      (name) => !DEV_DEPENDENCY_ALLOW_LIST.has(name),
    );
    assert.deepEqual(extra, [], 'devDependencies outside the allow-list need human approval');
  });

  void it('pins every devDependency to an exact version', () => {
    for (const [name, version] of Object.entries(devDependencies())) {
      assert.match(version, EXACT_VERSION, `${name} must be pinned exactly, got "${version}"`);
    }
  });

  void it('pins @types/vscode to the engines.vscode minimum', () => {
    const engines = asRecord(manifest.engines, 'engines');
    const range = String(engines.vscode);
    const minimum = /^\^?(\d+\.\d+\.\d+)$/.exec(range)?.[1];
    assert.ok(minimum !== undefined, `engines.vscode must be "^x.y.z" or "x.y.z", got "${range}"`);
    assert.equal(devDependencies()['@types/vscode'], minimum);
  });

  void it('pins @types/node to major 20, the extension host Node version', () => {
    assert.match(devDependencies()['@types/node'] ?? '', /^20\./);
  });

  void it('matches package-lock.json, which contains only dev packages', () => {
    const lock = asRecord(readJson('package-lock.json'), 'package-lock.json');
    const packages = asRecord(lock.packages, 'package-lock.json packages');
    const root = asRecord(packages[''], 'package-lock.json root package');
    assert.deepEqual(root.devDependencies, manifest.devDependencies, 'lockfile is out of date');
    for (const field of RUNTIME_DEPENDENCY_FIELDS) {
      assert.equal(root[field], undefined, `lockfile root must have no ${field}`);
    }
    const runtimePackages = Object.entries(packages)
      .filter(([key]) => key !== '')
      .filter(([, entry]) => {
        const record = asRecord(entry, 'lockfile package');
        return record.dev !== true && record.devOptional !== true;
      })
      .map(([key]) => key);
    assert.deepEqual(runtimePackages, [], 'every installed package must be dev-only');
  });
});

void describe('package.json: extension manifest', () => {
  void it('points main at the host bundle', () => {
    assert.equal(manifest.main, './dist/extension.js');
  });

  void it('has no top-level icon (invariant 5: no image files)', () => {
    assert.equal(manifest.icon, undefined);
  });

  void it('activates lazily: no "*" and no onStartupFinished', () => {
    const events = manifest.activationEvents;
    assert.ok(events === undefined || Array.isArray(events), 'activationEvents must be an array');
    for (const event of (events ?? []) as string[]) {
      assert.notEqual(event, '*');
      assert.notEqual(event, 'onStartupFinished');
    }
  });

  void it('contributes a pixelAgents panel container with a codicon icon', () => {
    const containers = asRecord(contributes().viewsContainers, 'viewsContainers');
    const panel = containers.panel as { id: string; title: string; icon: string }[];
    const container = panel.find((entry) => entry.id === 'pixelAgents');
    assert.ok(container !== undefined, 'panel container pixelAgents expected');
    assert.equal(container.title, 'Pixel Agents');
    assert.match(container.icon, /^\$\([a-z0-9-]+\)$/, 'icon must be a $(codicon) reference');
  });

  void it('contributes the pixelAgents.view webview view inside that container', () => {
    const views = asRecord(contributes().views, 'views');
    const list = views.pixelAgents as { id: string; type: string; name: string }[];
    const view = list.find((entry) => entry.id === 'pixelAgents.view');
    assert.ok(view !== undefined, 'view pixelAgents.view expected');
    assert.equal(view.type, 'webview');
    assert.equal(view.name, 'Pixel Agents');
  });

  void it('references no image file anywhere in the manifest', () => {
    const text = JSON.stringify(manifest);
    assert.ok(
      !/\.(png|gif|jpe?g|webp|bmp|ico|svg)\b/i.test(text),
      'package.json must not reference image files',
    );
  });
});

void describe('package.json: scripts', () => {
  for (const name of ['build', 'watch', 'package', 'lint', 'format', 'typecheck', 'test']) {
    void it(`defines the ${name} script`, () => {
      assert.equal(typeof scripts()[name], 'string');
      assert.notEqual(scripts()[name], '');
    });
  }

  void it('runs tests through the node:test runner (ADR 0006)', () => {
    assert.equal(scripts().test, 'node test/run.mjs');
  });

  void it('runs extension-host integration tests through the tester-owned launcher', () => {
    assert.equal(scripts()['test:integration'], 'node test/integration/run.mjs');
  });

  void it('pins @vscode/test-electron exactly (ADR 0006 amendment)', () => {
    assert.match(devDependencies()['@vscode/test-electron'] ?? '', EXACT_VERSION);
  });

  void it('packages with vsce without bundling node_modules', () => {
    const command = scripts().package ?? '';
    assert.match(command, /^vsce package(\s|$)/);
    assert.match(command, /(^|\s)--no-dependencies(\s|$)/);
  });

  void it('runs a production build before publishing', () => {
    assert.equal(scripts()['vscode:prepublish'], 'node esbuild.mjs --production');
  });
});
