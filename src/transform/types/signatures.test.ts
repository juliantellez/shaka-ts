import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { applySignatureTypes } from './signatures.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('applySignatureTypes', () => {
  it('should set parameter and return types on a method', () => {
    const sourceFile = parse(
      `export class C {\n  /**\n   * @param {string} name\n   * @return {number}\n   */\n  m(name) {\n    return 1;\n  }\n}\n`,
    );
    const result = applySignatureTypes(sourceFile);
    const text = sourceFile.getFullText();

    expect(text).toContain('m(name: string): number');
    expect(result.params).toBe(1);
    expect(result.returns).toBe(1);
  });

  it('should drop the non-null prefix through the type parser', () => {
    const sourceFile = parse(`export class C {\n  /** @param {!Element} el */\n  m(el) {}\n}\n`);
    applySignatureTypes(sourceFile);
    expect(sourceFile.getFullText()).toContain('m(el: Element)');
  });

  it('should make a trailing-equals parameter optional', () => {
    const sourceFile = parse(`export class C {\n  /** @param {string=} name */\n  m(name) {}\n}\n`);
    applySignatureTypes(sourceFile);
    expect(sourceFile.getFullText()).toContain('m(name?: string)');
  });

  it('should type a rest parameter as an array', () => {
    const sourceFile = parse(
      `export class C {\n  /** @param {...number} nums */\n  m(...nums) {}\n}\n`,
    );
    applySignatureTypes(sourceFile);
    expect(sourceFile.getFullText()).toContain('m(...nums: number[])');
  });

  it('should not set a return type on a constructor', () => {
    const sourceFile = parse(
      `export class C {\n  /**\n   * @param {number} n\n   * @return {void}\n   */\n  constructor(n) {}\n}\n`,
    );
    applySignatureTypes(sourceFile);
    const text = sourceFile.getFullText();
    expect(text).toContain('constructor(n: number)');
    expect(text).not.toContain('constructor(n: number): void');
  });

  it('should type a standalone function', () => {
    const sourceFile = parse(
      `/**\n * @param {?number} x\n * @return {boolean}\n */\nexport function f(x) {\n  return true;\n}\n`,
    );
    applySignatureTypes(sourceFile);
    expect(sourceFile.getFullText()).toContain('f(x: number | null): boolean');
  });

  it('should leave an already typed parameter alone', () => {
    const sourceFile = parse(
      `export class C {\n  /** @param {string} name */\n  m(name: number) {}\n}\n`,
    );
    expect(applySignatureTypes(sourceFile).params).toBe(0);
    expect(sourceFile.getFullText()).toContain('m(name: number)');
  });
});
