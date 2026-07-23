/**
 * Global names a module scoped declaration would shadow.
 *
 * Shadowing matters because Shaka genuinely uses several of these. The clearest
 * case is `shaka.util.Error`, whose last segment is `Error`: declaring
 * `class Error` in that module would shadow the global constructor the same
 * file relies on. Renaming is not cosmetic, it is required for correctness.
 */
const RESERVED_GLOBALS = new Set([
  'Array',
  'Blob',
  'Date',
  'Element',
  'Error',
  'Event',
  'EventTarget',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'Set',
  'String',
  'Symbol',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'Uint8Array',
  'WeakMap',
  'Window',
]);

const NAMESPACE_ROOTS = new Set(['shaka', 'goog']);

function segmentsOf(namespace: string): string[] {
  return namespace.split('.');
}

function capitalise(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

/**
 * Picks the local identifier a namespace becomes once it is a module export.
 *
 * Prefers the last segment, which is what a reader expects. Falls back to
 * qualifying with earlier segments when that would shadow a global or collide
 * with a name already used in the same module.
 */
export function localNameFor(namespace: string, taken: ReadonlySet<string>): string {
  const segments = segmentsOf(namespace);
  const last = segments[segments.length - 1] ?? namespace;

  if (!RESERVED_GLOBALS.has(last) && !taken.has(last)) {
    return last;
  }

  for (let extra = 2; extra <= segments.length; extra += 1) {
    const qualified = segments
      .slice(segments.length - extra)
      .map((segment) => capitalise(segment))
      .join('');
    if (!RESERVED_GLOBALS.has(qualified) && !taken.has(qualified)) {
      return qualified;
    }
  }

  let suffix = 2;
  while (taken.has(`${last}${String(suffix)}`)) {
    suffix += 1;
  }
  return `${last}${String(suffix)}`;
}

/** True when a dotted name is a namespace root this transform rewrites. */
export function isRewritableNamespace(namespace: string): boolean {
  const root = segmentsOf(namespace)[0];
  return root !== undefined && NAMESPACE_ROOTS.has(root);
}

export { RESERVED_GLOBALS };
