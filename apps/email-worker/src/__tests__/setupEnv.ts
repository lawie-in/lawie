// T-663: a real DSN in the shell must never reach a test (it leaked into a transcript once).
if (process.env.SENTRY_DSN !== undefined) {
  throw new Error('SENTRY_DSN set — unset it, see CLAUDE.md');
}

process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.EMAIL_PROVIDER = 'dry-run';
process.env.EMAIL_DRY_RUN = 'true';
process.env.EMAIL_QUEUE_PREFIX = 'lawie-test';
process.env.EMAIL_FROM_NAME = 'Lawie Test';
process.env.EMAIL_FROM_ADDRESS = 'hello@lawie.in';
process.env.EMAIL_REPLY_TO = 'hello@lawie.in';
process.env.EMAIL_FOUNDER = 'founder@lawie.in';
process.env.AWS_REGION = 'ap-south-1';
process.env.INTERNAL_SECRET = 'test-internal-secret-at-least-16';
process.env.AUTH_SERVICE_URL = 'http://localhost:4001';
