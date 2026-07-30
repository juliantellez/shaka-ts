import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { buildExportNameMap } from './bindings.ts';
import { convertFileLocals } from './locals.ts';

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

describe('convertFileLocals', () => {
  it('should turn a file local class into a plain local class and rename its uses', () => {
    const rec = record('lib/dash/segment_template.js', ['shaka.dash.SegmentTemplate']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(
      `shaka.dash.TimelineSegmentIndex = class {\n  m() {}\n};\n` +
        `const x = new shaka.dash.TimelineSegmentIndex();\n`,
    );
    const result = convertFileLocals(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();

    expect(text).toContain('class TimelineSegmentIndex {');
    expect(text).not.toContain('export class TimelineSegmentIndex');
    expect(text).toContain('const x = new TimelineSegmentIndex();');
    expect(result.declared).toEqual([
      { namespace: 'shaka.dash.TimelineSegmentIndex', localName: 'TimelineSegmentIndex' },
    ]);
  });

  it('should not touch a static member of a provided namespace', () => {
    const rec = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`shaka.util.Error.Code = {\n  OK: 0,\n};\n`);
    const result = convertFileLocals(sourceFile, rec, graph, names);

    expect(result.declared).toHaveLength(0);
    expect(sourceFile.getFullText()).toContain('shaka.util.Error.Code = {');
  });

  it('should keep the heritage of an extended file local class', () => {
    const rec = record('lib/a.js', ['shaka.A'], ['shaka.media.SegmentIndex']);
    const provider = record('lib/media/segment_index.js', ['shaka.media.SegmentIndex']);
    const { graph, names } = graphOf([rec, provider]);
    const sourceFile = parse(`shaka.dash.T = class extends shaka.media.SegmentIndex {};\n`);
    convertFileLocals(sourceFile, rec, graph, names);
    // The heritage reference is left for the namespace rewrite; the declaration is local.
    expect(sourceFile.getFullText()).toContain('class T extends shaka.media.SegmentIndex {');
  });

  it('should declare only the root of a nested namespace group', () => {
    const rec = record('lib/ui/x.js', ['shaka.ui.X']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(
      `shaka.extern = {};\nshaka.extern.IUIElement = class {};\n` +
        `shaka.extern.IUIElement.Factory = class {};\n`,
    );
    const result = convertFileLocals(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();

    expect(result.declared).toEqual([{ namespace: 'shaka.extern', localName: 'extern' }]);
    expect(text).toContain('const extern = {};');
    expect(text).toContain('extern.IUIElement = class {};');
    expect(text).toContain('extern.IUIElement.Factory = class {};');
  });

  it('should turn a file local constant into a local const', () => {
    const rec = record('lib/offline/x.js', ['shaka.offline.X']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`shaka.offline.indexeddb.Timeout = 5000;\n`);
    convertFileLocals(sourceFile, rec, graph, names);
    expect(sourceFile.getFullText()).toContain('const Timeout = 5000;');
  });
});
