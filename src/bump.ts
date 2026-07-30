import { readFileSync, writeFileSync } from 'node:fs';

const UPSTREAM_FILE = 'src/upstream.ts';
const VERSION_LINE = /const SHAKA_VERSION = '(\d+\.\d+\.\d+)';/;
const SEMVER = /^\d+\.\d+\.\d+$/;

export interface BumpResult {
  readonly from: string;
  readonly to: string;
}

/**
 * Rewrites the pinned Shaka version in `src/upstream.ts`.
 *
 * The pin is the single source of truth for which release the transpiler
 * targets, so retargeting is one edit: change the version, and the tag,
 * checksum verification and every downstream step follow from it. Returns the
 * old and new versions, or throws if the target is not a plain three part
 * version.
 */
export function bumpVersion(source: string, target: string): { text: string; result: BumpResult } {
  if (!SEMVER.test(target)) {
    throw new Error(`target is not a semantic version: ${target}`);
  }
  const match = VERSION_LINE.exec(source);
  if (!match?.[1]) {
    throw new Error('could not find the pinned version in the upstream file');
  }
  const from = match[1];
  const text = source.replace(VERSION_LINE, `const SHAKA_VERSION = '${target}';`);
  return { text, result: { from, to: target } };
}

function main(): void {
  const target = process.argv[2];
  if (target === undefined) {
    process.stderr.write('usage: npm run bump -- <version>\n');
    process.exitCode = 1;
    return;
  }

  const source = readFileSync(UPSTREAM_FILE, 'utf8');
  let bumped;
  try {
    bumped = bumpVersion(source, target);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  if (bumped.result.from === bumped.result.to) {
    process.stdout.write(`already pinned to ${target}\n`);
    return;
  }

  writeFileSync(UPSTREAM_FILE, bumped.text);
  process.stdout.write(
    `pinned ${bumped.result.from} -> ${bumped.result.to}\n` +
      `next: npm run build, then run the tests, and update CHECKJS_BASELINE if the count changed\n`,
  );
}

if (process.argv[1]?.endsWith('bump.ts')) {
  main();
}
