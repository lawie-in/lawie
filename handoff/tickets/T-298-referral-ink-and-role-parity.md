# T-298 — Referral Ink may never be credited; password users get a different role

| Field  | Value |
| ------ | ----- |
| Phase  | 0 — Prep |
| Owner  | Arjun (triage). Lead (build). Vikram if Ink is affected |
| Mode   | Small fix (auth), after T-234 merges |
| Status | Merged into develop_staging (b4d6b58, 12 Oct 2026). Waiting for Anushka on develop |

Two findings outside T-234:

1. **Referral Ink.** The referral code path sets `inkTopup`, but `inkTopup` is not in the auth User schema. With Mongoose strict mode the field may be dropped, so the referral Ink may never be credited. Unverified.
2. **Role.** Password sign-up gives role `Client`; Google sign-up gives `Lawyer` (T-196). No code checks `Lawyer` today, but the two should match.

## Acceptance criteria

1. Prove with a test whether referral Ink reaches the user's balance. If it does not, fix it so it does, exactly once.
2. Arjun decides the role for password sign-up (expected: the same as Google). Apply it, with a test.
3. No change to existing users' roles without Arjun's say.

## Arjun (12 Oct 2026): triage and rulings

**1. Referral Ink: confirmed by reading, the grant is dropped; the test proves it before the fix.**
- `grantReferralInk` (`apps/auth/src/services/credit-bonus.service.ts` ≈ l.74) does `User.findByIdAndUpdate(..., { $inc: { inkTopup }, $set: { freeTierBonusGrant } })` through the auth `User` model. The auth schema has no `inkTopup` (it has `freeTierBonusGrant`, `earnedCredits`, `signupBonusGrantedAt`), and Mongoose strict mode strips an unknown path from an update. So the Ink is not credited. Worse, the `inkledger` row is still written with `balanceAfter` falling back to `inkUnits`, so the ledger shows a credit the balance never got. The legacy `freeTierBonusGrant` and the drafting `BonusCredit` signal do land, so a referred user gets the bonus drafts but not the Ink.
- The signup seed in the same file avoids the problem by using the raw `users` collection. It is also racy with referral: `grantSignupBonus` and `applyReferralCode` are both fired with `void` and run concurrently, and the seed is guarded by `inkTopup: { $exists: false }`. Once referral works, a referral that lands first creates `inkTopup`, and the seed then silently skips: the user loses the 5 free Ink.
- **Fix (one lead, auth only):**
  a. Test first: register with a referral code, read the user's raw `inkTopup` and the `inkledger` row, assert they agree. It fails today.
  b. `grantReferralInk` uses the raw collection `$inc` on `inkTopup`, like the seed, and writes `balanceAfter` from the value the update returns (`returnDocument: 'after'`).
  c. The seed becomes order-independent: `$inc: { inkTopup: 10 }` (its own once-only guard is already `signupBonusGrantedAt`), `$set` of the other three fields only if absent, and `balanceAfter` from the returned document. Do not add `inkTopup` to the auth schema with a default: a `default: 0` would break any `$exists` guard elsewhere.
  d. Exactly once: only the call that wins `findOneAndUpdate({ _id, referredVia: { $exists: false } }, { $set: { referredVia } })` grants the Ink and bumps `uses`. Add a test with two concurrent `applyReferralCode` calls and one with referral plus seed in both orders: final `inkTopup` is 10 + bonus, two ledger rows.
  e. Do not add the field to the auth schema; do not touch billing or drafting.
- **Backfill: none.** Production starts fresh at launch (T-403). On develop, the lead lists users with `referredVia` set and no matching Ink and gives the list to Priya; test accounts are not worth fixing, a real one would be Vikram's call.

**2. Role: password sign-up becomes `Lawyer`, same as Google.** Lawie's users are advocates (T-234 collects the Bar Council id at sign-up), and a user who registers with a password is the same person as one who uses Google. Set it explicitly in `auth.service.ts` (`role: 'Lawyer'`, keeping the T-196 comment that no role is ever read from the request). Keep the schema default and the gateway/drafting/billing fallback at `Client` on purpose: a missing role stays the least-privileged value. `Admin` is still never assignable from sign-up.
- **No migration of existing users.** Production is fresh at launch, so there is nothing to migrate there. On develop, existing password test accounts stay `Client`; nothing reads either value, so no behaviour changes. If a future check reads `Lawyer`, that ticket brings its own migration, with my say.
- Test: password register gives `Lawyer`; a request body carrying `role: 'Admin'` still gives `Lawyer`; Google unchanged.

**Order:** after T-234 merges (same auth files). Size S. Vikram: no pricing change; heads-up only.

## Arjun (12 Oct 2026): two answers for the build (Kunal)

1. **`referredVia` guard:** `findOneAndUpdate({ _id, referredVia: null }, { $set: { referredVia } })` is right. The schema default is `null`, so my `$exists: false` never matches; `null` matches null and missing and still has one winner. Use it.
2. **`maxUses` overshoot: fix it in this ticket.** Each overshoot is free Ink we did not mean to give, it is the same function, and the fix is small. Order: (a) win the user's `referredVia: null` claim; (b) take a use slot atomically: `ReferralCode.findOneAndUpdate({ _id, isActive: true, expiresAt ok, $expr: { $lt: ['$uses', '$maxUses'] } }, { $inc: { uses: 1 } })` (skip the `$expr` when `maxUses` is unset, as `validateReferralCode` does today); (c) only a winner of both grants the Ink. If (b) finds no slot, undo (a) with `{ $set: { referredVia: null } }` filtered on the same code id, and grant nothing. The pre-check in `validateReferralCode` stays as the cheap early exit but is no longer the guard. Test: a code with `maxUses: 1` and five concurrent signups grants exactly once and ends with `uses: 1`; the four losers have `referredVia: null` and no Ink.
