const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'auth',
  rootDir: '.',
  setupFiles: ['./src/__tests__/setupEnv.ts'],
  // In CI, a failed test also shows as a note on the pull request, so the
  // reason can be read without opening the job log. Does nothing locally.
  reporters: ['default', 'github-actions'],
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 10,
      lines: 35,
      statements: 35,
    },
  },
};
