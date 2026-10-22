# T-540: Top-up coupon: displayed total versus charged amount

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design), Vikram (money rule for a 100% coupon), a billing lead (build) |
| Mode   | Full chain (billing); MUST land before main |
| Status | READY bfdd9c3f (branch CI 897 green), 22 Oct 2026; merge slot with Shashank. Follow-ups: T-551, T-552, T-553, T-556. Priya |

## Problem
The footer total comes from `/plans` or `validate-coupon`; the charge comes from the `/topup/order` response; nothing compares them.
1. A 100% coupon shows "₹0 incl. GST" but charges ₹1: `validate-coupon` floors at 0 (`coupon.routes.ts:224`), the order route floors at 1 (`billing.routes.ts:227`).
2. If a coupon is deactivated, expired or used up between Apply and Buy, the order route silently drops it and charges the full price while the footer still shows the discount.
3. The order route never checks `applicablePlans` or `maxUsesPerUser`.
4. A fractional fixed discount can give non-integer paise.

## Acceptance criteria
1. One rule for the minimum charge (Vikram decides: ₹0 handled without Razorpay, or ₹1) used by both routes.
2. A coupon that stops being valid between Apply and Buy makes the order route answer with an explicit "coupon no longer valid" result instead of charging the full price; the web shows an error and the user can retry.
3. `applicablePlans` and `maxUsesPerUser` are enforced in the order route.
4. Amounts are integer paise.
5. Tests for each; Razorpay mocked.

## Web side (done in T-535)
A guard in TopUpModal: if `order.amountInr` differs from the displayed total, Checkout does not open and the user sees the signed "Something did not work. Try again."

## Arjun's design (21 Oct 2026; full text in `handoff/design/T-540-topup-quote.md`)
- One `quoteTopup()` service used by both `validate-coupon` and `/topup/order` (today two copies with different floors and checks).
- Integer paise throughout; identical checks in both, including `applicablePlans` and `maxUsesPerUser`.
- The order route answers 409 `coupon_invalid` instead of silently dropping a coupon, and 409 `price_changed` if the web's expected amount differs.
- ₹0 quotes are blocked with 409 until Vikram rules: (a) a free-grant path with no Razorpay order, or (b) cap every coupon at price minus ₹1.
- Tests as listed in the design doc. Billing only; blocking before main.
- Web (after this lands): the TopUpModal guard from T-535 also handles the two 409s with the signed "Something did not work. Try again."

## Vikram's ruling (21 Oct 2026; both sections in `handoff/design/T-540-topup-quote.md`)
- The ₹0 rule is (a): a free-grant path with no Razorpay order. A 100% coupon grants the Ink directly and shows "Coupon, ₹0" in billing history, with no tax invoice. A partial coupon gets the normal T-436 invoice with a discount line.
- Build rules: the coupon usage count is atomic at the grant; `maxUses` and `maxUsesPerUser` are mandatory for any coupon that can reach 100%; a final amount between 0 and 100 paise (exclusive) rounds to ₹1 inside the quote function; the list value is logged without personal data.
- The 409 for a ₹0 quote is replaced by this free-grant path.

## Arjun (22 Oct 2026) — three calls after Explore (Shashank)

1. **Free grant behind a switch — (b), but as an AppSettings key, not an env var.** `feature.coupon_free_grant` (global, env fallback `FEATURE_DEFAULT_COUPON_FREE_GRANT`, default `off`), the same shape as `feature.fact_ledger`: the founder flips it in mongosh, no redeploy, no new line in any env file. Off → a ₹0 quote returns `409 coupon_invalid` ("This coupon cannot be applied to this item"), nothing granted. On → `{ status: 'granted', grant: { ink, couponCode, ledgerKey } }` and **no `data`**, so today's web cannot open Checkout on it. The web's granted state (T-535's guard) lands before the key is turned on. The server never sends `amountInr: 0` with an `orderId`.
2. **Validate: optional auth, drop the `userId` query param.** JWT present → its `sub` drives `maxUsesPerUser`; anonymous → no per-user check, and the response says `perUserChecked: false` so the web can re-validate after login. Order and free-grant always check it, atomically.
3. **Follow-ups, not T-540:** the partial-coupon invoice discount line (invoice.service, Invoice.model, PDF) and the "Coupon, ₹0" billing-history row (new route + web). T-540's invoice stays at the charged amount, which is the net taxable value, so GST is right; it lacks the discount line until the follow-up. Priya posts both; Vikram's ruling names them.

Small things: all agreed — `coupon_grant` ledger reason (admin revenue stays honest), charged amount in ledger metadata, `CouponUsage.orderId` holds the ledger key for free grants, admin create rejects fractional fixed values and any coupon that can reach 100 % without non-zero `maxUses` and `maxUsesPerUser`.

## Arjun (22 Oct 2026) — whole rupees

(a). Inside `quoteTopup()`, a percent discount rounds to whole rupees: `discountPaise = Math.round(originalPaise * value / 100 / 100) * 100`. Every final amount is whole rupees and integer paise; today's web (`amountInr * 100`) stays exact. The order and validate responses also carry `amountPaise`, so the web can switch to it in its own ticket without another server change. The whole-rupee rule is written into the quote tests (10 % of ₹199 → ₹20 off → ₹179).
