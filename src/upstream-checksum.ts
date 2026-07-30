import { checksumFiles } from './fetch.ts';
import { discoverModuleFiles } from './graph.ts';

/** Third party sources transpiled alongside `lib` and `ui`, kept in sync with the pipeline. */
const EXTRA_SOURCES = ['third_party/language-mapping-list/language-mapping-list.js'];

/**
 * The recorded checksum of the pinned release's source files.
 *
 * A git tag should be immutable, but nothing stops an upstream tag from being
 * force moved, which would silently change what the transpiler builds from.
 * Recording the checksum of the exact files the pipeline reads turns that into
 * a loud failure. When the pin is bumped, this is updated to match the new
 * release with `npm run checksum:update`.
 */
export const RECORDED_CHECKSUM = 'b29ad3a9291a072b2c2c3d52d2e3d17399308ad6fa0057453ec478de3643c82c';

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

/** Verifies a fetched release against the recorded checksum. */
export function verifyChecksum(root: string): ChecksumResult {
  const actual = computeChecksum(root);
  return { expected: RECORDED_CHECKSUM, actual, matches: actual === RECORDED_CHECKSUM };
}
