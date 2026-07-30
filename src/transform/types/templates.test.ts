import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { applyTemplates } from './templates.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('applyTemplates', () => {
  it('should add a single type parameter to a class', () => {
    const sourceFile = parse(`/** @template T */\nexport class Lazy {}\n`);
    const result = applyTemplates(sourceFile);
    expect(sourceFile.getFullText()).toContain('class Lazy<T>');
    expect(result.added).toBe(1);
  });

  it('should add several comma separated parameters', () => {
    const sourceFile = parse(`/** @template KEY,VALUE */\nexport class Multi {}\n`);
    applyTemplates(sourceFile);
    expect(sourceFile.getFullText()).toContain('class Multi<KEY, VALUE>');
  });

  it('should ignore a trailing description', () => {
    const sourceFile = parse(
      `/** @template T SegmentReference or InitSegmentReference */\nexport class C {}\n`,
    );
    applyTemplates(sourceFile);
    expect(sourceFile.getFullText()).toContain('class C<T>');
  });

  it('should add a type parameter to a function', () => {
    const sourceFile = parse(`/** @template T */\nexport function id(x) {\n  return x;\n}\n`);
    applyTemplates(sourceFile);
    expect(sourceFile.getFullText()).toContain('function id<T>');
  });

  it('should add a type parameter to a method', () => {
    const sourceFile = parse(
      `export class C {\n  /** @template T */\n  m(x) {\n    return x;\n  }\n}\n`,
    );
    applyTemplates(sourceFile);
    expect(sourceFile.getFullText()).toContain('m<T>(');
  });

  it('should not duplicate an existing type parameter', () => {
    const sourceFile = parse(`/** @template T */\nexport class C<T> {}\n`);
    expect(applyTemplates(sourceFile).added).toBe(0);
  });

  it('should leave a class with no template alone', () => {
    const sourceFile = parse(`export class C {}\n`);
    expect(applyTemplates(sourceFile).added).toBe(0);
  });
});
