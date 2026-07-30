import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transpileLibrary } from '../../src/pipeline.ts';

/**
 * The golden fixtures are hand written Closure files, not Shaka source, so no
 * upstream code is vendored. Each one exercises a shape the transform has to
 * handle, and its transpiled output is snapshotted, so any change to what the
 * pipeline emits shows up as a reviewable diff.
 */
const FIXTURES: Record<string, string> = {
  'lib/util/error.js':
    `/*! @license Shaka Player */\n` +
    `goog.provide('shaka.util.Error');\n\n` +
    `/**\n * An error.\n * @implements {shaka.util.IReleasable}\n * @export\n */\n` +
    `shaka.util.Error = class {\n` +
    `  /** @param {number} code */\n  constructor(code) {\n    /** @private {number} */\n    this.code_ = code;\n  }\n};\n\n` +
    `/** @enum {number} */\nshaka.util.Error.Code = {\n  OK: 0,\n};\n`,

  'lib/util/lazy.js':
    `goog.provide('shaka.util.Lazy');\n\n` +
    `/**\n * @template T\n * @final\n */\n` +
    `shaka.util.Lazy = class {\n` +
    `  /** @param {function():T} generate */\n  constructor(generate) {\n    /** @private {function():T} */\n    this.generate_ = generate;\n  }\n` +
    `  /** @return {T} */\n  value() {\n    const Lazy = shaka.util.Lazy;\n    return this.generate_();\n  }\n};\n`,

  'lib/net/engine.js':
    `goog.provide('shaka.net.Engine');\n` +
    `goog.require('shaka.util.Error');\n` +
    `goog.require('goog.Uri');\n\n` +
    `shaka.net.Engine = class {\n` +
    `  /**\n   * @param {string} uri\n   * @return {!shaka.util.Error}\n   */\n` +
    `  fail(uri) {\n    if (goog.DEBUG) {\n      const resolved = new goog.Uri(uri);\n      return new shaka.util.Error(resolved.toString().length);\n    }\n    return new shaka.util.Error(shaka.util.Error.Code.OK);\n  }\n};\n`,
};

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'shaka-ts-golden-'));
  mkdirSync(join(root, 'ui'), { recursive: true });
  mkdirSync(join(root, 'third_party/language-mapping-list'), { recursive: true });
  writeFileSync(
    join(root, 'third_party/language-mapping-list/language-mapping-list.js'),
    `goog.provide('mozilla.LanguageMapping');\n\nmozilla.LanguageMapping = {};\n`,
  );
  for (const [path, content] of Object.entries(FIXTURES)) {
    const target = join(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

const root = fixtureRoot();
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('golden fixtures', () => {
  const report = transpileLibrary(root);
  const byPath = new Map(report.files.map((file) => [file.outputPath, file.code]));

  for (const path of Object.keys(FIXTURES)) {
    const output = path.replace(/\.js$/, '.ts');
    it(`should transpile ${path} to a stable output`, () => {
      expect(byPath.get(output)).toMatchSnapshot();
    });
  }
});
