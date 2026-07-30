import { describe, expect, it } from 'vitest';
import { isNewer } from './check-upstream.ts';

describe('isNewer', () => {
  it('should detect a newer patch, minor and major', () => {
    expect(isNewer('4.16.6', '4.16.5')).toBe(true);
    expect(isNewer('4.17.0', '4.16.5')).toBe(true);
    expect(isNewer('5.0.0', '4.16.5')).toBe(true);
  });

  it('should not flag the same or an older version', () => {
    expect(isNewer('4.16.5', '4.16.5')).toBe(false);
    expect(isNewer('4.16.4', '4.16.5')).toBe(false);
    expect(isNewer('4.15.9', '4.16.5')).toBe(false);
  });

  it('should accept a v-prefixed tag on either side', () => {
    expect(isNewer('v4.17.0', '4.16.5')).toBe(true);
  });

  it('should treat a malformed tag as not newer', () => {
    expect(isNewer('nightly', '4.16.5')).toBe(false);
    expect(isNewer('4.17', '4.16.5')).toBe(false);
  });
});
