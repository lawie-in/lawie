const baseConfig = require('../../jest.config.base');

// T-688 (Arjun, 29 Oct 2026): two Jest projects, picked with --selectProjects.
//   sanity: the explicit file list below. ci.yml runs it on every push (`yarn test:sanity`).
//   full:   every test, unchanged. full-tests.yml runs it nightly and on release/** (`yarn test`).
// --selectProjects matches displayName.name, so the names are exactly `sanity` and `full`.
// coverageThreshold and reporters are global options and stay at the top level; they only bite
// in the full run (test:sanity passes --coverage=false). coveragePathIgnorePatterns is
// per-project in Jest 29, so it goes on the full project, the only one that collects coverage.
const { coveragePathIgnorePatterns } = baseConfig;
const baseProject = { ...baseConfig };
delete baseProject.coverageThreshold;
delete baseProject.coveragePathIgnorePatterns;

const project = {
  ...baseProject,
  rootDir: __dirname,
  setupFiles: ['<rootDir>/src/__tests__/setupEnv.ts'],
};

// Exact file names (src/__tests__/<name>.test.ts), no prefix globs.
const SANITY_FILES = [
  't616b-revoke-races',
  't616b-session-refresh',
  't642-signup-consent',
  't657-backfill',
  't657-free-seed-atomic',
];

/** @type {import('jest').Config} */
module.exports = {
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
  projects: [
    {
      ...project,
      displayName: { name: 'sanity', color: 'green' },
      testMatch: SANITY_FILES.map((f) => `<rootDir>/src/__tests__/${f}.test.ts`),
    },
    {
      ...project,
      displayName: { name: 'full', color: 'blue' },
      coveragePathIgnorePatterns,
    },
  ],
};
