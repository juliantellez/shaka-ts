import { CHECKJS_BASELINE, countCheckJsErrors } from './checkjs.ts';

/**
 * Enforces the checkJs ratchet over the transpiled output.
 *
 * Run after `npm run build`. Reports the current error count and fails only if
 * it rises above the recorded baseline, so type work can lower it but nothing
 * can raise it. When the count falls, the baseline in `checkjs.ts` should be
 * lowered to match.
 */
function main(): void {
  const count = countCheckJsErrors('build/package');
  process.stdout.write(`checkJs errors: ${String(count)} (baseline ${String(CHECKJS_BASELINE)})\n`);

  if (count > CHECKJS_BASELINE) {
    process.stderr.write(
      `\ncheckJs errors rose from ${String(CHECKJS_BASELINE)} to ${String(count)}. ` +
        `A change made the transpiled types worse.\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (count < CHECKJS_BASELINE) {
    process.stdout.write(
      `errors fell below the baseline; lower CHECKJS_BASELINE to ${String(count)} to lock it in.\n`,
    );
  }
}

main();
