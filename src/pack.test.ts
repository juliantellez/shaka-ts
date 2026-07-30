import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemblePackage } from './pack.ts';

/**
 * Runs against a minimal stand in for a completed build, so the assembly is
 * checked without a full transpile. The real bundle and declarations are
 * produced by the build steps the release workflow runs first.
 */
function stubBuild(): void {
  mkdirSync('build/dist', { recursive: true });
  mkdirSync('build/package/types', { recursive: true });
  writeFileSync('build/dist/shaka-player.min.js', 'export const x=1;');
  writeFileSync('build/package/types/shaka-player.d.ts', 'export declare const x: number;');
}

describe('assemblePackage', () => {
  it('should assemble a package with the manifest, bundle, types and notice', () => {
    stubBuild();
    try {
      const result = assemblePackage('1.2.3');
      const manifest = JSON.parse(readFileSync(join(result.dir, 'package.json'), 'utf8')) as {
        name: string;
        version: string;
        main: string;
        types: string;
        license: string;
      };

      expect(manifest.name).toBe('shaka-ts');
      expect(manifest.version).toBe('1.2.3');
      expect(manifest.main).toBe('shaka-player.min.js');
      expect(manifest.types).toBe('shaka-player.d.ts');
      expect(manifest.license).toBe('Apache-2.0');
      expect(existsSync(join(result.dir, 'shaka-player.min.js'))).toBe(true);
      expect(existsSync(join(result.dir, 'shaka-player.d.ts'))).toBe(true);
      expect(existsSync(join(result.dir, 'NOTICE'))).toBe(true);
    } finally {
      rmSync('dist', { recursive: true, force: true });
      rmSync('build', { recursive: true, force: true });
    }
  });
});
