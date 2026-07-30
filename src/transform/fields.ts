import { Node, SyntaxKind, type ClassDeclaration, type SourceFile } from 'ts-morph';

export interface FieldResult {
  /** Number of field declarations added across all classes in the file. */
  readonly declared: number;
}

/**
 * The JSDoc comment immediately above an assignment, if any.
 *
 * Shaka annotates a property at its assignment, with a `@private {T}` block just
 * above the `this.x = ...` line. The comment is carried onto the declaration so
 * the type stays attached to the field it describes.
 */
function leadingJsDoc(statement: Node): string | undefined {
  const comments = statement.getLeadingCommentRanges();
  const last = comments[comments.length - 1];
  if (!last) {
    return undefined;
  }
  const text = last.getText();
  return text.startsWith('/**') ? text : undefined;
}

/**
 * Collects the instance properties a class assigns through `this`, in first
 * assignment order, skipping any already declared as a field.
 */
function collectAssignedProperties(
  classDeclaration: ClassDeclaration,
): { name: string; doc: string | undefined }[] {
  const declared = new Set(classDeclaration.getInstanceProperties().map((p) => p.getName()));
  const seen = new Set<string>();
  const properties: { name: string; doc: string | undefined }[] = [];

  classDeclaration.forEachDescendant((node) => {
    if (!Node.isBinaryExpression(node)) {
      return;
    }
    if (node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      return;
    }
    const left = node.getLeft();
    if (!Node.isPropertyAccessExpression(left)) {
      return;
    }
    if (left.getExpression().getKind() !== SyntaxKind.ThisKeyword) {
      return;
    }
    const name = left.getName();
    if (declared.has(name) || seen.has(name)) {
      return;
    }
    seen.add(name);
    const statement = node.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
    properties.push({ name, doc: statement ? leadingJsDoc(statement) : undefined });
  });

  return properties;
}

/**
 * Declares a class field for every property assigned through `this`.
 *
 * Closure infers a property from its assignment plus the inline annotation, but
 * TypeScript does not, so every such property is an error until it is declared
 * in the class body. This is the largest single source of type errors in the
 * transpiled output, and the declarations are also where the real types will
 * live once the annotations are translated.
 */
export function declareFields(sourceFile: SourceFile): FieldResult {
  let declared = 0;
  for (const classDeclaration of sourceFile.getClasses()) {
    const properties = collectAssignedProperties(classDeclaration);
    classDeclaration.insertProperties(
      0,
      properties.map((property) => ({
        name: property.name,
        docs: property.doc ? [{ description: jsDocInner(property.doc) }] : [],
      })),
    );
    declared += properties.length;
  }
  return { declared };
}

/** Strips the block comment delimiters and the leading star from a JSDoc block. */
function jsDocInner(jsDoc: string): string {
  return jsDoc
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trimEnd())
    .join('\n')
    .trim();
}
