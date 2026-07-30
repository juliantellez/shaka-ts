import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { CLOSURE_CORE_BASELINE, formatReport, measure } from './size.ts';

describe('measure', () => {
  it('should report zero delta for a bundle the size of the baseline', () => {
    // Random bytes do not compress, so pad to reach the baseline gzip size.
    const bundle = Buffer.alloc(CLOSURE_CORE_BASELINE.raw, 0);
    const report = measure(bundle);
    expect(report.raw).toBe(CLOSURE_CORE_BASELINE.raw);
    expect(report.rawDelta).toBe(0);
  });

  it('should report a positive delta for a larger bundle', () => {
    const bundle = Buffer.alloc(CLOSURE_CORE_BASELINE.raw * 2, 0);
    expect(measure(bundle).rawDelta).toBeCloseTo(1, 5);
  });

  it('should compute gzip against the compressed size', () => {
    const bundle = Buffer.from('a'.repeat(10_000));
    expect(measure(bundle).gzip).toBe(gzipSync(bundle, { level: 9 }).byteLength);
  });

  it('should flag a bundle past the regression ceiling', () => {
    // Random bytes do not compress, so gzip stays near the raw size and clears
    // the ceiling, unlike a uniform buffer which would collapse to nothing.
    const huge = randomBytes(CLOSURE_CORE_BASELINE.gzip * 3);
    expect(measure(huge).withinCeiling).toBe(false);
  });
});

describe('formatReport', () => {
  it('should show both bundles and the delta', () => {
    const text = formatReport(measure(Buffer.alloc(CLOSURE_CORE_BASELINE.raw, 0)));
    expect(text).toContain('esbuild');
    expect(text).toContain('closure');
    expect(text).toContain('raw');
    expect(text).toContain('gzip');
  });
});
