// Shared builders for the monitor suites: a config for tests, a transcript source on fakes, and
// a full AgentMonitor on fakes wired to a real WebviewBridge. All time is virtual (FakeTime).
import path from 'node:path';
import { WebviewBridge } from '../../src/host/webviewBridge';
import type { WebviewPort } from '../../src/host/webviewBridge';
import { AgentMonitor } from '../../src/monitor/AgentMonitor';
import { AgentRegistry } from '../../src/monitor/AgentRegistry';
import { DEFAULT_MONITOR_CONFIG } from '../../src/monitor/monitorConfig';
import type { MonitorConfig } from '../../src/monitor/monitorConfig';
import type { ReadOnlyFileSystem, WorkspaceFolderRef } from '../../src/monitor/ports';
import { encodeProjectDir } from '../../src/monitor/projectPaths';
import { TranscriptSource } from '../../src/monitor/TranscriptSource';
import { PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { AgentInfo, HostToWebviewMessage } from '../../src/shared/protocol';
import {
  FakeFileSystem,
  FakeTerminalPort,
  FakeTime,
  RecordingLogger,
  settle,
} from './monitorFakes';

export const HOME = '/home/tester';
export const ROOT = `${HOME}/.claude/projects`;
export const FOLDER_PATH = '/work/My Repo';
export const FOLDER: WorkspaceFolderRef = { name: 'My Repo', fsPath: FOLDER_PATH };
export const PROJECT_DIR = encodeProjectDir(FOLDER_PATH);

/** Test config: the defaults with the simulator off, so only transcripts produce agents. */
export function testConfig(overrides: Partial<MonitorConfig> = {}): MonitorConfig {
  return { ...DEFAULT_MONITOR_CONFIG, simulator: 'off', ...overrides };
}

export function sessionFile(id: string, projectDir = PROJECT_DIR): string {
  return `${ROOT}/${projectDir}/${id}.jsonl`;
}

export interface SourceRig {
  readonly time: FakeTime;
  readonly fs: FakeFileSystem;
  readonly logger: RecordingLogger;
  readonly registry: AgentRegistry;
  readonly source: TranscriptSource;
  readonly events: AgentInfo[];
  config: MonitorConfig;
}

/** A TranscriptSource over fakes. Call rig.source.start() when the tree is ready. */
export function sourceRig(
  overrides: Partial<MonitorConfig> = {},
  folders: readonly WorkspaceFolderRef[] = [FOLDER],
  wrapFs?: (fs: FakeFileSystem) => ReadOnlyFileSystem,
): SourceRig {
  const time = new FakeTime();
  const baseFs = new FakeFileSystem(() => time.now());
  baseFs.home = HOME;
  const fs = wrapFs === undefined ? baseFs : wrapFs(baseFs);
  const logger = new RecordingLogger();
  const config = testConfig(overrides);
  const registry = new AgentRegistry({ clock: time, timers: time, logger }, config.debounceMs);
  const events: AgentInfo[] = [];
  registry.onDidChange((agent) => events.push(agent));
  const source = new TranscriptSource(
    { fs, path: path.posix, clock: time, timers: time, logger, registry, caseInsensitive: false },
    config,
    folders,
  );
  return { time, fs: baseFs, logger, registry, source, events, config };
}

export interface MonitorRig {
  readonly time: FakeTime;
  readonly fs: FakeFileSystem;
  readonly logger: RecordingLogger;
  readonly terminals: FakeTerminalPort;
  readonly monitor: AgentMonitor;
  readonly bridge: WebviewBridge;
  /** Every message posted to the fake webview, structured-cloned. */
  readonly posts: HostToWebviewMessage[];
  readonly changes: AgentInfo[];
  /** Post a `ready` as the webview would. */
  ready(): void;
}

export interface MonitorRigOptions {
  readonly config?: Partial<MonitorConfig>;
  readonly folders?: readonly WorkspaceFolderRef[];
  readonly withTerminals?: boolean;
  readonly seed?: number;
  /** Starts the monitor and attaches the bridge in the ready state (default true). */
  readonly start?: boolean;
}

/** A started AgentMonitor on fakes, wired to a real WebviewBridge whose port records posts. */
export function monitorRig(options: MonitorRigOptions = {}): MonitorRig {
  const time = new FakeTime();
  const fs = new FakeFileSystem(() => time.now());
  fs.home = HOME;
  const logger = new RecordingLogger();
  const terminals = new FakeTerminalPort();
  const config = testConfig(options.config);
  const monitor = new AgentMonitor(
    {
      fs,
      path: path.posix,
      clock: time,
      timers: time,
      terminals: options.withTerminals === false ? null : terminals,
      logger,
      caseInsensitive: false,
      simulatorSeed: options.seed ?? 0x5049584c,
    },
    config,
    options.folders ?? [FOLDER],
  );
  const posts: HostToWebviewMessage[] = [];
  const port: WebviewPort = {
    postMessage(message) {
      posts.push(structuredClone(message));
      return Promise.resolve(true);
    },
  };
  const bridge = new WebviewBridge({
    getAgents: () => monitor.getAgents(),
    getConfig: () => ({ protocolVersion: PROTOCOL_VERSION }),
    revealAgentTerminal: (agentId) => monitor.revealAgentTerminal(agentId),
    logger,
  });
  const changes: AgentInfo[] = [];
  monitor.onDidChangeAgent((agent) => {
    changes.push(agent);
    bridge.postAgentState(agent);
  });
  const rig: MonitorRig = {
    time,
    fs,
    logger,
    terminals,
    monitor,
    bridge,
    posts,
    changes,
    ready: () => bridge.handleMessage({ type: 'ready' }),
  };
  bridge.attach(port);
  if (options.start !== false) {
    bridge.handleMessage({ type: 'ready' });
    monitor.start();
  }
  return rig;
}

export { settle };
