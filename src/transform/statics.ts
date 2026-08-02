import {
  Node,
  SyntaxKind,
  type ClassDeclaration,
  type ExpressionStatement,
  type Expression,
  type SourceFile,
} from 'ts-morph';

export interface StaticResult {
  /** Number of static members hoisted into their class body. */
  readonly hoisted: number;
}

/**
 * Whether an expression is a literal that depends on nothing outside itself.
 *
 * A static field initialiser runs when the class is defined, which is earlier
 * than the module level assignment it replaces. Moving it is only safe when it
 * cannot observe that change, so this allows object and array literals of
 * literals and plain primitives, and nothing that reads another binding.
 */
function isSelfContainedLiteral(node: Expression): boolean {
  if (Node.isObjectLiteralExpression(node)) {
    return node.getProperties().every((property) => {
      if (!Node.isPropertyAssignment(property)) {
        return false;
      }
      const initializer = property.getInitializer();
      return initializer !== undefined && isSelfContainedLiteral(initializer);
    });
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().every((element) => isSelfContainedLiteral(element));
  }
  if (Node.isPrefixUnaryExpression(node)) {
    return Node.isNumericLiteral(node.getOperand());
  }
  const kind = node.getKind();
  return (
    Node.isStringLiteral(node) ||
    Node.isNumericLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node) ||
    Node.isRegularExpressionLiteral(node) ||
    kind === SyntaxKind.TrueKeyword ||
    kind === SyntaxKind.FalseKeyword ||
    kind === SyntaxKind.NullKeyword
  );
}

/** The JSDoc block immediately above a statement, if any. */
function leadingJsDoc(statement: Node): string | undefined {
  const comments = statement.getLeadingCommentRanges();
  const last = comments[comments.length - 1];
  const text = last?.getText();
  return text?.startsWith('/**') ? text : undefined;
}

/** Strips the block comment delimiters and the leading star from a JSDoc block. */
function jsDocInner(jsDoc: string): string {
  return jsDoc
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

interface Hoist {
  readonly target: ClassDeclaration;
  readonly name: string;
  readonly initializer: string;
  readonly doc: string | undefined;
  readonly statement: ExpressionStatement;
}

/**
 * Moves a class's static members from module level assignments into its body.
 *
 * Closure assigns statics after the class as `shaka.util.Error.Code = {...}`,
 * which the reference pass rewrites to `UtilError.Code = {...}`. TypeScript does
 * not treat that as a declared static, so both the assignment and every read of
 * it is an error. Declaring it as `static Code = {...}` inside the class fixes
 * both at once. This is the largest single source of "property does not exist"
 * errors in the transpiled output, after the instance fields.
 *
 * Only self contained literals are moved, because a static initialiser runs
 * earlier than the assignment it replaces; anything that reads another binding
 * is left where it is.
 */
export function declareStatics(sourceFile: SourceFile): StaticResult {
  const classes = new Map<string, ClassDeclaration>();
  for (const classDeclaration of sourceFile.getClasses()) {
    const name = classDeclaration.getName();
    if (name !== undefined) {
      classes.set(name, classDeclaration);
    }
  }
  if (classes.size === 0) {
    return { hoisted: 0 };
  }

  const hoists: Hoist[] = [];
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
    if (!Node.isPropertyAccessExpression(left) || !Node.isIdentifier(left.getExpression())) {
      continue;
    }
    const target = classes.get(left.getExpression().getText());
    if (target === undefined) {
      continue;
    }
    const name = left.getName();
    if (target.getStaticMember(name) !== undefined) {
      continue;
    }
    const right = expression.getRight();
    if (!isSelfContainedLiteral(right)) {
      continue;
    }
    hoists.push({
      target,
      name,
      initializer: right.getText(),
      doc: leadingJsDoc(statement),
      statement,
    });
  }

  for (const hoist of hoists) {
    hoist.target.addProperty({
      isStatic: true,
      name: hoist.name,
      initializer: hoist.initializer,
      docs: hoist.doc ? [{ description: jsDocInner(hoist.doc) }] : [],
    });
    hoist.statement.remove();
  }

  return { hoisted: hoists.length };
}
