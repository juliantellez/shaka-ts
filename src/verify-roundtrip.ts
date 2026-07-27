import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fetchUpstream } from './fetch.ts';
import { roundTripsCleanly } from './parse.ts';

/**
 * Proves the byte-faithful round trip on the real upstream library, not just on
 * the hand written samples in the unit tests.
 *
 * This is the strongest evidence that ts-morph is a safe foundation for the
 * transform: if every Shaka source file parses and reprints unchanged, then any
 * edit reflows only the nodes it touches. Run manually, or in a job that is
 * allowed to reach the network, since it clones the upstream tag.
 */
async function main(): Promise<void> {
  const root = await fetchUpstream();
  const listing = execFileSync('find', [join(root, 'lib'), join(root, 'ui'), '-name', '*.js'], {
    encoding: 'utf8',
  });
  const files = listing
    .trim()
    .split('\n')
    .filter((path) => path.length > 0);

  const failures: string[] = [];
  for (const absolutePath of files) {
    const source = readFileSync(absolutePath, 'utf8');
    const upstreamPath = relative(root, absolutePath);
    if (!roundTripsCleanly(upstreamPath, source)) {
      failures.push(upstreamPath);
    }
  }

  process.stdout.write(
    `byte-faithful round trip: ${String(files.length - failures.length)}/${String(files.length)} ok\n`,
  );
  for (const failure of failures) {
    process.stdout.write(`  FAIL ${failure}\n`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
