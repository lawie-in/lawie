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

// Exact file names (src/__tests__/<name>.test.ts), no prefix globs. t646 joins when it merges.
const SANITY_FILES = [
  't413-manual-grant-alerts',
  't413-topup-claim',
  't413-webhook-ack-after-grant',
  't415-grant-claim-state',
  't583-subscribe-create-log',
  // GST invoice gate (Priya/Arjun): no invoice before GST_EFFECTIVE_FROM, one at or after it.
  't436-invoice-issue',
];

/** @type {import('jest').Config} */
module.exports = {
  // In CI, a failed test also shows as a note on the pull request, so the
  // reason can be read without opening the job log. Does nothing locally.
  reporters: ['default', 'github-actions'],
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
