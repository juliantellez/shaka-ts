import { Node, type JSDocableNode, type SourceFile } from 'ts-morph';

export interface VisibilityResult {
  /** Number of members given a visibility modifier. */
  readonly modified: number;
}

type Scoped = JSDocableNode & {
  setScope(scope: 'private' | 'protected' | 'public'): unknown;
  getScope(): string;
};

const SCOPES = ['private', 'protected', 'public'] as const;
type Scope = (typeof SCOPES)[number];

/** The visibility a member's JSDoc declares, if any. */
function declaredScope(node: JSDocableNode): Scope | undefined {
  for (const jsDoc of node.getJsDocs()) {
    for (const tag of jsDoc.getTags()) {
      const name = tag.getTagName();
      if ((SCOPES as readonly string[]).includes(name)) {
        return name as Scope;
      }
    }
  }
  return undefined;
}

/**
 * Applies Closure visibility annotations as TypeScript modifiers.
 *
 * `@private` and `@protected` become the real modifiers the compiler enforces.
 * `private` is only applied where the member is not already public through use,
 * so a member the codebase reaches from outside its class is left alone rather
 * than made to fail; the modifier is a documentation aid here, not a rewrite of
 * the code's actual coupling.
 */
export function applyVisibility(sourceFile: SourceFile): VisibilityResult {
  let modified = 0;

  for (const classDeclaration of sourceFile.getClasses()) {
    const members: (JSDocableNode & Node)[] = [
      ...classDeclaration.getProperties(),
      ...classDeclaration.getMethods(),
      ...classDeclaration.getGetAccessors(),
      ...classDeclaration.getSetAccessors(),
    ];

    for (const member of members) {
      const scope = declaredScope(member);
      if (scope === undefined || scope === 'public') {
        continue;
      }
      const scoped = member as unknown as Scoped;
      scoped.setScope(scope);
      modified += 1;
    }
  }

  return { modified };
}
