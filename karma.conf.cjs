// Karma configuration for the headless Chrome suite.
//
// Loads the global namespace bundle (the whole transpiled library on
// `window.shaka`) and the generated surface spec, and runs them in headless
// Chrome. This is config only; the runner and the verdict live in src/suite.ts.
// Kept as CommonJS because Karma requires the config.

const { existsSync } = require('node:fs');

/** The transpiled library and the surface spec, both produced by src/suite.ts. */
const GLOBAL_BUNDLE = 'build/suite/shaka-global.js';
const SURFACE_SPEC = 'build/suite/library-surface.spec.js';

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
        // --disable-dev-shm-usage keeps Chrome off the small /dev/shm on CI
        // runners, where it otherwise crashes partway through a heavy run.
        flags: ['--no-sandbox', '--disable-gpu', '--mute-audio', '--disable-dev-shm-usage'],
      },
    },
    files: [GLOBAL_BUNDLE, SURFACE_SPEC],
    singleRun: true,
    autoWatch: false,
    concurrency: 1,
    reporters: ['dots'],
    // Run in order and never bail early, so a missing symbol is reported rather
    // than stopping the run at the first failure.
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
