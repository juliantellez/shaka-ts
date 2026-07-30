import { fetchUpstream } from './fetch.ts';
import { RECORDED_CHECKSUM, computeChecksum, verifyChecksum } from './upstream-checksum.ts';

/**
 * Fetches the pinned release and verifies it against the recorded checksum.
 *
 * With `--update` it prints the current checksum instead of failing, for use
 * after a version bump. Otherwise a mismatch is a hard failure: the pinned tag
 * no longer contains what it did when the checksum was recorded.
 */
async function main(): Promise<void> {
  const root = await fetchUpstream();

  if (process.argv.includes('--update')) {
    process.stdout.write(`${computeChecksum(root)}\n`);
    process.stdout.write(
      'update RECORDED_CHECKSUM in src/upstream-checksum.ts to the value above\n',
    );
    return;
  }

  const result = verifyChecksum(root);
  if (result.matches) {
    process.stdout.write(`upstream checksum verified: ${result.actual}\n`);
    return;
  }

  process.stderr.write(
    `upstream checksum mismatch\n  expected ${RECORDED_CHECKSUM}\n  actual   ${result.actual}\n` +
      `The pinned tag changed since the checksum was recorded. Review the difference, then run\n` +
      `npm run checksum:update if the change is expected.\n`,
  );
  process.exitCode = 1;
}

await main();
