import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { readModule, type DependencyGraph, type ModuleRecord } from '../graph.ts';
import { buildExportNameMap, resolveImports } from './bindings.ts';
import { convertRequiresToImports } from './imports.ts';
import { rewriteReferences } from './references.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

describe('readModule implicit globals', () => {
  it('should detect goog.DEBUG used in code but not in a comment or string', () => {
    const root = join(tmpdir(), `shaka-ts-debug-${String(process.pid)}`);
    mkdirSync(join(root, 'lib'), { recursive: true });

    writeFileSync(join(root, 'lib/used.js'), `if (goog.DEBUG) { log(); }\n`);
    writeFileSync(join(root, 'lib/commented.js'), `// goog.DEBUG only here\nconst x = 1;\n`);
    writeFileSync(join(root, 'lib/string.js'), `const s = 'goog.DEBUG in a string';\n`);

    expect(readModule(root, 'lib/used.js').implicitGlobals).toEqual(['goog.DEBUG']);
    expect(readModule(root, 'lib/commented.js').implicitGlobals).toEqual([]);
    expect(readModule(root, 'lib/string.js').implicitGlobals).toEqual([]);
  });
});

describe('goog.DEBUG resolution', () => {
  const record = (implicitGlobals: string[]): ModuleRecord => ({
    path: 'lib/a.js',
    provides: ['shaka.A'],
    requires: [],
    requireTypes: [],
    implicitGlobals,
  });

  it('should resolve goog.DEBUG to the runtime debug module', () => {
    const rec = record(['goog.DEBUG']);
    const { graph, names } = graphOf([rec]);
    const resolved = resolveImports(rec, graph, names);
    expect(resolved.imports[0]).toMatchObject({
      namespace: 'goog.DEBUG',
      localName: 'DEBUG',
      specifier: '../runtime/debug.ts',
    });
  });

  it('should import DEBUG and rewrite its references', () => {
    const rec = record(['goog.DEBUG']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`shaka.A = class {\n  m() {\n    if (goog.DEBUG) log();\n  }\n};\n`);

    convertRequiresToImports(sourceFile, rec, graph, names);
    rewriteReferences(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();

    expect(text).toContain("import { DEBUG } from '../runtime/debug.ts';");
    expect(text).toContain('if (DEBUG) log();');
    expect(text).not.toContain('goog.DEBUG');
  });
});
