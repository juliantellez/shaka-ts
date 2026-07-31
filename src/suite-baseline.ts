/**
 * The verdict logic for the headless Chrome suite run.
 *
 * The suite loads the whole transpiled library in a real browser and asserts its
 * public surface is present, one spec per symbol. This decides whether a run
 * cleared the bar: the browser stayed up, every spec ran, and the pass count met
 * the floor. It is pure, so the decision is tested without a browser.
 */
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
 * Decides whether a suite run cleared the bar.
 *
 * Fails a run that lost the browser or executed too few specs before it checks
 * the pass floor, so a browser that died or a spec that failed to load reads as
 * broken rather than as a low pass count. `passFloor` and `minExecuted` are
 * passed in from the surface list, so the bar tracks the list rather than a
 * constant that can drift from it.
 */
export function evaluateSuite(
  result: SuiteResult,
  passFloor: number,
  minExecuted: number,
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
      reason: `${String(result.success)} specs passed, below the floor of ${String(passFloor)}; the library did not load its full surface`,
    };
  }
  return {
    ...base,
    ok: true,
    reason: `${String(result.success)} specs passed, at or above the floor of ${String(passFloor)}`,
  };
}
