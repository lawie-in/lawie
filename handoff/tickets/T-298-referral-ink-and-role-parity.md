# T-298 — Referral Ink may never be credited; password users get a different role

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Prep |
| Owner  | Arjun (triage). Lead (build). Vikram if Ink is affected |
| Mode   | Small fix (auth), after T-234 merges |
| Status | To do. Found by Kunal in T-234 Explore, 12 Oct 2026. Unverified |

Two findings outside T-234:

1. **Referral Ink.** The referral code path sets `inkTopup`, but `inkTopup` is not in the auth User schema. With Mongoose strict mode the field may be dropped, so the referral Ink may never be credited. Unverified.
2. **Role.** Password sign-up gives role `Client`; Google sign-up gives `Lawyer` (T-196). No code checks `Lawyer` today, but the two should match.

## Acceptance criteria

1. Prove with a test whether referral Ink reaches the user's balance. If it does not, fix it so it does, exactly once.
2. Arjun decides the role for password sign-up (expected: the same as Google). Apply it, with a test.
3. No change to existing users' roles without Arjun's say.
