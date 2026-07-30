import { gzipSync } from 'node:zlib';

/**
 * The Closure ADVANCED baseline for the core bundle, from the official
 * `dist/shaka-player.compiled.js` of the pinned 4.16.5 release.
 *
 * Closure's property renaming and dead code elimination make this smaller than
 * anything esbuild produces. It is the number to measure against, not to match:
 * the point is to keep the regression visible, not to pretend it is zero.
 */
export const CLOSURE_CORE_BASELINE = {
  raw: 786_451,
  gzip: 250_793,
} as const;

/**
 * The regression ceiling. esbuild is expected to be larger than Closure, but a
 * jump past this on gzip means something is bundling that should not be, and is
 * worth failing a pull request over.
 */
export const MAX_GZIP_REGRESSION = 0.6;

export interface SizeReport {
  readonly raw: number;
  readonly gzip: number;
  readonly rawDelta: number;
  readonly gzipDelta: number;
  readonly withinCeiling: boolean;
}

/** Measures a bundle against the Closure baseline. */
export function measure(bundle: Uint8Array): SizeReport {
  const raw = bundle.byteLength;
  const gzip = gzipSync(bundle, { level: 9 }).byteLength;
  const rawDelta = raw / CLOSURE_CORE_BASELINE.raw - 1;
  const gzipDelta = gzip / CLOSURE_CORE_BASELINE.gzip - 1;
  return {
    raw,
    gzip,
    rawDelta,
    gzipDelta,
    withinCeiling: gzipDelta <= MAX_GZIP_REGRESSION,
  };
}

function percent(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

/** Formats a size report for a build log. */
export function formatReport(report: SizeReport): string {
  return [
    `                    esbuild        closure         delta`,
    `raw   ${String(report.raw).padStart(10)}   ${String(CLOSURE_CORE_BASELINE.raw).padStart(10)}   ${percent(report.rawDelta).padStart(8)}`,
    `gzip  ${String(report.gzip).padStart(10)}   ${String(CLOSURE_CORE_BASELINE.gzip).padStart(10)}   ${percent(report.gzipDelta).padStart(8)}`,
  ].join('\n');
}
