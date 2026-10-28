# T-657 — Free 5 Ink seed must be atomic with its once-only marker

Status: backlog (unassigned), PRIORITY. From Kunal's T-652 review, 28 Oct 2026. Ajay AJ-646-M9d: "nobody gets it twice or loses it".

## Problem
In auth `grantSignupBonus`, setting the once-only marker (signupBonusGrantedAt) and seeding the free 5 Ink (inkTopup +10, inkledger free_seed) are two separate writes. If the DB fails between them, the marker is set but the user has NO free Ink, and no retry heals it.

## Acceptance criteria
1. The marker and the Ink seed land in one atomic update (a pipeline update, as `grantTestInk` already does). The inkledger row is written idempotently, keyed on the user.
2. A failure at any step leaves the user either fully granted or not granted and retryable, never marked without the Ink.
3. Tests simulate a failure between the steps, then a retry: exactly 5 Ink, once.

## Also (small, same area)
- passport.ts:178 `void grantSignupBonus(...)` has no `.catch` (the call at :144 has one). Add one.
