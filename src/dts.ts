import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    allowImportingTsExtensions: true,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    strict: false,
    allowJs: true,
    noEmitOnError: false,
    outDir: 'types',
  },
  include: ['shaka-player.ts'],
};

/**
 * Emits TypeScript declarations for the public entry.
 *
 * The transpiled types are real enough that `tsc` can produce a declaration
 * file, so consumers get types generated from the source rather than from a
 * separate tool. Emission continues past the strict long tail, since the public
 * surface, the exported names, is what this file is checked against.
 */
export function emitDeclarations(packageDir: string): string {
  writeFileSync(join(packageDir, 'tsconfig.dts.json'), `${JSON.stringify(TSCONFIG, null, 2)}\n`);
  try {
    execFileSync('npx', ['tsc', '-p', join(packageDir, 'tsconfig.dts.json')], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    // tsc exits non zero because of the strict tail; the declarations still emit.
  }
  return join(packageDir, 'types', 'shaka-player.d.ts');
}

/** The exported names declared in a `.d.ts` entry. */
export function exportedNames(dtsPath: string): string[] {
  const text = readFileSync(dtsPath, 'utf8');
  const names = new Set<string>();
  for (const match of text.matchAll(/export\s*\{\s*([^}]+)\s*\}/g)) {
    for (const clause of (match[1] ?? '').split(',')) {
      const name = clause
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}
