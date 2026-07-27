import { describe, expect, it } from 'vitest';
import { SyntaxKind } from 'ts-morph';
import { createSourceProject, parseSource, reprint, roundTripsCleanly } from './parse.ts';

/**
 * These samples are written by hand in the Closure style rather than taken from
 * Shaka, so no upstream source is vendored into this repository. They exercise
 * the shapes that a naive printer reflows: a license header, JSDoc blocks,
 * `Name = class` assignments, several provides in one file, and irregular blank
 * lines and indentation.
 */
const LICENSE_AND_CLASS = `/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Example');

goog.require('goog.asserts');


/**
 * An example.
 *
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.util.Example = class {
  /**
   * @param {!Array<number>} values
   */
  constructor(values) {
    /** @private {!Array<number>} */
    this.values_ = values;
  }
};
`;

const MULTI_PROVIDE = `goog.provide('shaka.hls.Playlist');
goog.provide('shaka.hls.Tag');


/** @enum {string} */
shaka.hls.PlaylistType = {
  MASTER: 'master',
  MEDIA:  'media',
};

shaka.hls.Tag = class {};
`;

describe('roundTripsCleanly', () => {
  it('should reproduce a licensed class file byte for byte', () => {
    expect(roundTripsCleanly('lib/util/example.js', LICENSE_AND_CLASS)).toBe(true);
  });

  it('should reproduce a multi provide file byte for byte', () => {
    expect(roundTripsCleanly('lib/hls/example.js', MULTI_PROVIDE)).toBe(true);
  });

  it('should preserve irregular whitespace and blank lines', () => {
    const source = 'goog.provide("a");\n\n\n\n  const   x =   1;\n\t// tab indented\n';
    expect(roundTripsCleanly('lib/a.js', source)).toBe(true);
  });

  it('should preserve a trailing file with no final newline', () => {
    expect(roundTripsCleanly('lib/a.js', 'const x = 1;')).toBe(true);
  });
});

describe('parseSource', () => {
  it('should key the source file by its output path', () => {
    const project = createSourceProject();
    const sourceFile = parseSource(project, 'lib/util/example.js', LICENSE_AND_CLASS);
    expect(sourceFile.getFilePath()).toContain('lib/util/example.ts');
  });

  it('should parse Closure JSDoc without reporting syntax errors', () => {
    const project = createSourceProject();
    const sourceFile = parseSource(project, 'lib/util/example.js', LICENSE_AND_CLASS);
    expect(sourceFile.getPreEmitDiagnostics()).toHaveLength(0);
  });
});

describe('surgical mutation', () => {
  it('should reprint only the edited node and leave comments untouched', () => {
    const project = createSourceProject();
    const sourceFile = parseSource(project, 'lib/hls/example.js', MULTI_PROVIDE);

    const target = sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .find((identifier) => identifier.getText() === 'PlaylistType');
    expect(target).toBeDefined();
    target?.replaceWithText('PlaylistKind');

    const after = reprint(sourceFile);
    const originalLines = MULTI_PROVIDE.split('\n');
    const newLines = after.split('\n');

    let changed = 0;
    for (let index = 0; index < Math.max(originalLines.length, newLines.length); index += 1) {
      if (originalLines[index] !== newLines[index]) {
        changed += 1;
      }
    }

    expect(changed).toBe(1);
    expect(after).toContain('PlaylistKind');
    expect(after).toContain('@enum {string}');
  });
});
