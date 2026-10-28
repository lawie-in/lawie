# Credits, bonuses and the free Ink

Read this before touching `apps/auth/src/services/credit-bonus.service.ts`, `apps/drafting/src/routes/credits.routes.ts`, the credit ledger or the admin activity feed.

## Nothing writes to earnedCredits (T-652)

Since T-652 (Ajay AJ-646-M9b and AJ-646-M9c, 28 Oct 2026) no code path adds to `earnedCredits`: no daily login +2, no rating +1, no signup +5. Reason: DPDP purpose limitation. Users were never offered these credits, so the processing had no stated purpose.

- Existing `earnedCredits` and `lastLoginBonusAt` values stay in the User documents. They are hidden, unspendable and not mentioned anywhere in the UI.
- `spendCredits` (`apps/drafting/src/services/credits.service.ts`) has no callers. Never add one.
- Signing in grants nothing and writes no `creditledger` row.
- Clearing down existing `earnedCredits` is not built. If wanted, it is a separate script, dry-run first, run through Arjun and Nikhil.
- Any future bonus scheme goes to Ajay first (AC5) for its offer and terms.

## Credit ledger (`creditledger`)

- `login_bonus`, `rating_bonus` and `signup_bonus` are historic and no longer written. The enum values are kept so old rows still validate and display.
- The admin credit-ledger page (`/admin/credit-ledger`) and `GET /admin/credits/kpis` keep reading that history.
- `POST /credits/rate/:docId` is removed and returns 404.
- `GET /admin/credits/ledger?source=` accepts one value, a comma-separated list, or repeated params. Values are allow-listed to the 9 known sources (`signup_bonus`, `login_bonus`, `rating_bonus`, `plan_renewal`, `topup_purchase`, `admin_grant`, `draft_spent`, `plan_lapsed`, `admin_revoke`) and queried with `$in`. An unknown value matches nothing.

## The advertised free Ink

- `grantSignupBonus` (auth) seeds 5 Ink (10 units) into `inkTopup` and writes one `inkledger` row with reason `free_seed`. This is its only effect.
- Once only: the guard is `signupBonusGrantedAt`, set in the same atomic filter as `VERIFIED_FOR_BONUS` (AJ-646-M9d). Only Google users and verified email users match (T-351); an unverified call grants nothing and sets no marker, so a call after verification still grants once.
- Referral Ink is separate: `grantReferralInk` adds `bonusInk x 2` units to `inkTopup` and writes `inkledger` reason `referral_bonus`, once per user (`referralInkGrantedAt`).
- The test account's grant is `grantTestInk` (`test_grant`, 60 units), not this path.

## Admin activity feed

`GET /admin/overview/activity` (7-day window) builds "redeemed referral" items from `inkledger` `referral_bonus` rows, plus old `creditledger` `signup_bonus` rows for history (skipped for users who already have a `referral_bonus` row).

## Known limits (pre-existing, not fixed in T-652)

- In `grantSignupBonus` the marker write and the Ink seed are two separate writes. A DB failure between them leaves the marker set without the Ink. Follow-up: fold the marker into the seed's pipeline update, as `grantTestInk` does.
- `apps/auth/src/config/passport.ts` calls `void grantSignupBonus(...)` for a brand-new Google user without `.catch` (the Google-link branch has one). The function is documented as never throwing, but a catch is still missing.
- The `inkledger` `{reason, createdAt}` query in the activity feed is unindexed. Admin only; follow-up index belongs in billing.
- Old `signup_bonus` rows show as "redeemed referral" in the feed although they were written for every verified signup. They age out of the 7-day window.
