import type { ModuleRecord } from '../graph.ts';
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
