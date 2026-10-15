/**
 * Test helper, loaded with `node -r` into the verify-resend-all child process (T-436 AC10).
 * Makes the email client's enqueueEmail a no-op that resolves, so the script's enqueue is never
 * confirmed (no job, no dedupe key) and its "not confirmed -> failed -> exit 1" path runs.
 */
const client = require('@lawie/email-client');
client.enqueueEmail = async () => ({ jobId: 'stub', queue: 'email-high', deduped: false });
