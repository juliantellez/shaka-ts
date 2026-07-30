import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { applyHeritage } from './heritage.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('applyHeritage', () => {
  it('should add an implements clause for an imported interface', () => {
    const sourceFile = parse(
      `import { IReleasable } from './r.ts';\n/** @implements {IReleasable} */\nexport class C {}\n`,
    );
    const result = applyHeritage(sourceFile);
    expect(sourceFile.getFullText()).toContain('export class C implements IReleasable');
    expect(result.implemented).toBe(1);
  });

  it('should add an implements clause for a locally declared interface', () => {
    const sourceFile = parse(
      `export class IFoo {}\n/** @implements {IFoo} */\nexport class C {}\n`,
    );
    applyHeritage(sourceFile);
    expect(sourceFile.getFullText()).toContain('class C implements IFoo');
  });

  it('should skip an interface that is not in scope', () => {
    const sourceFile = parse(`/** @implements {shaka.extern.IUnknown} */\nexport class C {}\n`);
    expect(applyHeritage(sourceFile).implemented).toBe(0);
    // The class gains no heritage clause, though the JSDoc tag remains.
    expect(sourceFile.getClasses()[0]?.getImplements()).toHaveLength(0);
  });

  it('should not duplicate an existing implements clause', () => {
    const sourceFile = parse(
      `import { IFoo } from './f.ts';\n/** @implements {IFoo} */\nexport class C implements IFoo {}\n`,
    );
    expect(applyHeritage(sourceFile).implemented).toBe(0);
  });
});
