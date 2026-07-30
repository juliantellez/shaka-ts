import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLicenses } from './licenses.ts';

const HEADER = '/*! @license\n * Shaka Player\n * SPDX-License-Identifier: Apache-2.0\n */\n';
const MIT_HEADER = '/*! @license\n * tXml\n * SPDX-License-Identifier: MIT\n */\n';

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'shaka-ts-license-'));
  mkdirSync(join(dir, 'lib'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe('checkLicenses', () => {
  it('should pass when every file keeps its header and NOTICE exists', () => {
    const dir = fixture({
      'lib/a.ts': `${HEADER}export const a = 1;\n`,
      NOTICE: 'Copyright\n',
    });
    try {
      const report = checkLicenses(dir, join(dir, 'NOTICE'));
      expect(report.missing).toHaveLength(0);
      expect(report.hasNotice).toBe(true);
      expect(report.checked).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should flag a file that lost its header', () => {
    const dir = fixture({ 'lib/a.ts': `export const a = 1;\n`, NOTICE: 'x' });
    try {
      expect(checkLicenses(dir, join(dir, 'NOTICE')).missing).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should accept a non-Apache license header', () => {
    const dir = fixture({ 'lib/a.ts': `${MIT_HEADER}export const a = 1;\n`, NOTICE: 'x' });
    try {
      expect(checkLicenses(dir, join(dir, 'NOTICE')).missing).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should report a missing NOTICE', () => {
    const dir = fixture({ 'lib/a.ts': `${HEADER}export const a = 1;\n` });
    try {
      expect(checkLicenses(dir, join(dir, 'NOTICE')).hasNotice).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
