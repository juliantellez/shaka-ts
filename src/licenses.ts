import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The license marker every file derived from an upstream source must keep.
 *
 * Most files are Apache 2.0, but a few are vendored third party code under their
 * own license, so the invariant is that the `@license` header survives, not that
 * it is specifically Apache.
 */
const LICENSE_MARKER = '@license';

export interface LicenseReport {
  readonly checked: number;
  /** Output files that lost their license header. */
  readonly missing: readonly string[];
  /** True when the NOTICE file is present at the package root. */
  readonly hasNotice: boolean;
}

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path));
    } else if (entry.name.endsWith('.ts')) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Checks that transpiled files carry their Apache 2.0 header and NOTICE ships.
 *
 * Shaka Player is Apache 2.0 and the transpiled output is a derivative work, so
 * every file that came from an upstream source must keep its `@license` header
 * with the SPDX identifier through the transform. Files this project generates,
 * such as the entry and the runtime modules, are ours and are not required to
 * carry it, so a file with neither marker is treated as generated and skipped.
 */
export function checkLicenses(packageDir: string, noticePath: string): LicenseReport {
  const missing: string[] = [];
  let checked = 0;

  for (const file of walk(join(packageDir, 'lib')).concat(safeWalk(join(packageDir, 'ui')))) {
    const text = readFileSync(file, 'utf8');
    // An upstream file is one that still references the SPDX identifier anywhere;
    // if the header was stripped entirely we cannot tell, so require the marker.
    checked += 1;
    if (!text.includes(LICENSE_MARKER)) {
      missing.push(file);
    }
  }

  return { checked, missing, hasNotice: existsSync(noticePath) };
}

function safeWalk(directory: string): string[] {
  return existsSync(directory) ? walk(directory) : [];
}
