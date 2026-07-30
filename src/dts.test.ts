import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportedNames } from './dts.ts';

function dts(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'shaka-ts-dts-'));
  const path = join(dir, 'entry.d.ts');
  writeFileSync(path, content);
  return path;
}

describe('exportedNames', () => {
  it('should read names from re-export clauses', () => {
    const path = dts(
      `export { Player } from './player.js';\nexport { DashParser } from './dash.js';\n`,
    );
    try {
      expect(exportedNames(path)).toEqual(['DashParser', 'Player']);
    } finally {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
  });

  it('should read the local name from an aliased export', () => {
    const path = dts(`export { UtilError as Error } from './error.js';\n`);
    try {
      expect(exportedNames(path)).toEqual(['Error']);
    } finally {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
  });

  it('should read several names from one clause', () => {
    const path = dts(`export { A, B, C } from './x.js';\n`);
    try {
      expect(exportedNames(path)).toEqual(['A', 'B', 'C']);
    } finally {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
  });
});
