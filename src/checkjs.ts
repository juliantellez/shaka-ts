import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The current count of type errors when checking the transpiled output with
 * `checkJs`, which reads the Closure JSDoc as types.
 *
 * This is a ratchet, not a target. TypeScript understands most of Shaka's JSDoc
 * already, but the inline `this.x` property annotations and the Closure only
 * optional parameter syntax are not declared in a way it accepts yet, so the
 * count starts high. Every later type slice lowers it; the gate only fails if
 * it rises, so no change can quietly make the types worse.
 *
 * Set a little above the observed count (~7800), because tsc's count wobbles by
 * a few between runs. The gate is meant to catch a regression of hundreds, so a
 * small margin trades nothing real for not flaking.
 */
export const CHECKJS_BASELINE = 20;

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
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
