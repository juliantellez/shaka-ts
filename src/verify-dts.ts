import { emitDeclarations, exportedNames } from './dts.ts';

/** Public symbols the declarations must expose, as a sanity check on the surface. */
const REQUIRED_EXPORTS = ['Player', 'DashParser', 'HlsParser'];

/**
 * Emits the declarations and checks the public surface survived.
 *
 * The upstream project generates its own definitions with a separate tool; this
 * generates them straight from the transpiled source instead. A full diff would
 * need upstream's generated file, which is not in the source tree, so the check
 * here is that the declarations exist and expose the public entry points.
 */
function main(): void {
  const dtsPath = emitDeclarations('build/package');
  const names = exportedNames(dtsPath);

  const missing = REQUIRED_EXPORTS.filter((name) => !names.includes(name));
  process.stdout.write(`declarations: ${String(names.length)} exports\n`);

  if (names.length === 0 || missing.length > 0) {
    process.stderr.write(
      `missing expected exports: ${missing.join(', ') || '(no exports emitted)'}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`public surface present (${REQUIRED_EXPORTS.join(', ')}, and more)\n`);
}

main();
