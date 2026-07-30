import type {
  ClassDeclaration,
  FunctionDeclaration,
  JSDocableNode,
  MethodDeclaration,
  SourceFile,
  TypeParameteredNode,
} from 'ts-morph';

export interface TemplateResult {
  /** Number of type parameters added across the file. */
  readonly added: number;
}

/**
 * Reads the type parameter names from a node's `@template` tags.
 *
 * A tag can list several names, `@template KEY,VALUE`, and can carry a trailing
 * description, `@template T SegmentReference or InitSegmentReference`, so each
 * comma separated part is reduced to its leading identifier.
 */
function templateNames(node: JSDocableNode): string[] {
  const names: string[] = [];
  for (const jsDoc of node.getJsDocs()) {
    for (const tag of jsDoc.getTags()) {
      if (tag.getTagName() !== 'template') {
        continue;
      }
      const text = tag.getText().replace(/^\s*\*?\s*@template\s*/, '');
      for (const part of text.split(',')) {
        const identifier = /^[A-Za-z_$][\w$]*/.exec(part.trim())?.[0];
        if (identifier !== undefined) {
          names.push(identifier);
        }
      }
    }
  }
  return names;
}

function addTypeParameters(node: TypeParameteredNode & JSDocableNode): number {
  const existing = new Set(node.getTypeParameters().map((p) => p.getName()));
  let added = 0;
  for (const name of templateNames(node)) {
    if (!existing.has(name)) {
      node.addTypeParameter({ name });
      existing.add(name);
      added += 1;
    }
  }
  return added;
}

/**
 * Converts `@template` annotations into TypeScript generic parameters.
 *
 * A class, function or method annotated with `@template T` gains a `<T>` the
 * compiler understands, so the generic types the annotations already reference
 * resolve to real parameters rather than free names.
 */
export function applyTemplates(sourceFile: SourceFile): TemplateResult {
  let added = 0;

  const functions: (FunctionDeclaration & JSDocableNode)[] = sourceFile.getFunctions();
  const classes: ClassDeclaration[] = sourceFile.getClasses();

  for (const node of functions) {
    added += addTypeParameters(node);
  }
  for (const classDeclaration of classes) {
    added += addTypeParameters(classDeclaration);
    const methods: (MethodDeclaration & JSDocableNode)[] = classDeclaration.getMethods();
    for (const method of methods) {
      added += addTypeParameters(method);
    }
  }

  return { added };
}
