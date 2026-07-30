import { Node, type SourceFile, type Statement } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { resolveImports, type ImportBinding, type ResolvedImports } from './bindings.ts';
import { insertBelowHeader } from './source.ts';

function isRequireCall(statement: Statement): boolean {
  if (!Node.isExpressionStatement(statement)) {
    return false;
  }
  const expression = statement.getExpression();
  if (!Node.isCallExpression(expression)) {
    return false;
  }
  const callee = expression.getExpression().getText();
  return callee === 'goog.require' || callee === 'goog.requireType';
}

/**
 * Renders the import statements, one per source module.
 *
 * Names from the same file are combined into a single import, and a value
 * import and a type import from the same file stay separate so the type import
 * can still erase at build time. Within a statement the names are sorted for a
 * stable, reviewable result.
 */
function renderImports(imports: readonly ImportBinding[]): string {
  const groups = new Map<string, { typeOnly: boolean; names: string[] }>();
  for (const binding of imports) {
    const key = `${binding.typeOnly ? 'type:' : 'value:'}${binding.specifier}`;
    const clause =
      binding.importedName === binding.localName
        ? binding.localName
        : `${binding.importedName} as ${binding.localName}`;
    const group = groups.get(key);
    if (group) {
      group.names.push(clause);
    } else {
      groups.set(key, { typeOnly: binding.typeOnly, names: [clause] });
    }
  }

  const lines: string[] = [];
  for (const [key, group] of groups) {
    const specifier = key.slice(key.indexOf(':') + 1);
    const keyword = group.typeOnly ? 'import type' : 'import';
    const names = [...group.names].sort((a, b) => a.localeCompare(b)).join(', ');
    lines.push(`${keyword} { ${names} } from '${specifier}';`);
  }
  return lines.join('\n');
}

/**
 * Converts a file's `goog.require` and `goog.requireType` calls into imports.
 *
 * A required namespace is imported under the identifier its providing file
 * exports, so the two sides agree. When two different files export the same
 * name, the second is aliased so both can coexist in this file. Namespaces
 * provided by no file in the graph, notably the Closure `goog.Uri`, are left
 * for the runtime replacement pass and reported here.
 */
export function convertRequiresToImports(
  sourceFile: SourceFile,
  record: ModuleRecord,
  graph: DependencyGraph,
  exportNames: ReadonlyMap<string, string>,
): ResolvedImports {
  const resolved = resolveImports(record, graph, exportNames);

  for (const statement of sourceFile.getStatements()) {
    if (isRequireCall(statement)) {
      statement.remove();
    }
  }

  if (resolved.imports.length > 0) {
    insertBelowHeader(sourceFile, renderImports(resolved.imports));
  }

  return resolved;
}
