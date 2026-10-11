# T-211 — The ReferralCode uniqueness test is not flaky

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Phase          | 0 — Prep                                                  |
| Owner          | Lead (build)                                              |
| Mode           | Small fix: developer + tester + reviewer                  |
| Status         | Ready                                                     |
| Size           | S (0.5 day)                                               |
| Depends on     | None                                                      |
| Gate           | None for go-live. Keeps CI on auth trustworthy            |
| Branch         | fix/t-211-flaky-referral-test                             |
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
