// Builds the Pixel Agents webview HTML and its Content-Security-Policy.
// Host bundle, pure: imports nothing (no vscode, no node:*, no DOM). See the M1 plan section 3.2
// and docs/architecture/overview.md section 6 (security boundary).

export interface WebviewHtmlInput {
  /** base64 of at least 16 random bytes; must match /^[A-Za-z0-9+/]{22,}={0,2}$/ */
  readonly nonce: string;
  /** result of webview.asWebviewUri(...).toString(); non-empty */
  readonly scriptUri: string;
}

/** 16 bytes of base64 is 22 significant characters plus up to two `=` padding characters. */
const NONCE_PATTERN = /^[A-Za-z0-9+/]{22,}={0,2}$/;

function assertValidNonce(nonce: string): void {
  if (!NONCE_PATTERN.test(nonce)) {
    throw new RangeError('Invalid CSP nonce: expected base64 of at least 16 bytes.');
  }
}

/** Escapes a value for use inside a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns the Content-Security-Policy value for one HTML load. Pure.
 * `base-uri` and `form-action` are listed because they do not fall back to `default-src`.
 */
export function buildCsp(nonce: string): string {
  assertValidNonce(nonce);
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';`;
}

/** Returns the full HTML document. Pure; throws RangeError on an invalid nonce or empty scriptUri. */
export function buildWebviewHtml(input: WebviewHtmlInput): string {
  const { nonce, scriptUri } = input;
  assertValidNonce(nonce);
  if (scriptUri.length === 0) {
    throw new RangeError('Invalid script URI: expected a non-empty string.');
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${buildCsp(nonce)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Pixel Agents</title>',
    `<style nonce="${nonce}">`,
    'html, body {',
    '  margin: 0;',
    '  padding: 0;',
    '  width: 100%;',
    '  height: 100%;',
    '  overflow: hidden;',
    '}',
    'body {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  background: var(--vscode-panel-background);',
    '}',
    'canvas {',
    '  display: block;',
    '  image-rendering: pixelated;',
    '}',
    '</style>',
    '</head>',
    '<body>',
    '<canvas aria-label="Pixel Agents scene" role="img"></canvas>',
    `<script nonce="${nonce}" src="${escapeAttribute(scriptUri)}"></script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
