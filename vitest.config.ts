import { defineConfig, configDefaults } from 'vitest/config';

/**
 * The fast unit test pass over the transpiler's own source.
 *
 * The oracle under `test/oracle` is excluded here because it depends on a build
 * of the transpiled tree and runs separately through
 * `vitest.oracle.config.ts`.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/oracle/**'],
  },
});
