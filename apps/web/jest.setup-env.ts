// T-663: a real DSN in the shell must never reach a test (it leaked into a transcript once).
// Runs as a Jest setupFile, before the test framework and before any test module is loaded.
if (process.env.SENTRY_DSN !== undefined || process.env.NEXT_PUBLIC_SENTRY_DSN !== undefined) {
  throw new Error('SENTRY_DSN set — unset it, see CLAUDE.md');
}

export {};
