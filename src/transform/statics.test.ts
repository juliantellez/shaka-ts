import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { declareStatics } from './statics.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

describe('declareStatics', () => {
  it('should move a literal static assignment into the class body', () => {
    const sourceFile = parse(`export class C {}\nC.Code = { A: 1, B: 2 };\n`);
    const result = declareStatics(sourceFile);
    const text = sourceFile.getFullText();

    expect(result.hoisted).toBe(1);
    expect(text).toMatch(/class C \{[\s\S]*static Code = \{ A: 1, B: 2 \}/);
    // The module level assignment is gone.
    expect(text).not.toMatch(/^C\.Code =/m);
  });

  it('should hoist object, array and primitive literals', () => {
    const sourceFile = parse(
      `export class C {}\nC.obj = { a: 1 };\nC.list = [1, 2];\nC.flag = true;\nC.name = 'x';\n`,
    );
    expect(declareStatics(sourceFile).hoisted).toBe(4);
  });

  it('should hoist function and arrow expressions, whose bodies run when called', () => {
    const sourceFile = parse(
      `const dep = 1;\nexport class C {}\nC.make = function () {\n  return dep;\n};\nC.get = () => dep;\n`,
    );
    const result = declareStatics(sourceFile);
    expect(result.hoisted).toBe(2);
    expect(sourceFile.getFullText()).toMatch(/class C \{[\s\S]*static make = function/);
  });

  it('should hoist a new Map used as a static registry', () => {
    const sourceFile = parse(`export class C {}\nC.registry = new Map();\n`);
    expect(declareStatics(sourceFile).hoisted).toBe(1);
    expect(sourceFile.getFullText()).toContain('static registry = new Map()');
  });

  it('should leave a new call to a non-builtin constructor in place', () => {
    // `new Thing()` reads the module binding `Thing` at definition time.
    const sourceFile = parse(`class Thing {}\nexport class C {}\nC.thing = new Thing();\n`);
    expect(declareStatics(sourceFile).hoisted).toBe(0);
  });

  it('should carry the JSDoc block onto the hoisted member', () => {
    const sourceFile = parse(`export class C {}\n/** @enum {number} */\nC.Code = { A: 1 };\n`);
    declareStatics(sourceFile);
    expect(sourceFile.getFullText()).toContain('@enum {number}');
  });

  it('should leave an assignment whose value reads another binding', () => {
    // A static initialiser runs earlier than this assignment, so moving it could
    // read `base` before it is set. It is left in place.
    const sourceFile = parse(`const base = 1;\nexport class C {}\nC.Derived = base;\n`);
    const result = declareStatics(sourceFile);
    expect(result.hoisted).toBe(0);
    expect(sourceFile.getFullText()).toMatch(/^C\.Derived = base;/m);
  });

  it('should ignore an assignment to something that is not a class in the file', () => {
    const sourceFile = parse(`const obj = {};\nobj.Code = { A: 1 };\n`);
    expect(declareStatics(sourceFile).hoisted).toBe(0);
  });

  it('should not add a static that the class already declares', () => {
    const sourceFile = parse(
      `export class C {\n  static Code = { A: 1 };\n}\nC.Code = { B: 2 };\n`,
    );
    expect(declareStatics(sourceFile).hoisted).toBe(0);
  });
});
