import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countCheckJsErrors } from './checkjs.ts';

/**
 * Uses a tiny output directory rather than the full transpiled tree, so the
 * test stays fast while still exercising the real `tsc` invocation the gate
 * depends on.
 */
function outputDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'shaka-ts-checkjs-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe('countCheckJsErrors', () => {
  it('should report zero for output that checks clean', () => {
    const dir = outputDir({ 'clean.ts': `export const answer: number = 42;\n` });
    try {
      expect(countCheckJsErrors(dir)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should count a type error in the output', () => {
    // A property that does not exist is the dominant error class over the real
    // transpiled tree, so the gate must count it.
    const dir = outputDir({
      'bad.ts': `class C {}\nexport function use(c: C): number {\n  return c.missing;\n}\n`,
    });
    try {
      expect(countCheckJsErrors(dir)).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
