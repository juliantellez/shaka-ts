/**
 * The spike file set.
 *
 * This is the transitive `goog.require` closure of `lib/hls/hls_utils.js`, so
 * it is closed under dependency and every import resolves inside the set. It
 * was chosen because it exercises every shape the transform has to handle:
 *
 * - `lib/hls/hls_classes.js` provides five namespaces from one file
 * - `lib/util/manifest_parser_utils.js` is the only spike file using `goog.Uri`
 * - `lib/util/error.js` has `@implements` and a large `@enum`
 * - `lib/device/i_device.js` is an `@interface`
 * - `lib/util/lazy.js` and `lib/util/buffer_utils.js` use `@template`
 * - `lib/debug/asserts.js` is the `goog.asserts` shim boundary itself
 *
 * 12 files, 3284 lines against Shaka 4.16.5.
 */
export const SPIKE_FILES: readonly string[] = [
  'lib/debug/asserts.js',
  'lib/debug/log.js',
  'lib/device/device_factory.js',
  'lib/device/i_device.js',
  'lib/hls/hls_classes.js',
  'lib/hls/hls_utils.js',
  'lib/util/buffer_utils.js',
  'lib/util/error.js',
  'lib/util/lazy.js',
  'lib/util/manifest_parser_utils.js',
  'lib/util/string_utils.js',
  'lib/util/uint8array_utils.js',
];
