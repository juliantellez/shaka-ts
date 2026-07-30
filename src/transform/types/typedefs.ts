import { Node, type SourceFile, type Statement } from 'ts-morph';
import type { Binding } from '../bindings.ts';
import { localNameFor } from '../symbols.ts';
import { rewriteBindings } from '../references.ts';
import { translateType } from './closure-type.ts';

export interface TypedefResult {
  /** The typedefs converted into type aliases. */
  readonly declared: readonly Binding[];
}

/** A bare `shaka.X.Y;` statement whose JSDoc carries an `@typedef`. */
interface TypedefAnchor {
  readonly namespace: string;
  readonly statement: Statement;
  readonly closureType: string;
}

/** Reads the `@typedef` type expression from a statement's JSDoc, if it has one. */
function typedefType(statement: Statement): string | undefined {
  if (!Node.isJSDocable(statement)) {
    return undefined;
  }
  for (const jsDoc of statement.getJsDocs()) {
    for (const tag of jsDoc.getTags()) {
      if (tag.getTagName() === 'typedef') {
        return /@typedef\s*(\{[\s\S]*\})/.exec(tag.getText())?.[1];
      }
    }
  }
  return undefined;
}

/** Collects the `@typedef` anchor statements in a file. */
function collectAnchors(sourceFile: SourceFile): TypedefAnchor[] {
  const anchors: TypedefAnchor[] = [];
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      continue;
    }
    const expression = statement.getExpression();
    if (!Node.isPropertyAccessExpression(expression) && !Node.isIdentifier(expression)) {
      continue;
    }
    const namespace = expression.getText();
    if (!namespace.startsWith('shaka.')) {
      continue;
    }
    const closureType = typedefType(statement);
    if (closureType !== undefined) {
      anchors.push({ namespace, statement, closureType });
    }
  }
  return anchors;
}

/**
 * Converts Closure `@typedef` declarations into TypeScript type aliases.
 *
 * Closure declares a typedef as a documented but bare `shaka.util.ParsedBox;`
 * statement. That becomes an exported `type` alias with the translated type, and
 * references to it in the file are renamed, so a name that was only a comment
 * before is now a type the compiler resolves. The alias is exported so a later
 * cross module pass can import it where other files reference it.
 */
export function convertTypedefs(sourceFile: SourceFile): TypedefResult {
  const anchors = collectAnchors(sourceFile);
  if (anchors.length === 0) {
    return { declared: [] };
  }

  const taken = new Set<string>();
  const declared: Binding[] = [];

  for (const anchor of anchors) {
    const localName = localNameFor(anchor.namespace, taken);
    taken.add(localName);
    const type = translateType(anchor.closureType.replace(/^\{|\}$/g, ''));
    if (Node.isExpressionStatement(anchor.statement)) {
      anchor.statement.replaceWithText(`export type ${localName} = ${type};`);
    }
    declared.push({ namespace: anchor.namespace, localName });
  }

  rewriteBindings(sourceFile, new Map(declared.map((b) => [b.namespace, b.localName])));
  return { declared };
}
