const baseConfig = require('../../jest.config.base');

// T-688 (Arjun, 29 Oct 2026): two Jest projects, picked with --selectProjects.
// Gateway runs its WHOLE suite in sanity, so both projects have the same testMatch; they exist
// so `--selectProjects sanity|full` works the same in every workspace. Only the full run
// (`yarn test`) collects coverage; test:sanity passes --coverage=false.
// --selectProjects matches displayName.name, so the names are exactly `sanity` and `full`.
// coverageThreshold and reporters are global options and stay at the top level.
// coveragePathIgnorePatterns is per-project in Jest 29, so it goes on the full project.
const { coveragePathIgnorePatterns } = baseConfig;
const baseProject = { ...baseConfig };
delete baseProject.coverageThreshold;
delete baseProject.coveragePathIgnorePatterns;

const project = {
  ...baseProject,
  rootDir: __dirname,
  setupFiles: ['<rootDir>/src/__tests__/setupEnv.ts'],
};

/** @type {import('jest').Config} */
module.exports = {
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
  projects: [
    { ...project, displayName: { name: 'sanity', color: 'green' } },
    { ...project, displayName: { name: 'full', color: 'blue' }, coveragePathIgnorePatterns },
  ],
};
