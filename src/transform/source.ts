import type { SourceFile } from 'ts-morph';

/** A leading Shaka license block comment, plus the whitespace after it. */
const LEADING_LICENSE = /^\s*\/\*!\s*@license[\s\S]*?\*\/\s*/;

/**
 * Any leading license block, whether written `/*!` or `/**`.
 *
 * Nearly every Shaka file uses `/*!`, but a few vendored files use a plain
 * `/**` block, so header handling must recognise both.
 */
const ANY_LEADING_LICENSE = /^\s*\/\*[\s\S]*?@license[\s\S]*?\*\//;

/** Returns the leading license header of a file, if it has one. */
export function extractLicenseHeader(text: string): string | undefined {
  return ANY_LEADING_LICENSE.exec(text)?.[0].trim();
}

/**
 * Restores a license header that the transform dropped.
 *
 * A `/*!` header survives as leading trivia, but a `/**` header is attached to
 * the first statement and is lost when that statement, a `goog.require`, is
 * removed. Capturing the header before the transform and re-adding it after,
 * only when it has actually gone missing, keeps every file's attribution.
 */
export function ensureLicenseHeader(sourceFile: SourceFile, header: string | undefined): void {
  if (header !== undefined && !sourceFile.getFullText().includes('@license')) {
    sourceFile.replaceWithText(`${header}\n\n${sourceFile.getFullText()}`);
  }
}

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
