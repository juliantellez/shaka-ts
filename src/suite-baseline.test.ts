import { describe, expect, it } from 'vitest';
import { evaluateSuite } from './suite-baseline.ts';

const FLOOR = 26;
const MIN = 26;
const complete = { success: 26, failed: 0, skipped: 0, disconnected: false };

describe('evaluateSuite', () => {
  it('should pass a run whose pass count clears the floor', () => {
    const verdict = evaluateSuite(complete, FLOOR, MIN);
    expect(verdict.ok).toBe(true);
    expect(verdict.passed).toBe(26);
    expect(verdict.executed).toBe(26);
  });

  it('should fail a run whose pass count fell below the floor', () => {
    const verdict = evaluateSuite({ ...complete, success: 25, failed: 1 }, FLOOR, MIN);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/below the floor/);
  });

  it('should fail a truncated run before it looks at the pass count', () => {
    // Every spec that ran passed, but too few ran: still a failure, because the
    // run did not complete.
    const verdict = evaluateSuite(
      { success: 5, failed: 0, skipped: 0, disconnected: false },
      FLOOR,
      MIN,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/did not complete/);
  });

  it('should fail a run that lost the browser', () => {
    const verdict = evaluateSuite({ ...complete, disconnected: true }, FLOOR, MIN);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/disconnected/);
  });

  it('should count executed as passes plus failures', () => {
    const verdict = evaluateSuite(
      { success: 20, failed: 6, skipped: 0, disconnected: false },
      FLOOR,
      MIN,
    );
    expect(verdict.executed).toBe(26);
    // 20 passed, below the floor, so not ok even though the run completed.
    expect(verdict.ok).toBe(false);
  });
});
