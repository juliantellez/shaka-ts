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

/** Built-in constructors whose `new` call reads no module binding at definition. */
const SAFE_CONSTRUCTORS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);

/**
 * Whether an expression can be moved into a static field without changing when
 * its dependencies are read.
 *
 * A static field initialiser runs when the class is defined, which is earlier
 * than the module level assignment it replaces. Moving it is only safe when it
 * observes nothing at that point that the assignment's later position would
 * change. Literals qualify. So do function and arrow expressions, because their
 * bodies run when called, not when defined. So does `new Map()` and its siblings
 * over safe arguments, which is the common static registry. Anything that reads
 * another binding at definition time is left where it is.
 */
function isSafeToHoist(node: Expression): boolean {
  if (Node.isFunctionExpression(node) || Node.isArrowFunction(node)) {
    return true;
  }
  if (Node.isObjectLiteralExpression(node)) {
    return node.getProperties().every((property) => {
      if (!Node.isPropertyAssignment(property)) {
        return false;
      }
      const initializer = property.getInitializer();
      return initializer !== undefined && isSafeToHoist(initializer);
    });
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().every((element) => isSafeToHoist(element));
  }
  if (Node.isNewExpression(node)) {
    const callee = node.getExpression();
    if (!Node.isIdentifier(callee) || !SAFE_CONSTRUCTORS.has(callee.getText())) {
      return false;
    }
    return node.getArguments().every((argument) => {
      return Node.isExpression(argument) && isSafeToHoist(argument);
    });
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
 * Only self contained values are moved, because a static initialiser runs
 * earlier than the assignment it replaces; anything that reads another binding
 * at definition time is left where it is.
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
    if (!isSafeToHoist(right)) {
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
