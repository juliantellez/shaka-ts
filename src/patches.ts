import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PatchResult {
  readonly applied: readonly string[];
  /** Patches that no longer apply cleanly, by name. */
  readonly failed: readonly string[];
}

export class PatchError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}

/** The patch files in a directory, sorted for a deterministic order. */
export function listPatches(patchesDir: string): string[] {
  if (!existsSync(patchesDir)) {
    return [];
  }
  return readdirSync(patchesDir)
    .filter((name) => name.endsWith('.patch'))
    .sort();
}

/** The arguments to POSIX `patch` for a given patch file and package directory. */
function patchArgs(packageDir: string, patchPath: string, extra: readonly string[] = []): string[] {
  // `patch` rather than `git apply`, because the output tree is gitignored, and
  // `git apply` silently skips ignored paths. `-p1` strips the a/ b/ prefixes of
  // a git style diff; `--forward` refuses an already applied or reversed patch.
  return ['-p1', '--forward', '-d', packageDir, '-i', patchPath, ...extra];
}

function canApply(packageDir: string, patchPath: string): boolean {
  try {
    execFileSync('patch', patchArgs(packageDir, patchPath, ['--dry-run']), {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the patch overlay to the transpiled output.
 *
 * The overlay holds the residue the codemod cannot reach: the handful of fixes
 * that need judgement rather than a rule. Each patch is checked before it is
 * applied, and a patch that no longer applies is a loud failure rather than a
 * silent no-op, because a patch that quietly stops matching is how a fork rots.
 * A new upstream release that moves the patched code fails the build here, which
 * is the signal to refresh the patch.
 */
export function applyPatches(packageDir: string, patchesDir: string): PatchResult {
  const applied: string[] = [];
  const failed: string[] = [];

  for (const name of listPatches(patchesDir)) {
    // Absolute, because the patch is applied with the package directory as the
    // working directory, so a path relative to the caller would not resolve.
    const patchPath = resolve(patchesDir, name);
    if (!canApply(packageDir, patchPath)) {
      failed.push(name);
      continue;
    }
    execFileSync('patch', patchArgs(packageDir, patchPath), {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    applied.push(name);
  }

  if (failed.length > 0) {
    throw new PatchError(
      `patches no longer apply: ${failed.join(', ')}. ` +
        `The transpiled output changed under them; refresh or remove them.`,
    );
  }

  return { applied, failed };
}
