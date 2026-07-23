/**
 * The pinned upstream Shaka Player release this toolchain targets.
 *
 * Upstream source is fetched at build time and is never committed to this
 * repository. Fetching and checksum verification land in a later change.
 */
export interface UpstreamPin {
  /** Upstream repository to fetch from. */
  readonly repository: string;
  /** Exact release tag. Never a branch or a range. */
  readonly tag: string;
  /** Semantic version, matching the tag without its prefix. */
  readonly version: string;
}

const SHAKA_VERSION = '4.16.5';

export const UPSTREAM: UpstreamPin = {
  repository: 'https://github.com/shaka-project/shaka-player.git',
  tag: `v${SHAKA_VERSION}`,
  version: SHAKA_VERSION,
};

/** Matches a plain three part semantic version, with no prerelease or build metadata. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Validates that a pin is exact enough to be reproducible.
 *
 * A pin that resolves to a moving target defeats the point of the checksum, so
 * this rejects anything that is not a literal version tag.
 */
export function isReproduciblePin(pin: UpstreamPin): boolean {
  if (!SEMVER_PATTERN.test(pin.version)) {
    return false;
  }
  return pin.tag === `v${pin.version}`;
}
