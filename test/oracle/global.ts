import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from 'vitest';
import { buildGraph, discoverModuleFiles, toOutputPath } from '../../src/graph.ts';
import { buildExportNameMap } from '../../src/transform/bindings.ts';

/**
 * Minimal shim for Jasmine's `expectAsync`, which the specs use but vitest does
 * not provide. Only the matchers the util specs need are implemented, mapped
 * onto vitest's promise matchers.
 */
function installJasmineShim(): void {
  const rejected = async (promise: Promise<unknown>): Promise<boolean> => {
    try {
      await promise;
      return false;
    } catch {
      return true;
    }
  };
  (globalThis as { expectAsync?: unknown }).expectAsync = (promise: Promise<unknown>) => ({
    // A promise may reject with undefined, so assert that it rejected at all
    // rather than that the reason is defined.
    toBeRejected: async () => {
      expect(await rejected(promise)).toBe(true);
    },
    toBeRejectedWith: (value: unknown) => expect(promise).rejects.toBe(value),
    toBeResolved: async () => {
      expect(await rejected(promise)).toBe(false);
    },
    toBeResolvedTo: (value: unknown) => expect(promise).resolves.toEqual(value),
  });
}

const UPSTREAM = 'upstream/shaka-player';
const OUTPUT = 'build/package';

/**
 * Rebuilds the global `shaka` namespace from the transpiled modules.
 *
 * Shaka's unmodified specs reach the library through the global `shaka` object,
 * for example `shaka.util.StringUtils`. The transpiled output is ES modules
 * with renamed exports, so this imports the module that provides each requested
 * namespace and assigns its export back onto the global path the specs expect.
 */
export async function installGlobalShaka(namespaces: readonly string[]): Promise<void> {
  installJasmineShim();
  const graph = buildGraph(UPSTREAM, discoverModuleFiles(UPSTREAM));
  const exportNames = buildExportNameMap(graph);
  const root: Record<string, unknown> = {};

  for (const namespace of namespaces) {
    const provider = graph.providers.get(namespace);
    const exportName = exportNames.get(namespace);
    if (provider === undefined || exportName === undefined) {
      throw new Error(`no provider for ${namespace}`);
    }
    const modulePath = join(process.cwd(), OUTPUT, toOutputPath(provider));
    const module = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
    assign(root, namespace, module[exportName]);
  }

  (globalThis as { shaka?: unknown }).shaka = root;
}

/** Assigns a value at a dotted path, creating intermediate objects. */
function assign(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').slice(1); // drop the leading `shaka`
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index] ?? '';
    current[key] ??= {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1] ?? ''] = value;
}

/** Loads and runs an unmodified Shaka spec file in the current global scope. */
export function runSpec(relativePath: string): void {
  const spec = readFileSync(join(UPSTREAM, relativePath), 'utf8');
  // The spec is a Jasmine script using describe/it/expect and the global shaka.
  (0, eval)(spec);
}
