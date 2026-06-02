const baseConfig = require('../../jest.config.base');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  displayName: 'billing',
  rootDir: '.',
  setupFiles: ['./src/__tests__/setupEnv.ts'],
};
