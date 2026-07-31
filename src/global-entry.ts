import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGraph, discoverModuleFiles, toOutputPath } from './graph.ts';
import { buildExportNameMap } from './transform/bindings.ts';

/** Namespaces under the UI layer, left out because they need the generated locales. */
const UI_PREFIX = 'shaka.ui.';

/**
 * Whether a transpiled module has a runtime export for a name.
 *
 * Some provided namespaces are Closure `@typedef`s, which become `export type`
 * with no runtime value, so importing them into the global entry would fail the
 * bundle. This keeps only the ones that actually export something at runtime.
 */
export function hasRuntimeExport(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(
    `export\\s+(?:default\\s+)?(?:async\\s+)?(?:class|function|const|let|var)\\s+${escaped}\\b`,
  );
  const reexport = new RegExp(`export\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`);
  return declaration.test(source) || reexport.test(source);
}

/** One transpiled namespace to hang on the global `shaka` object. */
export interface GlobalAssignment {
  /** The dotted namespace, for example `shaka.util.BufferUtils`. */
  readonly namespace: string;
  /** The module specifier to import the value from, relative to the entry. */
  readonly specifier: string;
  /** The name the value is exported under in its module. */
  readonly exportName: string;
}

/**
 * Renders the global namespace entry from a list of assignments.
 *
 * Emits an import per namespace under a unique alias, rebuilds the nested
 * `shaka` object the specs reach through, and assigns it onto the global. Kept
 * pure and separate from the graph work so the generated shape is testable.
 */
export function renderGlobalEntry(assignments: readonly GlobalAssignment[]): string {
  const imports = assignments.map(
    (assignment, index) =>
      `import { ${assignment.exportName} as v${String(index)} } from '${assignment.specifier}';`,
  );
  const sets = assignments.map(
    (assignment, index) => `set('${assignment.namespace}', v${String(index)});`,
  );
  return [
    '// Generated global namespace entry. Do not edit.',
    ...imports,
    '',
    'const shaka = {};',
    'function set(path, value) {',
    "  const parts = path.split('.').slice(1);",
    '  let node = shaka;',
    '  for (let index = 0; index < parts.length - 1; index += 1) {',
    '    node[parts[index]] ??= {};',
    '    node = node[parts[index]];',
    '  }',
    '  node[parts[parts.length - 1]] = value;',
    '}',
    ...sets,
    'globalThis.shaka = shaka;',
    '',
  ].join('\n');
}

/**
 * Builds the global namespace entry for a transpiled tree.
 *
 * Exposes every provided namespace, not just the ones the uncompiled entry
 * requires directly, because the specs reach namespaces that are only pulled in
 * transitively (a util spec reads `shaka.util.BufferUtils`, which nothing
 * requires at the top level). The UI layer is left out because it needs the
 * generated locales, which the core build does not produce.
 *
 * `importPrefix` is prepended to each module's output path so the entry can live
 * outside the package directory (the suite writes it to `build/suite`, so the
 * checkJs ratchet over `build/package` never sees it). `packageDir` is the
 * transpiled output the specifiers point at, read to skip type only namespaces.
 */
export function buildGlobalEntry(root: string, importPrefix: string, packageDir: string): string {
  const graph = buildGraph(root, discoverModuleFiles(root));
  const exportNames = buildExportNameMap(graph);

  const assignments: GlobalAssignment[] = [];
  for (const [namespace, provider] of [...graph.providers].sort()) {
    if (namespace.startsWith(UI_PREFIX)) {
      continue;
    }
    const exportName = exportNames.get(namespace);
    if (exportName === undefined) {
      continue;
    }
    const outputPath = toOutputPath(provider);
    const source = readFileSync(join(packageDir, outputPath), 'utf8');
    if (!hasRuntimeExport(source, exportName)) {
      continue;
    }
    assignments.push({
      namespace,
      specifier: `${importPrefix}${outputPath}`,
      exportName,
    });
  }
  return renderGlobalEntry(assignments);
}
