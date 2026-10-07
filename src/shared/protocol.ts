// Host <-> webview protocol, shared by both bundles (ADR 0007).
//
// This file is two allow-lists at once:
//   - the privacy allow-list (Core invariant 7): AgentInfo carries exactly id, name, state,
//     toolName, and timestamp, and nothing else ever crosses the wire about a session;
//   - the complete list of webview-to-host messages (Core invariant 3): `ready` and `focusAgent`
//     (reveal only). No message may stop, write to, signal, or send input to a session.
// Any change here needs an architect plan and a matching update to
// docs/architecture/host-webview-protocol.md in the same change.
//
// Validators and creators are total: they never throw and never mutate or return their input.
// Imports nothing (src/shared/ boundary, coding-standards.md section 3).

export const PROTOCOL_VERSION = 1;

export const AGENT_STATES = ['spawned', 'working', 'idle', 'despawned'] as const;
export type AgentState = (typeof AGENT_STATES)[number];

/** Privacy allow-list (Core invariant 7). Exactly these keys, in this order. */
export const AGENT_INFO_KEYS = ['id', 'name', 'state', 'toolName', 'timestamp'] as const;

export interface AgentInfo {
  /** Session id. Matches AGENT_ID_PATTERN. */
  readonly id: string;
  /** Display name. 1..MAX_AGENT_NAME_LENGTH UTF-16 units, not blank, no control or bidi-override characters. */
  readonly name: string;
  readonly state: AgentState;
  /** Current or last tool name, or null when none. Matches TOOL_NAME_PATTERN. */
  readonly toolName: string | null;
  /** Epoch milliseconds of the last state change. Safe integer, >= 0. */
  readonly timestamp: number;
}

export const MAX_AGENT_ID_LENGTH = 128;
export const MAX_AGENT_NAME_LENGTH = 64;
export const MAX_TOOL_NAME_LENGTH = 128;
/** Upper bound on agents in one snapshot. Assumption: a protocol safety bound, not a user threshold. */
export const MAX_AGENTS = 64;
/** 1..128 characters; starts alphanumeric; then alphanumerics and `._:-`. No spaces. */
export const AGENT_ID_PATTERN: RegExp = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** 1..128 characters; fits `Bash`, `Read`, `mcp__server__tool`. No spaces, so free text cannot ride in it. */
export const TOOL_NAME_PATTERN: RegExp = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;

/** Webview-relevant configuration. M2 carries only the protocol version; M7 and M8 add fields. */
export interface ConfigSnapshot {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
}

// ---- Host to webview ----

export interface ConfigMessage {
  readonly type: 'config';
  readonly config: ConfigSnapshot;
}

export interface AgentListMessage {
  readonly type: 'agentList';
  readonly agents: readonly AgentInfo[];
}

export interface AgentStateMessage {
  readonly type: 'agentState';
  readonly agent: AgentInfo;
}

export type HostToWebviewMessage = ConfigMessage | AgentListMessage | AgentStateMessage;

// ---- Webview to host ----

export interface ReadyMessage {
  readonly type: 'ready';
}

/** Reveal-only. Never stops, writes to, or sends input to a session. */
export interface FocusAgentMessage {
  readonly type: 'focusAgent';
  readonly agentId: string;
}

export type WebviewToHostMessage = ReadyMessage | FocusAgentMessage;

export const HOST_TO_WEBVIEW_TYPES = ['config', 'agentList', 'agentState'] as const;
export const WEBVIEW_TO_HOST_TYPES = ['ready', 'focusAgent'] as const;

// ---- Compile-time proofs (exported so noUnusedLocals does not flag them) ----

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertTrue<T extends true> = T;
export type HostTypesComplete = AssertTrue<
  Exact<HostToWebviewMessage['type'], (typeof HOST_TO_WEBVIEW_TYPES)[number]>
>;
export type WebviewTypesComplete = AssertTrue<
  Exact<WebviewToHostMessage['type'], (typeof WEBVIEW_TO_HOST_TYPES)[number]>
>;
export type AgentInfoKeysComplete = AssertTrue<
  Exact<keyof AgentInfo, (typeof AGENT_INFO_KEYS)[number]>
>;

// ---- Private helpers ----

const READY_KEYS = ['type'] as const;
const FOCUS_AGENT_KEYS = ['type', 'agentId'] as const;
const CONFIG_MESSAGE_KEYS = ['type', 'config'] as const;
const CONFIG_SNAPSHOT_KEYS = ['protocolVersion'] as const;
const AGENT_LIST_KEYS = ['type', 'agents'] as const;
const AGENT_STATE_KEYS = ['type', 'agent'] as const;

/** Plain object: not null, not an array, prototype Object.prototype or null. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * True when the object's own string keys are exactly `keys` (as a set) and it has no symbol
 * keys. Uses getOwnPropertyNames, so a non-enumerable extra key is rejected too.
 */
function hasExactKeys(obj: object, keys: readonly string[]): boolean {
  if (Object.getOwnPropertySymbols(obj).length !== 0) {
    return false;
  }
  const own = Object.getOwnPropertyNames(obj);
  if (own.length !== keys.length) {
    return false;
  }
  for (const key of own) {
    if (!keys.includes(key)) {
      return false;
    }
  }
  return true;
}

/** typeof and length only; callers run any regex after this, so oversized strings stay cheap. */
function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

/** C0 controls, DEL and C1 controls, bidi embedding/override (U+202A..U+202E), isolates (U+2066..U+2069). */
function isForbiddenNameCode(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function isAgentName(value: unknown): value is string {
  if (!isBoundedString(value, 1, MAX_AGENT_NAME_LENGTH) || value.trim().length === 0) {
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    if (isForbiddenNameCode(value.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

function isToolName(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  return isBoundedString(value, 1, MAX_TOOL_NAME_LENGTH) && TOOL_NAME_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Reads `type` only if it is an own property, so an inherited `type` is never trusted. */
function ownType(obj: Record<string, unknown>): unknown {
  return Object.prototype.hasOwnProperty.call(obj, 'type') ? obj['type'] : undefined;
}

// ---- Guards and validators ----

export function isAgentState(value: unknown): value is AgentState {
  return typeof value === 'string' && (AGENT_STATES as readonly string[]).includes(value);
}

export function isAgentId(value: unknown): value is string {
  return isBoundedString(value, 1, MAX_AGENT_ID_LENGTH) && AGENT_ID_PATTERN.test(value);
}

export function isAgentInfo(value: unknown): value is AgentInfo {
  try {
    if (!isPlainObject(value) || !hasExactKeys(value, AGENT_INFO_KEYS)) {
      return false;
    }
    return (
      isAgentId(value['id']) &&
      isAgentName(value['name']) &&
      isAgentState(value['state']) &&
      isToolName(value['toolName']) &&
      isTimestamp(value['timestamp'])
    );
  } catch {
    // Throwing getters or Proxy traps (only reachable from tests; structured-cloned data has none).
    return false;
  }
}

/** Validates one webview-to-host message. Returns a new object, or undefined if invalid. */
export function parseWebviewMessage(raw: unknown): WebviewToHostMessage | undefined {
  try {
    if (!isPlainObject(raw)) {
      return undefined;
    }
    const type = ownType(raw);
    if (typeof type !== 'string') {
      return undefined;
    }
    // Raw string switch: exhaustiveness is proven by WebviewTypesComplete and the bridge switch.
    switch (type) {
      case 'ready':
        return hasExactKeys(raw, READY_KEYS) ? { type: 'ready' } : undefined;
      case 'focusAgent': {
        if (!hasExactKeys(raw, FOCUS_AGENT_KEYS)) {
          return undefined;
        }
        const agentId = raw['agentId'];
        return isAgentId(agentId) ? { type: 'focusAgent', agentId } : undefined;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/** Validates one host-to-webview message. Returns a new object, or undefined if invalid. */
export function parseHostMessage(raw: unknown): HostToWebviewMessage | undefined {
  try {
    if (!isPlainObject(raw)) {
      return undefined;
    }
    const type = ownType(raw);
    if (typeof type !== 'string') {
      return undefined;
    }
    // Raw string switch: exhaustiveness is proven by HostTypesComplete and the webview switch.
    switch (type) {
      case 'config':
        return hasExactKeys(raw, CONFIG_MESSAGE_KEYS) ? parseConfigMessage(raw) : undefined;
      case 'agentList':
        return hasExactKeys(raw, AGENT_LIST_KEYS) ? parseAgentListMessage(raw) : undefined;
      case 'agentState': {
        if (!hasExactKeys(raw, AGENT_STATE_KEYS)) {
          return undefined;
        }
        const agent = toAgentInfoFromUnknown(raw['agent']);
        return agent === undefined ? undefined : { type: 'agentState', agent };
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function parseConfigMessage(raw: Record<string, unknown>): ConfigMessage | undefined {
  const config = raw['config'];
  if (!isPlainObject(config) || !hasExactKeys(config, CONFIG_SNAPSHOT_KEYS)) {
    return undefined;
  }
  // A version mismatch (only possible mid-`watch`) makes the message invalid.
  return config['protocolVersion'] === PROTOCOL_VERSION
    ? { type: 'config', config: { protocolVersion: PROTOCOL_VERSION } }
    : undefined;
}

function parseAgentListMessage(raw: Record<string, unknown>): AgentListMessage | undefined {
  const list = raw['agents'];
  if (!Array.isArray(list) || list.length > MAX_AGENTS) {
    return undefined;
  }
  const entries: readonly unknown[] = list;
  const agents: AgentInfo[] = [];
  const seen = new Set<string>();
  // Index loop: a hole reads as undefined and fails validation.
  for (let i = 0; i < entries.length; i += 1) {
    const agent = toAgentInfoFromUnknown(entries[i]);
    if (agent === undefined || seen.has(agent.id)) {
      return undefined;
    }
    seen.add(agent.id);
    agents.push(agent);
  }
  return { type: 'agentList', agents };
}

function toAgentInfoFromUnknown(value: unknown): AgentInfo | undefined {
  return isAgentInfo(value) ? toAgentInfo(value) : undefined;
}

// ---- Creators: the only way the host builds outgoing messages ----

/**
 * Copies exactly the five allow-listed keys, in AGENT_INFO_KEYS order, into a new object.
 * Returns undefined if the copy is not a valid AgentInfo. Does not truncate or repair: the
 * monitor normalizes names and tool names to the protocol limits (M3).
 */
export function toAgentInfo(source: AgentInfo): AgentInfo | undefined {
  try {
    const copy: AgentInfo = {
      id: source.id,
      name: source.name,
      state: source.state,
      toolName: source.toolName,
      timestamp: source.timestamp,
    };
    return isAgentInfo(copy) ? copy : undefined;
  } catch {
    return undefined;
  }
}

export function createConfigMessage(config: ConfigSnapshot): ConfigMessage {
  return { type: 'config', config: { protocolVersion: config.protocolVersion } };
}

/** Skips invalid entries, keeps the first of duplicate ids, caps at MAX_AGENTS. */
export function createAgentListMessage(agents: readonly AgentInfo[]): AgentListMessage {
  const out: AgentInfo[] = [];
  const seen = new Set<string>();
  for (const source of agents) {
    if (out.length >= MAX_AGENTS) {
      break;
    }
    const agent = toAgentInfo(source);
    if (agent === undefined || seen.has(agent.id)) {
      continue;
    }
    seen.add(agent.id);
    out.push(agent);
  }
  return { type: 'agentList', agents: out };
}

export function createAgentStateMessage(agent: AgentInfo): AgentStateMessage | undefined {
  const copy = toAgentInfo(agent);
  return copy === undefined ? undefined : { type: 'agentState', agent: copy };
}
