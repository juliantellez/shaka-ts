/**
 * Closure globals that no Shaka source file provides, mapped to the local
 * runtime module that replaces them.
 *
 * These are the pieces of the Closure library Shaka actually uses. Rather than
 * pull in the Closure library, each is reimplemented under `src/runtime` and
 * wired in here, so a required or referenced Closure global resolves to a real
 * ES module import instead of an undefined free variable.
 */
export interface RuntimeModule {
  /** The identifier exported by the runtime module. */
  readonly exportName: string;
  /** The runtime module path, relative to the output root. */
  readonly module: string;
}

export const RUNTIME_MODULES: ReadonlyMap<string, RuntimeModule> = new Map([
  ['goog.Uri', { exportName: 'Uri', module: 'runtime/uri.ts' }],
  ['goog.DEBUG', { exportName: 'DEBUG', module: 'runtime/debug.ts' }],
]);

/**
 * Builds the import specifier from a source file to a runtime module.
 *
 * The runtime modules sit at the output root, beside `lib` and `ui`, so a file
 * reaches them by climbing out of its own directory. `lib/net/x.js` becomes
 * `../../runtime/uri.ts`.
 */
export function runtimeSpecifier(fromPath: string, module: string): string {
  const depth = fromPath.split('/').length - 1;
  return `${'../'.repeat(depth)}${module}`;
}
