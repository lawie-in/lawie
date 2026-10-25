const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'gateway',
  rootDir: '.',
  setupFiles: ['./src/__tests__/setupEnv.ts'],
  // In CI, a failed test also shows as a note on the pull request, so the
  // reason can be read without opening the job log. Does nothing locally.
  reporters: ['default', 'github-actions'],
  // Gateway is mostly proxy config — lower threshold; real coverage comes from e2e tests
  coverageThreshold: {
    global: {
      branches: 15,
      functions: 50,
      lines: 70,
      statements: 70,
    },
  },
};
