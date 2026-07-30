import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { localNameFor } from './symbols.ts';

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
