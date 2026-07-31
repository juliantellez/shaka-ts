import { writeFileSync } from 'node:fs';
import { fetchUpstream } from './fetch.ts';
import { computeChecksum } from './upstream-checksum.ts';
import { countCheckJsErrors } from './checkjs.ts';
import { UPSTREAM } from './upstream.ts';
import {
  AUTOPUBLISH_CHECKJS_CEILING,
  REGISTRY_PATH,
  TARGET_VERSIONS,
  baselineForCount,
  findVersionTarget,
  upsertVersionTarget,
  type VersionTarget,
} from './versions.ts';

const OUTPUT_DIR = 'build/package';

/**
 * Builds the recorded entry for a freshly transpiled release.
 *
 * A new release is not expected to transpile perfectly, so this does not gate on
 * a perfect count. It gates on the ceiling: a count that high means the release
 * transpiled badly enough that publishing it would ship something broken, so it
 * throws rather than record. Pure, so the guard is testable without a build.
 */
export function entryForVersion(
  version: string,
  checksum: string,
  checkjsCount: number,
): VersionTarget {
  if (checkjsCount > AUTOPUBLISH_CHECKJS_CEILING) {
    throw new Error(
      `checkJs count ${String(checkjsCount)} for ${version} exceeds the auto publish ceiling ` +
        `${String(AUTOPUBLISH_CHECKJS_CEILING)}; the release did not transpile cleanly enough to publish`,
    );
  }
  return { version, checksum, checkjsBaseline: baselineForCount(checkjsCount) };
}

/** Serialises the registry the way `versions.json` is stored. */
function serialiseRegistry(targets: readonly VersionTarget[]): string {
  return `${JSON.stringify(targets, null, 2)}\n`;
}

export interface OnboardResult {
  readonly entry: VersionTarget;
  readonly alreadyRecorded: boolean;
}

/**
 * Records a newly built release in the version registry.
 *
 * Assumes the pin already targets `version` and `npm run build` has produced the
 * output tree, so it can read the checksum from the fetched source and the
 * checkJs count from the build. Idempotent: a version already recorded is left
 * untouched so re-running the workflow does not churn the baseline.
 */
export async function onboardVersion(version: string): Promise<OnboardResult> {
  if (UPSTREAM.version !== version) {
    throw new Error(`pin is ${UPSTREAM.version} but onboarding ${version}; run npm run bump first`);
  }

  const existing = findVersionTarget(version);
  if (existing !== undefined) {
    return { entry: existing, alreadyRecorded: true };
  }

  const root = await fetchUpstream();
  const checksum = computeChecksum(root);
  const checkjsCount = countCheckJsErrors(OUTPUT_DIR);
  const entry = entryForVersion(version, checksum, checkjsCount);

  const next = upsertVersionTarget(TARGET_VERSIONS, entry);
  writeFileSync(REGISTRY_PATH, serialiseRegistry(next));

  return { entry, alreadyRecorded: false };
}

async function main(): Promise<void> {
  const version = process.argv[2];
  if (version === undefined) {
    process.stderr.write(
      'usage: node --experimental-strip-types src/onboard-version.ts <version>\n',
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await onboardVersion(version);
    if (result.alreadyRecorded) {
      process.stdout.write(`${version} is already recorded; nothing to do\n`);
      return;
    }
    process.stdout.write(
      `recorded ${version}: checksum ${result.entry.checksum}, ` +
        `checkjsBaseline ${String(result.entry.checkjsBaseline)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('onboard-version.ts')) {
  await main();
}
