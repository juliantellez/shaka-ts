import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { applyVisibility } from './visibility.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('applyVisibility', () => {
  it('should make a @private field private', () => {
    const sourceFile = parse(`export class C {\n  /** @private */\n  x_;\n}\n`);
    const result = applyVisibility(sourceFile);
    expect(sourceFile.getFullText()).toContain('private x_;');
    expect(result.modified).toBe(1);
  });

  it('should make a @protected method protected', () => {
    const sourceFile = parse(`export class C {\n  /** @protected */\n  m() {}\n}\n`);
    applyVisibility(sourceFile);
    expect(sourceFile.getFullText()).toContain('protected m()');
  });

  it('should leave a @public member alone', () => {
    const sourceFile = parse(`export class C {\n  /** @public */\n  m() {}\n}\n`);
    expect(applyVisibility(sourceFile).modified).toBe(0);
  });

  it('should leave an unannotated member alone', () => {
    const sourceFile = parse(`export class C {\n  m() {}\n}\n`);
    expect(applyVisibility(sourceFile).modified).toBe(0);
  });
});
