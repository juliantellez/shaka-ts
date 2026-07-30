import { readFileSync } from 'node:fs';
import { formatReport, measure } from './size.ts';

/**
 * Reports the core bundle size against the Closure baseline.
 *
 * Expects the bundle to already exist, so run `npm run build` first. Exits non
 * zero only if the gzip regression passes the ceiling, which flags something
 * unexpected bundling rather than the known, accepted esbuild overhead.
 */
function main(): void {
  const bundlePath = 'build/dist/shaka-player.min.js';
  let bundle: Buffer;
  try {
    bundle = readFileSync(bundlePath);
  } catch {
    process.stderr.write(`no bundle at ${bundlePath}; run npm run build first\n`);
    process.exitCode = 1;
    return;
  }

  const report = measure(bundle);
  process.stdout.write(`${formatReport(report)}\n`);

  if (!report.withinCeiling) {
    process.stderr.write(
      `\ngzip regression ${(report.gzipDelta * 100).toFixed(1)}% exceeds the ceiling. ` +
        `Check what is being bundled.\n`,
    );
    process.exitCode = 1;
  }
}

main();
