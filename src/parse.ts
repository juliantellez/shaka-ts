import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import { toOutputPath } from './graph.ts';

/**
 * A ts-morph project configured for Shaka source.
 *
 * Every code mutating transform runs through this rather than string
 * manipulation, because Shaka's own reference rewriting is the step most likely
 * to produce subtly wrong output: a regular expression cannot tell a namespace
 * inside a string literal from one in an expression, and a partial rewrite
 * still parses. ts-morph edits the syntax tree instead, and reprints only the
 * nodes that actually changed.
 */
export function createSourceProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      target: ScriptTarget.ES2022,
    },
  });
}

/**
 * Loads one upstream file into the project.
 *
 * The upstream path is a `.js` file but the node is created with a `.ts`
 * extension and JavaScript script kind: the source parses under JavaScript
 * rules, including the Closure JSDoc, while later passes are free to emit
 * TypeScript syntax into the same node.
 */
export function parseSource(project: Project, upstreamPath: string, source: string): SourceFile {
  return project.createSourceFile(toOutputPath(upstreamPath), source, {
    overwrite: true,
    scriptKind: ScriptKind.JS,
  });
}

/** Returns the current text of a parsed file, including every edit made so far. */
export function reprint(sourceFile: SourceFile): string {
  return sourceFile.getFullText();
}

/**
 * True when parsing then reprinting a file reproduces it exactly.
 *
 * This is the guarantee the whole transform depends on. If a file does not
 * round trip untouched, then any edit to it risks silently reflowing unrelated
 * code, comments, or the license header, and the transform can no longer be
 * trusted to change only what it means to.
 */
export function roundTripsCleanly(upstreamPath: string, source: string): boolean {
  const project = createSourceProject();
  const sourceFile = parseSource(project, upstreamPath, source);
  return reprint(sourceFile) === source;
}
