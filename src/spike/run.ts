import { readFileSync, cpSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { fetchUpstream, checksumFiles } from '../fetch.ts';
import { buildGraph, findCycles, toOutputPath } from '../graph.ts';
import { transformModule } from '../transform/module.ts';
import { SPIKE_FILES } from './files.ts';

const OUT_DIR = 'build/spike';

function line(text = ''): void {
  process.stdout.write(`${text}\n`);
}

async function main(): Promise<void> {
  const root = await fetchUpstream();
  line(`upstream      ${root}`);
  line(`checksum      ${checksumFiles(root, SPIKE_FILES)}`);

  const graph = buildGraph(root, SPIKE_FILES);
  const cycles = findCycles(graph);
  line(`modules       ${String(graph.modules.size)}   cycles ${String(cycles.length)}`);
  line();

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(join(OUT_DIR, 'runtime'), { recursive: true });
  cpSync('src/runtime/uri.ts', join(OUT_DIR, 'runtime/uri.ts'));
  cpSync('src/runtime/debug.ts', join(OUT_DIR, 'runtime/debug.ts'));

  let inputBytes = 0;
  let outputBytes = 0;
  const allWarnings: string[] = [];
  const exported: string[] = [];

  for (const relativePath of SPIKE_FILES) {
    const record = graph.modules.get(relativePath);
    if (!record) {
      throw new Error(`missing module record for ${relativePath}`);
    }
    const source = readFileSync(join(root, relativePath), 'utf8');
    const result = transformModule(source, record, graph);

    inputBytes += Buffer.byteLength(source);
    outputBytes += Buffer.byteLength(result.code);

    const target = join(OUT_DIR, toOutputPath(relativePath));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, result.code, 'utf8');

    for (const warning of result.warnings) {
      allWarnings.push(`${relativePath}: ${warning}`);
    }
    for (const entry of result.exports) {
      exported.push(`${entry.namespace} -> ${entry.localName}`);
    }
  }

  // A barrel re-exporting every provided symbol, so the bundle keeps the same
  // public surface that Closure's --generate_exports preserves. Without it the
  // two sides would be tree shaken against different roots and the size
  // comparison would be meaningless.
  const barrel = SPIKE_FILES.map((relativePath) => {
    const record = graph.modules.get(relativePath);
    const names = (record?.provides ?? [])
      .map((namespace) => {
        const entry = exported.find((item) => item.startsWith(`${namespace} -> `));
        return entry?.split(' -> ')[1] ?? '';
      })
      .filter((name) => name.length > 0);
    return `export { ${names.join(', ')} } from './${toOutputPath(relativePath)}';`;
  }).join('\n');
  await writeFile(join(OUT_DIR, 'index.ts'), `${barrel}\n`, 'utf8');

  // Emitted rather than committed, because the output tree is wiped on each run.
  // Deliberately loose: this measures how far the module transform alone gets,
  // before any Closure annotation is translated into TypeScript syntax.
  await writeFile(
    join(OUT_DIR, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2017',
          lib: ['ES2020', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          allowImportingTsExtensions: true,
          noEmit: true,
          skipLibCheck: true,
          strict: false,
        },
        include: ['**/*.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  line(`transformed   ${String(SPIKE_FILES.length)} files`);
  line(`source bytes  ${String(inputBytes)}`);
  line(`output bytes  ${String(outputBytes)}`);
  line();

  line('exports');
  for (const entry of exported) {
    line(`  ${entry}`);
  }
  line();

  if (allWarnings.length > 0) {
    line(`warnings (${String(allWarnings.length)})`);
    for (const warning of allWarnings) {
      line(`  ${warning}`);
    }
    line();
  }

  await bundle();
}

/** Bundles the transformed tree so the spike produces a real size number. */
async function bundle(): Promise<void> {
  const entry = join(OUT_DIR, 'index.ts');
  for (const minify of [false, true]) {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      target: 'es2017',
      minify,
      write: false,
      legalComments: 'inline',
    });
    const output = result.outputFiles[0];
    if (!output) {
      throw new Error('esbuild produced no output');
    }
    line(
      `bundle ${minify ? 'minified ' : 'readable '}  ${String(output.contents.byteLength)} bytes`,
    );
  }
}

await main();
