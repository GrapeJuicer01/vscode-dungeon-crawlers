// Extension-host checks for the M3 monitor (plan test note 16), observed only through public API:
// a fake webview view handed to the real provider (as the M2 positive control does) records every
// post and delivers `ready` and `focusAgent`; real terminals and real files drive the monitor.
//
// test/integration/run.mjs gives the host a temp transcript root (never the real ~/.claude), the
// simulator off, and short polling. Runs after protocol.itest.ts, which
// re-resolved the provider last and asserts that no terminal exists.
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { parseHostMessage } from '../../../src/shared/protocol';
import type { AgentInfo } from '../../../src/shared/protocol';
import { delay, describe, it, waitFor } from '../support/harness';
import { observed } from '../support/providerSpy';

const VIEW_ID = 'pixelAgents.view';
const MARKER = 'PIXEL_MARKER_9f2c';
const SESSION_REAL = 'a1b2c3d4-0000-4000-8000-000000000001';
const SESSION_PRIVATE = 'a1b2c3d4-0000-4000-8000-000000000002';
const SESSION_AUTO = 'a1b2c3d4-0000-4000-8000-000000000003';

function transcriptRoot(): string {
  const root = process.env.PIXEL_AGENTS_IT_TRANSCRIPT_ROOT;
  assert.ok(
    root !== undefined && root.length > 0,
    'run.mjs must pass PIXEL_AGENTS_IT_TRANSCRIPT_ROOT',
  );
  return root;
}

/** Computed independently of the source under test (plan note 16). */
function projectDir(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder !== undefined, 'the run opens a temp workspace folder');
  return path.join(transcriptRoot(), realpathSync(folder.uri.fsPath).replace(/[^A-Za-z0-9]/g, '-'));
}

function sessionPath(id: string): string {
  return path.join(projectDir(), `${id}.jsonl`);
}

/** The files this suite wrote, with the sizes it expects (to prove nothing else changed). */
const expected = new Map<string, number>();

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, { flag: 'a' });
  expected.set(file, (expected.get(file) ?? 0) + Buffer.byteLength(content));
}

function remove(file: string): void {
  unlinkSync(file);
  expected.delete(file);
}

const userLine = (text = 'synthetic prompt'): string =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
const toolUseLine = (name: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', name, input: { note: 'synthetic' } }],
    },
  }) + '\n';
const toolResultLine = (): string =>
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: 'synthetic result' }] },
  }) + '\n';
const assistantTextLine = (): string =>
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'synthetic reply' }] },
  }) + '\n';

// ---- A fake view for the real provider: records posts, delivers messages. ----

const posts: unknown[] = [];
const listeners: ((message: unknown) => void)[] = [];

function agentStates(): AgentInfo[] {
  return posts.flatMap((post) => {
    const message = post as { type?: string; agent?: AgentInfo };
    return message.type === 'agentState' && message.agent !== undefined
      ? [structuredClone(message.agent)]
      : [];
  });
}

function statesOf(id: string): string[] {
  return agentStates()
    .filter((agent) => agent.id === id)
    .map((agent) => agent.state);
}

async function attachFakeView(): Promise<void> {
  const provider = observed.providers[0];
  assert.ok(provider !== undefined, 'the real provider was captured at registration');
  const disposable = { dispose: (): void => undefined };
  const fakeWebview = {
    options: {},
    html: '',
    cspSource: 'vscode-webview://test',
    asWebviewUri: (uri: vscode.Uri): vscode.Uri => uri,
    onDidReceiveMessage: (listener: (message: unknown) => void): vscode.Disposable => {
      listeners.push(listener);
      return disposable;
    },
    postMessage: (message: unknown): Thenable<boolean> => {
      posts.push(message);
      return Promise.resolve(true);
    },
  };
  const fakeView = {
    viewType: VIEW_ID,
    webview: fakeWebview,
    visible: true,
    onDidChangeVisibility: (): vscode.Disposable => disposable,
    onDidDispose: (): vscode.Disposable => disposable,
    show: (): void => undefined,
  };
  const source = new vscode.CancellationTokenSource();
  await provider.resolveWebviewView(fakeView, { state: undefined }, source.token);
  source.dispose();
  listeners.at(-1)?.({ type: 'ready' });
}

function send(message: unknown): void {
  const listener = listeners.at(-1);
  assert.ok(listener !== undefined, 'the fake view is attached');
  listener(message);
}

/** Every log file of our extension in this run's user-data-dir. */
function ourLogText(): string {
  const userDataDir = process.env.PIXEL_AGENTS_IT_USER_DATA_DIR;
  assert.ok(userDataDir !== undefined, 'run.mjs must pass PIXEL_AGENTS_IT_USER_DATA_DIR');
  const logs = path.join(userDataDir, 'logs');
  if (!existsSync(logs)) {
    return '';
  }
  return readdirSync(logs, { recursive: true, encoding: 'utf8' })
    .map((relative) => path.join(logs, relative))
    .filter((file) => file.includes('pixel-agents.pixel-agents') && file.endsWith('.log'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

async function activeTerminalIs(terminal: vscode.Terminal): Promise<void> {
  await waitFor(
    () => vscode.window.activeTerminal === terminal,
    `terminal ${terminal.name} active`,
  );
}

const settings = (): vscode.WorkspaceConfiguration =>
  vscode.workspace.getConfiguration('pixelAgents');

describe('monitor: configuration reached the host (plan note 16 launcher)', () => {
  it('the temp transcript root and short thresholds are in effect (so the real ~/.claude is not read)', () => {
    assert.equal(settings().get('transcriptPath'), transcriptRoot());
    assert.equal(settings().get('simulator'), 'off');
    assert.equal(settings().get('pollIntervalMs'), 250);
    assert.equal(settings().get('debounceMs'), 100);
    assert.equal(settings().get('idleTimeoutSeconds'), 5);
    assert.ok(transcriptRoot().includes('pa-it-'), 'the root is inside this run’s temp directory');
    const realClaude = path.join(os.homedir(), '.claude');
    assert.ok(!transcriptRoot().startsWith(realClaude), 'the root is not under the real ~/.claude');
  });

  it('attaching the fake view: ready is answered with config, an empty agentList (simulator off), then the default progress (E1)', async () => {
    await attachFakeView();
    assert.deepEqual(
      posts.map((post) => structuredClone(post)),
      [
        {
          type: 'config',
          config: { protocolVersion: 2, enemiesEnabled: true, killsPerStage: 30, maxEnemies: 6 },
        },
        { type: 'agentList', agents: [] },
        {
          type: 'progress',
          progress: {
            schemaVersion: 1,
            stageIndex: 1,
            killsInStage: 0,
            totalKills: 0,
            bossesDefeated: 0,
            cycle: 0,
          },
        },
      ],
    );
  });
});

describe('monitor: a real session in this workspace', () => {
  const terminals: vscode.Terminal[] = [];

  it('a session file appears: spawned, then working with the Bash tool', async () => {
    // A real terminal, shown, so the session can link to it (used by the reveal test below).
    const first = vscode.window.createTerminal({ name: 'pa-it-1' });
    terminals.push(first);
    first.show();
    await activeTerminalIs(first);
    write(sessionPath(SESSION_REAL), userLine() + toolUseLine('Bash'));
    await waitFor(() => statesOf(SESSION_REAL).includes('working'), 'working for the new session');
    assert.deepEqual(statesOf(SESSION_REAL).slice(0, 2), ['spawned', 'working']);
    const working = agentStates().find((a) => a.id === SESSION_REAL && a.state === 'working');
    assert.equal(working?.toolName, 'Bash');
    for (const post of posts) {
      assert.notEqual(parseHostMessage(structuredClone(post)), undefined);
    }
  });

  it('goes idle after about 5 s of silence once the tool has finished', async () => {
    write(sessionPath(SESSION_REAL), toolResultLine() + assistantTextLine());
    const wrote = Date.now();
    await waitFor(
      () => statesOf(SESSION_REAL).includes('idle'),
      'idle after the idle timeout',
      20_000,
    );
    const waited = Date.now() - wrote;
    assert.ok(waited >= 3500, `idle came too early (${waited} ms)`);
    assert.ok(waited <= 15_000, `idle came too late (${waited} ms)`);
  }, 30_000);

  it('does not despawn while merely idle', async () => {
    await delay(2000);
    assert.ok(!statesOf(SESSION_REAL).includes('despawned'));
  });

  it('transcript privacy: a marker session and a malformed marker line reach no log and no post', async () => {
    write(
      sessionPath(SESSION_PRIVATE),
      userLine(MARKER) +
        toolUseLine(`${MARKER} tool`) +
        `{"type":"user","message":"${MARKER}\n` +
        `{"type":"summary","summary":"${MARKER}"}\n`,
    );
    await waitFor(() => statesOf(SESSION_PRIVATE).includes('spawned'), 'the marker session');
    await delay(1500);
    assert.ok(!JSON.stringify(posts).includes(MARKER), 'no post carries the marker');
    assert.ok(!ourLogText().includes(MARKER), 'the log file carries no marker');
    assert.ok(!ourLogText().includes(transcriptRoot()), 'the log file carries no transcript path');
    remove(sessionPath(SESSION_PRIVATE));
    await waitFor(
      () => statesOf(SESSION_PRIVATE).includes('despawned'),
      'the marker session ending',
    );
  });

  it('focusAgent reveals the linked terminal and closes nothing', async () => {
    const [first] = terminals;
    assert.ok(first !== undefined);
    const second = vscode.window.createTerminal({ name: 'pa-it-2' });
    terminals.push(second);
    second.show();
    await activeTerminalIs(second);
    const count = vscode.window.terminals.length;
    send({ type: 'focusAgent', agentId: SESSION_REAL });
    await activeTerminalIs(first);
    assert.equal(first.exitStatus, undefined);
    assert.equal(second.exitStatus, undefined);
    assert.equal(vscode.window.terminals.length, count, 'no terminal was created or closed');
    // Unknown and simulated ids reveal nothing.
    send({ type: 'focusAgent', agentId: 'sim-0-0' });
    send({ type: 'focusAgent', agentId: 'not-an-agent' });
    await delay(500);
    assert.equal(vscode.window.activeTerminal, first);
  });

  it('control messages from the webview change nothing', async () => {
    const before = JSON.stringify(agentStates());
    const count = posts.length;
    send({ type: 'stopAgent', agentId: SESSION_REAL });
    send({ type: 'sendText', text: 'echo hi' });
    send({ type: 'despawn', agentId: SESSION_REAL });
    await delay(500);
    assert.equal(JSON.stringify(agentStates()), before);
    assert.equal(posts.length, count);
    assert.equal(vscode.window.terminals.length, terminals.length);
  });

  it('deleting the file despawns the session; the terminals are untouched', async () => {
    remove(sessionPath(SESSION_REAL));
    await waitFor(() => statesOf(SESSION_REAL).includes('despawned'), 'despawned after delete');
    assert.equal(statesOf(SESSION_REAL).at(-1), 'despawned');
    for (const terminal of terminals) {
      assert.equal(terminal.exitStatus, undefined);
    }
  });
});

describe('monitor: the simulator through settings', () => {
  it('on with 2 agents: sim-0-0 and sim-1-0 spawn and work; off: both despawn', async () => {
    await settings().update('simulatorAgentCount', 2, vscode.ConfigurationTarget.Global);
    await settings().update('simulator', 'on', vscode.ConfigurationTarget.Global);
    await waitFor(
      () => ['sim-0-0', 'sim-1-0'].every((id) => statesOf(id).includes('working')),
      'both simulated agents working',
      15_000,
    );
    for (const agent of agentStates().filter((a) => a.id.startsWith('sim-'))) {
      assert.match(agent.name, /^Sim /);
    }
    await settings().update('simulator', 'off', vscode.ConfigurationTarget.Global);
    await waitFor(
      () => ['sim-0-0', 'sim-1-0'].every((id) => statesOf(id).at(-1) === 'despawned'),
      'both simulated agents leaving',
      15_000,
    );
  }, 40_000);

  it('auto while a real session exists: no simulated agent spawns', async () => {
    write(sessionPath(SESSION_AUTO), userLine());
    await waitFor(() => statesOf(SESSION_AUTO).includes('spawned'), 'the real session');
    const simSpawns = (): number =>
      agentStates().filter((a) => a.id.startsWith('sim-') && a.state === 'spawned').length;
    const before = simSpawns();
    await settings().update('simulator', 'auto', vscode.ConfigurationTarget.Global);
    await delay(3500);
    assert.equal(simSpawns(), before);
    await settings().update('simulator', 'off', vscode.ConfigurationTarget.Global);
    remove(sessionPath(SESSION_AUTO));
    await waitFor(() => statesOf(SESSION_AUTO).includes('despawned'), 'cleanup');
  }, 30_000);
});

describe('monitor: read-only and side-effect-free', () => {
  it('the transcript tree holds exactly the files this suite wrote, at exactly the sizes it wrote', () => {
    const found = new Map<string, number>();
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(full);
        } else {
          found.set(full, statSync(full).size);
        }
      }
    };
    visit(transcriptRoot());
    assert.deepEqual([...found.entries()].sort(), [...expected.entries()].sort());
  });

  it('the monitor wrote nothing into the workspace folder or the transcript root’s parent', () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder !== undefined);
    assert.deepEqual(
      readdirSync(folder.uri.fsPath).filter((name) => name !== '.vscode'),
      [],
    );
    assert.deepEqual(readdirSync(path.dirname(transcriptRoot())), ['projects']);
  });

  it('the extension registers no pixelAgents.* command of its own and created no terminal', async () => {
    const ours = (await vscode.commands.getCommands(false)).filter((id) =>
      id.startsWith('pixelAgents.'),
    );
    assert.deepEqual(
      ours.filter((id) => !id.startsWith(`${VIEW_ID}.`)),
      [],
    );
    assert.deepEqual(
      vscode.window.terminals.map((t) => t.name).sort(),
      ['pa-it-1', 'pa-it-2'],
      'only the two terminals this suite created exist',
    );
  });

  it('the log has no error line from the monitor', () => {
    const bad = ourLogText()
      .split('\n')
      .filter((line) => /\[error\]/i.test(line));
    assert.deepEqual(bad, []);
  });
});

// Clean up the project directory this suite created (the run's temp dir is removed by run.mjs).
describe('monitor: cleanup', () => {
  it('removes the suite’s transcript files', () => {
    rmSync(projectDir(), { recursive: true, force: true });
    expected.clear();
  });
});
