import { checkjsBaseline, countCheckJsErrors } from './checkjs.ts';

/**
 * Enforces the checkJs ratchet over the transpiled output.
 *
 * Run after `npm run build`. Reports the current error count and fails only if
 * it rises above the pinned version's recorded baseline, so type work can lower
 * it but nothing can raise it. When the count falls, the baseline in
 * `versions.ts` should be lowered to match.
 */
function main(): void {
  const baseline = checkjsBaseline();
  const count = countCheckJsErrors('build/package');
  process.stdout.write(`checkJs errors: ${String(count)} (baseline ${String(baseline)})\n`);

  if (count > baseline) {
    process.stderr.write(
      `\ncheckJs errors rose from ${String(baseline)} to ${String(count)}. ` +
        `A change made the transpiled types worse.\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (count < baseline) {
    process.stdout.write(
      `errors fell below the baseline; lower this version's checkjsBaseline in ` +
        `src/versions.ts to ${String(count)} to lock it in.\n`,
    );
  }
}

main();
