import { importSpecifier, type DependencyGraph, type ModuleRecord } from '../graph.ts';
import { localNameFor } from './symbols.ts';
import { RUNTIME_MODULES, runtimeSpecifier } from './runtime.ts';

/**
 * A Closure namespace mapped onto the local identifier it becomes.
 *
 * Every pass that touches names, converting a provide to an export, an import,
 * or rewriting a reference, works from these bindings, so a namespace resolves
 * to exactly one identifier across the whole file.
 */
export interface Binding {
  readonly namespace: string;
  readonly localName: string;
}

/** One resolved import: a namespace, where it comes from, and its local name. */
export interface ImportBinding {
  readonly namespace: string;
  /** The identifier the namespace is used under in this file. */
  readonly localName: string;
  /** The exported name in the providing file, when it differs from localName. */
  readonly importedName: string;
  /** Module specifier to import from, for example `../util/error.ts`. */
  readonly specifier: string;
  /** True for a `goog.requireType`, which becomes an `import type`. */
  readonly typeOnly: boolean;
}

export interface ResolvedImports {
  readonly imports: readonly ImportBinding[];
  /** Required namespaces provided by no file, such as the Closure `goog.Uri`. */
  readonly unresolved: readonly string[];
}

/**
 * Chooses the local identifiers for the namespaces a file provides.
 *
 * Names are assigned in source order, and each is reserved as it is taken so a
 * later provide cannot claim the same identifier. The collision handling lives
 * in `localNameFor`, which qualifies a name when its last segment would shadow
 * a global, for example `shaka.util.Error` becoming `UtilError` rather than the
 * built in `Error`.
 */
export function computeOwnBindings(record: ModuleRecord): Binding[] {
  const taken = new Set<string>();
  const bindings: Binding[] = [];
  for (const namespace of record.provides) {
    const localName = localNameFor(namespace, taken);
    taken.add(localName);
    bindings.push({ namespace, localName });
  }
  return bindings;
}

/**
 * Maps every provided namespace in the library to the identifier its own file
 * exports it as.
 *
 * A file that imports a namespace must use the same name the providing file
 * exported, so this is the shared source of truth: the import pass reads it to
 * name an import, and the reference rewrite reads it to rename a use. Because
 * each file's bindings are computed independently, the same last segment can
 * export from two files under the same name, which the import pass resolves per
 * file with an alias when they meet.
 */
export function buildExportNameMap(graph: DependencyGraph): Map<string, string> {
  const names = new Map<string, string>();
  for (const record of graph.modules.values()) {
    for (const binding of computeOwnBindings(record)) {
      names.set(binding.namespace, binding.localName);
    }
  }
  return names;
}

/**
 * Resolves a file's requires to imports, without touching the file.
 *
 * Each required namespace is imported under the identifier its providing file
 * exports, and when that name is already taken in this file it is suffixed so
 * both can coexist. This is the pure core the import pass and the reference
 * rewrite both rely on, so the import that is written and the reference that is
 * renamed always agree on the same identifier.
 */
export function resolveImports(
  record: ModuleRecord,
  graph: DependencyGraph,
  exportNames: ReadonlyMap<string, string>,
): ResolvedImports {
  const taken = new Set(computeOwnBindings(record).map((binding) => binding.localName));
  const imports: ImportBinding[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  const resolve = (namespace: string, typeOnly: boolean): void => {
    if (seen.has(namespace)) {
      return;
    }
    seen.add(namespace);

    const runtime = RUNTIME_MODULES.get(namespace);
    const providerPath = graph.providers.get(namespace);
    const importedName = runtime?.exportName ?? exportNames.get(namespace);
    const specifier = runtime
      ? runtimeSpecifier(record.path, runtime.module)
      : providerPath !== undefined
        ? importSpecifier(record.path, providerPath)
        : undefined;

    if (importedName === undefined || specifier === undefined) {
      unresolved.push(namespace);
      return;
    }

    let localName = importedName;
    for (let suffix = 2; taken.has(localName); suffix += 1) {
      localName = `${importedName}${String(suffix)}`;
    }
    taken.add(localName);

    imports.push({ namespace, localName, importedName, specifier, typeOnly });
  };

  for (const namespace of record.requires) {
    resolve(namespace, false);
  }
  for (const namespace of record.requireTypes) {
    resolve(namespace, true);
  }

  return { imports, unresolved };
}

/**
 * The full namespace to identifier map for one file: its own exports and its
 * imports together.
 *
 * The reference rewrite renames every use of a namespace with this, so it must
 * match exactly what the export and import passes emitted, including any import
 * alias.
 */
export function resolveFileBindings(
  record: ModuleRecord,
  graph: DependencyGraph,
  exportNames: ReadonlyMap<string, string>,
): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const binding of computeOwnBindings(record)) {
    bindings.set(binding.namespace, binding.localName);
  }
  for (const binding of resolveImports(record, graph, exportNames).imports) {
    bindings.set(binding.namespace, binding.localName);
  }
  return bindings;
}
