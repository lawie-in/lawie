# Credits, bonuses and the free Ink

Read this before touching `apps/auth/src/services/credit-bonus.service.ts`, `apps/drafting/src/routes/credits.routes.ts`, the credit ledger or the admin activity feed.

## Nothing writes to earnedCredits (T-652)

Since T-652 (Ajay AJ-646-M9b and AJ-646-M9c, 28 Oct 2026) no code path adds to `earnedCredits`: no daily login +2, no rating +1, no signup +5. Reason: DPDP purpose limitation. Users were never offered these credits, so the processing had no stated purpose.

- Existing `earnedCredits` and `lastLoginBonusAt` values stay in the User documents. They are hidden, guarded against spending (see "The earnedCredits spend guard (T-653)" below) and not mentioned anywhere in the UI.
- `spendCredits` (`apps/drafting/src/services/credits.service.ts`) still has no callers and is a legacy path: drafts are paid in Ink (`holdInk` / `settleInk`, `releaseInk` on failure). Do not add a caller.
- Signing in grants nothing and writes no `creditledger` row.
- Clearing down existing `earnedCredits` is not built. If wanted, it is a separate script, dry-run first, run through Arjun and Nikhil.
- No signed bonus scheme exists. Any future bonus scheme goes to Ajay first (AC5, AJ-646-M9c) for its offer and terms.

## The earnedCredits spend guard (T-653)

Ajay AJ-646-M9c / AC3. `spendCredits` and `grantCredits` (`apps/drafting/src/services/credits.service.ts`) REFUSE the `earnedCredits` bucket with the typed `EarnedCreditsSpendDisabledError` (`code` `earned_credits_spend_disabled`) unless the env flag `EARNED_CREDITS_SPEND_ENABLED` is exactly the string `true`.

- The flag is env-only (`apps/drafting/src/config/env.ts`): no AppSetting, no admin override. Off by default, and `.env.example` carries it as `false`. Read at call time (`isEarnedSpendEnabled`).
- Fail-closed parse: unset, `''`, `TRUE`, `1`, `yes` or anything else is off. An odd value never stops boot.
- Keep it off. It may be turned on only after Ajay has signed an offer and terms for a bonus scheme (none exists).
- `grantCredits` throws the same error for the `earnedCredits` bucket with the flag off, before any write (checked after the `amount > 0` check).
- Check order in `spendCredits` with the flag off. The amount must be > 0 first, then:
  1. total (topup + earned + sub) < amount: `InsufficientCreditsError`, with `available` = topup + sub (earned is never reported).
  2. else, if the plan (order topup, earned, sub) would take anything from earned: the typed refusal, before any write (all or nothing).
  3. else a normal spend.
- Consequence (deliberate; there are no callers): with earned > 0 and topup smaller than the amount, a spend is refused even when topup + sub could pay.
- Debits are guarded (`$gte` per bucket). If one matches nothing (a concurrent drain), the debits already made in the call are re-credited, best effort, and `InsufficientCreditsError` is thrown. Ledger rows are written only after all debits have landed.

Known limits:

- A crash between debits leaves the earlier debits without a ledger row.
- A debit the server applied but the driver reported as an error is not re-credited.
- `NaN` passes the `amount <= 0` check and writes nothing. Non-finite amount hardening is a separate follow-up.
- `getCreditBalance().total` still includes `earnedCredits`, and the 402 body from `enforceCredits` includes `balance.earnedCredits`. This is T-664, a separate ticket.
- The source-scan test in `apps/drafting/src/__tests__/t653-earned-credits-guard.test.ts` only walks `*/src`. A future writer under `apps/*/scripts` would escape it (follow-up).

## Credit ledger (`creditledger`)

- `login_bonus`, `rating_bonus` and `signup_bonus` are historic and no longer written. The enum values are kept so old rows still validate and display.
- The admin credit-ledger page (`/admin/credit-ledger`) and `GET /admin/credits/kpis` keep reading that history.
- `POST /credits/rate/:docId` is removed and returns 404.
- `GET /admin/credits/ledger?source=` accepts one value, a comma-separated list, or repeated params. Values are allow-listed to the 9 known sources (`signup_bonus`, `login_bonus`, `rating_bonus`, `plan_renewal`, `topup_purchase`, `admin_grant`, `draft_spent`, `plan_lapsed`, `admin_revoke`) and queried with `$in`. An unknown value matches nothing.

## The advertised free Ink

- `grantSignupBonus` (auth) seeds 5 Ink (10 units) into `inkTopup` and writes one `inkledger` row with reason `free_seed`. This is its only effect.
- Once only, in ONE write (T-657): a single raw `users` pipeline `findOneAndUpdate` adds 10 units to `inkTopup` (`$add`, never `$set`, so it is order-independent with referral Ink) and stamps `signupBonusGrantedAt` and `freeSeedAt` together. Its filter is the guard: marker absent or null, and `VERIFIED_FOR_BONUS` (AJ-646-M9d). Only Google users and verified email users match (T-351); an unverified call grants nothing and sets no marker, so a call after verification still grants once. Two parallel calls give exactly one +10: the loser matches nothing.
- `freeSeedAt` is raw-only (not in the Mongoose schema), like `inkTopup`. It means "this code granted the Ink". Users marked by older code have `signupBonusGrantedAt` but no `freeSeedAt`.
- The ledger row is written after the grant with the deterministic `_id` `free_seed:<lower-case hex userId>` (`freeSeedLedgerId`, normalised through the ObjectId). A duplicate key (E11000) counts as already written. The backfill script keeps a copy of `freeSeedLedgerId` (it cannot import the service: env init); keep the two equal.
- Heal: a call whose update matches nothing looks for a user with `freeSeedAt` and no row, and writes the row. Users marked by old code (no `freeSeedAt`) are never healed this way; the backfill is their only path. A heal-written row has an approximate `balanceAfter` (the current `inkTopup`).
- Failure semantics: if the pipeline update fails, nothing is written and the next call retries. If the row insert fails, the user is fully granted (Ink and markers) and the next call heals the row. A marker set by this code always means the Ink landed. Logs carry the user id and the error name only (T-210).
- Sign-in self-heal (T-657): `startSignedInSession` (password login, and the verify-link sign-in) and the Google callback in `oauth.routes.ts` call `grantSignupBonus` fire-and-forget after the session exists, for verified, non-test users only. It never blocks or fails a sign-in; failures are logged with the error name only. Normally it matches nothing (marker set, row present). The new-user branch in `passport.ts` also catches its call now.
- The `inkledger` collection now holds rows with string `_id` (`free_seed:<hex>`), as it already does for `topup:` and `coupon:` claim keys. No reader casts or sorts by `inkledger._id`; keep it that way.
- Referral Ink is separate: `grantReferralInk` adds `bonusInk x 2` units to `inkTopup` and writes `inkledger` reason `referral_bonus`, once per user (`referralInkGrantedAt`).
- The test account's grant is `grantTestInk` (`test_grant`, 60 units), not this path.

## Admin activity feed

`GET /admin/overview/activity` (7-day window) builds "redeemed referral" items from `inkledger` `referral_bonus` rows, plus old `creditledger` `signup_bonus` rows for history (skipped for users who already have a `referral_bonus` row).

## Backfill (AJ-657-M1/M1a/M1b/M1c)

`apps/auth/scripts/backfill-free-seed.ts`: a one-time fix for verified accounts that carry `signupBonusGrantedAt` but never got the free 5 Ink (before T-657 the marker and the Ink were two writes). Read the script header before changing it.

- Usage: `yarn workspace @lawie/auth backfill:free-seed -- --cutoff 2026-10-25T22:00:00Z --ids-out /path/ids.tsv [--apply]`
- Who and when: Arjun or Nikhil only, through the prod SSM action (v11), and only AFTER the atomic fix is deployed, so nothing new can join the set.
- Dry run is the default and writes nothing. `--apply` needs `--cutoff` and `--ids-out`.
- `--apply` is REFUSED (exit 1, before any DB write) if any account has `createdAt` before the cut-off. The counts then go back to Ajay.
- `--cutoff` (and `--before`) must be a strict ISO date-time with `Z` or an offset. `--cutoff` must be at or after the floor, 2026-06-15T19:40:43Z (commit 7652ed93, the first free_seed code).
- Either `MONGO_URI` or `NODE_ENV` must be set explicitly; the script refuses to guess (exit 2).
- Selection is by state: marker set, no `freeSeedAt`, no `free_seed` row; verified; not test, erased or inactive. The date is only a guard. Verification date precedence: `signupBonusGrantedAt`, then `createdAt`, then none. Dated before the cut-off (or no date) means never granted.
- Classes:
  - A: unexplained `inkTopup` is exactly 0. Gets +10 units and a row with `metadata.note` `backfill`.
  - B: unexplained is exactly 10. Row only, no extra Ink. Limitation: a lost seed that coincides with exactly 10 unexplained units from another failed ledger row cannot be told apart.
  - manual: subscribers or any non-free plan. Never touched.
  - ambiguous: any other unexplained value, or any `pending` ledger row. Never touched.
  - window and near_cutoff: id classes near the cut-off. Never touched.
  - (unexplained = `inkTopup` minus the sum of the user's topup-bucket ledger deltas.)
- Output: stdout carries counts ONLY. Ids go only to the `--ids-out` file: mode 0600, never overwrites, created before connecting (a re-run after a refusal needs a new path), one `<class>\t<id>` per line. The file goes to Ajay.
- The counts per class go to Ajay before any apply.
- Expected on prod (DB created empty on 25 Oct 2026): pre-cutoff, window and near_cutoff are all empty.
- No email, no queue.

## Known limits

- A user whose first grant failed and who never signs in again is healed only when they next sign in.
- A new-code user whose row insert failed is NOT covered by the backfill (`freeSeedAt` is set). Their row comes back only from the heal at their next sign-in.
- billing's `seedFreeInk` (`apps/billing/src/services/ink-ledger.service.ts`) is dead code (tests only) that also writes `free_seed`. Follow-up: remove it.
- The sign-in self-heal has no date guard. Safe on prod, where no user predates 25 Oct 2026; an older non-prod DB would seed legacy users whose marker is null.
- Heal-written rows carry no `backfill` note (only rows from the script do).
- The `inkledger` `{reason, createdAt}` query in the activity feed is unindexed. Admin only; follow-up index belongs in billing.
- Old `signup_bonus` rows show as "redeemed referral" in the feed although they were written for every verified signup. They age out of the 7-day window.
