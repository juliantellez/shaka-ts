import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { buildExportNameMap, resolveImports } from './bindings.ts';
import { dropClosureOnlyCalls, removeNamespaceAnchors } from './closure-cleanup.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('dropClosureOnlyCalls', () => {
  it('should remove a goog.exportSymbol statement', () => {
    const sourceFile = parse(`const log = () => {};\ngoog.exportSymbol('log', log);\n`);
    const result = dropClosureOnlyCalls(sourceFile);
    expect(result.removed).toBe(1);
    expect(sourceFile.getFullText()).not.toContain('goog.exportSymbol');
    expect(sourceFile.getFullText()).toContain('const log = () => {};');
  });

  it('should remove a goog.exportSymbol nested inside a debug block', () => {
    const sourceFile = parse(
      `if (DEBUG) {\n  goog.exportSymbol('log', log);\n  log.level = 1;\n}\n`,
    );
    dropClosureOnlyCalls(sourceFile);
    const text = sourceFile.getFullText();
    expect(text).not.toContain('goog.exportSymbol');
    expect(text).toContain('log.level = 1;');
  });

  it('should leave other code untouched', () => {
    const sourceFile = parse(`foo();\nbar();\n`);
    expect(dropClosureOnlyCalls(sourceFile).removed).toBe(0);
    expect(sourceFile.getFullText()).toBe(`foo();\nbar();\n`);
  });
});

describe('removeNamespaceAnchors', () => {
  it('should remove a bare namespace typedef anchor', () => {
    const sourceFile = parse(
      `/** @typedef {{a: number}} */\nshaka.util.ParsedBox;\nconst x = 1;\n`,
    );
    const result = removeNamespaceAnchors(sourceFile);
    expect(result.removed).toBe(1);
    expect(sourceFile.getFullText()).not.toContain('shaka.util.ParsedBox;');
    expect(sourceFile.getFullText()).toContain('const x = 1;');
  });

  it('should not remove a call or an assignment on a namespace', () => {
    const sourceFile = parse(`shaka.log.info('x');\nshaka.a.b = 1;\n`);
    expect(removeNamespaceAnchors(sourceFile).removed).toBe(0);
  });

  it('should not remove a bare access that is not a known namespace root', () => {
    const sourceFile = parse(`config.value;\n`);
    expect(removeNamespaceAnchors(sourceFile).removed).toBe(0);
  });
});

/**
 * Shaka ships its own `goog.asserts` in `lib/debug/asserts.js`, so no assertion
 * shim is needed: a `goog.require('goog.asserts')` resolves like any other
 * import, and `goog.asserts.assert` becomes `asserts.assert` through the normal
 * passes. This confirms that, rather than adding a replacement module.
 */
describe('goog.asserts resolves as a module', () => {
  it('should import goog.asserts from the file that provides it', () => {
    const consumer: ModuleRecord = {
      path: 'lib/media/x.js',
      provides: ['shaka.media.X'],
      requires: ['goog.asserts'],
      requireTypes: [],
    };
    const provider: ModuleRecord = {
      path: 'lib/debug/asserts.js',
      provides: ['goog.asserts'],
      requires: [],
      requireTypes: [],
    };
    const graph: DependencyGraph = {
      modules: new Map([
        [consumer.path, consumer],
        [provider.path, provider],
      ]),
      providers: new Map([['goog.asserts', provider.path]]),
    };
    const names = buildExportNameMap(graph);

    const resolved = resolveImports(consumer, graph, names);
    expect(resolved.unresolved).toHaveLength(0);
    expect(resolved.imports[0]).toMatchObject({
      namespace: 'goog.asserts',
      localName: 'asserts',
      specifier: '../debug/asserts.ts',
    });
  });
});
