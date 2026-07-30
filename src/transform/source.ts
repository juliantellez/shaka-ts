import type { SourceFile } from 'ts-morph';

/** A leading Shaka license block comment, plus the whitespace after it. */
const LEADING_LICENSE = /^\s*\/\*!\s*@license[\s\S]*?\*\/\s*/;

/**
 * Inserts text at the top of a file, but below any license header.
 *
 * The Apache 2.0 header must stay the first thing in every file, so a plain
 * insertion at the top would push it down and break the attribution. This finds
 * the end of the header, if there is one, and splices in below it.
 *
 * Uses a text edit rather than a node insertion, so it must be the last
 * structural change to the file: the edit reparses and invalidates existing
 * node references.
 */
export function insertBelowHeader(sourceFile: SourceFile, text: string): void {
  const fullText = sourceFile.getFullText();
  const header = LEADING_LICENSE.exec(fullText);
  const offset = header ? header[0].length : fullText.length - fullText.trimStart().length;
  sourceFile.insertText(offset, `${text}\n\n`);
}
