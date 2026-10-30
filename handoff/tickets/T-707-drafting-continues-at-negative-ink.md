# T-707: Drafting still works after the Ink balance goes negative

Status: UNCONFIRMED, P1 (downgraded from P0 by Arjun, 30 Oct 2026 17:27 UTC). Anushka did not observe or report it: the smoke account never went below 10 Ink. Waiting on the founder to name the account or the symptom. Meanwhile: Arjun's code check of the hold/settle path, and Anushka's live zero-balance test after the v1.3.1 deploy. Was: P0, open. Raised 30 Oct 2026 by Priya from the founder (Anushka reported it from prod during the model-grid test). Arjun decides who fixes it; it is a money leak.

On prod, the app kept drafting after the account's Ink balance went below zero. A user can draft without paying.

## To find out first
- The exact steps Anushka used and her account's balance trail: Ink history, admin ledger, which actions (describe/intake, generate, revision) ran at a negative balance.
- Whether the hold at generate (withInkHold) checks the balance, or a path skips the hold (form route, generate-from-brief, retries, the T-705 revision route).
- Whether the admin top-up or the +50 grant during the grid test raced a hold.

## Acceptance criteria
1. No paid action (generate, paid revision) starts when available Ink is below its quote; the user sees the existing "not enough Ink" message and Ink is not taken.
2. The balance can never go below zero through normal use; concurrent requests cannot overdraw (atomic check and hold).
3. Tests on every charging path, including concurrent requests.
4. A one-off report of any prod accounts that are below zero now (ids and amounts only), for the founder to decide what to do.

## Arjun's code audit (30 Oct 2026, 17:35 UTC) — read-only trace of the hold/settle path at a965afe7

Finding: **no drafting path lets the Ink total go below 0 or lets a negative total draft.** `holdInk` (credits.service.ts:1050-1095) is one `findOneAndUpdate` whose filter requires sum(inkSub+inkAnnualCarry+inkTopup) ≥ cost and the same write debits the buckets and pushes the hold — concurrent requests cannot both hold (t226 covers 5 parallel holds). Settle never debits (`charged = max(0, min(actual, hold.units))`, :1339; refunds only). Release pulls the hold in one write. Earned credits are never read (T-667). Admin grants `$inc inkTopup`, which the hold reads. The revise route uses the same hold with the original quote (402 on a short balance, tested). Prod `main` has the same logic. A negative *bucket* can exist only from a write outside the app; the total still guards drafting. Anushka confirms she never observed negative-Ink drafting (smoke account min 10). **Status: unconfirmed; the founder is asked for the account or symptom.**

Real holes found on the way (next month unless noted):
- **H1 — phantom Ink (likely real leak, not negative):** `releaseInk` (:1237-1239) and a partial settle (:1358) add the hold's sub/carry split back on top of a bucket that was `$set` while the hold was open (monthly drip yearly-drip.ts:177-181, renewal grant ink-ledger.service.ts:320-324, expiry/cancel yearly-drip.ts:242-247 / ink-ledger.service.ts:855). A failed or expired draft refunds plan Ink that was already reset or expired. Fix: an `inkSubEpoch` counter `$inc`'d by every `$set` of inkSub/inkAnnualCarry, stamped on the hold; release/refund skip the sub/carry part when epochs differ. Test: hold from inkSub → drip/expiry `$set` → release + partial settle → total = reset value + topup.
- **H3 — double free revision (revise only, ships dark):** `revisions.count` and `hasOpenHoldForRun` are read-then-act before the hold (documents.routes.ts:2501, :2509); two concurrent first revisions are both priced 0. Fix: atomic claim of the free revision (conditional `$inc` on the document). Test: two parallel /revise at count 0 → one 200, one 409. **Must be fixed before `feature.revisions` is turned on in prod.**
- **H2 — negative bucket from outside the app:** clamp each bucket with `$max: [0, …]` in the hold/release pipelines + a one-off repair. 
- **H4 — NaN cost passes the guard** (theoretical): `Number.isFinite(cost) && cost >= 0` at the top of `holdInk`.
Untested today: negative bucket/total, `$set` between hold and release, NaN cost, concurrent free revisions.

Audit (Arjun, 30 Oct 2026): no code path lets a negative balance draft. The hold is one atomic write with a balance >= cost filter, the settle step only refunds, and concurrent holds are covered by tests. The two real holes found are T-707a (phantom Ink refund) and T-707b (concurrent free revisions). H2 (bucket clamp) and H4 (NaN guard) are P3, next month.
