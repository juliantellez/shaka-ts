import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import {
  buildGraph,
  discoverModuleFiles,
  readModule,
  toOutputPath,
  type DependencyGraph,
} from './graph.ts';
import { buildExportNameMap } from './transform/bindings.ts';
import { extractLicenseHeader, ensureLicenseHeader } from './transform/source.ts';
import { convertProvidesToExports } from './transform/exports.ts';
import { convertFileLocals } from './transform/locals.ts';
import { dropClosureOnlyCalls, removeNamespaceAnchors } from './transform/closure-cleanup.ts';
import { convertRequiresToImports } from './transform/imports.ts';
import { rewriteReferences } from './transform/references.ts';
import { declareFields } from './transform/fields.ts';
import { applyTemplates } from './transform/types/templates.ts';
import { applySignatureTypes } from './transform/types/signatures.ts';
import { dropClosureAnnotations } from './transform/types/annotations.ts';
import { convertEnums } from './transform/types/enums.ts';

/**
 * Extra provider files outside `lib` and `ui` that the library depends on.
 *
 * `mozilla.LanguageMapping` lives in a third party file and is required by the
 * core, so it is transpiled alongside the Shaka source rather than treated as
 * an external.
 */
const EXTRA_SOURCES = ['third_party/language-mapping-list/language-mapping-list.js'] as const;

export interface TranspiledFile {
  /** Output path, for example `lib/util/error.ts`. */
  readonly outputPath: string;
  readonly code: string;
}

export interface TranspileReport {
  readonly files: readonly TranspiledFile[];
  /** Namespaces still unresolved after every pass, such as `shaka.ui.Locales`. */
  readonly unresolved: ReadonlyMap<string, number>;
}

function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
}

/**
 * Runs the full module transform on one already parsed file.
 *
 * The passes run in a fixed order: declarations first, so exports and file
 * local classes exist before anything references them, then the Closure only
 * calls are dropped, then requires become imports, and last the references are
 * rewritten to the local identifiers the earlier passes established.
 */
export function transpileSourceFile(
  sourceFile: SourceFile,
  root: string,
  relativePath: string,
  graph: DependencyGraph,
  exportNames: ReadonlyMap<string, string>,
): string[] {
  const record = readModule(root, relativePath);
  const header = extractLicenseHeader(sourceFile.getFullText());
  convertProvidesToExports(sourceFile, record);
  convertFileLocals(sourceFile, record, graph, exportNames);
  dropClosureOnlyCalls(sourceFile);
  removeNamespaceAnchors(sourceFile);
  const { unresolved } = convertRequiresToImports(sourceFile, record, graph, exportNames);
  rewriteReferences(sourceFile, record, graph, exportNames);
  // Runs last, on the reparsed tree the reference rewrite produced, so the
  // annotations it carries onto the fields already use the local identifiers.
  declareFields(sourceFile);
  applyTemplates(sourceFile);
  applySignatureTypes(sourceFile);
  dropClosureAnnotations(sourceFile);
  convertEnums(sourceFile);
  ensureLicenseHeader(sourceFile, header);
  return [...unresolved];
}

/**
 * Transpiles the whole library from Closure JavaScript to ES modules.
 *
 * Returns the transpiled text for every file plus a tally of the namespaces
 * that no file or runtime module resolves, so the caller can see what is still
 * external, such as the generated `shaka.ui.Locales`.
 */
export function transpileLibrary(root: string): TranspileReport {
  const sourceFiles = [...discoverModuleFiles(root), ...EXTRA_SOURCES];
  const graph = buildGraph(root, sourceFiles);
  const exportNames = buildExportNameMap(graph);

  const files: TranspiledFile[] = [];
  const unresolved = new Map<string, number>();
  const project = createProject();

  for (const relativePath of sourceFiles) {
    const source = readFileSync(join(root, relativePath), 'utf8');
    const sourceFile = project.createSourceFile('current.ts', source, {
      overwrite: true,
      scriptKind: ScriptKind.JS,
    });
    const missing = transpileSourceFile(sourceFile, root, relativePath, graph, exportNames);
    for (const namespace of missing) {
      unresolved.set(namespace, (unresolved.get(namespace) ?? 0) + 1);
    }
    files.push({ outputPath: toOutputPath(relativePath), code: sourceFile.getFullText() });
  }

  return { files, unresolved };
}
