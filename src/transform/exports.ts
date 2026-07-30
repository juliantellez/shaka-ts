import { Node, SyntaxKind, type SourceFile, type Statement } from 'ts-morph';
import type { ModuleRecord } from '../graph.ts';
import { computeOwnBindings, type Binding } from './bindings.ts';

/** The outcome of converting one file's provides. */
export interface ExportResult {
  /** The namespaces that were turned into exported declarations. */
  readonly exported: readonly Binding[];
  /**
   * Provided namespaces that are pure Closure typedefs, with no runtime value.
   *
   * Their placeholder statement is removed here because it has no meaning in an
   * ES module, and a later pass turns the `@typedef` comment into a TypeScript
   * type. They are reported so the reference rewrite knows not to expect a
   * runtime binding for them.
   */
  readonly typeOnly: readonly string[];
  /** Provided namespaces whose shape could not be recognised. */
  readonly warnings: readonly string[];
}

/**
 * Leading `class` keyword and any class expression name.
 *
 * The name is optional, and the lookahead stops `extends` or `implements` from
 * being mistaken for one, so an anonymous `class extends Base` keeps its
 * heritage intact.
 */
const CLASS_PREFIX = /^class(\s+(?!extends\b|implements\b)[A-Za-z_$][\w$]*)?/;

function isProvideCall(statement: Statement): boolean {
  if (!Node.isExpressionStatement(statement)) {
    return false;
  }
  const expression = statement.getExpression();
  return (
    Node.isCallExpression(expression) && expression.getExpression().getText() === 'goog.provide'
  );
}

/**
 * Finds the top level statement that assigns a value to `namespace`.
 *
 * Matches only an exact assignment to the namespace, so `shaka.util.Error`
 * matches its class but `shaka.util.Error.Code`, a static attached afterwards,
 * does not. Statics are left in place for a later pass to hoist.
 */
function findAssignment(sourceFile: SourceFile, namespace: string): Statement | undefined {
  return sourceFile.getStatements().find((statement) => {
    if (!Node.isExpressionStatement(statement)) {
      return false;
    }
    const expression = statement.getExpression();
    if (!Node.isBinaryExpression(expression)) {
      return false;
    }
    if (expression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      return false;
    }
    return expression.getLeft().getText() === namespace;
  });
}

/**
 * True when the file assigns a member of the namespace at the top level, for
 * example `shaka.ui.Enums.Icons = {...}`.
 *
 * This is the namespace object pattern: `goog.provide` implicitly created the
 * object and members are attached to it, with no `Enums = {}` of its own.
 */
function hasMemberAssignment(sourceFile: SourceFile, namespace: string): boolean {
  const prefix = `${namespace}.`;
  return sourceFile.getStatements().some((statement) => {
    if (!Node.isExpressionStatement(statement)) {
      return false;
    }
    const expression = statement.getExpression();
    if (!Node.isBinaryExpression(expression)) {
      return false;
    }
    if (expression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      return false;
    }
    return expression.getLeft().getText().startsWith(prefix);
  });
}

/** Removes bare `namespace;` placeholder statements left by a Closure typedef. */
function removePlaceholders(sourceFile: SourceFile, namespace: string): void {
  for (const statement of sourceFile.getStatements()) {
    if (
      Node.isExpressionStatement(statement) &&
      statement.getExpression().getText() === namespace
    ) {
      statement.remove();
    }
  }
}

/**
 * Builds the exported declaration text for one assignment.
 *
 * A class expression becomes an exported class declaration, so it keeps its
 * heritage and members verbatim. Everything else, an object literal, a
 * function, or any other expression a provide is assigned, becomes an exported
 * `const`, which preserves the value exactly.
 */
function declarationFor(localName: string, rightHandSide: Node): string {
  if (Node.isClassExpression(rightHandSide)) {
    return `export class ${localName}${rightHandSide.getText().replace(CLASS_PREFIX, '')}`;
  }
  return `export const ${localName} = ${rightHandSide.getText()};`;
}

/**
 * Converts a file's `goog.provide` declarations into ES module exports.
 *
 * Each provided namespace is assigned a value at the top level, and that
 * assignment becomes an exported declaration named by the file's bindings. The
 * `goog.provide` calls themselves are removed, since an ES module needs no
 * separate declaration of what it provides.
 *
 * References to the namespace elsewhere in the file are left untouched here; a
 * later pass rewrites them to the local identifier.
 */
export function convertProvidesToExports(
  sourceFile: SourceFile,
  record: ModuleRecord,
): ExportResult {
  const bindings = computeOwnBindings(record);
  const exported: Binding[] = [];
  const typeOnly: string[] = [];
  const warnings: string[] = [];

  for (const binding of bindings) {
    const statement = findAssignment(sourceFile, binding.namespace);

    if (statement && Node.isExpressionStatement(statement)) {
      const expression = statement.getExpression();
      if (!Node.isBinaryExpression(expression)) {
        warnings.push(`assignment for ${binding.namespace} is not a simple assignment`);
        continue;
      }
      statement.replaceWithText(declarationFor(binding.localName, expression.getRight()));
      exported.push(binding);
      continue;
    }

    // No direct assignment. Either a namespace object built up from member
    // assignments, or a typedef placeholder with no runtime value.
    if (hasMemberAssignment(sourceFile, binding.namespace)) {
      sourceFile.insertStatements(0, `export const ${binding.localName} = {};`);
      exported.push(binding);
      continue;
    }

    removePlaceholders(sourceFile, binding.namespace);
    typeOnly.push(binding.namespace);
  }

  // Remove the goog.provide calls last, so removing statements does not shift
  // the ones still being matched above.
  for (const statement of sourceFile.getStatements()) {
    if (isProvideCall(statement)) {
      statement.remove();
    }
  }

  return { exported, typeOnly, warnings };
}
