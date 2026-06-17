const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'billing',
  rootDir: '.',
  setupFiles: ['./src/__tests__/setupEnv.ts'],
  coverageThreshold: {
    global: {
      // Branches capped at 65% — remaining uncovered branches are defensive
      // catch blocks for MongoDB insert failures and non-Error rejection paths
      // that would require deep collection-level mocking to reach.
      branches: 65,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
