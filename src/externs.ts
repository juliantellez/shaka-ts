import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Node, Project, ScriptKind, ScriptTarget, type Statement } from 'ts-morph';
import { translateType } from './transform/types/closure-type.ts';

/** Where Shaka's Closure externs live, relative to the upstream root. */
const EXTERNS_DIR = 'externs';

/** One `shaka.extern.*` type extracted from the externs. */
interface ExternType {
  /** The namespace segments up to but not including the name, e.g. `[shaka, extern]`. */
  readonly path: readonly string[];
  readonly name: string;
  /** The translated TypeScript type text. */
  readonly type: string;
}

/** Lists the extern JavaScript files under the upstream externs directory. */
function discoverExternFiles(root: string): string[] {
  const base = join(root, EXTERNS_DIR);
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        files.push(full);
      }
    }
  };
  walk(base);
  return files.sort();
}

/** Reads the `@typedef` type expression from a statement's JSDoc, if it has one. */
function typedefType(statement: Statement): string | undefined {
  if (!Node.isJSDocable(statement)) {
    return undefined;
  }
  for (const jsDoc of statement.getJsDocs()) {
    for (const tag of jsDoc.getTags()) {
      if (tag.getTagName() === 'typedef') {
        return /@typedef\s*(\{[\s\S]*\})/.exec(tag.getText())?.[1];
      }
    }
  }
  return undefined;
}

/**
 * Extracts the `@typedef` externs from a single file's source.
 *
 * Shaka anchors an extern typedef on a bare `shaka.extern.Manifest;` statement
 * with a `@typedef {{...}}` block above it, the same shape the library uses. The
 * Closure type is translated with the shared translator, and the qualified name
 * becomes a namespace path plus a leaf name.
 */
export function collectExternTypesFromSource(source: string, project: Project): ExternType[] {
  const sourceFile = project.createSourceFile('externs-current.ts', source, {
    overwrite: true,
    scriptKind: ScriptKind.JS,
  });
  const types: ExternType[] = [];
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      continue;
    }
    const expression = statement.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      continue;
    }
    const namespace = expression.getText();
    if (!namespace.startsWith('shaka.extern.')) {
      continue;
    }
    const closureType = typedefType(statement);
    if (closureType === undefined) {
      continue;
    }
    const segments = namespace.split('.');
    types.push({
      path: segments.slice(0, -1),
      name: segments[segments.length - 1] ?? namespace,
      type: translateType(closureType.replace(/^\{|\}$/g, '')),
    });
  }
  return types;
}

/** A node in the namespace tree assembled from the extern types. */
interface NamespaceNode {
  readonly children: Map<string, NamespaceNode>;
  readonly types: { name: string; type: string }[];
}

function emptyNode(): NamespaceNode {
  return { children: new Map(), types: [] };
}

function insert(root: NamespaceNode, type: ExternType): void {
  // path[0] is `shaka`, which the caller renders as the outer namespace.
  let node = root;
  for (const segment of type.path.slice(1)) {
    let child = node.children.get(segment);
    if (child === undefined) {
      child = emptyNode();
      node.children.set(segment, child);
    }
    node = child;
  }
  node.types.push({ name: type.name, type: type.type });
}

function renderNode(node: NamespaceNode, indent: string): string {
  const lines: string[] = [];
  for (const [name, child] of [...node.children].sort()) {
    lines.push(`${indent}export namespace ${name} {`);
    lines.push(renderNode(child, `${indent}  `));
    lines.push(`${indent}}`);
  }
  for (const { name, type } of node.types) {
    lines.push(`${indent}export type ${name} = ${type};`);
  }
  return lines.join('\n');
}

/**
 * Builds an ambient declaration for the `shaka.extern.*` namespace.
 *
 * The library refers to extern types by their qualified name, `shaka.extern.
 * Manifest`, but the externs are Closure only and never transpiled into the
 * output, so those references resolve to nothing. This declares them once as a
 * global ambient namespace. It is emitted as a `.d.ts`, so `skipLibCheck` leaves
 * its own internals unchecked while the library files resolve against it.
 */
export function buildExternsDeclaration(root: string): string {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  const tree = emptyNode();
  for (const file of discoverExternFiles(root)) {
    for (const type of collectExternTypesFromSource(readFileSync(file, 'utf8'), project)) {
      insert(tree, type);
    }
  }
  return [
    '// Generated ambient declaration for the Closure externs. Do not edit.',
    'declare namespace shaka {',
    renderNode(tree, '  '),
    '}',
    '',
  ].join('\n');
}
