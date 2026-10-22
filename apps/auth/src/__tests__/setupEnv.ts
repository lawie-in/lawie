// T-563: the bypass and production-marker variables must never be inherited from the shell the
// suite runs in; a test sets its own fake values. Deleted before anything reads the env.
for (const name of [
  'TEST_SIGNUP_BYPASS',
  'TEST_SIGNUP_BYPASS_SECRET',
  'RAZORPAY_KEY_GUARD',
  'SECRETS_ENV',
  'RAZORPAY_KEY_ID',
]) {
  delete process.env[name];
}

process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.MONGO_URI = 'mongodb://placeholder:27017/test';
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-at-least-32-chars';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.INTERNAL_SECRET = 'test-internal-secret-at-least-16';
process.env.LOG_LEVEL = 'error';
