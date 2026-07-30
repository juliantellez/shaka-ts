import { installGlobalShaka, runSpec } from './global.ts';

/**
 * Runs Shaka's own util unit tests, unmodified, against the transpiled output.
 *
 * These specs are the correctness oracle: if the transform changed behaviour,
 * they fail. The set here is the pure logic util layer, which needs no media
 * pipeline, so it runs in a DOM environment without a real browser. The full
 * suite, which drives MediaSource and EME in a real browser through Karma,
 * builds on this and is tracked as remaining work.
 */
const NEEDED = ['shaka.util.BufferUtils', 'shaka.util.ArrayUtils', 'shaka.util.Functional'];

const SPECS = [
  'test/util/buffer_utils_unit.js',
  'test/util/array_utils_unit.js',
  'test/util/functional_unit.js',
];

// The global namespace must exist before the specs are evaluated, because a
// spec reads shaka.util.X while its describe body is being collected, so this
// runs at module load with top level await rather than in a hook.
await installGlobalShaka(NEEDED);

for (const spec of SPECS) {
  runSpec(spec);
}
