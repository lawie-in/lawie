// T-663: a real DSN in the shell must never reach a test (it leaked into a transcript once).
if (process.env.SENTRY_DSN !== undefined) {
  throw new Error('SENTRY_DSN set — unset it, see CLAUDE.md');
}

process.env.NODE_ENV = 'test';
process.env.PORT = '4002';
process.env.MONGO_URI = 'mongodb://placeholder:27017/test';
process.env.INTERNAL_SECRET = 'test-internal-secret-at-least-16';
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-dummy-key-for-testing-minimum-20';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LOG_LEVEL = 'error';

// T-343: requireCurrentPrivacy is a pass-through for every existing drafting test, which sends no
// x-user-privacy-version header. The real middleware is tested in t343-privacy-reaccept.test.ts
// (it takes it back with jest.requireActual). Tests that jest.mock('@lawie/shared') themselves
// replace this mock for their own file.
jest.mock('@lawie/shared', () => ({
  ...jest.requireActual('@lawie/shared'),
  requireCurrentPrivacy: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
