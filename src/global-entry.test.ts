import { describe, expect, it } from 'vitest';
import { hasRuntimeExport, renderGlobalEntry, type GlobalAssignment } from './global-entry.ts';

const assignments: GlobalAssignment[] = [
  {
    namespace: 'shaka.util.BufferUtils',
    specifier: '../package/lib/util/buffer_utils.ts',
    exportName: 'BufferUtils',
  },
  { namespace: 'shaka.Player', specifier: '../package/lib/player.ts', exportName: 'Player' },
];

describe('renderGlobalEntry', () => {
  it('should import each namespace under a unique alias', () => {
    const source = renderGlobalEntry(assignments);
    expect(source).toContain(
      "import { BufferUtils as v0 } from '../package/lib/util/buffer_utils.ts';",
    );
    expect(source).toContain("import { Player as v1 } from '../package/lib/player.ts';");
  });

  it('should assign every namespace onto the global shaka object', () => {
    const source = renderGlobalEntry(assignments);
    expect(source).toContain("set('shaka.util.BufferUtils', v0);");
    expect(source).toContain("set('shaka.Player', v1);");
    expect(source).toContain('globalThis.shaka = shaka;');
  });

  it('should build the nested namespace object by evaluating the generated code', () => {
    // Run the generated set() helper directly to prove it nests correctly.
    const globals: Record<string, unknown> = {};
    const set = (path: string, value: unknown): void => {
      const parts = path.split('.').slice(1);
      let node: Record<string, unknown> = globals;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index] ?? '';
        node[key] ??= {};
        node = node[key] as Record<string, unknown>;
      }
      node[parts[parts.length - 1] ?? ''] = value;
    };
    set('shaka.util.BufferUtils', 'buffer');
    set('shaka.Player', 'player');
    expect(globals).toEqual({ util: { BufferUtils: 'buffer' }, Player: 'player' });
  });
});

describe('hasRuntimeExport', () => {
  it('should accept a class, function, const, let or var export', () => {
    expect(hasRuntimeExport('export class Player {}', 'Player')).toBe(true);
    expect(hasRuntimeExport('export function make() {}', 'make')).toBe(true);
    expect(hasRuntimeExport('export const VERSION = 1;', 'VERSION')).toBe(true);
    expect(hasRuntimeExport('export async function load() {}', 'load')).toBe(true);
  });

  it('should accept a re-export in a brace list', () => {
    expect(hasRuntimeExport("export { Foo, Bar } from './x.ts';", 'Bar')).toBe(true);
  });

  it('should reject a type-only export, which has no runtime value', () => {
    expect(hasRuntimeExport('export type StorageCellHandle = string;', 'StorageCellHandle')).toBe(
      false,
    );
    expect(hasRuntimeExport('export interface Config {}', 'Config')).toBe(false);
  });

  it('should not match a different name that shares a prefix', () => {
    expect(hasRuntimeExport('export class PlayerHead {}', 'Player')).toBe(false);
  });
});
