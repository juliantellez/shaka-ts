import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { dropClosureAnnotations } from './annotations.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('dropClosureAnnotations', () => {
  it('should drop an @export tag', () => {
    const sourceFile = parse(`/**\n * Does a thing.\n * @export\n */\nexport function f() {}\n`);
    const result = dropClosureAnnotations(sourceFile);
    const text = sourceFile.getFullText();

    expect(text).not.toContain('@export');
    expect(text).toContain('Does a thing.');
    expect(result.dropped).toBe(1);
  });

  it('should turn @override into the override keyword', () => {
    const sourceFile = parse(`export class C extends B {\n  /** @override */\n  m() {}\n}\n`);
    const result = dropClosureAnnotations(sourceFile);
    const text = sourceFile.getFullText();

    expect(text).toContain('override m()');
    expect(text).not.toContain('@override');
    expect(result.overrides).toBe(1);
  });

  it('should drop several closure only tags at once', () => {
    const sourceFile = parse(
      `export class C {\n  /**\n   * @const\n   * @final\n   * @export\n   */\n  m() {}\n}\n`,
    );
    expect(dropClosureAnnotations(sourceFile).dropped).toBe(3);
  });

  it('should remove a JSDoc that becomes empty', () => {
    const sourceFile = parse(`/**\n * @export\n */\nexport function f() {}\n`);
    dropClosureAnnotations(sourceFile);
    expect(sourceFile.getFullText().trim()).toBe('export function f() {}');
  });

  it('should keep a description-only JSDoc', () => {
    const sourceFile = parse(`/**\n * Keep me.\n */\nexport function f() {}\n`);
    dropClosureAnnotations(sourceFile);
    expect(sourceFile.getFullText()).toContain('Keep me.');
  });

  it('should keep tags that are not closure only', () => {
    const sourceFile = parse(
      `/**\n * @param {number} x\n * @export\n */\nexport function f(x) {}\n`,
    );
    dropClosureAnnotations(sourceFile);
    const text = sourceFile.getFullText();
    expect(text).toContain('@param');
    expect(text).not.toContain('@export');
  });
});
