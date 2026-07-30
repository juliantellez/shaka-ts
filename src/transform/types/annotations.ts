import type { SourceFile } from 'ts-morph';

export interface AnnotationResult {
  /** Number of Closure only tags removed. */
  readonly dropped: number;
  /** Number of methods given an `override` modifier. */
  readonly overrides: number;
}

/**
 * Closure JSDoc tags that carry no meaning once the code is TypeScript.
 *
 * These existed to steer the Closure compiler: `@export` and friends controlled
 * renaming, `@const`, `@final` and `@struct` were compiler assertions, and
 * `@suppress` silenced its warnings. `@override` becomes the TypeScript keyword,
 * which the compiler checks; `@final` has no equivalent and is simply dropped.
 */
const DROPPED_TAGS = [
  'export',
  'exportDoc',
  'exportInterface',
  'const',
  'final',
  'struct',
  'dict',
  'unrestricted',
  'suppress',
  'nocollapse',
  'constructor',
  'record',
  'package',
  'define',
  'override',
];

/** A full JSDoc line carrying one of the dropped tags, in a multi-line comment. */
const DROPPED_TAG_LINE = new RegExp(
  `^[ \\t]*\\*[ \\t]*@(?:${DROPPED_TAGS.join('|')})\\b[^\\n]*\\r?\\n`,
  'gm',
);

/** A dropped tag written inline within a single-line comment, with its optional type. */
const DROPPED_TAG_INLINE = new RegExp(
  `@(?:${DROPPED_TAGS.join('|')})\\b[ \\t]*(?:\\{[^}]*\\})?`,
  'g',
);

/** A JSDoc block whose content is only whitespace and stars, left empty after removal. */
const EMPTY_JSDOC = /[ \t]*\/\*\*[\s*]*?\*\/[ \t]*\r?\n?/g;

/**
 * Drops the Closure only JSDoc tags and turns `@override` into the keyword.
 *
 * The `override` modifier is set through the syntax tree so the compiler checks
 * it. The tag removal is done on text, because removing individual JSDoc tags
 * through the tree is fragile, and a JSDoc left empty by the removal is dropped
 * so the output does not fill with bare comments.
 */
export function dropClosureAnnotations(sourceFile: SourceFile): AnnotationResult {
  let overrides = 0;
  for (const classDeclaration of sourceFile.getClasses()) {
    for (const method of classDeclaration.getMethods()) {
      const hasOverride = method
        .getJsDocs()
        .some((jsDoc) => jsDoc.getTags().some((tag) => tag.getTagName() === 'override'));
      if (hasOverride && !method.hasOverrideKeyword()) {
        try {
          method.setHasOverrideKeyword(true);
          overrides += 1;
        } catch {
          // A method whose position rejects the modifier is left for review.
        }
      }
    }
  }

  const original = sourceFile.getFullText();
  const dropped =
    (original.match(DROPPED_TAG_LINE) ?? []).length +
    (original.replace(DROPPED_TAG_LINE, '').match(DROPPED_TAG_INLINE) ?? []).length;
  const output = original
    .replace(DROPPED_TAG_LINE, '')
    .replace(DROPPED_TAG_INLINE, '')
    .replace(EMPTY_JSDOC, '');
  if (output !== original) {
    sourceFile.replaceWithText(output);
  }

  return { dropped, overrides };
}
