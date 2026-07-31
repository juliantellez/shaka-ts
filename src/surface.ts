/**
 * The public surface the transpiled library must expose in a real browser.
 *
 * The suite loads the whole transpiled library as a global in headless Chrome
 * and asserts each of these resolves on `window.shaka`. That is a real browser
 * check the happy-dom oracle cannot be: it runs the library's top level module
 * initialisation the way a consumer's browser does, which is how it catches a
 * whole class of defect. It already found one, a polyfill whose static self
 * reference bound to a shadowing parameter and threw before `window.shaka` was
 * ever set.
 *
 * Running Shaka's own behavioural specs against the library needs its test
 * harness (the `shaka.test.*` helpers, custom matchers and asset servers), which
 * is a larger port tracked separately. This surface check is the first tier of
 * that work: it proves the library loads and initialises in the real runtime.
 */
export const PUBLIC_SURFACE: readonly string[] = [
  'Player',
  'polyfill',
  'Deprecate',
  'dash.DashParser',
  'hls.HlsParser',
  'mss.MssParser',
  'text.TextEngine',
  'text.VttTextParser',
  'text.Mp4TtmlParser',
  'text.SimpleTextDisplayer',
  'media.SegmentReference',
  'media.PresentationTimeline',
  'media.ManifestParser',
  'net.NetworkingEngine',
  'net.HttpFetchPlugin',
  'util.BufferUtils',
  'util.StringUtils',
  'util.ArrayUtils',
  'util.Functional',
  'util.Uint8ArrayUtils',
  'util.Error',
  'util.EventManager',
  'util.PublicPromise',
  'util.Mp4Parser',
];

/**
 * Renders the Jasmine spec that asserts the public surface in the browser.
 *
 * Generated rather than hand written so the surface list is the single source of
 * truth and each entry becomes its own spec, which makes the pass count the
 * number of symbols present. A dropped or broken export lowers that count and
 * trips the ratchet.
 */
export function renderSurfaceSpec(paths: readonly string[]): string {
  const specs = paths.map(
    (path) =>
      `  it('exposes shaka.${path}', () => {\n` +
      `    expect(resolve('${path}')).withContext('${path}').toBeDefined();\n` +
      `  });`,
  );
  return [
    '// Generated surface spec. Do not edit.',
    "describe('transpiled library in headless Chrome', () => {",
    '  function resolve(path) {',
    '    return path.split(".").reduce((node, key) => (node ? node[key] : undefined), window.shaka);',
    '  }',
    '',
    "  it('defines the shaka global', () => {",
    "    expect(typeof window.shaka).toBe('object');",
    '  });',
    '',
    ...specs,
    '',
    "  it('installs polyfills without throwing', () => {",
    '    expect(() => window.shaka.polyfill.installAll()).not.toThrow();',
    '  });',
    '});',
    '',
  ].join('\n');
}
