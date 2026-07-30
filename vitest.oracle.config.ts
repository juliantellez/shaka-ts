import { defineConfig } from 'vitest/config';

/**
 * The oracle runs Shaka's own unit tests, unmodified, against the transpiled
 * output. It needs a browser like environment for the `window` and text codec
 * globals the specs and the player touch, and it needs `describe`, `it` and
 * `expect` as globals because the specs are plain Jasmine scripts.
 *
 * It is a separate config because it depends on `npm run build` having produced
 * the transpiled tree, so it runs after the build rather than in the fast unit
 * test pass.
 */
export default defineConfig({
  test: {
    include: ['test/oracle/**/*.test.ts'],
    environment: 'happy-dom',
    globals: true,
    testTimeout: 20_000,
  },
});
