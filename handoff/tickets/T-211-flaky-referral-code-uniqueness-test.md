# T-211 — The ReferralCode uniqueness test is not flaky

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Phase          | 0 — Prep                                                  |
| Owner          | Lead (build)                                              |
| Mode           | Small fix: developer + tester + reviewer                  |
| Status         | Done. Merged into develop_staging (0d37a2e, 12 Oct 2026). Nothing to test in the UI (CI only). Fix 2 shipped in T-210 |
| Assigned lead  | shashank |
| Size           | S (0.5 day)                                               |
| Depends on     | None                                                      |
| Gate           | None for go-live. Keeps CI on auth trustworthy            |
| Branch         | fix/t-211-ci-mongo-binary-cache |
| Legal sign-off | Not needed                                                |
| Created        | 2026-10-11                                                |
| Source         | Finding, 11 Oct 2026                                      |

## Problem

The uniqueness test in `apps/auth/src/__tests__/referral.test.ts` passes or fails between runs. A red that is not real trains everyone to re-run and ignore auth CI.

## Acceptance criteria

1. The cause is found and written in the report (e.g. the unique index not yet built in the in-memory Mongo when the duplicate is inserted, or random codes).
2. The fix is in the test setup or the model, not a retry. If it is the model (`ReferralCode.model.ts`) and real codes can collide, say so: that is a product bug.
3. The test passes 50 runs in a row (`--runInBand`, loop in the report).
4. CI green on auth.

## Out of scope

- Referral rules

## Priya (11 Oct 2026): likely root cause, scope widened

CI run 246 (docs-only commit 0fa7b48) failed 25 auth tests in one suite with `Cannot unlock file "/home/runner/.cache/mongodb-binaries/7.0.24.lock", because it is not locked by this process` at `MongoMemoryServer.create()` in `apps/auth/src/__tests__/setupDb.ts`. Parallel Jest workers race to download the Mongo binary because CI has no cache for it. That is probably the "flaky referral test" too.

Added acceptance criterion: CI downloads the Mongo binary once (an `actions/cache` step for `~/.cache/mongodb-binaries`, or a pre-download step before the tests), for every service job that uses mongodb-memory-server. That touches `.github/workflows/ci.yml` (root config, one lead at a time) and needs Arjun's ok on the approach before build.


## Arjun (11 Oct 2026): approach for the binary race, and the referral flake

Read: `.github/workflows/ci.yml`, `jest.config.base.js`, each service's `jest.config.js`, `apps/{auth,billing,drafting}/src/__tests__/setupDb.ts`, `referral.test.ts`, `ReferralCode.model.ts`, `referral.service.ts`. Nothing run.

**Who is exposed.** `test-auth`, `test-billing`, `test-drafting` all use mongodb-memory-server through a per-file `setupDb.ts` (`MongoMemoryServer.create()` in `beforeAll`), with Jest's default parallel workers. None of the three jobs caches or pre-fetches the binary. Gateway and email-worker do not use it.

**Decision: pin + cache + pre-download, in all three jobs.** Not a Jest globalSetup.

1. Job-level env: `MONGOMS_VERSION: '7.0.24'` and `MONGOMS_DOWNLOAD_DIR: /home/runner/.cache/mongodb-binaries` (absolute path, no `~`), so the step below and the tests resolve the same file.
2. `actions/cache@v4` on that dir, key `mongoms-${{ runner.os }}-7.0.24-${{ hashFiles('yarn.lock') }}`, restore-key `mongoms-${{ runner.os }}-7.0.24-`.
3. After `yarn install`, before the tests, one serial step that downloads the binary if missing and fails the job loudly if it cannot, e.g. `node -e "require('mongodb-memory-server').MongoMemoryServer.create().then(s => s.stop())"` run via `yarn workspace @lawie/auth node -e ...` (or the billing/drafting workspace in their jobs). On a cache hit it is a no-op.

Why not the others:
- Cache alone: a cold cache (first run, key change, eviction) brings the race straight back. The pre-download step is what removes it; the cache only saves the ~70 MB per job.
- Pre-download alone: fixes the race, re-downloads every run. Acceptable fallback if cache gives trouble.
- Jest globalSetup with one shared server: changes test isolation. Today each file has its own server; with one server, parallel files share databases and `setupDb.ts`'s `afterEach` `deleteMany` on every collection would wipe other files' data mid-test, a worse flake than the one we have. Would need per-worker DB names. Not worth it for this ticket.
- `--runInBand`: hides the race by slowing every run. No.

Assumption: the `mongodb-memory-server` postinstall is not populating `~/.cache/mongodb-binaries` on the runner (the run-246 error shows the tests downloading). The pre-download step does not depend on why. Risk: the pinned version must match what tests resolve; if `MONGOMS_VERSION` is set in the job env it is the single source, so keep it there and nowhere else.

Scope: `.github/workflows/ci.yml` only (root config, one lead at a time per `multi-lead.md`). No change to `setupDb.ts` is needed for the race.

**Referral uniqueness flake: separate cause, not the binary race.**

- The lock error fails `MongoMemoryServer.create()` in `beforeAll`, so the whole file goes red (25 tests in run 246). The referral flake is one assertion, `enforces uniqueness on code`, going red on its own. Different signature.
- Cause: the unique index on `ReferralCode.code` is built by Mongoose `autoIndex` in the background after the model is compiled and the connection opens. Auth's `setupDb.ts` never waits for it (drafting's does: `await mongoose.connection.syncIndexes()`). When the test inserts `UNIQUE01` twice before the build finishes, the second insert succeeds and `rejects.toThrow()` fails. `session.model.test.ts` already works around the same thing with `Session.syncIndexes()`.
- Fix (in the test setup, per AC 2): wait for indexes before tests, either `await ReferralCode.init()` in a `beforeAll` in `referral.test.ts`, or `await mongoose.connection.syncIndexes()` in auth's `setupDb.ts` after `connect` (matches drafting, also covers `t209-token-unique` and any other unique test in auth). Prefer the `setupDb.ts` change.
- Model is not a product bug: `randomCode()` uses `crypto.randomInt` over 32 chars x 8 (about 1.1e12 codes) and retries on E11000. The retry only works if the unique index exists, which the test fix and prod `autoIndex` both provide.

So the ticket has two fixes: `ci.yml` (cache + pre-download, three jobs) and auth `setupDb.ts` (wait for indexes). AC 3 (50 runs `--runInBand`) proves the second; one green CI run after a cache miss proves the first.

## Priya (11 Oct 2026, 23:50)

develop_staging CI run 269 (docs-only commit 50ba260) went red on `referral.test.ts` "enforces uniqueness on code" (the second `UNIQUE01` insert resolved). Arjun's fix 2, the `syncIndexes()` line in `apps/auth/src/__tests__/setupDb.ts`, moves into T-210 (shashank is in auth now), so the base goes green sooner. T-211 keeps fix 1: the Mongo binary pre-download and cache in `ci.yml`.

