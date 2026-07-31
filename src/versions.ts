/**
 * The Shaka Player releases this toolchain transpiles and publishes.
 *
 * Each release is published to npm as `shaka-ts@<version>`, so the shaka-ts
 * version equals the Shaka version it was transpiled from. That makes selection
 * obvious: a consumer on Shaka 4.16.x installs `shaka-ts@4.16.43`.
 *
 * Every entry has been built from its pinned tag and passes the oracle. The
 * recorded values are per version because they are measured from that release:
 * the `checksum` fixes the exact upstream source, and `checkjsBaseline` is the
 * strict `checkJs` ratchet ceiling for the output that release produces.
 */
export interface VersionTarget {
  /** Semantic version, equal to the upstream tag without its `v` prefix. */
  readonly version: string;
  /** sha256 of the upstream source files the pipeline reads for this release. */
  readonly checksum: string;
  /** The strict `checkJs` error ceiling for this release's transpiled output. */
  readonly checkjsBaseline: number;
}

/**
 * The published set, in ascending version order.
 *
 * The 5.x line is not published yet: its device detection modules do not
 * transpile cleanly (the core entry re-exports an `AllDevices` that resolves to
 * undefined), so it needs transpiler work before it can be trusted. It is
 * tracked separately rather than shipped broken.
 */
export const TARGET_VERSIONS: readonly VersionTarget[] = [
  {
    version: '4.15.55',
    checksum: 'b7ab2c4aa78a7f2bcdb267f35e218ea293f7204cc0da74d514858c7e3e1aa626',
    checkjsBaseline: 7_480,
  },
  {
    version: '4.16.5',
    checksum: 'b29ad3a9291a072b2c2c3d52d2e3d17399308ad6fa0057453ec478de3643c82c',
    checkjsBaseline: 7_520,
  },
  {
    version: '4.16.43',
    checksum: 'e219baf02f7a5f1a8598028472ea6ca2058cbbe8e6115e4567918d4570dbc527',
    checkjsBaseline: 7_515,
  },
];

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

/** Prints the published versions as a JSON array for the publish matrix. */
if (process.argv[1]?.endsWith('versions.ts')) {
  process.stdout.write(`${JSON.stringify(TARGET_VERSIONS.map((target) => target.version))}\n`);
}
