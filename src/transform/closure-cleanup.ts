import { Node, SyntaxKind, type SourceFile } from 'ts-morph';

/**
 * Closure runtime calls that exist only to serve the compiler and have no
 * meaning once the code is ES modules.
 *
 * `goog.exportSymbol` registers a name on the global object so Closure's
 * renaming pass leaves it reachable. Real module exports make that unnecessary,
 * and leaving the call in produces a reference to an undefined `goog` at
 * runtime. It is the last `goog.*` call remaining after the module and runtime
 * passes, so removing it clears the Closure runtime entirely.
 */
const DROPPED_CALLS = new Set(['goog.exportSymbol']);

export interface CleanupResult {
  /** Number of Closure only call statements removed. */
  readonly removed: number;
}

/** Namespace roots whose bare member access statements are Closure type anchors. */
const NAMESPACE_ROOTS = new Set(['shaka', 'goog', 'mozilla']);

/**
 * Returns the leftmost identifier of a dotted access, for example `shaka` in
 * `shaka.util.ParsedBox`.
 */
function rootIdentifier(node: Node): string | undefined {
  let current: Node = node;
  while (Node.isPropertyAccessExpression(current)) {
    current = current.getExpression();
  }
  return Node.isIdentifier(current) ? current.getText() : undefined;
}

/**
 * Removes bare namespace statements left by a Closure typedef.
 *
 * A file-internal typedef is declared as a documented but bare
 * `shaka.util.ParsedBox;` statement, with no `goog.provide` and no assignment.
 * The JSDoc becomes a type later, but the statement itself accesses a namespace
 * that no longer exists and throws at runtime, so it is removed. Only a plain
 * member access on a known namespace root is removed, never a call or an
 * assignment.
 */
export function removeNamespaceAnchors(sourceFile: SourceFile): CleanupResult {
  let removed = 0;
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      continue;
    }
    const expression = statement.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      continue;
    }
    const root = rootIdentifier(expression);
    if (root !== undefined && NAMESPACE_ROOTS.has(root)) {
      statement.remove();
      removed += 1;
    }
  }
  return { removed };
}

/**
 * Removes Closure only runtime calls from a file.
 *
 * Only a statement whose whole expression is the call is removed, so a call
 * used as a value would be left for review rather than silently deleted. In
 * practice these appear only as standalone statements.
 */
export function dropClosureOnlyCalls(sourceFile: SourceFile): CleanupResult {
  let removed = 0;
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.wasForgotten()) {
      continue;
    }
    if (!DROPPED_CALLS.has(call.getExpression().getText())) {
      continue;
    }
    const statement = call.getParentIfKind(SyntaxKind.ExpressionStatement);
    if (statement) {
      statement.remove();
      removed += 1;
    }
  }
  return { removed };
}
