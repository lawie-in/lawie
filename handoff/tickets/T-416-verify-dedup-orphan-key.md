# T-416: verify-email dedup survives an orphaned key

| Field | Value |
|---|---|
| Status | Todo. Mahak, after T-390. Priya, 13 Oct 2026 |
| Owner | Mahak (build), Arjun (Redis call) |
| Mode | Small fix (packages/email-client) |

## Why
These are should-fixes from T-390's reviewer. The verify-email dedup key has no TTL, which is correct. But if a job's hash is deleted outside BullMQ, the key is left orphaned: a manual DEL or FLUSH would do it, and so would Redis eviction without `maxmemory-policy noeviction`. After that, every resend for that user is dropped silently, forever.

## Acceptance criteria
1. On a dedup hit, the producer looks up the pending job. If it's gone, it removes the dedup key and adds the job again.
2. A test deletes the job hash and checks that the next resend is queued.
3. The t390 real-Redis producer tests obliterate the queue in beforeEach, so they don't depend on the order they run in.
4. The doc comment names the delayed-retry case: a resend is dropped while the pending job is in backoff. That costs at most about one wasted resend, in line with Arjun's AC2 ruling.

## Question for Arjun
Is the prod Redis on `maxmemory-policy noeviction`? If not, he decides whether that changes too.
