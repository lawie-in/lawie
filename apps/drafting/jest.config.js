const baseConfig = require('../../jest.config.base');

// T-688 (Arjun, 29 Oct 2026): two Jest projects, picked with --selectProjects.
//   sanity: the explicit file list below. ci.yml runs it on every push (`yarn test:sanity`).
//   full:   every test, unchanged. full-tests.yml runs it nightly and on release/** (`yarn test`).
// --selectProjects matches displayName.name, so the names are exactly `sanity` and `full`.
// No file moves, renames or tags: a test joins sanity by being listed here.
//
// coverageThreshold and reporters are global options, so they stay at the top level; they only
// bite in the full run (test:sanity passes --coverage=false). coveragePathIgnorePatterns is a
// per-project option in Jest 29 (a top-level one is ignored once `projects` is set), so it goes
// on the full project, the only one that collects coverage.
const { coveragePathIgnorePatterns } = baseConfig;
const baseProject = { ...baseConfig };
delete baseProject.coverageThreshold;
delete baseProject.coveragePathIgnorePatterns;

const project = {
  ...baseProject,
  rootDir: __dirname,
  setupFiles: ['<rootDir>/src/__tests__/setupEnv.ts'],
  moduleNameMapper: {
    '^ioredis$': 'ioredis-mock',
  },
};

// Exact file names (src/__tests__/<name>.test.ts), no prefix globs: Ajay's "may move to the full
// tier" list has route variants (t611-gate.routes, t628-o39-*.routes, ...) that a prefix such as
// t611-* or t628-* would also catch. Groups A-G: handoff/legal/T-688-sanity-legal-gate-tests-ajay.md.
const SANITY_FILES = [
  // A. Signed text, byte for byte
  't136-signed-text',
  't371-signed-tables',
  't397-ledger-prompts-signed',
  't473-signed-labels',
  't473-form-labels',
  't566-legal-draft-text',
  't661-party-ask-lines',
  't666-confirm-messages-scope',
  't374-skeletons',
  't577-skeleton-validator',
  'court-rules-golden',
  'court-rules',
  't613-o39-injunction',
  't644-o39-cause-title',
  't650-party-fields',
  't612-bail-grounds',
  't612-averments',
  't612-police-station',
  't638-police-station-prose',
  't197-disclaimer',
  't321-one-disclaimer',
  't322-signed-blank-covers-clause',
  // B. Citations (Ajay's narrowed ask)
  't248-bnss-citations',
  't263-citation-name-match',
  // C. Fact checker and ledger (T-611 policy)
  't611-verifier',
  't611-amount-in-words',
  't611-gate-helpers',
  't611-round2',
  't611-review-r1',
  't488-verifier-dates',
  't488-state-not-in-draft',
  't340-fact-alteration-dates',
  't241-bail-instructions-assert-facts',
  't678-ws-gate',
  't638-custody-since',
  't638-none-answers',
  't660-brief-ledger-agreement',
  // D. Non-answers and parties (T-511 rulings)
  't629-confirm-block',
  't655-ledger-not-known',
  't668-typed-not-known-party',
  't668b-non-answer-prefix',
  't668c-declaration-party',
  't381-brief-party-fields',
  // E. Gates that block before Ink
  't628-prayer-date-gate',
  't628-hold',
  't637-form-ledger',
  'bail-guard',
  't522-verified-fence',
  // F. Courts
  't674-court-label',
  't674-court-title',
  't634-document-court-type',
  // G. Privacy and logs
  't288-ink-log-redaction',
  't229-sentry-hooks',
  'sentry',
  't115e-no-matter-label',
  't343-privacy-reaccept',
  // Arjun: Ink hold/release, one route smoke, the intake gate
  't226-ink-holds.service',
  't226-ink-holds.routes',
  't226-ink-holds.heartbeat',
  'templates.routes',
  'intake-gate',
];

/** @type {import('jest').Config} */
module.exports = {
  // In CI, a failed test also shows as a note on the pull request, so the
  // reason can be read without opening the job log. Does nothing locally.
  reporters: ['default', 'github-actions'],
  // Only health check tests for now — coverage improves as feature tests are added per ticket
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
