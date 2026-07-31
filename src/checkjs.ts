import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPSTREAM } from './upstream.ts';
import { requireVersionTarget } from './versions.ts';

/**
 * The count of type errors when checking a release's transpiled output under
 * full `strict` mode, as a ratchet ceiling.
 *
 * This is a ratchet, not a target. Without strict, the transpiled output checks
 * nearly clean, but `strict` turns on `strictNullChecks` and `noImplicitAny`,
 * which surface the long tail the module and type passes cannot reach on their
 * own: statics not yet hoisted, extern namespaces not yet declared as types, and
 * untyped callback parameters. Getting this to zero is the work of the patch
 * overlay and further type passes; the gate only fails if the count rises, so no
 * change can quietly make the types worse.
 *
 * The baseline is per version because each release produces a different output;
 * each is stored in `versions.ts` a little above the observed count, because
 * tsc's count wobbles by a few between runs. The gate catches a regression of
 * hundreds, not a wobble of ones.
 */
export function checkjsBaseline(version: string = UPSTREAM.version): number {
  return requireVersionTarget(version).checkjsBaseline;
}

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    allowJs: true,
    checkJs: true,
  },
  include: ['**/*.ts'],
  // The generated entry re-exports across the whole tree and only adds noise.
  exclude: ['shaka-player.ts'],
};

/**
 * Counts the `checkJs` errors over a transpiled output directory.
 *
 * Writes the check configuration into the directory and runs `tsc`, which exits
 * non zero when there are errors, so the non zero exit is expected and the
 * error lines are counted from its output.
 */
export function countCheckJsErrors(outputDir: string): number {
  writeFileSync(join(outputDir, 'tsconfig.checkjs.json'), `${JSON.stringify(TSCONFIG, null, 2)}\n`);

  let output: string;
  try {
    output = execFileSync('npx', ['tsc', '-p', join(outputDir, 'tsconfig.checkjs.json')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const withOutput = error as { stdout?: string };
    output = withOutput.stdout ?? '';
  }

  return (output.match(/error TS\d+/g) ?? []).length;
}
