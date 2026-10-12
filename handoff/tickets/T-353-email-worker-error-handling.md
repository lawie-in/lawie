# T-353 — Email worker: safe error logging, worker error listener, one Sentry event per dead job

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (email-worker). Arjun (says if it gates release) |
| Mode   | Small fix |
| Status | To do. Mahak after T-220 step 1 (same files), while T-223 waits. Not a release gate unless Arjun says so. From the T-220 step 1 review, 12 Oct 2026 |

## Acceptance criteria

1. `apps/email-worker/src/index.ts` boot, `unhandledRejection` and `uncaughtException` handlers log and report through `safeErrorFields` and `toSentrySafeError`, as `worker.ts` does. No raw error objects in logs or Sentry.
2. `worker.ts` has a `worker.on('error')` listener, so a BullMQ error is logged safely and does not reach the raw `uncaughtException` handler.
3. `Sentry.captureException` fires only on a job's final attempt, not on every retry (today up to 5 events per dead job).
4. Tests for each.
