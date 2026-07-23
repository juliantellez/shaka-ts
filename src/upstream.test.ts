import { describe, expect, it } from 'vitest';
import { UPSTREAM, isReproduciblePin, type UpstreamPin } from './upstream.js';

describe('UPSTREAM', () => {
  it('should pin an exact upstream release tag', () => {
    expect(isReproduciblePin(UPSTREAM)).toBe(true);
  });

  it('should point at the upstream Shaka Player repository', () => {
    expect(UPSTREAM.repository).toBe('https://github.com/shaka-project/shaka-player.git');
  });
});

describe('isReproduciblePin', () => {
  const pin = (overrides: Partial<UpstreamPin>): UpstreamPin => ({
    repository: 'https://github.com/shaka-project/shaka-player.git',
    tag: 'v4.16.5',
    version: '4.16.5',
    ...overrides,
  });

  it('should reject a version that is not a three part semantic version', () => {
    expect(isReproduciblePin(pin({ tag: 'v4.16', version: '4.16' }))).toBe(false);
  });

  it('should reject a tag that does not match its version', () => {
    expect(isReproduciblePin(pin({ tag: 'v4.16.4' }))).toBe(false);
  });

  it('should reject a branch name used as a tag', () => {
    expect(isReproduciblePin(pin({ tag: 'main', version: 'main' }))).toBe(false);
  });

  it('should reject a prerelease version', () => {
    expect(isReproduciblePin(pin({ tag: 'v4.17.0-beta.1', version: '4.17.0-beta.1' }))).toBe(false);
  });
});
