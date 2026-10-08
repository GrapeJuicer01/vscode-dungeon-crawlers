// Agent and tool name normalization to the protocol limits (M3 plan section 3.5). The protocol's
// toAgentInfo does not repair, so the monitor produces names that always pass its rules.
// Names never come from transcript or terminal text (decision H-5): only a folder or project
// directory label plus a short id.
import { MAX_AGENT_NAME_LENGTH, MAX_TOOL_NAME_LENGTH, TOOL_NAME_PATTERN } from '../shared/protocol';

const SHORT_ID_LENGTH = 4;
const FALLBACK_LABEL = 'Agent';

/** The name if it is a string, 1..MAX_TOOL_NAME_LENGTH long, matching TOOL_NAME_PATTERN; else null. No repair. */
export function normalizeToolName(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > MAX_TOOL_NAME_LENGTH) {
    return null;
  }
  return TOOL_NAME_PATTERN.test(raw) ? raw : null;
}

/** Same set as the protocol's name rule: C0, DEL and C1, bidi embeddings and overrides, isolates. */
function isForbiddenNameCode(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function sanitizeLabel(label: string): string {
  let out = '';
  for (let i = 0; i < label.length; i += 1) {
    const code = label.charCodeAt(i);
    out += isForbiddenNameCode(code) ? ' ' : label.charAt(i);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Shortens to at most `max` UTF-16 units without leaving a lone high surrogate at the end. */
function shorten(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  let cut = text.slice(0, Math.max(0, max));
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    cut = cut.slice(0, -1);
  }
  return cut.trimEnd();
}

/**
 * `${label} ${first 4 chars of id}`: forbidden name characters become spaces, whitespace
 * collapsed and trimmed, label shortened (never splitting a surrogate pair) so the result fits
 * MAX_AGENT_NAME_LENGTH; blank label gives `Agent ${shortId}`. Always passes the protocol name
 * rule (agent ids are already restricted to [A-Za-z0-9._:-]).
 */
export function buildAgentName(label: string, agentId: string): string {
  const shortId = sanitizeLabel(agentId.slice(0, SHORT_ID_LENGTH)).replace(/ /g, '');
  const suffix = shortId.length > 0 ? ' ' + shortId : '';
  const room = MAX_AGENT_NAME_LENGTH - suffix.length;
  let base = shorten(sanitizeLabel(label), room);
  if (base.length === 0) {
    base = FALLBACK_LABEL;
  }
  return base + suffix;
}
