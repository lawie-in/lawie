// T-663: a real DSN in the shell must never reach a test (it leaked into a transcript once).
if (process.env.SENTRY_DSN !== undefined) {
  throw new Error('SENTRY_DSN set — unset it, see CLAUDE.md');
}

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.AUTH_SERVICE_URL = 'http://localhost:4001';
process.env.DRAFTING_SERVICE_URL = 'http://localhost:4002';
process.env.BILLING_SERVICE_URL = 'http://localhost:4003';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-chars-long';
process.env.INTERNAL_SECRET = 'test-internal-secret-at-least-16';
process.env.LOG_LEVEL = 'error';
