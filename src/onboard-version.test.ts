import { describe, expect, it } from 'vitest';
import { AUTOPUBLISH_CHECKJS_CEILING, CHECKJS_BASELINE_MARGIN } from './versions.ts';
import { entryForVersion } from './onboard-version.ts';

const CHECKSUM = 'a'.repeat(64);

describe('entryForVersion', () => {
  it('should record the checksum and a baseline a margin above the count', () => {
    const entry = entryForVersion('4.16.44', CHECKSUM, 7_490);
    expect(entry).toEqual({
      version: '4.16.44',
      checksum: CHECKSUM,
      checkjsBaseline: 7_490 + CHECKJS_BASELINE_MARGIN,
    });
  });

  it('should accept a count at the ceiling', () => {
    expect(() => entryForVersion('4.16.44', CHECKSUM, AUTOPUBLISH_CHECKJS_CEILING)).not.toThrow();
  });

  it('should refuse a count past the ceiling so a broken transpile does not publish', () => {
    expect(() => entryForVersion('4.16.44', CHECKSUM, AUTOPUBLISH_CHECKJS_CEILING + 1)).toThrow(
      /ceiling/,
    );
  });
});
