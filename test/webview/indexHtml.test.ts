// Unit tests for the pure webview HTML and CSP builder (M1 plan sections 3.2 and 7.1).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { buildCsp, buildWebviewHtml } from '../../src/webview/index.html';

const NONCE = 'AbCdEfGhIjKlMnOpQrStUv==';
const OTHER_NONCE = 'ZyXwVuTsRqPoNmLkJiHgFe==';
const SCRIPT_URI = 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview.js';

function html(nonce = NONCE, scriptUri = SCRIPT_URI): string {
  return buildWebviewHtml({ nonce, scriptUri });
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Every opening tag in the document, e.g. `<script nonce="..." src="...">`. */
function openingTags(doc: string): string[] {
  return doc.match(/<[a-zA-Z][^>]*>/g) ?? [];
}

const VALID_NONCES: readonly [string, string][] = [
  ['16 random bytes from randomBytes, padded', randomBytes(16).toString('base64')],
  ['32 random bytes from randomBytes', randomBytes(32).toString('base64')],
  ['22 characters with no padding', 'abcdefghijklmnopqrstuv'],
  ['22 characters with + and /', 'ab+/efghijklmnopqrst+/'],
];

const INVALID_NONCES: readonly [string, string][] = [
  ['empty', ''],
  ['too short (21 characters)', 'abcdefghijklmnopqrstu'],
  ['too short with padding', 'abcdefghijklmnopqrst=='],
  ['containing a single quote', "abcdefghijk'mnopqrstuvwx"],
  ['containing a double quote', 'abcdefghijk"mnopqrstuvwx'],
  ['containing a semicolon', 'abcdefghijk;mnopqrstuvwx'],
  ['containing a space', 'abcdefghijk mnopqrstuvwx'],
  ['containing a newline', 'abcdefghijk\nmnopqrstuvwx'],
  ['containing angle brackets', 'abcdefghijk<mnopqrstuvwx>'],
  ['base64url alphabet (- and _)', 'abcdefghijk-mnopqrstu_wx'],
  ['three padding characters', 'abcdefghijklmnopqrstuv==='],
  ['padding in the middle', 'abcdefghijk==mnopqrstuvwx'],
  ['injecting a CSP source', "abc' 'unsafe-inline' 'nonce-abcdefghijklmnopqrstuv"],
];

void describe('buildCsp', () => {
  void it('returns exactly the planned policy for a nonce', () => {
    assert.equal(
      buildCsp(NONCE),
      `default-src 'none'; script-src 'nonce-${NONCE}'; style-src 'nonce-${NONCE}'; base-uri 'none'; form-action 'none';`,
    );
  });

  void it('lists exactly default-src, script-src, style-src, base-uri, form-action', () => {
    const directives = buildCsp(NONCE)
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => part.split(/\s+/)[0]);
    assert.deepEqual(directives, [
      'default-src',
      'script-src',
      'style-src',
      'base-uri',
      'form-action',
    ]);
  });

  void it('contains no unsafe keyword, wildcard, or scheme source', () => {
    const csp = buildCsp(NONCE);
    for (const forbidden of [
      'unsafe-inline',
      'unsafe-eval',
      'unsafe-hashes',
      'strict-dynamic',
      '*',
      'http:',
      'https:',
      'data:',
      'blob:',
      'filesystem:',
      'ws:',
      'wss:',
    ]) {
      assert.ok(!csp.includes(forbidden), `CSP must not contain ${forbidden}: ${csp}`);
    }
  });

  void it('grants no image, media, font, connect, worker, frame, or object sources', () => {
    const csp = buildCsp(NONCE);
    for (const directive of [
      'img-src',
      'media-src',
      'font-src',
      'connect-src',
      'worker-src',
      'frame-src',
      'child-src',
      'object-src',
      'manifest-src',
    ]) {
      assert.ok(!csp.includes(directive), `CSP must not contain ${directive}: ${csp}`);
    }
  });

  void it('is pure: the same nonce gives the same policy', () => {
    assert.equal(buildCsp(NONCE), buildCsp(NONCE));
  });

  for (const [label, nonce] of VALID_NONCES) {
    void it(`accepts a valid nonce: ${label}`, () => {
      assert.ok(buildCsp(nonce).includes(`'nonce-${nonce}'`));
    });
  }

  for (const [label, nonce] of INVALID_NONCES) {
    void it(`throws RangeError for an invalid nonce: ${label}`, () => {
      assert.throws(() => buildCsp(nonce), RangeError);
    });
  }
});

void describe('buildWebviewHtml', () => {
  void it('emits the document skeleton in the planned order', () => {
    const doc = html();
    assert.ok(doc.startsWith('<!DOCTYPE html>'), 'document must start with the doctype');
    const order = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<meta charset="UTF-8">',
      '<meta http-equiv="Content-Security-Policy"',
      '<meta name="viewport"',
      '<title>Pixel Agents</title>',
      '<style nonce=',
      '</head>',
      '<body>',
      '<canvas',
      '<script',
      '</body>',
      '</html>',
    ];
    let previous = -1;
    for (const marker of order) {
      const index = doc.indexOf(marker);
      assert.ok(index > previous, `"${marker}" must appear after the previous marker`);
      previous = index;
    }
  });

  void it('has exactly one CSP meta tag whose content is buildCsp(nonce)', () => {
    const doc = html();
    assert.equal(countOf(doc, 'http-equiv="Content-Security-Policy"'), 1);
    assert.ok(
      doc.includes(`<meta http-equiv="Content-Security-Policy" content="${buildCsp(NONCE)}">`),
    );
  });

  void it('has exactly one script tag carrying the nonce and the script URI, with no inline body', () => {
    const doc = html();
    const scripts = [...doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.equal(countOf(doc, '<script'), 1);
    const [, attributes, body] = scripts[0] ?? [];
    assert.ok(attributes?.includes(`nonce="${NONCE}"`), 'script must carry the nonce');
    assert.ok(attributes?.includes(`src="${SCRIPT_URI}"`), 'script must load the script URI');
    assert.equal(body, '', 'script must have no inline body');
  });

  void it('has exactly one style block, and it carries the nonce', () => {
    const doc = html();
    assert.equal(countOf(doc, '<style'), 1);
    assert.ok(doc.includes(`<style nonce="${NONCE}">`));
  });

  void it('styles the page with the panel background and a pixelated canvas', () => {
    const doc = html();
    assert.ok(doc.includes('background: var(--vscode-panel-background)'));
    assert.ok(doc.includes('image-rendering: pixelated'));
  });

  void it('has exactly one accessible canvas', () => {
    const doc = html();
    assert.equal(countOf(doc, '<canvas'), 1);
    assert.ok(doc.includes('<canvas aria-label="Pixel Agents scene" role="img"></canvas>'));
  });

  void it('has no inline event handlers and no style attributes', () => {
    for (const tag of openingTags(html())) {
      assert.ok(!/\son[a-z]+\s*=/i.test(tag), `inline event handler in ${tag}`);
      assert.ok(!/\sstyle\s*=/i.test(tag), `style attribute in ${tag}`);
    }
  });

  void it('references no external resource other than the script', () => {
    const doc = html();
    assert.equal(countOf(doc, 'src='), 1, 'only the script tag may have src');
    assert.ok(!/\shref\s*=/i.test(doc), 'no href attributes');
    assert.ok(!/<(link|img|iframe|object|embed|audio|video|source|base|form)\b/i.test(doc));
    assert.ok(!/url\(/i.test(doc), 'no url() in styles');
    assert.ok(!doc.includes('http://'), 'no http:// reference');
    assert.equal(countOf(doc, 'https://'), 1, 'the only https:// reference is the script URI');
  });

  void it('places the nonce only in the CSP, the script tag, and the style tag', () => {
    const doc = html();
    // Twice in the CSP (script-src, style-src), once on <script>, once on <style>.
    assert.equal(countOf(doc, NONCE), 4);
    assert.equal(countOf(buildCsp(NONCE), NONCE), 2);
    const withoutKnownPlaces = doc
      .replace(buildCsp(NONCE), '')
      .replace(`<style nonce="${NONCE}">`, '')
      .replace(`<script nonce="${NONCE}"`, '');
    assert.ok(!withoutKnownPlaces.includes(NONCE));
  });

  void it('gives two different documents for two different nonces', () => {
    const first = html(NONCE);
    const second = html(OTHER_NONCE);
    assert.notEqual(first, second);
    assert.ok(!second.includes(NONCE));
    assert.equal(second, first.split(NONCE).join(OTHER_NONCE));
  });

  void it('is pure: the same input gives the same document', () => {
    assert.equal(html(), html());
  });

  void it('HTML-attribute-escapes the script URI', () => {
    const doc = html(NONCE, `https://x.test/a"b<c>d&e'f.js`);
    assert.ok(doc.includes('src="https://x.test/a&quot;b&lt;c&gt;d&amp;e&#39;f.js"'));
    assert.ok(!doc.includes('a"b'), 'raw double quote must not reach the attribute');
    assert.ok(!doc.includes('b<c'), 'raw angle bracket must not reach the attribute');
    assert.equal(countOf(doc, '<script'), 1, 'escaping must prevent tag injection');
  });

  void it('cannot be broken out of with a script URI that closes the tag', () => {
    const doc = html(NONCE, '"></script><script>alert(1)</script><script src="');
    assert.equal(countOf(doc, '<script'), 1);
    assert.equal(countOf(doc, '</script>'), 1);
  });

  void it('throws RangeError for an empty script URI', () => {
    assert.throws(() => html(NONCE, ''), RangeError);
  });

  for (const [label, nonce] of INVALID_NONCES) {
    void it(`throws RangeError for an invalid nonce: ${label}`, () => {
      assert.throws(() => html(nonce), RangeError);
    });
  }
});
