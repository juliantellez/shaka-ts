import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transpileLibrary } from './pipeline.ts';

/**
 * Writes a tiny two file library to a temp directory and transpiles it, so the
 * whole pipeline is exercised end to end without fetching upstream.
 */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'shaka-ts-pipeline-'));
  mkdirSync(join(root, 'lib/util'), { recursive: true });
  mkdirSync(join(root, 'lib/net'), { recursive: true });
  mkdirSync(join(root, 'ui'), { recursive: true });
  mkdirSync(join(root, 'third_party/language-mapping-list'), { recursive: true });

  writeFileSync(
    join(root, 'lib/util/error.js'),
    `/*! @license Shaka Player */\ngoog.provide('shaka.util.Error');\n\n` +
      `shaka.util.Error = class {};\nshaka.util.Error.Code = { OK: 0 };\n`,
  );
  writeFileSync(
    join(root, 'lib/net/engine.js'),
    `goog.provide('shaka.net.Engine');\ngoog.require('shaka.util.Error');\ngoog.require('goog.Uri');\n\n` +
      `shaka.net.Engine = class {\n  fail() {\n    throw new shaka.util.Error(shaka.util.Error.Code.OK);\n  }\n  uri(u) {\n    return new goog.Uri(u);\n  }\n};\n`,
  );
  // The third party file must exist because the pipeline always includes it.
  writeFileSync(
    join(root, 'third_party/language-mapping-list/language-mapping-list.js'),
    `goog.provide('mozilla.LanguageMapping');\n\nmozilla.LanguageMapping = {};\n`,
  );
  return root;
}

const root = fixtureRoot();
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('transpileLibrary', () => {
  const report = transpileLibrary(root);
  const byPath = new Map(report.files.map((file) => [file.outputPath, file.code]));

  it('should emit a .ts file for every source file', () => {
    expect(byPath.has('lib/util/error.ts')).toBe(true);
    expect(byPath.has('lib/net/engine.ts')).toBe(true);
  });

  it('should export the provided classes', () => {
    expect(byPath.get('lib/util/error.ts')).toContain('export class UtilError {');
    expect(byPath.get('lib/net/engine.ts')).toContain('export class Engine {');
  });

  it('should import across modules and from the runtime', () => {
    const engine = byPath.get('lib/net/engine.ts') ?? '';
    expect(engine).toContain("import { UtilError } from '../util/error.ts';");
    expect(engine).toContain("import { Uri } from '../../runtime/uri.ts';");
  });

  it('should leave no goog reference in the transpiled code', () => {
    const engine = byPath.get('lib/net/engine.ts') ?? '';
    expect(engine).toContain('throw new UtilError(UtilError.Code.OK);');
    expect(engine).toContain('return new Uri(u);');
    expect(engine).not.toContain('goog.');
  });

  it('should preserve the license header at the top', () => {
    const error = byPath.get('lib/util/error.ts') ?? '';
    expect(error.indexOf('@license')).toBeLessThan(error.indexOf('export'));
  });

  it('should report no unresolved namespaces for a self contained library', () => {
    expect(report.unresolved.size).toBe(0);
  });
});
