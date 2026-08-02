import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project, ScriptTarget } from 'ts-morph';
import { buildExternsDeclaration, collectExternTypesFromSource } from './externs.ts';

function project(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
}

describe('collectExternTypesFromSource', () => {
  it('should extract a record typedef under its namespace path', () => {
    const types = collectExternTypesFromSource(
      `/** @typedef {{a: number, b: string}} */\nshaka.extern.Box;\n`,
      project(),
    );
    expect(types).toEqual([
      { path: ['shaka', 'extern'], name: 'Box', type: '{ a: number; b: string }' },
    ]);
  });

  it('should keep a deeper namespace path', () => {
    const types = collectExternTypesFromSource(
      `/** @typedef {number} */\nshaka.extern.xml.Node;\n`,
      project(),
    );
    expect(types[0]?.path).toEqual(['shaka', 'extern', 'xml']);
    expect(types[0]?.name).toBe('Node');
  });

  it('should ignore anchors that are not shaka.extern', () => {
    expect(
      collectExternTypesFromSource(`/** @typedef {number} */\nshaka.util.Id;\n`, project()),
    ).toEqual([]);
  });
});

describe('buildExternsDeclaration', () => {
  it('should assemble a nested ambient namespace from the extern files', () => {
    const root = mkdtempSync(join(tmpdir(), 'shaka-ts-externs-'));
    try {
      mkdirSync(join(root, 'externs', 'shaka'), { recursive: true });
      writeFileSync(
        join(root, 'externs', 'shaka', 'manifest.js'),
        `/** @typedef {{variants: !Array<shaka.extern.Variant>}} */\nshaka.extern.Manifest;\n` +
          `/** @typedef {{id: number}} */\nshaka.extern.Variant;\n`,
      );
      const text = buildExternsDeclaration(root);

      expect(text).toContain('declare namespace shaka {');
      expect(text).toContain('export namespace extern {');
      expect(text).toContain('export type Variant = { id: number };');
      // A cross reference to another extern stays qualified and resolves in the namespace.
      expect(text).toContain('shaka.extern.Variant');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
