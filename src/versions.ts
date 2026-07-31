import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The Shaka Player releases this toolchain transpiles and publishes.
 *
 * Each release is published to npm as `shaka-ts@<version>`, so the shaka-ts
 * version equals the Shaka version it was transpiled from. That makes selection
 * obvious: a consumer on Shaka 4.16.x installs `shaka-ts@4.16.43`.
 *
 * The recorded values are per version because they are measured from that
 * release: the `checksum` fixes the exact upstream source, and `checkjsBaseline`
 * is the strict `checkJs` ratchet ceiling for the output that release produces.
 * The set lives in `versions.json` so the auto publish workflow can add an entry
 * for a new release without editing code.
 */
export interface VersionTarget {
  /** Semantic version, equal to the upstream tag without its `v` prefix. */
  readonly version: string;
  /** sha256 of the upstream source files the pipeline reads for this release. */
  readonly checksum: string;
  /** The strict `checkJs` error ceiling for this release's transpiled output. */
  readonly checkjsBaseline: number;
}

/** Path to the version registry, next to this module. */
export const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'versions.json');

/**
 * A brand new release will not transpile perfectly, but a doubling of the
 * `checkJs` count means it transpiled badly enough not to trust. The auto
 * publish flow refuses to publish above this ceiling, so a broken retarget
 * fails loudly instead of shipping. The recorded baselines sit near 7,500.
 */
export const AUTOPUBLISH_CHECKJS_CEILING = 8_500;

/** The margin added over the observed count when recording a new baseline. */
export const CHECKJS_BASELINE_MARGIN = 30;

function readRegistry(): VersionTarget[] {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as VersionTarget[];
  return [...raw].sort((a, b) => compareVersions(a.version, b.version));
}

/**
 * The published set, in ascending version order.
 *
 * The 5.x line is not published yet: its device detection modules do not
 * transpile cleanly (the core entry re-exports an `AllDevices` that resolves to
 * undefined), so it needs transpiler work before it can be trusted.
 */
export const TARGET_VERSIONS: readonly VersionTarget[] = readRegistry();

/** Parses a three part semantic version into numbers, throwing if malformed. */
function parts(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`not a three part semantic version: ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Orders two semantic versions ascending: negative when `a` is older. */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

/** Looks up a target by version, or undefined if it is not a published one. */
export function findVersionTarget(version: string): VersionTarget | undefined {
  return TARGET_VERSIONS.find((target) => target.version === version);
}

/**
 * Looks up a target by version, throwing if it is not published.
 *
 * The verify steps read the pinned version's recorded values through this, so a
 * pin that is not in the published set fails loudly rather than checking against
 * a stale or missing baseline.
 */
export function requireVersionTarget(version: string): VersionTarget {
  const target = findVersionTarget(version);
  if (target === undefined) {
    const known = TARGET_VERSIONS.map((entry) => entry.version).join(', ');
    throw new Error(`no recorded target for ${version}; published versions are ${known}`);
  }
  return target;
}

/**
 * Returns the registry with `entry` added or replaced, in ascending order.
 *
 * Pure so onboarding a new release is testable without touching disk. An
 * existing version is replaced, so re-recording a version is idempotent.
 */
export function upsertVersionTarget(
  targets: readonly VersionTarget[],
  entry: VersionTarget,
): VersionTarget[] {
  const others = targets.filter((target) => target.version !== entry.version);
  return [...others, entry].sort((a, b) => compareVersions(a.version, b.version));
}

/** The recorded checkJs baseline for an observed count: the count plus a margin. */
export function baselineForCount(count: number): number {
  return count + CHECKJS_BASELINE_MARGIN;
}

/** Prints the published versions as a JSON array for the publish matrix. */
if (process.argv[1]?.endsWith('versions.ts')) {
  process.stdout.write(`${JSON.stringify(TARGET_VERSIONS.map((target) => target.version))}\n`);
}
