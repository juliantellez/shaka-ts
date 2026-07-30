import {
  Node,
  type ConstructorDeclaration,
  type FunctionDeclaration,
  type JSDocableNode,
  type MethodDeclaration,
  type ParameterDeclaration,
  type ParameteredNode,
  type ReturnTypedNode,
  type SourceFile,
} from 'ts-morph';
import { translateType } from './closure-type.ts';

export interface SignatureResult {
  /** Number of parameters given a type. */
  readonly params: number;
  /** Number of return types set. */
  readonly returns: number;
}

type FunctionLike = (FunctionDeclaration | MethodDeclaration | ConstructorDeclaration) &
  ParameteredNode &
  JSDocableNode;

/**
 * Reads the Closure type text from a JSDoc tag, or undefined if it has none.
 */
function tagType(tag: Node): string | undefined {
  if (!Node.isJSDocParameterTag(tag) && !Node.isJSDocReturnTag(tag)) {
    return undefined;
  }
  return tag.getTypeExpression()?.getTypeNode().getText();
}

/**
 * Applies a Closure parameter type to a real TypeScript parameter.
 *
 * Closure marks an optional parameter with a trailing `=` and a rest parameter
 * with a leading `...`, both of which move onto the parameter itself rather than
 * its type: `{string=}` becomes `x?: string`, `{...number}` becomes
 * `...x: number[]`.
 */
function applyParamType(parameter: ParameterDeclaration, closureType: string): void {
  let type = closureType.trim();
  if (parameter.isRestParameter() || type.startsWith('...')) {
    type = type.replace(/^\.\.\./, '');
    parameter.setType(`${translateType(type)}[]`);
    return;
  }
  if (type.endsWith('=')) {
    type = type.slice(0, -1);
    if (!parameter.hasInitializer()) {
      parameter.setHasQuestionToken(true);
    }
  }
  parameter.setType(translateType(type));
}

function applySignature(node: FunctionLike): SignatureResult {
  const jsDoc = node.getJsDocs().at(-1);
  if (!jsDoc) {
    return { params: 0, returns: 0 };
  }

  let params = 0;
  let returns = 0;

  for (const tag of jsDoc.getTags()) {
    // A type that ts-morph would reject as syntactically invalid is skipped
    // rather than allowed to crash the build; the parameter stays untyped.
    try {
      if (Node.isJSDocParameterTag(tag)) {
        const parameter = node.getParameters().find((p) => p.getName() === tag.getName());
        const type = tagType(tag);
        if (parameter && type !== undefined && !parameter.getTypeNode()) {
          applyParamType(parameter, type);
          params += 1;
        }
      } else if (Node.isJSDocReturnTag(tag) && !Node.isConstructorDeclaration(node)) {
        const type = tagType(tag);
        const typed = node as ReturnTypedNode;
        if (type !== undefined && !typed.getReturnTypeNode()) {
          typed.setReturnType(translateType(type));
          returns += 1;
        }
      }
    } catch {
      // Leave this annotation for a later, more precise pass.
    }
  }

  return { params, returns };
}

/**
 * Converts `@param` and `@return` annotations into TypeScript signatures.
 *
 * The types move onto the parameters and the return position, where TypeScript
 * enforces them; the descriptions stay in the JSDoc comment, which is the
 * published API documentation. A parameter or return that already carries a
 * TypeScript type is left alone.
 */
export function applySignatureTypes(sourceFile: SourceFile): SignatureResult {
  let params = 0;
  let returns = 0;

  const nodes = [
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses().flatMap((c) => [...c.getMethods(), ...c.getConstructors()]),
  ];

  for (const node of nodes) {
    const result = applySignature(node);
    params += result.params;
    returns += result.returns;
  }

  return { params, returns };
}
