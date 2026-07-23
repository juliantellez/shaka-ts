import { readFileSync } from 'node:fs';
import { relative, dirname, join, posix } from 'node:path';

const PROVIDE_PATTERN = /goog\.provide\('([^']+)'\)/g;
const REQUIRE_PATTERN = /goog\.require\('([^']+)'\)/g;
const REQUIRE_TYPE_PATTERN = /goog\.requireType\('([^']+)'\)/g;

/** What a single source file declares and depends on. */
export interface ModuleRecord {
  /** Path relative to the upstream root, for example `lib/util/error.js`. */
  readonly path: string;
  /** Namespaces this file provides, in source order. */
  readonly provides: readonly string[];
  /** Namespaces required at runtime. */
  readonly requires: readonly string[];
  /** Namespaces required for types only. These erase at build time. */
  readonly requireTypes: readonly string[];
}

export interface DependencyGraph {
  readonly modules: ReadonlyMap<string, ModuleRecord>;
  /** Namespace to the file path providing it. */
  readonly providers: ReadonlyMap<string, string>;
}

function matchAll(source: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const captured = match[1];
    if (captured !== undefined) {
      found.push(captured);
    }
  }
  return found;
}

export function readModule(rootDir: string, relativePath: string): ModuleRecord {
  const source = readFileSync(join(rootDir, relativePath), 'utf8');
  return {
    path: relativePath,
    provides: matchAll(source, PROVIDE_PATTERN),
    requires: matchAll(source, REQUIRE_PATTERN),
    requireTypes: matchAll(source, REQUIRE_TYPE_PATTERN),
  };
}

export function buildGraph(rootDir: string, relativePaths: readonly string[]): DependencyGraph {
  const modules = new Map<string, ModuleRecord>();
  const providers = new Map<string, string>();

  for (const relativePath of relativePaths) {
    const record = readModule(rootDir, relativePath);
    modules.set(relativePath, record);
    for (const namespace of record.provides) {
      providers.set(namespace, relativePath);
    }
  }

  return { modules, providers };
}

/**
 * Returns every cycle in the runtime dependency graph.
 *
 * Shaka 4.16.5 has none, and that property is what makes converting
 * `goog.require` into a static import safe. If a future upstream release
 * introduces one, this is what catches it before it becomes a temporal dead
 * zone error at runtime.
 *
 * Type only edges are excluded on purpose: they erase to `import type`.
 */
export function findCycles(graph: DependencyGraph): string[][] {
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  const edgesFrom = (path: string): string[] => {
    const record = graph.modules.get(path);
    if (!record) {
      return [];
    }
    const targets = new Set<string>();
    for (const namespace of record.requires) {
      const provider = graph.providers.get(namespace);
      if (provider !== undefined && provider !== path) {
        targets.add(provider);
      }
    }
    return [...targets];
  };

  const connect = (root: string): void => {
    const work: { path: string; edges: string[]; next: number }[] = [
      { path: root, edges: edgesFrom(root), next: 0 },
    ];
    index.set(root, counter);
    lowLink.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (!frame) {
        break;
      }

      if (frame.next < frame.edges.length) {
        const child = frame.edges[frame.next];
        frame.next += 1;
        if (child === undefined) {
          continue;
        }
        if (!index.has(child)) {
          index.set(child, counter);
          lowLink.set(child, counter);
          counter += 1;
          stack.push(child);
          onStack.add(child);
          work.push({ path: child, edges: edgesFrom(child), next: 0 });
        } else if (onStack.has(child)) {
          lowLink.set(frame.path, Math.min(lowLink.get(frame.path) ?? 0, index.get(child) ?? 0));
        }
        continue;
      }

      work.pop();
      const parent = work[work.length - 1];
      if (parent) {
        lowLink.set(
          parent.path,
          Math.min(lowLink.get(parent.path) ?? 0, lowLink.get(frame.path) ?? 0),
        );
      }

      if (lowLink.get(frame.path) === index.get(frame.path)) {
        const component: string[] = [];
        for (;;) {
          const popped = stack.pop();
          if (popped === undefined) {
            break;
          }
          onStack.delete(popped);
          component.push(popped);
          if (popped === frame.path) {
            break;
          }
        }
        if (component.length > 1) {
          cycles.push(component.sort());
        }
      }
    }
  };

  for (const path of graph.modules.keys()) {
    if (!index.has(path)) {
      connect(path);
    }
  }

  return cycles;
}

/** Converts an upstream `.js` path into its emitted `.ts` path. */
export function toOutputPath(relativePath: string): string {
  return relativePath.replace(/\.js$/, '.ts');
}

/**
 * Builds the ES module specifier importing `toPath` from `fromPath`.
 *
 * Emits an extension so the output resolves under Node's ES module rules
 * without a bundler having to guess.
 */
export function importSpecifier(fromPath: string, toPath: string): string {
  const fromDir = dirname(toOutputPath(fromPath));
  const target = toOutputPath(toPath);
  let specifier = posix.normalize(relative(fromDir, target).split('\\').join('/'));
  if (!specifier.startsWith('.')) {
    specifier = `./${specifier}`;
  }
  return specifier;
}
