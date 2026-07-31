import { describe, expect, it } from 'vitest';
import { SUITE_MIN_EXECUTED, SUITE_PASS_FLOOR, evaluateSuite } from './suite-baseline.ts';

const complete = { success: 90, failed: 700, skipped: 1, disconnected: false };

describe('evaluateSuite', () => {
  it('should pass a run whose pass count clears the floor', () => {
    const verdict = evaluateSuite(complete);
    expect(verdict.ok).toBe(true);
    expect(verdict.passed).toBe(90);
    expect(verdict.executed).toBe(790);
  });

  it('should fail a run whose pass count fell below the floor', () => {
    const verdict = evaluateSuite({ ...complete, success: SUITE_PASS_FLOOR - 1 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/below the floor/);
  });

  it('should fail a truncated run before it looks at the pass count', () => {
    // Few specs executed, but the passes clear the floor: still a failure,
    // because the run did not complete.
    const verdict = evaluateSuite({ success: 90, failed: 5, skipped: 0, disconnected: false });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/did not complete/);
  });

  it('should fail a run that lost the browser', () => {
    const verdict = evaluateSuite({ ...complete, disconnected: true });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/disconnected/);
  });

  it('should treat the executed floor as the sum of passes and failures', () => {
    const verdict = evaluateSuite({
      success: SUITE_PASS_FLOOR,
      failed: SUITE_MIN_EXECUTED - SUITE_PASS_FLOOR,
      skipped: 0,
      disconnected: false,
    });
    expect(verdict.executed).toBe(SUITE_MIN_EXECUTED);
    expect(verdict.ok).toBe(true);
  });
});
