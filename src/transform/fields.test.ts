import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { declareFields } from './fields.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('declareFields', () => {
  it('should declare a field for a property assigned through this', () => {
    const sourceFile = parse(`export class C {\n  constructor() {\n    this.value_ = 1;\n  }\n}\n`);
    const result = declareFields(sourceFile);
    const text = sourceFile.getFullText();

    expect(result.declared).toBe(1);
    expect(text).toMatch(/class C \{[\s\S]*value_;[\s\S]*constructor/);
  });

  it('should carry the inline annotation onto the declaration', () => {
    const sourceFile = parse(
      `export class C {\n  constructor() {\n    /** @private {number} */\n    this.n_ = 1;\n  }\n}\n`,
    );
    declareFields(sourceFile);
    expect(sourceFile.getFullText()).toContain('@private {number}');
  });

  it('should declare each property once even if assigned repeatedly', () => {
    const sourceFile = parse(
      `export class C {\n  constructor() {\n    this.x = 1;\n  }\n  reset() {\n    this.x = 0;\n  }\n}\n`,
    );
    expect(declareFields(sourceFile).declared).toBe(1);
  });

  it('should not redeclare a property that is already a field', () => {
    const sourceFile = parse(
      `export class C {\n  x;\n  constructor() {\n    this.x = 1;\n  }\n}\n`,
    );
    expect(declareFields(sourceFile).declared).toBe(0);
  });

  it('should declare properties across several classes in a file', () => {
    const sourceFile = parse(
      `export class A {\n  constructor() {\n    this.a = 1;\n  }\n}\n` +
        `export class B {\n  constructor() {\n    this.b = 2;\n  }\n}\n`,
    );
    expect(declareFields(sourceFile).declared).toBe(2);
  });

  it('should leave a class with no this assignments untouched', () => {
    const sourceFile = parse(`export class C {\n  m() {\n    return 1;\n  }\n}\n`);
    expect(declareFields(sourceFile).declared).toBe(0);
  });

  it('should produce output that parses without error', () => {
    const sourceFile = parse(
      `export class C {\n  constructor() {\n    /** @private {number} */\n    this.n_ = 1;\n    this.list_ = [];\n  }\n}\n`,
    );
    declareFields(sourceFile);
    expect(sourceFile.getPreEmitDiagnostics()).toHaveLength(0);
  });
});
