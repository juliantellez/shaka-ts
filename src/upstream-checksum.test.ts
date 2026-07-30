import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checksumFiles } from './fetch.ts';

/**
 * The checksum machinery is small; the value that matters is that identical
 * trees hash the same and any change to a covered file changes the hash. The
 * recorded checksum itself is exercised end to end by `npm run verify:upstream`
 * against the real fetched release.
 */
function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'shaka-ts-checksum-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe('checksumFiles', () => {
  it('should be stable for identical content', () => {
    const a = tree({ 'lib/a.js': 'x', 'lib/b.js': 'y' });
    const b = tree({ 'lib/a.js': 'x', 'lib/b.js': 'y' });
    try {
      expect(checksumFiles(a, ['lib/a.js', 'lib/b.js'])).toBe(
        checksumFiles(b, ['lib/a.js', 'lib/b.js']),
      );
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('should change when a covered file changes', () => {
    const a = tree({ 'lib/a.js': 'x' });
    const b = tree({ 'lib/a.js': 'changed' });
    try {
      expect(checksumFiles(a, ['lib/a.js'])).not.toBe(checksumFiles(b, ['lib/a.js']));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('should not depend on the order paths are passed', () => {
    const dir = tree({ 'lib/a.js': 'x', 'lib/b.js': 'y' });
    try {
      expect(checksumFiles(dir, ['lib/a.js', 'lib/b.js'])).toBe(
        checksumFiles(dir, ['lib/b.js', 'lib/a.js']),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
