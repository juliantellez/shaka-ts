import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { UPSTREAM, isReproduciblePin, type UpstreamPin } from './upstream.ts';

/** Where the fetched upstream tree lives. Git ignored, never committed. */
export const UPSTREAM_DIR = 'upstream/shaka-player';

export class UpstreamFetchError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UpstreamFetchError';
  }
}

function git(args: readonly string[], cwd?: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    throw new UpstreamFetchError(`git ${args.join(' ')} failed`, { cause });
  }
}

/**
 * Clones the pinned upstream release at depth one.
 *
 * Refuses to run against a pin that is not an exact version tag, because a
 * moving target would make the recorded checksum meaningless.
 */
export async function fetchUpstream(pin: UpstreamPin = UPSTREAM): Promise<string> {
  if (!isReproduciblePin(pin)) {
    throw new UpstreamFetchError(`pin is not reproducible: tag=${pin.tag} version=${pin.version}`);
  }

  const target = join(process.cwd(), UPSTREAM_DIR);

  if (existsSync(join(target, '.git'))) {
    const current = git(['describe', '--tags', '--exact-match'], target).trim();
    if (current === pin.tag) {
      return target;
    }
    await rm(target, { recursive: true, force: true });
  }

  await mkdir(target, { recursive: true });
  git(['clone', '--depth', '1', '--branch', pin.tag, '--single-branch', pin.repository, target]);

  return target;
}

/**
 * Hashes a set of files so a silent upstream change cannot pass unnoticed.
 *
 * Paths are sorted and folded into the digest alongside contents, so a renamed
 * or removed file changes the result even when the bytes are identical.
 */
export function checksumFiles(rootDir: string, relativePaths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const relativePath of [...relativePaths].sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(readFileSync(join(rootDir, relativePath)));
    hash.update('\0');
  }
  return hash.digest('hex');
}
