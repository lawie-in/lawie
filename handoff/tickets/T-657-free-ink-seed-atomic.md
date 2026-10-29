# T-657 — Free 5 Ink seed must be atomic with its once-only marker

Status: Merged into develop_staging (71bc4d71), 29 Oct 2026. Backfill: after the auth deploy, Arjun/Nikhil v11 dry run (--cutoff 2026-10-25T22:00:00Z), counts to Ajay; ambiguous/manual never auto-applied; --print-ids <class> bare ObjectIds only if Ajay asks; ids file stays on the box, deleted within 24 h.

## Problem
In auth `grantSignupBonus`, setting the once-only marker (signupBonusGrantedAt) and seeding the free 5 Ink (inkTopup +10, inkledger free_seed) are two separate writes. If the DB fails between them, the marker is set but the user has NO free Ink, and no retry heals it.

## Acceptance criteria
1. The marker and the Ink seed land in one atomic update (a pipeline update, as `grantTestInk` already does). The inkledger row is written idempotently, keyed on the user.
2. A failure at any step leaves the user either fully granted or not granted and retryable, never marked without the Ink.
3. Tests simulate a failure between the steps, then a retry: exactly 5 Ink, once.

## Also (small, same area)
- passport.ts:178 `void grantSignupBonus(...)` has no `.catch` (the call at :144 has one). Add one.
