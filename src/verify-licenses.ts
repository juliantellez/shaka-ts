import { checkLicenses } from './licenses.ts';

/**
 * Fails the build if any transpiled upstream file lost its Apache 2.0 header,
 * or if the NOTICE file is not present. Run after `npm run build`.
 */
function main(): void {
  const report = checkLicenses('build/package', 'NOTICE');
  process.stdout.write(
    `license headers: ${String(report.checked - report.missing.length)}/${String(report.checked)} present; ` +
      `NOTICE ${report.hasNotice ? 'present' : 'MISSING'}\n`,
  );

  if (report.missing.length > 0 || !report.hasNotice) {
    for (const file of report.missing) {
      process.stderr.write(`  missing @license: ${file}\n`);
    }
    if (!report.hasNotice) {
      process.stderr.write('  NOTICE file is missing\n');
    }
    process.exitCode = 1;
  }
}

main();
