import { describe, expect, it } from 'vitest';
import { PUBLIC_SURFACE, renderSurfaceSpec } from './surface.ts';

describe('PUBLIC_SURFACE', () => {
  it('should list dotted namespace paths without the shaka prefix', () => {
    for (const path of PUBLIC_SURFACE) {
      expect(path).toMatch(/^[A-Za-z]\w*(\.\w+)*$/);
      expect(path.startsWith('shaka.')).toBe(false);
    }
  });

  it('should not list the same symbol twice', () => {
    expect(new Set(PUBLIC_SURFACE).size).toBe(PUBLIC_SURFACE.length);
  });
});

describe('renderSurfaceSpec', () => {
  it('should emit one spec per symbol that resolves it on the global', () => {
    const source = renderSurfaceSpec(['Player', 'util.BufferUtils']);
    expect(source).toContain("it('exposes shaka.Player'");
    expect(source).toContain("it('exposes shaka.util.BufferUtils'");
    expect(source).toContain("resolve('Player')");
  });

  it('should assert the global is defined and the polyfills install', () => {
    const source = renderSurfaceSpec(['Player']);
    expect(source).toContain("expect(typeof window.shaka).toBe('object')");
    expect(source).toContain('window.shaka.polyfill.installAll()');
  });
});
