import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPatches, listPatches, PatchError } from './patches.ts';

/**
 * Builds a package directory and a matching patch by diffing the original
 * against an edited copy with `git diff`, exactly the form the overlay expects.
 */
function scenario(original: string, edited: string): { pkg: string; patches: string } {
  const root = mkdtempSync(join(tmpdir(), 'shaka-ts-patch-'));
  const pkg = join(root, 'package');
  const patches = join(root, 'patches');
  mkdirSync(join(pkg, 'lib'), { recursive: true });
  mkdirSync(patches, { recursive: true });

  const file = join(pkg, 'lib', 'a.ts');
  writeFileSync(file, original);
  execFileSync('git', ['init', '-q'], { cwd: pkg });
  execFileSync('git', ['add', '.'], { cwd: pkg });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], {
    cwd: pkg,
  });
  writeFileSync(file, edited);
  const diff = execFileSync('git', ['diff'], { cwd: pkg, encoding: 'utf8' });
  execFileSync('git', ['checkout', '.'], { cwd: pkg });
  writeFileSync(join(patches, '001-fix.patch'), diff);

  return { pkg, patches };
}

describe('applyPatches', () => {
  it('should apply a patch to the output', () => {
    const { pkg, patches } = scenario('export const a = 1;\n', 'export const a = 2;\n');
    try {
      const result = applyPatches(pkg, patches);
      expect(result.applied).toEqual(['001-fix.patch']);
      expect(readFileSync(join(pkg, 'lib/a.ts'), 'utf8')).toContain('a = 2');
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  it('should fail loudly when a patch no longer applies', () => {
    const { pkg, patches } = scenario('export const a = 1;\n', 'export const a = 2;\n');
    // Change the target so the patch context no longer matches.
    writeFileSync(join(pkg, 'lib/a.ts'), 'export const a = 999;\n');
    try {
      expect(() => applyPatches(pkg, patches)).toThrow(PatchError);
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  });

  it('should do nothing when there are no patches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shaka-ts-empty-'));
    try {
      expect(applyPatches(dir, join(dir, 'patches'))).toEqual({ applied: [], failed: [] });
      expect(listPatches(join(dir, 'patches'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
