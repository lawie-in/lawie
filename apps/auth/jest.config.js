const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'auth',
  rootDir: '.',
  setupFiles: ['./src/__tests__/setupEnv.ts'],
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 10,
      lines: 35,
      statements: 35,
    },
  },
};
