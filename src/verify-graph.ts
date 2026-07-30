import { fetchUpstream } from './fetch.ts';
import { buildGraph, discoverModuleFiles, findCycles, summariseGraph } from './graph.ts';

/**
 * Asserts the pinned upstream release has an acyclic module graph.
 *
 * A cycle is what makes the `goog.require` to `import` conversion unsafe: ES
 * modules turn a `goog.require` cycle into a temporal dead zone error at
 * runtime, where Closure tolerated it. Shaka 4.16.5 has none, and this gate is
 * what catches the day a future release introduces one, at conversion time
 * rather than in production.
 *
 * Exits non zero on any cycle so it can gate a pull request.
 */
async function main(): Promise<void> {
  const root = await fetchUpstream();
  const files = discoverModuleFiles(root);
  const graph = buildGraph(root, files);
  const stats = summariseGraph(graph);
  const cycles = findCycles(graph);

  process.stdout.write(
    `files ${String(stats.files)}  require edges ${String(stats.requireEdges)}  ` +
      `type edges ${String(stats.typeEdges)}  unresolved ${String(stats.unresolved)}\n`,
  );
  process.stdout.write(`cycles ${String(cycles.length)}\n`);

  if (cycles.length > 0) {
    for (const cycle of cycles) {
      process.stdout.write(`  cycle: ${cycle.join(' -> ')}\n`);
    }
    process.stderr.write(
      `\nThe upstream module graph is no longer acyclic. Converting goog.require to a\n` +
        `static import would produce a temporal dead zone error at runtime. Break the\n` +
        `cycle upstream or move one edge to goog.requireType before bumping the pin.\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write('graph is acyclic\n');
}

await main();
