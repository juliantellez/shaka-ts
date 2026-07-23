/**
 * Replacement for the Closure `goog.DEBUG` define.
 *
 * Closure resolved this at compile time via `-D goog.DEBUG=false` and then
 * eliminated the dead branches. The equivalent here is a constant the bundler
 * can inline, so `if (DEBUG)` blocks still disappear from a production build.
 *
 * Bundlers substitute this at build time. The runtime fallback only applies
 * when the module is executed directly, as in tests.
 */

/**
 * Shaka targets browsers, where `process` does not exist. The global is read
 * through a narrow local shape rather than the Node typings, which would
 * otherwise assert it is always present and make the guard look redundant.
 */
interface MaybeNodeGlobal {
  readonly process?: { readonly env?: Record<string, string | undefined> };
}

export const DEBUG: boolean =
  (globalThis as MaybeNodeGlobal).process?.env?.['NODE_ENV'] !== 'production';
