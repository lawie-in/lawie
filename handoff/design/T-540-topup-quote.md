# T-540 — top-up quote: displayed total must equal the charge

Design note; Priya folds it into the ticket when it lands.

## Arjun (21 Oct 2026) — backend design

Root cause: two copies of the pricing rule. `coupon.routes.ts` (validate) and `billing.routes.ts` (order) each re-derive the discount, with different floors (0 vs 1), different checks (order skips `applicablePlans` and `maxUsesPerUser`), and rupee arithmetic that can produce fractional paise.

1. **One quote function, one place.** `quoteTopup({ skuId, couponCode, userId, now })` in `apps/billing/src/services/topup-quote.service.ts`. Pure over its inputs (coupon + usage rows passed in or loaded by a thin wrapper), unit-tested on its own. Returns `{ ok: true, sku, originalPaise, discountPaise, finalPaise, coupon? }` or `{ ok: false, reason }`. **Both** routes call it; neither computes a price itself.
2. **Integer paise, always.** Prices and discounts in paise. Percent: `Math.round(originalPaise * value / 100)`. Fixed: `Math.min(value * 100, originalPaise)`; `discountValue` for `fixed` is validated as a whole rupee at coupon creation (admin route + model `validate`). `finalPaise = originalPaise - discountPaise`, never negative, no floor to 1 here — the ₹0 case is a decision, not a clamp (point 5).
3. **Same checks in both routes, in this order:** exists, `isActive`, `expiresAt`, `applicablePlans` (empty = all), `maxUses`, `maxUsesPerUser` via `CouponUsage` count for this user. Any failure → `{ ok: false, reason }` with the same user-facing reasons validate shows today.
4. **Order never silently drops a coupon.** Coupon given and quote says not ok → `409 { error: 'coupon_invalid', reason }`, no order created. The web shows the reason and re-quotes. Web may also send `expectedAmountPaise`; if it differs from `finalPaise` → `409 { error: 'price_changed', quote }`, no order. (Web already refuses Checkout on a mismatch; this makes the server refuse first.)
5. **₹0 total (100 % coupon).** Razorpay orders need ≥ 100 paise. Two honest options, **Vikram decides**:
   (a) a **free-grant path**: `finalPaise === 0` → no Razorpay order; grant the Ink in the same transaction shape as a captured payment (`provider: 'coupon'`, `CouponUsage` written, ledger row, T-436 invoice at ₹0 with the coupon as the discount line — Vikram confirms a ₹0 GST invoice is right or that no invoice is issued); response `{ status: 'granted' }`, web skips Checkout. Correct, ~1 extra day.
   (b) **cap every coupon at price − ₹1**: `discountPaise = Math.min(discountPaise, originalPaise - 100)`; validate shows ₹1 and order charges ₹1; admin UI says "coupons cannot make an item free". Trivial, slightly odd for the user.
   Either way display equals charge. Until Vikram rules, the ticket builds 1–4 and blocks a ₹0 quote with `409 coupon_invalid` ("This coupon cannot be applied to this item") so nothing is charged wrongly.
6. **Usage counting.** `CouponUsage` + `uses` increment stay on payment capture (webhook), as today. A race where two buyers take the last use between order and capture is accepted: money was taken, Ink is granted, the overshoot is logged at warn with coupon code and count (no PII). Not worth a reservation table.
7. **Tests:** quote table (percent/fixed/100 %/expired/used-up/wrong plan/per-user limit); order 409s for `coupon_invalid` and `price_changed`; validate and order return byte-identical amounts for every row of the table.

Files: new `topup-quote.service.ts` + test, `coupon.routes.ts`, `billing.routes.ts`, coupon admin validation. Billing only. Blocking before `main`.
