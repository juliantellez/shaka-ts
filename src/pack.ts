import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_DIR = 'dist/package';

/**
 * The package.json for the published `shaka-ts` package.
 *
 * Deliberately minimal: the bundle is the entry, the emitted declarations are
 * the types, and the license is Apache 2.0 to match the derivative work. The
 * name and description state plainly that this is unofficial.
 */
function packageManifest(version: string): string {
  const manifest = {
    name: 'shaka-ts',
    version,
    description:
      'Shaka Player transpiled from Closure JavaScript to TypeScript. Unofficial, not affiliated with Google.',
    license: 'Apache-2.0',
    type: 'module',
    main: 'shaka-player.min.js',
    types: 'shaka-player.d.ts',
    files: ['shaka-player.min.js', 'shaka-player.d.ts', 'NOTICE'],
    repository: { type: 'git', url: 'git+https://github.com/juliantellez/shaka-ts.git' },
    keywords: ['shaka', 'dash', 'hls', 'video', 'player', 'typescript'],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export interface PackResult {
  readonly dir: string;
  readonly version: string;
  readonly files: readonly string[];
}

/**
 * Assembles the publishable package from a completed build.
 *
 * Copies the minified bundle and the emitted declarations, writes the manifest
 * at the given version, and includes the NOTICE so the attribution ships with
 * the package. Expects `npm run build` and the declaration emit to have run.
 */
export function assemblePackage(version: string): PackResult {
  rmSync(PACKAGE_DIR, { recursive: true, force: true });
  mkdirSync(PACKAGE_DIR, { recursive: true });

  cpSync('build/dist/shaka-player.min.js', join(PACKAGE_DIR, 'shaka-player.min.js'));
  cpSync('build/package/types/shaka-player.d.ts', join(PACKAGE_DIR, 'shaka-player.d.ts'));
  cpSync('NOTICE', join(PACKAGE_DIR, 'NOTICE'));
  writeFileSync(join(PACKAGE_DIR, 'package.json'), packageManifest(version));
  writeFileSync(join(PACKAGE_DIR, 'README.md'), readFileSync('README.md', 'utf8'));

  return {
    dir: PACKAGE_DIR,
    version,
    files: ['package.json', 'shaka-player.min.js', 'shaka-player.d.ts', 'NOTICE', 'README.md'],
  };
}

function versionFromArg(): string {
  const raw = process.argv[2] ?? '0.0.0';
  return raw.replace(/^v/, '');
}

if (process.argv[1]?.endsWith('pack.ts')) {
  const result = assemblePackage(versionFromArg());
  process.stdout.write(`assembled ${result.dir} at version ${result.version}\n`);
}
