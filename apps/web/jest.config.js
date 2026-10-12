// T-310: Jest for the web app (jsdom, React Testing Library). Not based on jest.config.base.js,
// which is node-only and .ts-only.
const nextJestMocks = (file) => require.resolve(`next/dist/build/jest/__mocks__/${file}`);

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'web',
  rootDir: '.',
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
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/.next/'],
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
};
