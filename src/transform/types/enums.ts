import { Node, type ExpressionStatement, type SourceFile, type Statement } from 'ts-morph';

export interface EnumResult {
  /** Number of `@enum` objects converted. */
  readonly converted: number;
}

/** True when a statement's JSDoc carries an `@enum` tag. */
function isEnum(statement: Statement): boolean {
  if (!Node.isJSDocable(statement)) {
    return false;
  }
  return statement
    .getJsDocs()
    .some((jsDoc) => jsDoc.getTags().some((tag) => tag.getTagName() === 'enum'));
}

/**
 * Adds `as const` to a member enum, such as `log.Level = {...}`.
 *
 * These are attached to a class or namespace rather than declared standalone, so
 * a companion value type cannot share their name. They still gain `as const`,
 * which narrows the members to literals, the core of preferring `as const` over
 * a TypeScript `enum`.
 */
function convertMemberEnum(statement: ExpressionStatement): boolean {
  const expression = statement.getExpression();
  if (!Node.isBinaryExpression(expression)) {
    return false;
  }
  const right = expression.getRight();
  if (!Node.isObjectLiteralExpression(right) || right.getText().trimEnd().endsWith('as const')) {
    return false;
  }
  right.replaceWithText(`${right.getText()} as const`);
  return true;
}

/**
 * Converts Closure `@enum` objects into `as const` objects with a value type.
 *
 * Closure's `@enum` gives an object both a set of constant members and a type
 * of the same name. The TypeScript equivalent is an `as const` object, which
 * narrows the members to literals, paired with a type alias that is the union
 * of the member values. Declaring the type beside the value, under the same
 * name, lets the name work in both positions exactly as the Closure enum did.
 */
export function convertEnums(sourceFile: SourceFile): EnumResult {
  let converted = 0;

  // Member enums attached to a class or namespace, such as `log.Level = {...}`.
  for (const statement of sourceFile.getStatements()) {
    if (
      Node.isExpressionStatement(statement) &&
      isEnum(statement) &&
      convertMemberEnum(statement)
    ) {
      converted += 1;
    }
  }

  for (const statement of sourceFile.getVariableStatements()) {
    if (!isEnum(statement)) {
      continue;
    }
    const declaration = statement.getDeclarations()[0];
    const initializer = declaration?.getInitializer();
    if (!declaration || !initializer || !Node.isObjectLiteralExpression(initializer)) {
      continue;
    }
    const objectText = initializer.getText();
    if (objectText.trimEnd().endsWith('as const')) {
      continue;
    }

    const name = declaration.getName();
    const typeAlias = `export type ${name} = (typeof ${name})[keyof typeof ${name}];`;
    // Build the whole replacement in one edit: the object gains `as const` and
    // the value type alias follows the statement.
    const statementText = statement.getText().replace(objectText, `${objectText} as const`);
    statement.replaceWithText(`${statementText}\n\n${typeAlias}`);
    converted += 1;
  }

  return { converted };
}
