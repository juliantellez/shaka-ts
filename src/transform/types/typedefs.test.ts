import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { convertTypedefs } from './typedefs.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('convertTypedefs', () => {
  it('should turn a record typedef into a type alias', () => {
    const sourceFile = parse(`/** @typedef {{a: number, b: string}} */\nshaka.util.Box;\n`);
    const result = convertTypedefs(sourceFile);
    const text = sourceFile.getFullText();

    expect(text).toContain('export type Box = { a: number; b: string };');
    expect(text).not.toContain('shaka.util.Box;');
    expect(result.declared).toEqual([{ namespace: 'shaka.util.Box', localName: 'Box' }]);
  });

  it('should rename references to the typedef in the file', () => {
    const sourceFile = parse(
      `/** @typedef {number} */\nshaka.util.Id;\n/** @type {shaka.util.Id} */\nlet x;\n`,
    );
    convertTypedefs(sourceFile);
    expect(sourceFile.getFullText()).toContain('@type {Id}');
  });

  it('should translate a union typedef', () => {
    const sourceFile = parse(`/** @typedef {number|string} */\nshaka.util.Key;\n`);
    convertTypedefs(sourceFile);
    expect(sourceFile.getFullText()).toContain('export type Key = number | string;');
  });

  it('should leave a bare statement with no typedef alone', () => {
    const sourceFile = parse(`shaka.util.Something;\n`);
    expect(convertTypedefs(sourceFile).declared).toHaveLength(0);
  });
});
