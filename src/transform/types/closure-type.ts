/**
 * Translates a Closure type expression into a TypeScript type.
 *
 * Closure and TypeScript share most surface syntax but differ on nullability
 * and a few constructors: Closure types are nullable by default for object
 * types and use `!`/`?` prefixes, `function(...)` for function types, and
 * `Object<K,V>` for maps. This is a recursive descent parser over that grammar
 * that emits the TypeScript equivalent, preserving type names verbatim so the
 * name resolution done elsewhere is untouched.
 */

class Cursor {
  private position = 0;
  private readonly input: string;

  public constructor(input: string) {
    this.input = input;
  }

  public peek(): string {
    return this.input[this.position] ?? '';
  }

  public startsWith(text: string): boolean {
    return this.input.startsWith(text, this.position);
  }

  public take(count = 1): string {
    const taken = this.input.slice(this.position, this.position + count);
    this.position += count;
    return taken;
  }

  public skipSpace(): void {
    while (/\s/.test(this.peek())) {
      this.position += 1;
    }
  }

  public done(): boolean {
    this.skipSpace();
    return this.position >= this.input.length;
  }

  public at(): number {
    return this.position;
  }

  /** Reads a dotted, optionally namespaced name such as `shaka.util.Error`. */
  public readName(): string {
    const match = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*/.exec(this.input.slice(this.position));
    const name = match?.[0] ?? '';
    this.position += name.length;
    return name;
  }
}

function parseType(cursor: Cursor): string {
  cursor.skipSpace();

  if (cursor.peek() === '!') {
    cursor.take();
    return parseType(cursor); // TypeScript is non-null by default.
  }
  if (cursor.peek() === '?') {
    cursor.take();
    cursor.skipSpace();
    if (isTypeEnd(cursor)) {
      return 'unknown'; // A bare `?` is any nullable value.
    }
    return `${wrapUnion(parseType(cursor))} | null`;
  }

  return parseUnion(cursor);
}

function parseUnion(cursor: Cursor): string {
  const parts = [parseAtom(cursor)];
  cursor.skipSpace();
  while (cursor.peek() === '|') {
    cursor.take();
    parts.push(parseAtom(cursor));
    cursor.skipSpace();
  }
  if (parts.length === 1) {
    return parts[0] ?? '';
  }
  // A function type must be parenthesised inside a union, or `A | () => B` reads
  // as `A | (() => B)` with the wrong precedence and TypeScript rejects it.
  return parts.map((part) => (isFunctionType(part) ? `(${part})` : part)).join(' | ');
}

/** True when a rendered type contains a function arrow that a union must parenthesise. */
function isFunctionType(type: string): boolean {
  return type.includes('=>');
}

function parseAtom(cursor: Cursor): string {
  cursor.skipSpace();
  const char = cursor.peek();

  if (char === '*') {
    cursor.take();
    return 'unknown';
  }
  if (char === '?' || char === '!') {
    return parseType(cursor);
  }
  if (char === '(') {
    cursor.take();
    const inner = parseType(cursor);
    cursor.skipSpace();
    cursor.take(); // ')'
    return inner;
  }
  if (char === '{') {
    return parseRecord(cursor);
  }
  if (cursor.startsWith('function')) {
    return parseFunction(cursor);
  }

  const name = cursor.readName();

  // The `typeof X` operator has the same meaning in both languages.
  if (name === 'typeof') {
    cursor.skipSpace();
    return `typeof ${cursor.readName()}`;
  }

  cursor.skipSpace();
  if (cursor.startsWith('.<') || cursor.peek() === '<') {
    return parseGeneric(cursor, name);
  }
  return translateName(name);
}

function parseGeneric(cursor: Cursor, name: string): string {
  if (cursor.startsWith('.<')) {
    cursor.take(2);
  } else {
    cursor.take(); // '<'
  }
  const args: string[] = [parseType(cursor)];
  cursor.skipSpace();
  while (cursor.peek() === ',') {
    cursor.take();
    args.push(parseType(cursor));
    cursor.skipSpace();
  }
  cursor.take(); // '>'

  if (name === 'Object' && args.length === 2) {
    return `Record<${args[0] ?? 'string'}, ${args[1] ?? 'unknown'}>`;
  }
  return `${translateName(name)}<${args.join(', ')}>`;
}

function parseRecord(cursor: Cursor): string {
  cursor.take(); // '{'
  cursor.skipSpace();
  const members: string[] = [];
  while (cursor.peek() !== '}' && !cursor.done()) {
    const before = cursor.at();
    const key = cursor.readName();
    cursor.skipSpace();
    const optional = cursor.peek() === '?'; // Closure optional record key `{k?: T}`.
    if (optional) {
      cursor.take();
      cursor.skipSpace();
    }
    if (cursor.peek() === ':') {
      cursor.take();
      members.push(`${key}${optional ? '?' : ''}: ${parseType(cursor)}`);
    } else {
      members.push(`${key}: unknown`);
    }
    cursor.skipSpace();
    if (cursor.peek() === ',') {
      cursor.take();
      cursor.skipSpace();
    }
    if (cursor.at() === before) {
      cursor.take(); // Guarantee progress so a stray character cannot loop forever.
    }
  }
  cursor.take(); // '}'
  return `{ ${members.join('; ')} }`;
}

function parseFunction(cursor: Cursor): string {
  cursor.take('function'.length);
  cursor.skipSpace();
  cursor.take(); // '('

  const params: string[] = [];
  let isConstructor = false;
  let thisType: string | undefined;
  let index = 0;

  cursor.skipSpace();
  while (cursor.peek() !== ')' && !cursor.done()) {
    const before = cursor.at();
    if (cursor.startsWith('this')) {
      cursor.take('this'.length);
      cursor.skipSpace();
      cursor.take(); // ':'
      thisType = parseType(cursor);
    } else if (cursor.startsWith('new')) {
      cursor.take('new'.length);
      cursor.skipSpace();
      cursor.take(); // ':'
      isConstructor = true;
      thisType = parseType(cursor);
    } else if (cursor.startsWith('...')) {
      cursor.take(3);
      params.push(`...args${String(index)}: ${parseType(cursor)}[]`);
      index += 1;
    } else {
      const type = parseType(cursor);
      cursor.skipSpace();
      const optional = cursor.peek() === '=';
      if (optional) {
        cursor.take();
      }
      params.push(`arg${String(index)}${optional ? '?' : ''}: ${type}`);
      index += 1;
    }
    cursor.skipSpace();
    if (cursor.peek() === ',') {
      cursor.take();
      cursor.skipSpace();
    }
    if (cursor.at() === before) {
      cursor.take(); // Guarantee progress.
    }
  }
  cursor.take(); // ')'

  cursor.skipSpace();
  let returnType = 'void';
  if (cursor.peek() === ':') {
    cursor.take();
    returnType = parseType(cursor);
  }

  const signature = params.join(', ');
  if (isConstructor) {
    return `new (${signature}) => ${thisType ?? 'unknown'}`;
  }
  const withThis = thisType
    ? [`this: ${thisType}`, ...(signature ? [signature] : [])].join(', ')
    : signature;
  return `(${withThis}) => ${returnType}`;
}

const NAME_MAP: Record<string, string> = {
  Object: 'object',
  '': 'unknown',
};

function translateName(name: string): string {
  return NAME_MAP[name] ?? name;
}

function isTypeEnd(cursor: Cursor): boolean {
  const char = cursor.peek();
  return (
    char === '' || char === ',' || char === '>' || char === ')' || char === '}' || char === '|'
  );
}

function wrapUnion(type: string): string {
  // Parenthesise a union or a function type before a `| null` suffix, so the
  // precedence is right and TypeScript accepts it.
  return type.includes('|') || type.includes('=>') ? `(${type})` : type;
}

/**
 * Collapses a multi-line JSDoc type onto one line.
 *
 * A record type that spans several lines in a comment carries the JSDoc line
 * prefixes, `\n   *   `, into the text ts-morph returns. Each such prefix
 * becomes a single space so the parser sees a clean expression, while a `*`
 * used as the wildcard type, which never follows a newline, is left alone.
 */
function normalize(closureType: string): string {
  return closureType.replace(/\s*\n\s*\*?\s*/g, ' ').trim();
}

/** Translates a Closure type expression, returning `unknown` for empty input. */
export function translateType(closureType: string): string {
  const trimmed = normalize(closureType);
  if (trimmed === '') {
    return 'unknown';
  }
  return parseType(new Cursor(trimmed));
}
