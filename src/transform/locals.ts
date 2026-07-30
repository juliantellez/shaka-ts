import { Node, SyntaxKind, type SourceFile, type Statement } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { computeOwnBindings, resolveImports, type Binding } from './bindings.ts';
import { localNameFor } from './symbols.ts';
import { rewriteBindings } from './references.ts';

export interface FileLocalResult {
  /** The file local namespaces that became local declarations. */
  readonly declared: readonly Binding[];
}

/** Leading `class` keyword and any class expression name. */
const CLASS_PREFIX = /^class(\s+(?!extends\b|implements\b)[A-Za-z_$][\w$]*)?/;

interface Candidate {
  readonly namespace: string;
  readonly statement: Statement;
  readonly rightHandSide: Node;
}

/**
 * Collects top level assignments to a `shaka` namespace that no file provides.
 *
 * These are the file local helpers: a class or value attached to a namespace
 * but never passed to `goog.provide`. An assignment to a static member of a
 * provided namespace, such as `shaka.util.Error.Code`, is excluded, since that
 * is a static handled by another pass.
 */
function collectCandidates(sourceFile: SourceFile, provided: ReadonlySet<string>): Candidate[] {
  const isMemberOfProvided = (namespace: string): boolean => {
    const parts = namespace.split('.');
    for (let length = parts.length - 1; length >= 2; length -= 1) {
      if (provided.has(parts.slice(0, length).join('.'))) {
        return true;
      }
    }
    return false;
  };

  const candidates: Candidate[] = [];
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      continue;
    }
    const expression = statement.getExpression();
    if (!Node.isBinaryExpression(expression)) {
      continue;
    }
    if (expression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      continue;
    }
    const left = expression.getLeft();
    if (!Node.isPropertyAccessExpression(left)) {
      continue;
    }
    const namespace = left.getText();
    if (!namespace.startsWith('shaka.')) {
      continue;
    }
    if (provided.has(namespace) || isMemberOfProvided(namespace)) {
      continue;
    }
    candidates.push({ namespace, statement, rightHandSide: expression.getRight() });
  }
  return candidates;
}

/** True when another candidate is a proper namespace prefix of this one. */
function hasCandidatePrefix(namespace: string, all: readonly Candidate[]): boolean {
  return all.some(
    (other) => other.namespace !== namespace && namespace.startsWith(`${other.namespace}.`),
  );
}

function declarationFor(localName: string, rightHandSide: Node): string {
  if (Node.isClassExpression(rightHandSide)) {
    return `class ${localName}${rightHandSide.getText().replace(CLASS_PREFIX, '')}`;
  }
  return `const ${localName} = ${rightHandSide.getText()};`;
}

/**
 * Converts a file's namespace attached helpers into local declarations.
 *
 * A helper like `shaka.dash.TimelineSegmentIndex = class extends ...` becomes a
 * plain `class TimelineSegmentIndex extends ...`, not exported, and every
 * reference to it in the file is renamed. Only the outermost namespace of a
 * group is declared: a nested `shaka.extern.IUIElement.Factory` stays a member
 * assignment on its parent, which the reference rewrite relocates for free.
 */
export function convertFileLocals(
  sourceFile: SourceFile,
  record: ModuleRecord,
  graph: DependencyGraph,
  exportNames: ReadonlyMap<string, string>,
): FileLocalResult {
  const candidates = collectCandidates(sourceFile, new Set(graph.providers.keys()));
  const roots = candidates.filter(
    (candidate) => !hasCandidatePrefix(candidate.namespace, candidates),
  );
  if (roots.length === 0) {
    return { declared: [] };
  }

  // Names already claimed by this file's exports and imports must not be reused.
  const taken = new Set<string>([
    ...computeOwnBindings(record).map((binding) => binding.localName),
    ...resolveImports(record, graph, exportNames).imports.map((binding) => binding.localName),
  ]);

  const declared: Binding[] = [];
  for (const root of roots) {
    const localName = localNameFor(root.namespace, taken);
    taken.add(localName);
    if (Node.isExpressionStatement(root.statement)) {
      root.statement.replaceWithText(declarationFor(localName, root.rightHandSide));
    }
    declared.push({ namespace: root.namespace, localName });
  }

  rewriteBindings(
    sourceFile,
    new Map(declared.map((binding) => [binding.namespace, binding.localName])),
  );
  return { declared };
}
