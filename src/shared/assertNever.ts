// Exhaustiveness guard shared by both bundles (coding-standards.md section 2). The only
// definition in the repo; import it, never redefine it locally.

/**
 * Exhaustiveness guard for switches over discriminated unions. Throws
 * TypeError('Unexpected variant'); never includes the value in the message, because the value
 * may be untrusted input.
 */
export function assertNever(_value: never): never {
  throw new TypeError('Unexpected variant');
}
