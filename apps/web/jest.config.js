// T-310: Jest for the web app (jsdom, React Testing Library). Not based on jest.config.base.js,
// which is node-only and .ts-only.
const nextJestMocks = (file) => require.resolve(`next/dist/build/jest/__mocks__/${file}`);

// T-688 (Arjun, 29 Oct 2026): two Jest projects, picked with --selectProjects.
//   sanity: the explicit file list below. ci.yml runs it on every push (`yarn test:sanity`).
//   full:   every test, unchanged. full-tests.yml runs it nightly and on release/** (`yarn test`).
// --selectProjects matches displayName.name, so the names are exactly `sanity` and `full`.
// collectCoverageFrom and coverageThreshold are global options and stay at the top level; they
// only bite in the full run (test:sanity passes --coverage=false). coveragePathIgnorePatterns is
// per-project in Jest 29, so it goes on the full project, the only one that collects coverage.
const project = {
  rootDir: __dirname,
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        // The app's tsconfig is for Next (module esnext, bundler resolution); Jest needs CommonJS
        // and the automatic JSX runtime.
        tsconfig: {
          jsx: 'react-jsx',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    // Plain and module CSS: empty objects (Next ships these mocks for next/jest).
    '\\.(css|scss|sass)$': nextJestMocks('styleMock.js'),
    // Static files imported from code.
    '\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$': nextJestMocks('fileMock.js'),
    // next/font is a build-time transform; in Jest every font returns a stub
    // ({ className, variable, style: { fontFamily } }).
    '^next/font/(.*)$': nextJestMocks('nextFontMock.js'),
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@lawie/shared$': '<rootDir>/../../packages/shared/src',
  },
  // T-663: fails the suite fast if SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN is set in the shell.
  setupFiles: ['<rootDir>/jest.setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
};

// Exact paths, no prefix globs. Brackets and parentheses in route-group folders such as (auth)
// are glob syntax, so they are escaped with a backslash to match the folder name literally.
const SANITY_FILES = [
  // t616: admin and login return paths
  'src/app/admin/__tests__/admin-layout-t616.test.tsx',
  'src/app/auth/callback/__tests__/t616-callback-return.test.tsx',
  'src/app/\\(auth\\)/login/__tests__/t616-login-next.test.tsx',
  'src/lib/__tests__/auth-t616.test.ts',
  // t543: .env.example
  '__tests__/t543-env-example.test.ts',
  // t642: signup consent gate
  'src/components/__tests__/SignupConsentPrompt.t642.test.tsx',
  'src/components/__tests__/t642-entry-points.test.tsx',
  'src/components/intake/__tests__/OneFlow.t642-gate.test.tsx',
  'src/app/dashboard/new/__tests__/t642-gate.test.tsx',
  // BriefStep confirm blocking
  'src/components/intake/__tests__/BriefStep.t629.test.tsx',
  'src/components/intake/__tests__/BriefStep.t644.test.tsx',
  'src/components/intake/__tests__/BriefStep.t668.test.tsx',
  'src/components/intake/__tests__/BriefStep.t498.test.tsx',
  'src/components/intake/__tests__/BriefStep.datecheck.test.tsx',
  'src/components/intake/__tests__/t655-briefstep-given-keys.test.tsx',
];

/** @type {import('jest').Config} */
module.exports = {
  collectCoverageFrom: ['src/components/AnalyticsConsent.tsx', 'src/components/analytics/**/*.ts'],
  // Coverage is collected only from the files the T-310 suite targets (the consent flow and
  // T-306's route helpers), not the whole app, which has no tests yet. A global threshold over
  // those files: a small focused suite can meet it, and an empty run (no data) still passes.
  // Raise it, and widen collectCoverageFrom, as the web suite grows.
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  projects: [
    {
      ...project,
      displayName: { name: 'sanity', color: 'green' },
      testMatch: SANITY_FILES.map((f) => `<rootDir>/${f}`),
    },
    {
      ...project,
      displayName: { name: 'full', color: 'blue' },
      coveragePathIgnorePatterns: ['/node_modules/', '/.next/'],
    },
  ],
};
