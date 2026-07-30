import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { buildExportNameMap } from './bindings.ts';
import { convertRequiresToImports } from './imports.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

/**
 * A graph is built from records so the import pass can resolve namespaces to
 * providers and their export names, exactly as it does over the real library.
 */
function graphOf(records: ModuleRecord[]): { graph: DependencyGraph; names: Map<string, string> } {
  const graph: DependencyGraph = {
    modules: new Map(records.map((record) => [record.path, record])),
    providers: new Map(records.flatMap((r) => r.provides.map((namespace) => [namespace, r.path]))),
  };
  return { graph, names: buildExportNameMap(graph) };
}

function record(
  path: string,
  provides: string[],
  requires: string[] = [],
  requireTypes: string[] = [],
): ModuleRecord {
  return { path, provides, requires, requireTypes };
}

describe('convertRequiresToImports', () => {
  it('should import a required namespace under its exported name', () => {
    const consumer = record('lib/a.js', ['shaka.A'], ['shaka.util.Error']);
    const provider = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([consumer, provider]);

    const sourceFile = parse(`goog.require('shaka.util.Error');\n\nshaka.A = class {};\n`);
    const result = convertRequiresToImports(sourceFile, consumer, graph, names);
    const text = sourceFile.getFullText();

    expect(text).toContain("import { UtilError } from './util/error.ts';");
    expect(text).not.toContain("goog.require('shaka.util.Error')");
    expect(result.imports[0]?.localName).toBe('UtilError');
  });

  it('should turn goog.requireType into an import type', () => {
    const consumer = record('lib/a.js', ['shaka.A'], [], ['shaka.util.Error']);
    const provider = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([consumer, provider]);

    const sourceFile = parse(`goog.requireType('shaka.util.Error');\n\nshaka.A = class {};\n`);
    convertRequiresToImports(sourceFile, consumer, graph, names);
    expect(sourceFile.getFullText()).toContain("import type { UtilError } from './util/error.ts';");
  });

  it('should combine several names from one file into a single import', () => {
    const consumer = record('lib/a.js', ['shaka.A'], ['shaka.hls.Tag', 'shaka.hls.Segment']);
    const provider = record('lib/hls/classes.js', ['shaka.hls.Tag', 'shaka.hls.Segment']);
    const { graph, names } = graphOf([consumer, provider]);

    const sourceFile = parse(
      `goog.require('shaka.hls.Tag');\ngoog.require('shaka.hls.Segment');\n\nshaka.A = class {};\n`,
    );
    convertRequiresToImports(sourceFile, consumer, graph, names);
    expect(sourceFile.getFullText()).toContain("import { Segment, Tag } from './hls/classes.ts';");
  });

  it('should alias when two files export the same name', () => {
    const consumer = record('lib/a.js', ['shaka.A'], ['shaka.p.Timer', 'shaka.q.Timer']);
    const p = record('lib/p/timer.js', ['shaka.p.Timer']);
    const q = record('lib/q/timer.js', ['shaka.q.Timer']);
    const { graph, names } = graphOf([consumer, p, q]);

    const sourceFile = parse(
      `goog.require('shaka.p.Timer');\ngoog.require('shaka.q.Timer');\n\nshaka.A = class {};\n`,
    );
    const result = convertRequiresToImports(sourceFile, consumer, graph, names);
    const localNames = result.imports.map((binding) => binding.localName);

    expect(localNames).toContain('Timer');
    expect(localNames).toContain('Timer2');
    expect(sourceFile.getFullText()).toContain('Timer as Timer2');
  });

  it('should report a namespace no file provides as unresolved', () => {
    const consumer = record('lib/a.js', ['shaka.A'], ['goog.Uri']);
    const { graph, names } = graphOf([consumer]);

    const sourceFile = parse(`goog.require('goog.Uri');\n\nshaka.A = class {};\n`);
    const result = convertRequiresToImports(sourceFile, consumer, graph, names);

    expect(result.unresolved).toEqual(['goog.Uri']);
    expect(result.imports).toHaveLength(0);
    expect(sourceFile.getFullText()).not.toContain('goog.require');
  });

  it('should keep the license header at the very top', () => {
    const consumer = record('lib/a.js', ['shaka.A'], ['shaka.util.Error']);
    const provider = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([consumer, provider]);

    const sourceFile = parse(
      `/*! @license Shaka Player */\n\ngoog.require('shaka.util.Error');\n\nshaka.A = class {};\n`,
    );
    convertRequiresToImports(sourceFile, consumer, graph, names);
    const text = sourceFile.getFullText();
    expect(text.indexOf('@license')).toBeLessThan(text.indexOf('import'));
  });
});
