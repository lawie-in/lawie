# T-540: Top-up coupon: displayed total versus charged amount

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design), Vikram (money rule for a 100% coupon), a billing lead (build) |
| Mode   | Full chain (billing); MUST land before main |
| Status | To do. Found by Tanvi on T-535 (21 Oct 2026). Priya |

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
