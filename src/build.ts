import { mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { build as esbuild } from 'esbuild';
import { fetchUpstream } from './fetch.ts';
import { buildGraph, discoverModuleFiles, toOutputPath } from './graph.ts';
import { buildExportNameMap } from './transform/bindings.ts';
import { transpileLibrary } from './pipeline.ts';

const OUTPUT_DIR = 'build/package';
const BUNDLE_DIR = 'build/dist';

/** Namespaces required by the uncompiled entry that need the generated UI locales. */
const UI_PREFIX = 'shaka.ui.';

/**
 * Reads the upstream entry's require list.
 *
 * Shaka lists every module of the full library in `shaka-player.uncompiled.js`.
 * That list is the set of modules a build must include, since many register
 * themselves by side effect and are not reached from `Player` alone.
 */
function readEntryRequires(root: string): string[] {
  const source = readFileSync(join(root, 'shaka-player.uncompiled.js'), 'utf8');
  return [...source.matchAll(/goog\.require\('([^']+)'\)/g)].map((match) => match[1] ?? '');
}

/**
 * Builds the entry module for the core bundle.
 *
 * Every required namespace except the UI layer is re-exported from its
 * transpiled module, which both includes it in the bundle and exposes it. The
 * UI is left out of the core build because it depends on the generated locales,
 * which are a separate build input.
 */
function buildCoreEntry(root: string): string {
  const files = discoverModuleFiles(root);
  const graph = buildGraph(root, files);
  const exportNames = buildExportNameMap(graph);

  const lines: string[] = ['// Generated core entry. Do not edit.'];
  for (const namespace of readEntryRequires(root)) {
    if (namespace.startsWith(UI_PREFIX)) {
      continue;
    }
    const provider = graph.providers.get(namespace);
    const exportName = exportNames.get(namespace);
    if (provider === undefined || exportName === undefined) {
      continue;
    }
    const specifier = `./${toOutputPath(provider)}`;
    lines.push(`export { ${exportName} } from '${specifier}';`);
  }
  return `${lines.join('\n')}\n`;
}

async function writeTree(root: string): Promise<number> {
  const { files, unresolved } = transpileLibrary(root);
  await rm(OUTPUT_DIR, { recursive: true, force: true });

  for (const file of files) {
    const target = join(OUTPUT_DIR, file.outputPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.code, 'utf8');
  }

  await cp('src/runtime', join(OUTPUT_DIR, 'runtime'), { recursive: true });
  await writeFile(join(OUTPUT_DIR, 'shaka-player.ts'), buildCoreEntry(root), 'utf8');

  process.stdout.write(`transpiled ${String(files.length)} files\n`);
  if (unresolved.size > 0) {
    const summary = [...unresolved.entries()].map(([ns, n]) => `${ns} (x${String(n)})`).join(', ');
    process.stdout.write(`unresolved (expected, UI locales): ${summary}\n`);
  }
  return files.length;
}

async function bundle(): Promise<void> {
  await rm(BUNDLE_DIR, { recursive: true, force: true });
  await mkdir(BUNDLE_DIR, { recursive: true });

  for (const minify of [false, true]) {
    const suffix = minify ? '.min' : '';
    const result = await esbuild({
      entryPoints: [join(OUTPUT_DIR, 'shaka-player.ts')],
      bundle: true,
      format: 'esm',
      target: 'es2017',
      minify,
      legalComments: 'inline',
      outfile: join(BUNDLE_DIR, `shaka-player${suffix}.js`),
      metafile: true,
    });
    const bytes = Object.values(result.metafile.outputs).reduce((sum, out) => sum + out.bytes, 0);
    process.stdout.write(`bundle ${minify ? 'minified' : 'readable'}: ${String(bytes)} bytes\n`);
  }
}

async function main(): Promise<void> {
  const root = await fetchUpstream();
  await writeTree(root);
  await bundle();
  process.stdout.write('build complete\n');
}

await main();
