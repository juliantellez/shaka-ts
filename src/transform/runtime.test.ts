import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { buildExportNameMap, resolveImports } from './bindings.ts';
import { convertRequiresToImports } from './imports.ts';
import { rewriteReferences } from './references.ts';
import { runtimeSpecifier } from './runtime.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

function graphOf(records: ModuleRecord[]): { graph: DependencyGraph; names: Map<string, string> } {
  const graph: DependencyGraph = {
    modules: new Map(records.map((record) => [record.path, record])),
    providers: new Map(records.flatMap((r) => r.provides.map((namespace) => [namespace, r.path]))),
  };
  return { graph, names: buildExportNameMap(graph) };
}

function record(path: string, provides: string[], requires: string[] = []): ModuleRecord {
  return { path, provides, requires, requireTypes: [] };
}

describe('runtimeSpecifier', () => {
  it('should climb out of the source directory to the runtime root', () => {
    expect(runtimeSpecifier('lib/net/networking_engine.js', 'runtime/uri.ts')).toBe(
      '../../runtime/uri.ts',
    );
    expect(runtimeSpecifier('lib/a.js', 'runtime/uri.ts')).toBe('../runtime/uri.ts');
  });
});

describe('goog.Uri resolution', () => {
  it('should resolve goog.Uri to the runtime module instead of leaving it unresolved', () => {
    const rec = record('lib/net/x.js', ['shaka.net.X'], ['goog.Uri']);
    const { graph, names } = graphOf([rec]);

    const resolved = resolveImports(rec, graph, names);
    expect(resolved.unresolved).toHaveLength(0);
    expect(resolved.imports[0]).toMatchObject({
      namespace: 'goog.Uri',
      localName: 'Uri',
      specifier: '../../runtime/uri.ts',
    });
  });

  it('should import Uri and rewrite goog.Uri references', () => {
    const rec = record('lib/net/x.js', ['shaka.net.X'], ['goog.Uri']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(
      `goog.require('goog.Uri');\n\nshaka.net.X = class {\n  m() {\n    return new goog.Uri('a');\n  }\n};\n`,
    );

    convertRequiresToImports(sourceFile, rec, graph, names);
    rewriteReferences(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();

    expect(text).toContain("import { Uri } from '../../runtime/uri.ts';");
    expect(text).toContain("return new Uri('a');");
    expect(text).not.toContain('goog.Uri');
  });
});
