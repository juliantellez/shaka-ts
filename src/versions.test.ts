import { describe, expect, it } from 'vitest';
import { UPSTREAM } from './upstream.ts';
import {
  CHECKJS_BASELINE_MARGIN,
  TARGET_VERSIONS,
  baselineForCount,
  compareVersions,
  findVersionTarget,
  requireVersionTarget,
  upsertVersionTarget,
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

describe('compareVersions', () => {
  it('should order by major, then minor, then patch', () => {
    expect(compareVersions('4.16.5', '4.16.43')).toBeLessThan(0);
    expect(compareVersions('4.16.5', '4.15.55')).toBeGreaterThan(0);
    expect(compareVersions('5.0.0', '4.99.99')).toBeGreaterThan(0);
    expect(compareVersions('4.16.5', '4.16.5')).toBe(0);
  });
});

describe('upsertVersionTarget', () => {
  const target = (version: string): VersionTarget => ({
    version,
    checksum: 'a'.repeat(64),
    checkjsBaseline: 7_500,
  });

  it('should insert a new version in ascending order', () => {
    const next = upsertVersionTarget([target('4.16.5'), target('4.16.43')], target('4.16.20'));
    expect(next.map((entry) => entry.version)).toEqual(['4.16.5', '4.16.20', '4.16.43']);
  });

  it('should replace an existing version rather than duplicate it', () => {
    const replacement: VersionTarget = { ...target('4.16.5'), checkjsBaseline: 7_000 };
    const next = upsertVersionTarget([target('4.16.5'), target('4.16.43')], replacement);
    expect(next.map((entry) => entry.version)).toEqual(['4.16.5', '4.16.43']);
    expect(findByVersion(next, '4.16.5')?.checkjsBaseline).toBe(7_000);
  });

  function findByVersion(targets: VersionTarget[], version: string): VersionTarget | undefined {
    return targets.find((entry) => entry.version === version);
  }
});

describe('baselineForCount', () => {
  it('should add the margin over the observed count', () => {
    expect(baselineForCount(7_450)).toBe(7_450 + CHECKJS_BASELINE_MARGIN);
  });
});
