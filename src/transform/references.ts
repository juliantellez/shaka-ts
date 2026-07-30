import type { SourceFile } from 'ts-morph';
import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { resolveFileBindings } from './bindings.ts';

export interface RewriteResult {
  /** Number of namespace references replaced across code and comments. */
  readonly rewritten: number;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the matcher for a set of namespaces.
 *
 * Namespaces are ordered longest first, so `shaka.util.Error` is tried before
 * `shaka.util` and a reference like `shaka.util.Error.Code` rewrites through the
 * longer binding and keeps its `.Code` suffix.
 *
 * The lookbehind stops a namespace matching as the tail of a longer identifier
 * (`myshaka`) or as a property of another object (`foo.shaka`), but must still
 * match after a spread, where the preceding dot belongs to `...` rather than a
 * property access. So it rejects only a dot that follows an identifier, not the
 * dots of a spread.
 */
function namespaceMatcher(namespaces: readonly string[]): RegExp {
  const alternation = [...namespaces]
    .sort((a, b) => b.length - a.length)
    .map(escapeForRegExp)
    .join('|');
  return new RegExp(`(?<![\\w$])(?<![\\w$)\\]]\\.)(?:${alternation})(?![\\w$])`, 'g');
}

/**
 * Matches, in priority order, the spans a namespace must not be rewritten
 * inside: block comments, line comments, and the three string forms. A block or
 * line comment is captured so its own contents can still be rewritten, since
 * JSDoc type annotations reference namespaces too. Strings are captured so they
 * can be left exactly as written.
 */
const TOKENS = [
  String.raw`/\*[\s\S]*?\*/`, // block comment
  String.raw`//[^\n]*`, // line comment
  String.raw`'(?:[^'\\]|\\.)*'`, // single quoted string
  String.raw`"(?:[^"\\]|\\.)*"`, // double quoted string
  String.raw`\`(?:[^\`\\]|\\.)*\``, // template literal
].join('|');

/**
 * Rewrites every fully qualified namespace reference to its local identifier.
 *
 * References are rewritten in code and in JSDoc comments, since the type
 * annotations there are what the type passes later depend on, but never inside
 * a string literal: a namespace that appears in a log message or an error
 * string is left untouched. This is why the rewrite is tokenized rather than a
 * blanket text replace.
 */
export function rewriteReferences(
  sourceFile: SourceFile,
  record: ModuleRecord,
  graph: DependencyGraph,
  exportNames: ReadonlyMap<string, string>,
): RewriteResult {
  const names = resolveFileBindings(record, graph, exportNames);
  return rewriteBindings(sourceFile, names);
}

/**
 * Rewrites a given set of namespace bindings across a file.
 *
 * The tokenizer core shared by the namespace rewrite and the file local pass:
 * it replaces each namespace in code and in comments, never inside a string,
 * and keeps the suffix of a longer reference by matching the longest namespace
 * first.
 */
export function rewriteBindings(
  sourceFile: SourceFile,
  names: ReadonlyMap<string, string>,
): RewriteResult {
  if (names.size === 0) {
    return { rewritten: 0 };
  }

  const matcher = namespaceMatcher([...names.keys()]);
  let rewritten = 0;

  const rewriteIn = (text: string): string =>
    text.replace(matcher, (match) => {
      const replacement = names.get(match);
      if (replacement === undefined) {
        return match;
      }
      rewritten += 1;
      return replacement;
    });

  const combined = new RegExp(`(${TOKENS})|(${matcher.source})`, 'g');
  const output = sourceFile.getFullText().replace(combined, (match, token: string | undefined) => {
    if (token === undefined) {
      // A namespace matched in code.
      const replacement = names.get(match);
      if (replacement === undefined) {
        return match;
      }
      rewritten += 1;
      return replacement;
    }
    if (token.startsWith('/*') || token.startsWith('//')) {
      // A comment: rewrite the namespaces inside it, but not the comment itself.
      return rewriteIn(token);
    }
    // A string literal: leave untouched.
    return token;
  });

  sourceFile.replaceWithText(removeSelfAliases(output));
  return { rewritten };
}

/** A local alias that became self referential after the namespace rewrite. */
const SELF_ALIAS = /^[ \t]*const ([A-Za-z_$][\w$]*) = \1;[ \t]*\r?\n/gm;

/**
 * Removes `const X = X;` statements left by the rewrite.
 *
 * Shaka shortens a long namespace inside a method with `const BufferUtils =
 * shaka.util.BufferUtils;`. Once the right hand side is rewritten to its local
 * name it reads `const BufferUtils = BufferUtils`, a temporal dead zone crash
 * rather than an alias. The binding is already in scope, so the statement is
 * redundant and removed.
 */
function removeSelfAliases(code: string): string {
  return code.replace(SELF_ALIAS, '');
}
