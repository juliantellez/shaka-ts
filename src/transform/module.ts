import type { DependencyGraph, ModuleRecord } from '../graph.ts';
import { importSpecifier } from '../graph.ts';
import { localNameFor } from './symbols.ts';

/** A namespace mapped onto the identifier it becomes, and where it comes from. */
interface Binding {
  readonly namespace: string;
  readonly localName: string;
  /** Module specifier to import from, or undefined when declared in this file. */
  readonly from?: string;
  readonly typeOnly?: boolean;
}

export interface TransformResult {
  readonly code: string;
  readonly warnings: readonly string[];
  /** Namespaces this module exports, paired with their emitted identifiers. */
  readonly exports: readonly { namespace: string; localName: string }[];
}

const LICENSE_HEADER = /^\/\*!\s*@license[\s\S]*?\*\/\n/;
const GOOG_STATEMENT = /^goog\.(provide|require|requireType)\('[^']+'\);?[ \t]*\n/gm;

/**
 * Calls that exist only to serve the Closure compiler and have no meaning once
 * the code is ES modules.
 *
 * `goog.exportSymbol` registers a name globally so Closure's renaming pass and
 * its debug module wrapper leave it reachable. Real module exports make that
 * unnecessary, and leaving the call in produces an undefined free variable that
 * only fails at runtime.
 */
const DROPPED_CALLS = /^[ \t]*goog\.exportSymbol\([^;]*\);?[ \t]*\n/gm;

/**
 * Local aliases that become self referential once the namespace is rewritten.
 *
 * Shaka shortens long namespaces inside method bodies:
 *
 *     const StringUtils = shaka.util.StringUtils;
 *
 * After the right hand side is rewritten to its local identifier the statement
 * reads `const StringUtils = StringUtils`, which is a temporal dead zone error
 * rather than an alias. The declaration is redundant in a module, since the
 * imported binding is already in scope, so it is removed.
 */
const SELF_ALIAS = /^[ \t]*const ([A-Za-z_$][\w$]*) = \1;[ \t]*\n/gm;

/** Namespaces satisfied by our own runtime rather than by an upstream file. */
const RUNTIME_MODULES: ReadonlyMap<string, { localName: string; from: string }> = new Map([
  ['goog.Uri', { localName: 'Uri', from: 'runtime/uri.ts' }],
]);

/**
 * Namespaces used without a matching `goog.require`.
 *
 * Closure defines these globally, so upstream references them bare. Nothing in
 * the require graph points at them, which means they have to be detected by
 * scanning the source or they silently survive into the output as an undefined
 * free variable. A bundler will not complain, and the failure only appears when
 * the code actually runs.
 */
const IMPLICIT_GLOBALS: ReadonlyMap<string, { localName: string; from: string }> = new Map([
  ['goog.DEBUG', { localName: 'DEBUG', from: 'runtime/debug.ts' }],
]);

function runtimeSpecifier(fromPath: string, target: string): string {
  const depth = fromPath.split('/').length - 1;
  return `${'../'.repeat(depth)}${target}`;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites every dotted reference to a namespace into its local identifier.
 *
 * Longest namespace first, so `shaka.util.Error.Code` rewrites via
 * `shaka.util.Error` and keeps its `.Code` suffix rather than being matched by
 * some shorter prefix.
 *
 * Comments are rewritten alongside code on purpose: the JSDoc blocks are the
 * type information, and leaving `shaka.util.Error` inside them would strand
 * every annotation the type pass later depends on.
 */
function rewriteReferences(source: string, bindings: readonly Binding[]): string {
  const ordered = [...bindings].sort((a, b) => b.namespace.length - a.namespace.length);
  let output = source;
  for (const binding of ordered) {
    const pattern = new RegExp(`(?<![\\w$.])${escapeForRegExp(binding.namespace)}(?![\\w$])`, 'g');
    output = output.replace(pattern, binding.localName);
  }
  return output;
}

/**
 * Turns `Name = class {` and friends into real exported declarations.
 *
 * Runs after reference rewriting, so the left hand side is already the local
 * identifier rather than a dotted namespace.
 */
function convertDeclarations(source: string, exportedNames: ReadonlySet<string>): string {
  let output = source;
  for (const name of exportedNames) {
    const escaped = escapeForRegExp(name);
    output = output.replace(
      new RegExp(`^${escaped}\\s*=\\s*class\\b`, 'gm'),
      `export class ${name}`,
    );
    output = output.replace(
      new RegExp(`^${escaped}\\s*=\\s*(function\\s*\\()`, 'gm'),
      `export const ${name} = $1`,
    );
    output = output.replace(
      new RegExp(`^${escaped}\\s*=\\s*\\{`, 'gm'),
      `export const ${name} = {`,
    );
  }
  return output;
}

/**
 * Moves `Name.Member = value;` statements into the class body as statics.
 *
 * Closure allows decorating a constructor with arbitrary properties after the
 * fact and Shaka uses that heavily: `shaka.util.Error` alone attaches
 * `createStack`, `Severity`, `Category` and `Code` this way. TypeScript rejects
 * it, so the assignments have to become real static members.
 */
function hoistStatics(
  source: string,
  className: string,
  warnings: string[],
): { code: string; hoisted: number } {
  const classStart = source.search(
    new RegExp(`^export class ${escapeForRegExp(className)}\\b`, 'm'),
  );
  if (classStart === -1) {
    return { code: source, hoisted: 0 };
  }

  const openBrace = source.indexOf('{', classStart);
  if (openBrace === -1) {
    return { code: source, hoisted: 0 };
  }

  const closeBrace = matchBrace(source, openBrace);
  if (closeBrace === -1) {
    warnings.push(`could not find the end of class ${className}, statics not hoisted`);
    return { code: source, hoisted: 0 };
  }

  const assignment = new RegExp(
    `(?:^\\/\\*\\*[\\s\\S]*?\\*\\/\\n)?^${escapeForRegExp(className)}\\.([A-Za-z_$][\\w$]*)\\s*=\\s*`,
    'gm',
  );

  const statics: string[] = [];
  const removals: { start: number; end: number }[] = [];

  assignment.lastIndex = closeBrace;
  for (;;) {
    const match = assignment.exec(source);
    if (!match) {
      break;
    }
    const member = match[1];
    if (member === undefined) {
      continue;
    }
    const valueStart = match.index + match[0].length;
    const valueEnd = findStatementEnd(source, valueStart);
    if (valueEnd === -1) {
      warnings.push(`could not find the end of ${className}.${member}, left as an assignment`);
      continue;
    }
    const doc = match[0].startsWith('/**')
      ? `${indentBlock(match[0].slice(0, match[0].indexOf('*/') + 2))}\n  `
      : '';
    const value = source.slice(valueStart, valueEnd).trim().replace(/;$/, '');
    statics.push(`  ${doc}static ${member} = ${indentBlock(value)};`);
    removals.push({ start: match.index, end: skipTrailingNewlines(source, valueEnd) });
    assignment.lastIndex = valueEnd;
  }

  if (statics.length === 0) {
    return { code: source, hoisted: 0 };
  }

  let output = source;
  for (const removal of [...removals].reverse()) {
    output = output.slice(0, removal.start) + output.slice(removal.end);
  }

  // matchBrace returns the position after the closing brace, so step back one
  // to land inside the class body rather than after it.
  const insertAt =
    matchBrace(
      output,
      output.indexOf(
        '{',
        output.search(new RegExp(`^export class ${escapeForRegExp(className)}\\b`, 'm')),
      ),
    ) - 1;
  return {
    code: `${output.slice(0, insertAt)}\n${statics.join('\n\n')}\n${output.slice(insertAt)}`,
    hoisted: statics.length,
  };
}

/**
 * Declares instance fields for every `this.name = ...` assignment in a class.
 *
 * Closure infers the property from the assignment plus its inline annotation:
 *
 *     \/** @private {shaka.util.Timer} *\/
 *     this.timer_ = null;
 *
 * TypeScript does not, so every such property is an error until it is declared
 * in the class body. This is the single largest source of type errors in the
 * transformed output, and the declarations are also where the types will
 * eventually live once annotations are translated.
 *
 * The JSDoc block is carried across rather than left in the constructor, so the
 * annotation ends up attached to the declaration it describes.
 */
function declareInstanceFields(source: string, className: string): string {
  const classStart = source.search(
    new RegExp(`^export class ${escapeForRegExp(className)}\\b`, 'm'),
  );
  if (classStart === -1) {
    return source;
  }
  const openBrace = source.indexOf('{', classStart);
  if (openBrace === -1) {
    return source;
  }
  const closeBrace = matchBrace(source, openBrace);
  if (closeBrace === -1) {
    return source;
  }

  const body = source.slice(openBrace + 1, closeBrace - 1);

  // The doc body must not swallow its own terminator, otherwise the match runs
  // past `*/` and drags unrelated code, such as the constructor signature, into
  // the captured comment.
  const assignment =
    /^[ \t]*(?:\/\*\*((?:[^*]|\*(?!\/))*)\*\/[ \t]*\n[ \t]*)?this\.([A-Za-z_$][\w$]*)\s*=/gm;
  const fields = new Map<string, string | undefined>();
  for (const match of body.matchAll(assignment)) {
    const name = match[2];
    if (name === undefined || fields.has(name)) {
      continue;
    }
    fields.set(name, match[1]);
  }

  if (fields.size === 0) {
    return source;
  }

  const declarations = [...fields]
    .map(([name, doc]) => {
      if (doc === undefined) {
        return `  ${name};`;
      }
      const cleaned = doc
        .split('\n')
        .map((docLine) => docLine.trim().replace(/^\*\s?/, ''))
        .filter((docLine) => docLine.length > 0)
        .join('\n   * ');
      return `  /**\n   * ${cleaned}\n   */\n  ${name};`;
    })
    .join('\n\n');

  return `${source.slice(0, openBrace + 1)}\n${declarations}\n${source.slice(openBrace + 1)}`;
}

function indentBlock(value: string): string {
  return value
    .split('\n')
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join('\n');
}

/** Finds the `}` matching the `{` at `openIndex`, skipping strings and comments. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index);
      if (index === -1) return -1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      index = source.indexOf('*/', index);
      if (index === -1) return -1;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      index = skipString(source, index);
      if (index === -1) return -1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return -1;
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return -1;
}

/** Finds the `;` ending a statement that starts at `start`, skipping nested braces. */
function findStatementEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index);
      if (index === -1) return -1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      index = source.indexOf('*/', index);
      if (index === -1) return -1;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      index = skipString(source, index);
      if (index === -1) return -1;
      continue;
    }
    if (char === '{' || char === '[' || char === '(') {
      const close = matchBracket(source, index);
      if (close === -1) return -1;
      index = close;
      continue;
    }
    if (char === ';') return index + 1;
    index += 1;
  }
  return -1;
}

function matchBracket(source: string, openIndex: number): number {
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const open = source[openIndex];
  if (open === undefined) return -1;
  const close = pairs[open];
  if (close === undefined) return -1;
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index);
      if (index === -1) return -1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      index = source.indexOf('*/', index);
      if (index === -1) return -1;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      index = skipString(source, index);
      if (index === -1) return -1;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return -1;
}

function skipTrailingNewlines(source: string, from: number): number {
  let index = from;
  while (index < source.length && (source[index] === '\n' || source[index] === '\r')) {
    index += 1;
  }
  return index;
}

/** Converts one upstream file into an ES module. */
export function transformModule(
  source: string,
  record: ModuleRecord,
  graph: DependencyGraph,
): TransformResult {
  const warnings: string[] = [];
  const taken = new Set<string>();

  const ownBindings: Binding[] = record.provides.map((namespace) => {
    const localName = localNameFor(namespace, taken);
    taken.add(localName);
    return { namespace, localName };
  });

  const imported: Binding[] = [];
  const seenNamespaces = new Set(record.provides);

  const addImport = (namespace: string, typeOnly: boolean): void => {
    if (seenNamespaces.has(namespace)) {
      return;
    }
    seenNamespaces.add(namespace);

    const runtime = RUNTIME_MODULES.get(namespace);
    if (runtime) {
      const localName = localNameFor(runtime.localName, taken);
      taken.add(localName);
      imported.push({
        namespace,
        localName,
        from: runtimeSpecifier(record.path, runtime.from),
        typeOnly,
      });
      return;
    }

    const provider = graph.providers.get(namespace);
    if (provider === undefined) {
      warnings.push(`unresolved require: ${namespace}`);
      return;
    }

    const localName = localNameFor(namespace, taken);
    taken.add(localName);
    imported.push({
      namespace,
      localName,
      from: importSpecifier(record.path, provider),
      typeOnly,
    });
  };

  for (const namespace of record.requires) {
    addImport(namespace, false);
  }
  for (const namespace of record.requireTypes) {
    addImport(namespace, true);
  }

  const header = LICENSE_HEADER.exec(source)?.[0] ?? '';
  let body = source.slice(header.length).replace(GOOG_STATEMENT, '').replace(DROPPED_CALLS, '');

  for (const [namespace, runtime] of IMPLICIT_GLOBALS) {
    const used = new RegExp(`(?<![\\w$.])${escapeForRegExp(namespace)}(?![\\w$])`).test(body);
    if (!used || seenNamespaces.has(namespace)) {
      continue;
    }
    seenNamespaces.add(namespace);
    const localName = localNameFor(runtime.localName, taken);
    taken.add(localName);
    imported.push({
      namespace,
      localName,
      from: runtimeSpecifier(record.path, runtime.from),
    });
  }

  const allBindings = [...ownBindings, ...imported];
  body = rewriteReferences(body, allBindings);
  body = body.replace(SELF_ALIAS, '');
  body = convertDeclarations(body, new Set(ownBindings.map((binding) => binding.localName)));

  for (const binding of ownBindings) {
    const result = hoistStatics(body, binding.localName, warnings);
    body = result.code;
    body = declareInstanceFields(body, binding.localName);
  }

  const importLines = imported.map((binding) => {
    const keyword = binding.typeOnly === true ? 'import type' : 'import';
    return `${keyword} { ${binding.localName} } from '${binding.from ?? ''}';`;
  });

  const parts = [header.trimEnd(), importLines.join('\n'), body.trim()].filter(
    (part) => part.length > 0,
  );

  return {
    code: `${parts.join('\n\n')}\n`,
    warnings,
    exports: ownBindings.map((binding) => ({
      namespace: binding.namespace,
      localName: binding.localName,
    })),
  };
}
