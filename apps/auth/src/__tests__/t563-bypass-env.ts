// Imported after setupEnv by the suites that need the bypass switched on. Fake values, built at
// runtime (never a literal secret).
process.env.TEST_SIGNUP_BYPASS = 'true';
process.env.TEST_SIGNUP_BYPASS_SECRET = 'lts_' + 'q'.repeat(40);
