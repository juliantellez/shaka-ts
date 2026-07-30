import { SyntaxKind, type SourceFile } from 'ts-morph';

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
