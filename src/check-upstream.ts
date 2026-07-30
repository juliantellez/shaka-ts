import { UPSTREAM } from './upstream.ts';

const LATEST_RELEASE_API =
  'https://api.github.com/repos/shaka-project/shaka-player/releases/latest';

/** Parses a `v1.2.3` or `1.2.3` tag into comparable numbers, or null if malformed. */
function parseVersion(tag: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * True when `candidate` is a strictly newer release than `current`.
 *
 * Compares major, minor and patch in order. A malformed tag is treated as not
 * newer, so a bad release name never triggers a false alarm.
 */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) {
      return (a[index] ?? 0) > (b[index] ?? 0);
    }
  }
  return false;
}

/** Fetches the latest upstream release tag from the GitHub API. */
async function fetchLatestTag(): Promise<string> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${String(response.status)}`);
  }
  const body = (await response.json()) as { tag_name?: string };
  if (typeof body.tag_name !== 'string') {
    throw new Error('release response had no tag_name');
  }
  return body.tag_name;
}

/**
 * Reports whether a newer Shaka release exists than the pinned one.
 *
 * Prints `new <version>` when there is one, for the scheduled workflow to open
 * an issue, or `current` otherwise. Kept side effect light so the comparison
 * can be tested without the network.
 */
async function main(): Promise<void> {
  const latest = await fetchLatestTag();
  if (isNewer(latest, UPSTREAM.version)) {
    process.stdout.write(`new ${latest.replace(/^v/, '')}\n`);
  } else {
    process.stdout.write(`current (pinned ${UPSTREAM.version}, latest ${latest})\n`);
  }
}

if (process.argv[1]?.endsWith('check-upstream.ts')) {
  await main();
}
