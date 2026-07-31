import { describe, expect, it } from 'vitest';
import { UPSTREAM } from './upstream.ts';
import {
  TARGET_VERSIONS,
  findVersionTarget,
  requireVersionTarget,
  type VersionTarget,
} from './versions.ts';

describe('TARGET_VERSIONS', () => {
  it('should record a sha256 checksum and a positive checkJs baseline for each', () => {
    for (const target of TARGET_VERSIONS) {
      expect(target.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(target.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(target.checkjsBaseline).toBeGreaterThan(0);
    }
  });

  it('should not list the same version twice', () => {
    const versions = TARGET_VERSIONS.map((target) => target.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('should include the version the dev pin targets', () => {
    // The pinned release the local build uses must be one that is published, so
    // its recorded checksum and baseline exist to verify against.
    expect(findVersionTarget(UPSTREAM.version)).toBeDefined();
  });
});

describe('findVersionTarget', () => {
  it('should return the target for a published version', () => {
    const target = findVersionTarget('4.16.5');
    expect(target?.version).toBe('4.16.5');
  });

  it('should return undefined for a version that is not published', () => {
    expect(findVersionTarget('9.9.9')).toBeUndefined();
  });
});

describe('requireVersionTarget', () => {
  it('should return the target for a published version', () => {
    const target: VersionTarget = requireVersionTarget('4.16.5');
    expect(target.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should throw naming the published versions for an unknown one', () => {
    expect(() => requireVersionTarget('9.9.9')).toThrow(/9\.9\.9.*4\.16\.5/);
  });
});
