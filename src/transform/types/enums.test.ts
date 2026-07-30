import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { convertEnums } from './enums.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('convertEnums', () => {
  it('should add as const and a value type to an @enum object', () => {
    const sourceFile = parse(
      `/** @enum {number} */\nexport const Level = {\n  OFF: 0,\n  ON: 1,\n};\n`,
    );
    const result = convertEnums(sourceFile);
    const text = sourceFile.getFullText();

    expect(text).toContain('} as const;');
    expect(text).toContain('export type Level = (typeof Level)[keyof typeof Level];');
    expect(result.converted).toBe(1);
  });

  it('should let the enum name be used as both a value and a type', () => {
    const sourceFile = parse(
      `/** @enum {string} */\nexport const Kind = {\n  A: 'a',\n};\n` +
        `export function use(k: Kind) {\n  return Kind.A;\n}\n`,
    );
    convertEnums(sourceFile);

    // Re-check the output as TypeScript, since the input was parsed as JS.
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { strict: true },
    });
    const checked = project.createSourceFile('out.ts', sourceFile.getFullText());
    expect(checked.getPreEmitDiagnostics()).toHaveLength(0);
  });

  it('should add as const to a member enum on a class', () => {
    const sourceFile = parse(
      `export class log {}\n/** @enum {number} */\nlog.Level = {\n  OFF: 0,\n};\n`,
    );
    const result = convertEnums(sourceFile);
    expect(sourceFile.getFullText()).toContain('} as const;');
    expect(result.converted).toBe(1);
  });

  it('should ignore a plain object with no @enum tag', () => {
    const sourceFile = parse(`export const config = {\n  a: 1,\n};\n`);
    expect(convertEnums(sourceFile).converted).toBe(0);
  });

  it('should not convert an object twice', () => {
    const sourceFile = parse(`/** @enum {number} */\nexport const E = {\n  A: 0,\n} as const;\n`);
    expect(convertEnums(sourceFile).converted).toBe(0);
  });
});
