const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'drafting',
  rootDir: '.',
  setupFiles: ['./src/__tests__/setupEnv.ts'],
  // Only health check tests for now — coverage improves as feature tests are added per ticket
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 10,
      lines: 35,
      statements: 35,
    },
  },
};
