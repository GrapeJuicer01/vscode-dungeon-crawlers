// The only code that looks inside a transcript record (agent-detection.md section 3.1.1,
// Core invariant 7). It reads at most `type`, `message.content[i].type`,
// `message.content[i].name`, and `message.stop_reason`, and returns a new object with exactly
// `kind` and `toolName`. The parsed value never escapes this module, and a JSON.parse error is
// discarded unread (its text quotes the input). Properties are read with bracket access on own
// properties only, so an inherited or `__proto__` key is never trusted.
import { normalizeToolName } from './agentNames';

/** Bound on the content blocks scanned in one record (agent-detection.md section 9). */
export const MAX_CONTENT_BLOCKS = 256;

export type TranscriptSignalKind =
  'prompt' | 'assistant' | 'toolUse' | 'toolResult' | 'turnEnd' | 'ignored' | 'unparseable';

export interface TranscriptSignal {
  readonly kind: TranscriptSignalKind;
  readonly toolName: string | null;
}

type JsonRecord = Readonly<Record<string, unknown>>;

function isPlainRecord(value: unknown): value is JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function own(record: JsonRecord, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function signal(kind: TranscriptSignalKind, toolName: string | null = null): TranscriptSignal {
  return { kind, toolName };
}

/** Content blocks of `record['message']['content']`, at most MAX_CONTENT_BLOCKS, or []. */
function contentBlocks(record: JsonRecord): readonly unknown[] {
  const body = own(record, 'message');
  if (!isPlainRecord(body)) {
    return [];
  }
  const content = own(body, 'content');
  return Array.isArray(content) ? (content as readonly unknown[]).slice(0, MAX_CONTENT_BLOCKS) : [];
}

function blockType(block: unknown): unknown {
  return isPlainRecord(block) ? own(block, 'type') : undefined;
}

function classifyAssistant(record: JsonRecord): TranscriptSignal {
  let sawToolUse = false;
  let toolName: string | null = null;
  for (const block of contentBlocks(record)) {
    if (isPlainRecord(block) && own(block, 'type') === 'tool_use') {
      // The last tool_use block wins, including its (possibly invalid, hence null) name.
      sawToolUse = true;
      toolName = normalizeToolName(own(block, 'name'));
    }
  }
  if (sawToolUse) {
    return signal('toolUse', toolName);
  }
  const body = own(record, 'message');
  if (isPlainRecord(body) && own(body, 'stop_reason') === 'end_turn') {
    return signal('turnEnd');
  }
  return signal('assistant');
}

function classifyUser(record: JsonRecord): TranscriptSignal {
  for (const block of contentBlocks(record)) {
    if (blockType(block) === 'tool_result') {
      return signal('toolResult');
    }
  }
  return signal('prompt');
}

/** The only code that looks inside a record. Never throws. The parsed value never escapes; the JSON.parse error is discarded unread. */
export function classifyTranscriptLine(line: string): TranscriptSignal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return signal('unparseable');
  }
  try {
    if (!isPlainRecord(parsed)) {
      return signal('ignored');
    }
    const type = own(parsed, 'type');
    if (type === 'assistant') {
      return classifyAssistant(parsed);
    }
    if (type === 'user') {
      return classifyUser(parsed);
    }
    return signal('ignored');
  } catch {
    return signal('ignored');
  }
}
