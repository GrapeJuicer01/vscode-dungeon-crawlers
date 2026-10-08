// Node implementation of the read-only file-system port (agent-detection.md section 2, ADR 0005).
//
// Core invariant 3: imports only the read functions open, lstat, readdir, realpath, the flag
// constants, and homedir. Files are opened with READ_FLAGS only (read-only, no symlink following
// where the platform supports it), checked with fstat against the identity seen by lstat, read,
// and closed before the call settles, so no handle is ever held between polls.
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { DirEntry, EntryKind, EntryStat, FileIdentity, ReadOnlyFileSystem } from '../ports';

/** O_RDONLY, plus O_NOFOLLOW where defined (not on Windows; containment then relies on lstat and realpath). */
const READ_FLAGS: number = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

interface KindSource {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

function kindOf(entry: KindSource): EntryKind {
  if (entry.isSymbolicLink()) {
    return 'symlink';
  }
  if (entry.isFile()) {
    return 'file';
  }
  if (entry.isDirectory()) {
    return 'directory';
  }
  return 'other';
}

/** Rejection for a file whose fstat identity differs from lstat (rotated or swapped). */
class IdentityError extends Error {
  readonly code = 'EIDENTITY';

  constructor() {
    super('file identity changed');
    this.name = 'IdentityError';
  }
}

function differs(expected: number, actual: number): boolean {
  return expected !== 0 && actual !== 0 && expected !== actual;
}

export function createNodeFileSystem(): ReadOnlyFileSystem {
  return {
    homedir(): string {
      return homedir();
    },

    async realpath(target: string): Promise<string> {
      return realpath(target);
    },

    async lstat(target: string): Promise<EntryStat> {
      const stats = await lstat(target);
      return {
        kind: kindOf(stats),
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        ino: stats.ino,
        dev: stats.dev,
      };
    },

    async readdir(directory: string): Promise<readonly DirEntry[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, kind: kindOf(entry) }));
    },

    async readRange(
      file: string,
      position: number,
      length: number,
      expected: FileIdentity,
    ): Promise<Uint8Array> {
      const handle = await open(file, READ_FLAGS);
      try {
        const stats = await handle.stat();
        if (
          !stats.isFile() ||
          differs(expected.ino, stats.ino) ||
          differs(expected.dev, stats.dev)
        ) {
          throw new IdentityError();
        }
        if (length <= 0) {
          return new Uint8Array(0);
        }
        // Zeroed (never allocUnsafe), so no stale memory can appear past bytesRead.
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, position);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },
  };
}
