import type { ClassDeclaration, SourceFile } from 'ts-morph';

export interface HeritageResult {
  /** Number of `implements` clauses added. */
  readonly implemented: number;
}

/** The interface names a class's JSDoc says it implements. */
function implementedNames(classDeclaration: ClassDeclaration): string[] {
  const names: string[] = [];
  for (const jsDoc of classDeclaration.getJsDocs()) {
    for (const tag of jsDoc.getTags()) {
      if (tag.getTagName() !== 'implements') {
        continue;
      }
      const type = /@implements\s*\{?\s*([^}\n]+?)\s*\}?\s*$/.exec(tag.getText())?.[1];
      const name = type?.trim().replace(/^[!?]/, '');
      // A simple identifier only, so a generic or namespaced type is left for a
      // later pass rather than emitted as a broken heritage clause.
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

/**
 * Adds `implements` clauses from `@implements` annotations, where the interface
 * is in scope.
 *
 * A clause is added only when the interface is a name the file already imports
 * or declares, so an extern interface that is not yet a real TypeScript type is
 * left alone rather than emitted as a reference to a missing name. `@extends` is
 * not handled here: Shaka classes already carry a real `extends` in their
 * syntax, so the annotation is redundant.
 */
export function applyHeritage(sourceFile: SourceFile): HeritageResult {
  const inScope = new Set<string>([
    ...sourceFile
      .getImportDeclarations()
      .flatMap((d) => d.getNamedImports().map((n) => n.getName())),
    ...sourceFile.getClasses().map((c) => c.getName() ?? ''),
    ...sourceFile.getInterfaces().map((i) => i.getName()),
  ]);

  let implemented = 0;
  for (const classDeclaration of sourceFile.getClasses()) {
    const existing = new Set(classDeclaration.getImplements().map((clause) => clause.getText()));
    for (const name of implementedNames(classDeclaration)) {
      if (inScope.has(name) && !existing.has(name)) {
        classDeclaration.addImplements(name);
        existing.add(name);
        implemented += 1;
      }
    }
  }

  return { implemented };
}
