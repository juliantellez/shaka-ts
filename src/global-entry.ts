import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGraph, discoverModuleFiles, toOutputPath } from './graph.ts';
import { buildExportNameMap } from './transform/bindings.ts';

/** Namespaces under the UI layer, left out because they need the generated locales. */
const UI_PREFIX = 'shaka.ui.';

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
 * Reads the upstream entry's require list.
 *
 * Shaka lists every module of the full library in `shaka-player.uncompiled.js`.
 * That list is the set of namespaces the global build should expose, since many
 * register themselves by side effect and are not reached from `Player` alone.
 */
function readEntryRequires(root: string): string[] {
  const source = readFileSync(join(root, 'shaka-player.uncompiled.js'), 'utf8');
  return [...source.matchAll(/goog\.require\('([^']+)'\)/g)].map((match) => match[1] ?? '');
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
 * `importPrefix` is prepended to each module's output path so the entry can live
 * outside the package directory (the suite writes it to `build/suite`, so the
 * checkJs ratchet over `build/package` never sees it).
 */
export function buildGlobalEntry(root: string, importPrefix: string): string {
  const graph = buildGraph(root, discoverModuleFiles(root));
  const exportNames = buildExportNameMap(graph);

  const assignments: GlobalAssignment[] = [];
  for (const namespace of readEntryRequires(root)) {
    if (namespace.startsWith(UI_PREFIX)) {
      continue;
    }
    const provider = graph.providers.get(namespace);
    const exportName = exportNames.get(namespace);
    if (provider === undefined || exportName === undefined) {
      continue;
    }
    assignments.push({
      namespace,
      specifier: `${importPrefix}${toOutputPath(provider)}`,
      exportName,
    });
  }
  return renderGlobalEntry(assignments);
}
