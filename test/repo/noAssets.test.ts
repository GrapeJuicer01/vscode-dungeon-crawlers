// Core invariant 5: no image, audio, or font files anywhere in the repo; sprites are procedural
// and audio is Web Audio. Also rejects embedded binary assets in source (data: URIs).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listFiles, readText } from '../support/repo';

const ASSET_EXTENSIONS = [
  '.png',
  '.gif',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.ico',
  '.svg',
  '.wav',
  '.mp3',
  '.ogg',
  '.flac',
  '.m4a',
  '.aac',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
];

void describe('no image, audio, or font assets (invariant 5)', () => {
  void it('walks a non-trivial file list, including dot-directories', () => {
    const files = listFiles();
    assert.ok(files.includes('package.json'), 'walk must start at the repo root');
    assert.ok(files.includes('.github/workflows/ci.yml'), 'walk must include .github/');
    assert.ok(!files.some((file) => file.startsWith('node_modules/')), 'node_modules is skipped');
  });

  void it('finds no file with an asset extension (case-insensitive)', () => {
    const offenders = listFiles().filter((file) => {
      const lower = file.toLowerCase();
      return ASSET_EXTENSIONS.some((extension) => lower.endsWith(extension));
    });
    assert.deepEqual(offenders, []);
  });

  void it('embeds no image, audio, or font data URI in src/', () => {
    const offenders = listFiles('src').filter((file) =>
      /data:(image|audio|font|video)\//i.test(readText(file)),
    );
    assert.deepEqual(offenders, []);
  });

  void it('loads no asset file by name from src/', () => {
    const pattern = new RegExp(
      `['"\`][^'"\`]*(${ASSET_EXTENSIONS.map((e) => e.replace('.', '\\.')).join('|')})['"\`]`,
      'i',
    );
    const offenders = listFiles('src').filter((file) => pattern.test(readText(file)));
    assert.deepEqual(offenders, []);
  });
});
