import { readdirSync, readFileSync } from 'node:fs';
import { relative, dirname, join, posix } from 'node:path';

/**
 * Directories under the upstream root that hold convertible source.
 *
 * `lib` is the player, `ui` is the optional controls layer. Everything else
 * (externs, demo, test, build) is either type only, tooling, or not part of the
 * shipped library, so it stays out of the module graph.
 */
const SOURCE_DIRECTORIES = ['lib', 'ui'] as const;

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

/**
 * Finds every convertible source file under the upstream root.
 *
 * Returns paths relative to the root, sorted, so the graph and its checksum are
 * deterministic regardless of directory listing order. On the clean Shaka
 * 4.16.5 tag this is 288 files across `lib` and `ui`.
 */
export function discoverModuleFiles(rootDir: string): string[] {
  const found: string[] = [];
  for (const directory of SOURCE_DIRECTORIES) {
    const entries = readdirSync(join(rootDir, directory), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.js')) {
        found.push(relative(rootDir, join(entry.parentPath, entry.name)));
      }
    }
  }
  return found.sort();
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

/** Counts that describe the shape of a dependency graph. */
export interface GraphStats {
  readonly files: number;
  /** Distinct runtime require edges between files, ignoring duplicates. */
  readonly requireEdges: number;
  /** Type only edges, which erase to `import type` and cannot cause a cycle. */
  readonly typeEdges: number;
  /** Namespaces required but provided by no file in the graph. */
  readonly unresolved: number;
}

/**
 * Summarises a graph.
 *
 * Runtime edges are counted per distinct target so that a file requiring the
 * same module twice, or providing a namespace it also requires, does not
 * inflate the total. This is what makes the reported numbers stable enough to
 * assert on.
 */
export function summariseGraph(graph: DependencyGraph): GraphStats {
  let requireEdges = 0;
  let typeEdges = 0;
  const unresolved = new Set<string>();

  for (const record of graph.modules.values()) {
    const runtimeTargets = new Set<string>();
    for (const namespace of record.requires) {
      const provider = graph.providers.get(namespace);
      if (provider === undefined) {
        unresolved.add(namespace);
      } else if (provider !== record.path) {
        runtimeTargets.add(provider);
      }
    }
    requireEdges += runtimeTargets.size;

    for (const namespace of record.requireTypes) {
      const provider = graph.providers.get(namespace);
      if (provider === undefined) {
        unresolved.add(namespace);
      } else if (provider !== record.path) {
        typeEdges += 1;
      }
    }
  }

  return { files: graph.modules.size, requireEdges, typeEdges, unresolved: unresolved.size };
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
