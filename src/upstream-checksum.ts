import { checksumFiles } from './fetch.ts';
import { discoverModuleFiles } from './graph.ts';
import { UPSTREAM } from './upstream.ts';
import { requireVersionTarget } from './versions.ts';

/** Third party sources transpiled alongside `lib` and `ui`, kept in sync with the pipeline. */
const EXTRA_SOURCES = ['third_party/language-mapping-list/language-mapping-list.js'];

/**
 * The recorded checksum of a release's source files.
 *
 * A git tag should be immutable, but nothing stops an upstream tag from being
 * force moved, which would silently change what the transpiler builds from.
 * Recording the checksum of the exact files the pipeline reads turns that into
 * a loud failure. The checksum is per version because each release has its own
 * source; when a version is added or bumped, its entry in `versions.ts` is
 * updated to match with `npm run checksum:update`.
 */
export function recordedChecksum(version: string = UPSTREAM.version): string {
  return requireVersionTarget(version).checksum;
}

/** The source files the checksum covers, sorted for determinism. */
export function checksumSources(root: string): string[] {
  return [...discoverModuleFiles(root), ...EXTRA_SOURCES].sort();
}

/** Computes the checksum of a fetched release's source files. */
export function computeChecksum(root: string): string {
  return checksumFiles(root, checksumSources(root));
}

export interface ChecksumResult {
  readonly expected: string;
  readonly actual: string;
  readonly matches: boolean;
}

/** Verifies a fetched release against its recorded checksum. */
export function verifyChecksum(root: string, version: string = UPSTREAM.version): ChecksumResult {
  const expected = recordedChecksum(version);
  const actual = computeChecksum(root);
  return { expected, actual, matches: actual === expected };
}
