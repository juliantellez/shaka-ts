import { describe, expect, it } from 'vitest';
import { bumpVersion } from './bump.ts';

const SOURCE = `const SHAKA_VERSION = '4.16.5';\nexport const UPSTREAM = { version: SHAKA_VERSION };\n`;

describe('bumpVersion', () => {
  it('should rewrite the pinned version', () => {
    const { text, result } = bumpVersion(SOURCE, '4.17.0');
    expect(text).toContain("const SHAKA_VERSION = '4.17.0';");
    expect(result).toEqual({ from: '4.16.5', to: '4.17.0' });
  });

  it('should reject a non-semantic version', () => {
    expect(() => bumpVersion(SOURCE, 'latest')).toThrow();
    expect(() => bumpVersion(SOURCE, '4.17')).toThrow();
  });

  it('should throw when the pin cannot be found', () => {
    expect(() => bumpVersion('no version here', '4.17.0')).toThrow();
  });

  it('should report the same version when unchanged', () => {
    expect(bumpVersion(SOURCE, '4.16.5').result).toEqual({ from: '4.16.5', to: '4.16.5' });
  });
});
