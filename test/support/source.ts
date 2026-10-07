// Helpers for structural tests that scan TypeScript source as text. Comment stripping lets a
// rule like "postMessage appears only in hostChannel.ts" ignore prose that mentions the API.
import { listFiles, readText } from './repo';

/**
 * Removes block and line comments. Assumption: good enough for this repo's source, where `//`
 * inside a string literal only occurs in URLs, which are kept because a `//` preceded by `:` is
 * not treated as a comment start.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Source of a repo file with comments removed. */
export function code(relative: string): string {
  return stripComments(readText(relative));
}

/** Every `.ts` file under src/, POSIX paths relative to the repo root. */
export function srcFiles(): string[] {
  return listFiles('src').filter((file) => file.endsWith('.ts'));
}

/** Files (from `files`) whose comment-free source matches `pattern`. */
export function filesMatching(files: readonly string[], pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(code(file)));
}

/** Every module specifier imported or re-exported by a source file (static, dynamic, require). */
export function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"`]([^'"`]+)['"`]/g,
    /\bimport\s*['"`]([^'"`]+)['"`]/g,
    /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1] ?? '');
    }
  }
  return specifiers;
}

/**
 * The body (from the opening `{` to its matching `}`) of the block that starts at `openIndex`.
 * Assumption: braces inside string literals are balanced in this repo's switch bodies.
 */
export function blockAt(source: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, i + 1);
      }
    }
  }
  throw new Error(`unbalanced block at index ${openIndex}`);
}
