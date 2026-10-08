// Monitor settings (agent-detection.md section 6). MONITOR_SETTINGS mirrors
// package.json contributes.configuration exactly (a test keeps them equal), and
// readMonitorConfig is total: it never throws, falls back on wrong types, and clamps ranges.
// Units are converted to milliseconds here, once (coding-standards.md section 9).

export const SETTINGS_SECTION = 'pixelAgents';

export type SimulatorMode = 'auto' | 'on' | 'off';
export type ProjectScope = 'workspace' | 'all';

export interface MonitorConfig {
  readonly simulator: SimulatorMode;
  readonly simulatorAgentCount: number;
  readonly projectScope: ProjectScope;
  readonly transcriptPath: string;
  readonly idleTimeoutMs: number;
  readonly toolTimeoutMs: number;
  readonly sessionEndTimeoutMs: number;
  readonly debounceMs: number;
  readonly pollIntervalMs: number;
}

type SettingScope = 'window' | 'machine';

export type SettingSpec =
  | {
      readonly key: string;
      readonly kind: 'integer';
      readonly default: number;
      readonly minimum: number;
      readonly maximum: number;
      readonly scope: SettingScope;
    }
  | {
      readonly key: string;
      readonly kind: 'string';
      readonly default: string;
      readonly scope: SettingScope;
    }
  | {
      readonly key: string;
      readonly kind: 'enum';
      readonly values: readonly string[];
      readonly default: string;
      readonly scope: SettingScope;
    };

type IntegerSpec = Extract<SettingSpec, { readonly kind: 'integer' }>;
type StringSpec = Extract<SettingSpec, { readonly kind: 'string' }>;
interface EnumSpec<T extends string> {
  readonly key: string;
  readonly kind: 'enum';
  readonly values: readonly T[];
  readonly default: T;
  readonly scope: SettingScope;
}

const SIMULATOR: EnumSpec<SimulatorMode> = {
  key: 'simulator',
  kind: 'enum',
  values: ['auto', 'on', 'off'],
  default: 'auto',
  scope: 'window',
};
const SIMULATOR_AGENT_COUNT: IntegerSpec = {
  key: 'simulatorAgentCount',
  kind: 'integer',
  default: 3,
  minimum: 1,
  maximum: 16,
  scope: 'window',
};
const PROJECT_SCOPE: EnumSpec<ProjectScope> = {
  key: 'projectScope',
  kind: 'enum',
  values: ['workspace', 'all'],
  default: 'workspace',
  scope: 'machine',
};
const TRANSCRIPT_PATH: StringSpec = {
  key: 'transcriptPath',
  kind: 'string',
  default: '',
  scope: 'machine',
};
const IDLE_TIMEOUT_SECONDS: IntegerSpec = {
  key: 'idleTimeoutSeconds',
  kind: 'integer',
  default: 60,
  minimum: 5,
  maximum: 3600,
  scope: 'window',
};
const TOOL_TIMEOUT_SECONDS: IntegerSpec = {
  key: 'toolTimeoutSeconds',
  kind: 'integer',
  default: 300,
  minimum: 30,
  maximum: 86_400,
  scope: 'window',
};
const SESSION_END_TIMEOUT_MINUTES: IntegerSpec = {
  key: 'sessionEndTimeoutMinutes',
  kind: 'integer',
  default: 30,
  minimum: 1,
  maximum: 1440,
  scope: 'window',
};
const DEBOUNCE_MS: IntegerSpec = {
  key: 'debounceMs',
  kind: 'integer',
  default: 750,
  minimum: 0,
  maximum: 10_000,
  scope: 'window',
};
const POLL_INTERVAL_MS: IntegerSpec = {
  key: 'pollIntervalMs',
  kind: 'integer',
  default: 1000,
  minimum: 250,
  maximum: 10_000,
  scope: 'window',
};

/** The nine settings of agent-detection.md section 6, keys without the section prefix. */
export const MONITOR_SETTINGS: readonly SettingSpec[] = Object.freeze([
  SIMULATOR,
  SIMULATOR_AGENT_COUNT,
  PROJECT_SCOPE,
  TRANSCRIPT_PATH,
  IDLE_TIMEOUT_SECONDS,
  TOOL_TIMEOUT_SECONDS,
  SESSION_END_TIMEOUT_MINUTES,
  DEBOUNCE_MS,
  POLL_INTERVAL_MS,
]);

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = Object.freeze({
  simulator: SIMULATOR.default,
  simulatorAgentCount: SIMULATOR_AGENT_COUNT.default,
  projectScope: PROJECT_SCOPE.default,
  transcriptPath: TRANSCRIPT_PATH.default,
  idleTimeoutMs: IDLE_TIMEOUT_SECONDS.default * SECOND_MS,
  toolTimeoutMs: TOOL_TIMEOUT_SECONDS.default * SECOND_MS,
  sessionEndTimeoutMs: SESSION_END_TIMEOUT_MINUTES.default * MINUTE_MS,
  debounceMs: DEBOUNCE_MS.default,
  pollIntervalMs: POLL_INTERVAL_MS.default,
});

function readInteger(spec: IntegerSpec, raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return spec.default;
  }
  return Math.min(spec.maximum, Math.max(spec.minimum, Math.round(raw)));
}

function readString(spec: StringSpec, raw: unknown): string {
  return typeof raw === 'string' ? raw : spec.default;
}

function readEnum<T extends string>(spec: EnumSpec<T>, raw: unknown): T {
  if (typeof raw !== 'string') {
    return spec.default;
  }
  const match = spec.values.find((value) => value === raw);
  return match ?? spec.default;
}

/** Reads one key; a throwing getter counts as unset. */
function safeGet(get: (key: string) => unknown, key: string): unknown {
  try {
    return get(key);
  } catch {
    return undefined;
  }
}

/**
 * Total: wrong type, NaN, or infinity gives the default; integers are rounded and clamped;
 * enforces toolTimeout >= idleTimeout and sessionEndTimeout >= toolTimeout (by raising the
 * later value).
 */
export function readMonitorConfig(get: (key: string) => unknown): MonitorConfig {
  const idleTimeoutMs =
    readInteger(IDLE_TIMEOUT_SECONDS, safeGet(get, IDLE_TIMEOUT_SECONDS.key)) * SECOND_MS;
  const toolTimeoutMs = Math.max(
    idleTimeoutMs,
    readInteger(TOOL_TIMEOUT_SECONDS, safeGet(get, TOOL_TIMEOUT_SECONDS.key)) * SECOND_MS,
  );
  const sessionEndTimeoutMs = Math.max(
    toolTimeoutMs,
    readInteger(SESSION_END_TIMEOUT_MINUTES, safeGet(get, SESSION_END_TIMEOUT_MINUTES.key)) *
      MINUTE_MS,
  );
  return Object.freeze({
    simulator: readEnum(SIMULATOR, safeGet(get, SIMULATOR.key)),
    simulatorAgentCount: readInteger(
      SIMULATOR_AGENT_COUNT,
      safeGet(get, SIMULATOR_AGENT_COUNT.key),
    ),
    projectScope: readEnum(PROJECT_SCOPE, safeGet(get, PROJECT_SCOPE.key)),
    transcriptPath: readString(TRANSCRIPT_PATH, safeGet(get, TRANSCRIPT_PATH.key)),
    idleTimeoutMs,
    toolTimeoutMs,
    sessionEndTimeoutMs,
    debounceMs: readInteger(DEBOUNCE_MS, safeGet(get, DEBOUNCE_MS.key)),
    pollIntervalMs: readInteger(POLL_INTERVAL_MS, safeGet(get, POLL_INTERVAL_MS.key)),
  });
}
