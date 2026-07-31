import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build as esbuild } from 'esbuild';
import karma from 'karma';
import { buildGlobalEntry } from './global-entry.ts';
import { SUITE_PASS_FLOOR, evaluateSuite, type SuiteResult } from './suite-baseline.ts';

const UPSTREAM = 'upstream/shaka-player';
const SUITE_DIR = 'build/suite';
const GLOBAL_ENTRY = `${SUITE_DIR}/shaka-global.ts`;
const GLOBAL_BUNDLE = `${SUITE_DIR}/shaka-global.js`;

/**
 * Bundles the whole transpiled library as a global.
 *
 * The specs reach the library through `window.shaka`, so this rebuilds that
 * global from the transpiled modules and bundles it as a classic script Karma
 * can load. Written into build/suite, outside the package the checkJs ratchet
 * scans, so the generated entry never counts against it.
 */
async function buildGlobalBundle(): Promise<void> {
  await mkdir(SUITE_DIR, { recursive: true });
  await writeFile(GLOBAL_ENTRY, buildGlobalEntry(UPSTREAM, '../package/'), 'utf8');
  await esbuild({
    entryPoints: [GLOBAL_ENTRY],
    bundle: true,
    format: 'iife',
    target: 'es2017',
    outfile: GLOBAL_BUNDLE,
  });
}

/** Runs Karma once and resolves with the run's counts. */
async function runKarma(): Promise<SuiteResult> {
  const config = await karma.config.parseConfig(
    resolve('karma.conf.cjs'),
    { singleRun: true },
    { promiseConfig: true, throwErrors: true },
  );

  return new Promise<SuiteResult>((resolvePromise, rejectPromise) => {
    let captured: SuiteResult | undefined;
    const server = new karma.Server(config, () => {
      if (captured === undefined) {
        rejectPromise(new Error('Karma finished without reporting a run result'));
        return;
      }
      resolvePromise(captured);
    });
    server.on('run_complete', (_browsers, result) => {
      captured = {
        success: result.success,
        failed: result.failed,
        skipped: result.skipped ?? 0,
        disconnected: result.disconnected,
      };
    });
    server.start();
  });
}

async function main(): Promise<void> {
  await buildGlobalBundle();
  const result = await runKarma();
  const verdict = evaluateSuite(result);

  process.stdout.write(
    `suite: ${String(result.success)} passed, ${String(result.failed)} failed, ` +
      `${String(result.skipped)} skipped, ${String(verdict.executed)} executed ` +
      `(floor ${String(SUITE_PASS_FLOOR)})\n`,
  );

  if (!verdict.ok) {
    process.stderr.write(`\n${verdict.reason}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${verdict.reason}\n`);
}

await main();
