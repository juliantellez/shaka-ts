import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { buildExportNameMap } from './bindings.ts';
import { rewriteReferences } from './references.ts';

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

function record(
  path: string,
  provides: string[],
  requires: string[] = [],
  requireTypes: string[] = [],
): ModuleRecord {
  return { path, provides, requires, requireTypes };
}

describe('rewriteReferences', () => {
  it('should rewrite a reference to an own provided namespace', () => {
    const rec = record('lib/hls/tag.js', ['shaka.hls.Tag']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`export class Tag {}\nconst t = new shaka.hls.Tag();\n`);

    rewriteReferences(sourceFile, rec, graph, names);
    expect(sourceFile.getFullText()).toContain('const t = new Tag();');
  });

  it('should keep the suffix of a longer reference through the longest binding', () => {
    const rec = record('lib/a.js', ['shaka.A'], ['shaka.util.Error']);
    const provider = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([rec, provider]);
    const sourceFile = parse(`throwCode(shaka.util.Error.Code.BAD);\n`);

    rewriteReferences(sourceFile, rec, graph, names);
    expect(sourceFile.getFullText()).toContain('throwCode(UtilError.Code.BAD);');
  });

  it('should rewrite a namespace inside a JSDoc annotation', () => {
    const rec = record('lib/a.js', ['shaka.A'], ['shaka.util.Error']);
    const provider = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([rec, provider]);
    const sourceFile = parse(
      `/**\n * @param {shaka.util.Error} error\n */\nfunction f(error) {}\n`,
    );

    rewriteReferences(sourceFile, rec, graph, names);
    expect(sourceFile.getFullText()).toContain('@param {UtilError} error');
  });

  it('should not rewrite a namespace inside a string literal', () => {
    const rec = record('lib/a.js', ['shaka.A'], ['shaka.util.Error']);
    const provider = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([rec, provider]);
    const sourceFile = parse(
      `log('failed in shaka.util.Error handler');\nnew shaka.util.Error();\n`,
    );

    rewriteReferences(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();
    expect(text).toContain("log('failed in shaka.util.Error handler');");
    expect(text).toContain('new UtilError();');
  });

  it('should not rewrite a namespace inside a template literal', () => {
    const rec = record('lib/a.js', ['shaka.A'], ['shaka.util.Error']);
    const provider = record('lib/util/error.js', ['shaka.util.Error']);
    const { graph, names } = graphOf([rec, provider]);
    const sourceFile = parse('const m = `saw shaka.util.Error here`;\n');

    rewriteReferences(sourceFile, rec, graph, names);
    expect(sourceFile.getFullText()).toContain('`saw shaka.util.Error here`');
  });

  it('should rewrite a namespace that follows a spread operator', () => {
    const rec = record('lib/text/text_utils.js', ['shaka.text.Utils']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`result.push(...shaka.text.Utils.getCuesToFlatten(x));\n`);

    rewriteReferences(sourceFile, rec, graph, names);
    expect(sourceFile.getFullText()).toContain('result.push(...Utils.getCuesToFlatten(x));');
  });

  it('should not rewrite a namespace that is a property of another object', () => {
    const rec = record('lib/a.js', ['shaka.A']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`const x = foo.shaka.A;\n`);

    rewriteReferences(sourceFile, rec, graph, names);
    expect(sourceFile.getFullText()).toContain('foo.shaka.A');
  });

  it('should not rewrite a longer identifier that merely ends with a namespace', () => {
    const rec = record('lib/a.js', ['shaka.A']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`const x = myshaka.A;\nconst y = shaka.Asher;\n`);

    rewriteReferences(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();
    expect(text).toContain('myshaka.A');
    expect(text).toContain('shaka.Asher');
  });

  it('should rewrite an imported name under its alias', () => {
    const rec = record('lib/a.js', ['shaka.A'], ['shaka.p.Timer', 'shaka.q.Timer']);
    const p = record('lib/p/timer.js', ['shaka.p.Timer']);
    const q = record('lib/q/timer.js', ['shaka.q.Timer']);
    const { graph, names } = graphOf([rec, p, q]);
    const sourceFile = parse(`new shaka.p.Timer();\nnew shaka.q.Timer();\n`);

    rewriteReferences(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();
    expect(text).toContain('new Timer();');
    expect(text).toContain('new Timer2();');
  });

  it('should remove a self referential alias the rewrite produces', () => {
    const rec = record('lib/util/buffer_utils.js', ['shaka.util.BufferUtils']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(
      `export class BufferUtils {\n  static equal(a, b) {\n    const BufferUtils = shaka.util.BufferUtils;\n    return BufferUtils.same(a, b);\n  }\n}\n`,
    );

    rewriteReferences(sourceFile, rec, graph, names);
    const text = sourceFile.getFullText();
    expect(text).not.toContain('const BufferUtils = BufferUtils;');
    expect(text).toContain('return BufferUtils.same(a, b);');
  });

  it('should report how many references it rewrote', () => {
    const rec = record('lib/hls/tag.js', ['shaka.hls.Tag']);
    const { graph, names } = graphOf([rec]);
    const sourceFile = parse(`shaka.hls.Tag; shaka.hls.Tag; shaka.hls.Tag;\n`);

    const result = rewriteReferences(sourceFile, rec, graph, names);
    expect(result.rewritten).toBe(3);
  });
});
