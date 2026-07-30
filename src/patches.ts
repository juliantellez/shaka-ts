import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

function canApply(packageDir: string, patchPath: string): boolean {
  try {
    execFileSync('git', ['apply', '--check', patchPath], {
      cwd: packageDir,
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
    const patchPath = join(patchesDir, name);
    if (!canApply(packageDir, patchPath)) {
      failed.push(name);
      continue;
    }
    execFileSync('git', ['apply', patchPath], {
      cwd: packageDir,
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
