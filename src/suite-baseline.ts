/**
 * The pass rate ratchet for the full suite run.
 *
 * Shaka's own specs are run unmodified against the transpiled library in
 * headless Chrome. Most fail today: the whole test harness layer (`shaka.test.*`
 * helpers, custom matchers, asset servers) is not wired yet, and the media specs
 * need a real pipeline. So this is a ratchet, not a target: it records how many
 * specs pass now and fails only if that count drops, so transpiler and harness
 * work can raise it but nothing can quietly break what already runs.
 *
 * The floor sits a little below the observed count, because the passing set can
 * wobble by a few across browser versions. When the count rises for good, raise
 * the floor to lock it in.
 */
export const SUITE_PASS_FLOOR = 70;

/**
 * The fewest specs a healthy run executes.
 *
 * A run that executes far fewer than this did not complete: the library failed
 * to initialise, or the browser died partway. Guarding on it stops a truncated
 * run from passing the ratchet just because the pass floor happened to be low.
 */
export const SUITE_MIN_EXECUTED = 700;

/** The counts a suite run reports, taken from Karma's run_complete result. */
export interface SuiteResult {
  readonly success: number;
  readonly failed: number;
  readonly skipped: number;
  readonly disconnected: boolean;
}

export interface SuiteVerdict {
  readonly ok: boolean;
  readonly passed: number;
  readonly executed: number;
  readonly reason: string;
}

/**
 * Decides whether a suite run clears the ratchet.
 *
 * Pure, so the decision is tested without a browser. Fails a run that lost the
 * browser or executed too few specs before it checks the pass floor, so a broken
 * run reads as broken rather than as a low pass count.
 */
export function evaluateSuite(
  result: SuiteResult,
  passFloor: number = SUITE_PASS_FLOOR,
  minExecuted: number = SUITE_MIN_EXECUTED,
): SuiteVerdict {
  const executed = result.success + result.failed;
  const base = { passed: result.success, executed };

  if (result.disconnected) {
    return { ...base, ok: false, reason: 'the browser disconnected before the run finished' };
  }
  if (executed < minExecuted) {
    return {
      ...base,
      ok: false,
      reason: `only ${String(executed)} specs executed, fewer than ${String(minExecuted)}; the run did not complete`,
    };
  }
  if (result.success < passFloor) {
    return {
      ...base,
      ok: false,
      reason: `${String(result.success)} specs passed, below the floor of ${String(passFloor)}; a change made the suite worse`,
    };
  }
  return {
    ...base,
    ok: true,
    reason: `${String(result.success)} specs passed, at or above the floor of ${String(passFloor)}`,
  };
}
