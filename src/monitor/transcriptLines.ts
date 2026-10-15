// Splits a byte buffer from a transcript into complete lines (agent-detection.md section 3.1,
// polling step 4). A trailing partial line is never consumed, so the caller re-reads it on the
// next poll and no transcript text survives between polls. Lines are bounded by maxLineBytes.

export const MAX_LINE_BYTES = 256 * 1024;

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

export interface LineScan {
  /** Complete lines (without '\n' or a trailing '\r'), decoded as UTF-8, each at most maxLineBytes. */
  readonly lines: readonly string[];
  /** Bytes the caller may advance its offset by. Never includes a trailing partial line unless skipRemainder. */
  readonly consumedBytes: number;
  /** Complete lines dropped for exceeding maxLineBytes. */
  readonly oversizedLines: number;
  /** The trailing partial line already exceeds maxLineBytes: consume everything and skip to the next newline. */
  readonly skipRemainder: boolean;
}

const decoder = new TextDecoder('utf-8');

/**
 * skipLeadingPartial drops bytes up to and including the first '\n' (tail reads, skip mode).
 * If there is no '\n' at all in that mode, everything is consumed and skipRemainder is true
 * (the caller is still inside the line it is skipping).
 * Line length is measured without the '\n' and without a trailing '\r'.
 */
export function scanLines(
  bytes: Uint8Array,
  skipLeadingPartial: boolean,
  maxLineBytes: number,
): LineScan {
  let position = 0;
  if (skipLeadingPartial) {
    const first = bytes.indexOf(NEWLINE);
    if (first < 0) {
      return { lines: [], consumedBytes: bytes.length, oversizedLines: 0, skipRemainder: true };
    }
    position = first + 1;
  }
  const lines: string[] = [];
  let oversizedLines = 0;
  while (position < bytes.length) {
    const newline = bytes.indexOf(NEWLINE, position);
    if (newline < 0) {
      break;
    }
    let end = newline;
    if (end > position && bytes[end - 1] === CARRIAGE_RETURN) {
      end -= 1;
    }
    if (end - position > maxLineBytes) {
      oversizedLines += 1;
    } else {
      lines.push(decoder.decode(bytes.subarray(position, end)));
    }
    position = newline + 1;
  }
  const remainder = bytes.length - position;
  if (remainder > maxLineBytes) {
    return { lines, consumedBytes: bytes.length, oversizedLines, skipRemainder: true };
  }
  return { lines, consumedBytes: position, oversizedLines, skipRemainder: false };
}
