// T-688 (Arjun, 29 Oct 2026): two Jest projects, picked with --selectProjects.
// email-client runs its WHOLE suite in sanity, so both projects are the same; they exist so
// `--selectProjects sanity|full` works the same in every workspace. Only the full run
// (`yarn test`) collects coverage; test:sanity passes --coverage=false.
// --selectProjects matches displayName.name, so the names are exactly `sanity` and `full`.
const project = {
  rootDir: __dirname,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    { ...project, displayName: { name: 'sanity', color: 'green' } },
    { ...project, displayName: { name: 'full', color: 'blue' } },
  ],
};
