// Karma configuration for the full suite run.
//
// Loads the global namespace bundle (the whole transpiled library on
// `window.shaka`) and Shaka's own unmodified unit specs, and runs them in
// headless Chrome. This is config only; the runner and the pass rate ratchet
// live in src/suite.ts. Kept as CommonJS because Karma requires the config.

const { existsSync } = require('node:fs');

/** The unmodified Shaka unit specs, reached through the global `shaka`. */
const UNIT_SPECS = 'upstream/shaka-player/test/**/*_unit.js';

/** The transpiled library, bundled as a global by src/suite.ts before this runs. */
const GLOBAL_BUNDLE = 'build/suite/shaka-global.js';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// karma-chrome-launcher reads CHROME_BIN. Point it at the local Chrome when the
// environment has not set one, so the suite runs the same locally and in CI.
if (!process.env.CHROME_BIN && existsSync(MAC_CHROME)) {
  process.env.CHROME_BIN = MAC_CHROME;
}

module.exports = (config) => {
  config.set({
    basePath: __dirname,
    frameworks: ['jasmine'],
    browsers: ['ShakaChromeHeadless'],
    customLaunchers: {
      ShakaChromeHeadless: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
      },
    },
    files: [GLOBAL_BUNDLE, { pattern: UNIT_SPECS, included: true, watched: false }],
    singleRun: true,
    autoWatch: false,
    concurrency: 1,
    reporters: ['dots'],
    // The specs are unmodified, so run them in file order and never bail early:
    // a failing spec is data for the ratchet, not a reason to stop the run.
    client: {
      jasmine: { random: false, stopOnSpecFailure: false, failFast: false },
      clearContext: true,
      captureConsole: false,
    },
    browserConsoleLogOptions: { level: 'error', terminal: false },
    failOnEmptyTestSuite: false,
    // A spec that never settles should fail on the timeout rather than hang the run.
    browserNoActivityTimeout: 120000,
    captureTimeout: 120000,
  });
};
