# T-130 — CI is red on develop for billing and auth

| Field      | Value                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                                                    |
| Owner      | Vishal                                                                                                                      |
| Mode       | Full chain                                                                                                                  |
| Status     | Done. PR #43 merged by the founder, 6 Oct 2026, 13:50. The CI run on `develop` after the merge passed for all four services |
| Depends on | None                                                                                                                        |
| Branch     | fix/t-130-ci-show-failures (PR #43; #42 was the draft used to find the cause)                                               |
| Created    | 2026-10-06                                                                                                                  |

## Goal

A push to `develop` gives a green CI run, so a red run means something.

## Context

- Found on 6 Oct 2026 while PR #40 was in CI. On a push to `develop`, CI runs the tests of all four services. "Test — Billing" and "Test — Auth" fail at the test step. "Test — Drafting" and "Test — Gateway" pass.
- The three most recent runs on `develop` all failed this way: 4 Oct 2026 18:48 UTC, 6 Oct 04:14 UTC and 6 Oct 04:28 UTC.
- Pull requests look green because CI skips a service the pull request did not touch. The last four pull requests touched drafting or the web only.
- Not known: why they fail. The chat session could not read the job logs. Whether billing or auth tests pass on a developer's machine is not checked.

## Acceptance criteria

- The cause of each failure is written in this ticket.
- `yarn workspace @lawie/billing test` and `yarn workspace @lawie/auth test` pass in CI on `develop`.
- No test is skipped, disabled or deleted to get there. If a test is wrong, the ticket says why before it is changed.
- If the failure is a real fault in billing or auth, it is reported to the founder before anything else is merged to `main`.

## In scope

- `apps/billing`, `apps/auth`, `.github/workflows/ci.yml`

## Out of scope

- Adding CI jobs for `web`, `email-worker` and `email-client` (noted in `.claude/docs/test-gaps.md`)

## References

- Run: https://github.com/lawie-in/lawie/actions/runs/37413905508

## Delivery report (Vishal, from the war-room chat, 6 Oct 2026, 13:4x)

Pull request: https://github.com/lawie-in/lawie/pull/43 into `develop`.

### The cause of each failure

- **Auth.** `apps/auth/src/__tests__/referral.test.ts` did not start. Commit `33eaa5d` (17 June 2026, "per-code ink bonus and expiry for referral codes") removed `REFERRAL_BONUS_DRAFTS` from the referral service. The test still imported it, so the type check failed and none of its 29 tests ran. The other 6 auth suites passed.
- **Billing.** All 95 tests passed. The job failed on the coverage bar alone: 65% statements, 34% branches, 67% lines, 57% functions, against a bar of 70 / 65 / 70 / 70. Commit `e026d24` (17 June 2026, admin panel) added `coupon.routes.ts` and `admin-billing.routes.ts`, about 550 lines, with no tests.
- So CI has been red on `develop` since 17 June, not since 4 October.

### What was changed

- **Auth test** (the test was wrong, the service was right): the stale import is removed and the test checks `bonusInk`, which the route returns now. This was changed before it was written here; the ticket asked for the reason first. No test was skipped, disabled or deleted.
- **Billing**: 70 new tests in `coupon.routes.test.ts` and `admin-billing.routes.test.ts`. Coverage is now 95% statements, 78% branches, 97% functions, 96% lines. The bar was not lowered.
- **One fix in billing service code**, found by the new tests: in `admin-billing.routes.ts`, a subscription with no Razorpay plan id was shown under the first plan whose env var was not set (admin list and revenue plan mix). It now shows as "unknown". The webhook that grants Ink already checks for a plan id and was not touched.
- **Test configs** of billing, auth and gateway now also use Jest's `github-actions` reporter: a failed test in CI shows as a note on the pull request.
- `.github/workflows/ci.yml` is unchanged at the end. Two commits on the branch added and removed a temporary step that copied the end of the test output into a note. That is how the causes were read without the job logs.

### How the cause was found without the logs

Draft pull request #42 touched the three test configs, so CI ran billing and auth. The reporter showed no failed test, which pointed away from the tests themselves. The temporary step then showed the coverage lines for billing and "Test suite failed to run" for auth. The auth type error was reproduced in the chat session.

### Seen in billing while writing the tests, not changed

- `GET /validate-coupon/:code` is public and takes `userId` from the query string. Leaving it out skips the "already used" check. Whether the same check runs again when the order is created was not checked. For Arjun.
- The admin subscription search filters after the page is cut: it only searches inside the current page, and `total` ignores the search.
- In `POST /admin/coupons`, a database error other than a duplicate code is thrown inside an async handler, which Express 4 does not catch.

### What was run

- CI on the branch: "Test — Billing", "Test — Auth" and "Test — Gateway" passed. "Test — Drafting" was skipped (not touched).
- In the chat session: type check, lint with no errors, prettier.

### What was not run

- The billing and auth suites on a developer's machine. The in-memory database cannot start in the chat session, so the new tests ran in CI only.
- Nothing against Razorpay. It is a stub in every test.
- No separate review. The same agent wrote the tests and the fix.
- Checked after the merge: the CI run on `develop` at `021b43e` passed for Billing, Auth, Gateway and Drafting.
