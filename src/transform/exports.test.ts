import { describe, expect, it } from 'vitest';
import { Project, ScriptKind, ScriptTarget, type SourceFile } from 'ts-morph';
import type { ModuleRecord } from '../graph.ts';
import { convertProvidesToExports } from './exports.ts';

function parse(source: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.ES2022 },
  });
  return project.createSourceFile('m.ts', source, { overwrite: true, scriptKind: ScriptKind.JS });
}

function record(provides: string[]): ModuleRecord {
  return { path: 'lib/x.js', provides, requires: [], requireTypes: [] };
}

describe('convertProvidesToExports', () => {
  it('should turn a provided class into an exported class declaration', () => {
    const sourceFile = parse(
      `goog.provide('shaka.hls.Tag');\n\nshaka.hls.Tag = class {\n  foo() {}\n};\n`,
    );
    const result = convertProvidesToExports(sourceFile, record(['shaka.hls.Tag']));
    const text = sourceFile.getFullText();

    expect(text).toContain('export class Tag {');
    expect(text).toContain('foo() {}');
    expect(text).not.toContain('shaka.hls.Tag = class');
    expect(text).not.toContain("goog.provide('shaka.hls.Tag')");
    expect(result.exported).toEqual([{ namespace: 'shaka.hls.Tag', localName: 'Tag' }]);
  });

  it('should keep the heritage clause of an extended class', () => {
    const sourceFile = parse(
      `goog.provide('shaka.X');\n\nshaka.X = class extends shaka.Base {\n  m() {}\n};\n`,
    );
    convertProvidesToExports(sourceFile, record(['shaka.X']));
    expect(sourceFile.getFullText()).toContain('export class X extends shaka.Base {');
  });

  it('should turn a provided object literal into an exported const', () => {
    const sourceFile = parse(
      `goog.provide('shaka.hls.PlaylistType');\n\nshaka.hls.PlaylistType = {\n  MASTER: 'master',\n};\n`,
    );
    convertProvidesToExports(sourceFile, record(['shaka.hls.PlaylistType']));
    const text = sourceFile.getFullText();
    expect(text).toContain('export const PlaylistType = {');
    expect(text).toContain("MASTER: 'master',");
  });

  it('should export several provides from one file', () => {
    const sourceFile = parse(
      `goog.provide('shaka.hls.Playlist');\ngoog.provide('shaka.hls.Tag');\n\n` +
        `shaka.hls.Playlist = class {};\nshaka.hls.Tag = class {};\n`,
    );
    const result = convertProvidesToExports(
      sourceFile,
      record(['shaka.hls.Playlist', 'shaka.hls.Tag']),
    );
    const text = sourceFile.getFullText();
    expect(text).toContain('export class Playlist {');
    expect(text).toContain('export class Tag {');
    expect(result.exported).toHaveLength(2);
  });

  it('should rename a provided symbol that shadows a global', () => {
    const sourceFile = parse(`goog.provide('shaka.util.Error');\n\nshaka.util.Error = class {};\n`);
    const result = convertProvidesToExports(sourceFile, record(['shaka.util.Error']));
    expect(sourceFile.getFullText()).toContain('export class UtilError {');
    expect(result.exported[0]?.localName).toBe('UtilError');
  });

  it('should leave a static attached after the class as a plain assignment', () => {
    const sourceFile = parse(
      `goog.provide('shaka.util.Error');\n\nshaka.util.Error = class {};\n` +
        `shaka.util.Error.Code = {\n  OK: 0,\n};\n`,
    );
    convertProvidesToExports(sourceFile, record(['shaka.util.Error']));
    const text = sourceFile.getFullText();
    expect(text).toContain('export class UtilError {');
    // The static is not a provide, so it stays untouched for a later pass.
    expect(text).toContain('shaka.util.Error.Code = {');
  });

  it('should synthesize an object export for a namespace built from members', () => {
    const sourceFile = parse(
      `goog.provide('shaka.ui.Enums');\n\nshaka.ui.Enums.Icons = {\n  PLAY: 'play',\n};\n`,
    );
    const result = convertProvidesToExports(sourceFile, record(['shaka.ui.Enums']));
    const text = sourceFile.getFullText();
    expect(text).toContain('export const Enums = {};');
    // The member assignment is left for the reference rewrite to relocate.
    expect(text).toContain('shaka.ui.Enums.Icons = {');
    expect(result.exported).toEqual([{ namespace: 'shaka.ui.Enums', localName: 'Enums' }]);
  });

  it('should drop a typedef only placeholder and report it as type only', () => {
    const sourceFile = parse(
      `goog.provide('shaka.offline.StorageCellPath');\n\n` +
        `/** @typedef {!Array<string>} */\nshaka.offline.StorageCellPath;\n`,
    );
    const result = convertProvidesToExports(sourceFile, record(['shaka.offline.StorageCellPath']));
    const text = sourceFile.getFullText();
    expect(text).not.toContain('shaka.offline.StorageCellPath;');
    expect(result.exported).toHaveLength(0);
    expect(result.typeOnly).toEqual(['shaka.offline.StorageCellPath']);
  });
});
