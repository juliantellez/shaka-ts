import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'build/**',
    'dist/**',
    'upstream/**',
    'coverage/**',
    'node_modules/**',
    // Karma requires its config as CommonJS, so it is not part of the typed project.
    'karma.conf.cjs',
    // A DOM-targeted declaration template for the transpiled output, checked by
    // the checkJs pass rather than the Node toolchain tsconfig.
    'src/dom.d.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
);
