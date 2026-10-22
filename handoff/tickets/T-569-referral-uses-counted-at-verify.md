# T-569: Referral uses counted at verify, not at sign-up

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (follow-up to T-522; not blocking the v1 batch) |
| Owner  | Arjun (design, done in T-522's last section), a lead (build; auth) |
| Mode   | Full chain (auth, one service) |
| Status | To do. Posted 22 Oct 2026 on Arjun's request after the T-522 review. Priya |
| Source | Arjun, T-522 review pass; detail in `T-522-*.md` last section |

## Problem
With neutral sign-up (T-522), unverified accounts can hold the slots of a capped referral code (`maxUses`) until the sweep removes them, because the count is taken at sign-up.

## Acceptance criteria
1. The `maxUses` count moves from sign-up to the deferred referral grant at verify.
2. The count is an atomic conditional `$inc` so the cap can never be exceeded.
3. Sign-up keeps a soft pre-check only (no increment).
4. If the grant fails after the increment, the increment is reversed.
5. Tests: two verifies racing for the last slot (one wins), grant failure reverses, unverified sign-ups never consume a slot.

## Files (to be claimed by Priya when a lead takes it)
apps/auth referral code service and verify path; tests. Not before T-522 merges.
