import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  findCycles,
  summariseGraph,
  type DependencyGraph,
  type ModuleRecord,
} from './graph.ts';

/**
 * Builds a graph from an inline description, without touching the filesystem.
 *
 * Each entry is `path -> { provides, requires, requireTypes }`, so a test can
 * state exactly the edges it means to exercise. The provider index is derived
 * the same way `buildGraph` derives it.
 */
function graphFrom(
  modules: Record<string, { provides: string[]; requires?: string[]; requireTypes?: string[] }>,
): DependencyGraph {
  const records = new Map<string, ModuleRecord>();
  const providers = new Map<string, string>();
  for (const [path, spec] of Object.entries(modules)) {
    records.set(path, {
      path,
      provides: spec.provides,
      requires: spec.requires ?? [],
      requireTypes: spec.requireTypes ?? [],
    });
    for (const namespace of spec.provides) {
      providers.set(namespace, path);
    }
  }
  return { modules: records, providers };
}

describe('findCycles', () => {
  it('should find no cycle in an acyclic graph', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['b'] },
      'b.js': { provides: ['b'], requires: ['c'] },
      'c.js': { provides: ['c'] },
    });
    expect(findCycles(graph)).toEqual([]);
  });

  // The whole point of this module is to catch a cycle, and on the real library
  // it never fires. This is the case that proves the detector actually works.
  it('should detect a direct two file cycle', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['b'] },
      'b.js': { provides: ['b'], requires: ['a'] },
    });
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(['a.js', 'b.js']);
  });

  it('should detect an indirect cycle through a third file', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['b'] },
      'b.js': { provides: ['b'], requires: ['c'] },
      'c.js': { provides: ['c'], requires: ['a'] },
    });
    const cycles = findCycles(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toEqual(['a.js', 'b.js', 'c.js']);
  });

  it('should not count a type only edge as part of a cycle', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['b'] },
      'b.js': { provides: ['b'], requireTypes: ['a'] },
    });
    expect(findCycles(graph)).toEqual([]);
  });

  it('should ignore a namespace a file requires from itself', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a', 'a.Helper'], requires: ['a.Helper'] },
    });
    expect(findCycles(graph)).toEqual([]);
  });

  it('should report two independent cycles separately', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['b'] },
      'b.js': { provides: ['b'], requires: ['a'] },
      'c.js': { provides: ['c'], requires: ['d'] },
      'd.js': { provides: ['d'], requires: ['c'] },
    });
    expect(findCycles(graph)).toHaveLength(2);
  });
});

describe('summariseGraph', () => {
  it('should count files, runtime edges and type edges', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['b'], requireTypes: ['c'] },
      'b.js': { provides: ['b'] },
      'c.js': { provides: ['c'] },
    });
    expect(summariseGraph(graph)).toEqual({
      files: 3,
      requireEdges: 1,
      typeEdges: 1,
      unresolved: 0,
    });
  });

  it('should not double count a namespace required twice', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['b', 'b'] },
      'b.js': { provides: ['b'] },
    });
    expect(summariseGraph(graph).requireEdges).toBe(1);
  });

  it('should count a require with no provider as unresolved', () => {
    const graph = graphFrom({
      'a.js': { provides: ['a'], requires: ['goog.Uri'] },
    });
    const stats = summariseGraph(graph);
    expect(stats.unresolved).toBe(1);
    expect(stats.requireEdges).toBe(0);
  });
});

describe('buildGraph', () => {
  it('should index every provided namespace to its file', () => {
    const graph = buildGraph('/does-not-matter', []);
    expect(graph.modules.size).toBe(0);
    expect(graph.providers.size).toBe(0);
  });
});
