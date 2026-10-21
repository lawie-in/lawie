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

## Vikram (21 Oct 2026): ₹0 total, ruling

**Option (a), the free-grant path, with no tax invoice.** Not (b): showing ₹1 under a "100% off" coupon is a price claim Ajay would have to defend. It also turns a giveaway into a ₹1 taxable sale with its own invoice and gateway fee.

Why (GST):
- **Partial coupon (finalPaise ≥ 100):** a normal sale. The discount is given at the time of supply and shown on the invoice, so it is excluded from taxable value (CGST Act s.15(3)(a)). The T-436 invoice shows list price, a coupon discount line, taxable value, then CGST + SGST or IGST on the net. Prices are GST-inclusive, so tax is backed out of `finalPaise`, not out of the list price.
- **100% coupon (finalPaise = 0):** there is no consideration, so it is not a supply (s.7(1)(a)). Schedule I does not apply: the buyer is not a related or distinct person. No GST is due and **no tax invoice is issued**. A ₹0 "tax invoice" for a non-supply would be wrong and would sit in GSTR-1 for no reason.
- Input tax credit stays: a promotional grant is in the course of business. Revisit if coupon Ink ever passes 5% of all Ink issued in a month.

Build rules (additions to point 5a):
1. `finalPaise === 0` → no Razorpay order. Grant top-up Ink with `provider: 'coupon'`, ledger key `coupon:<couponId>:<userId>:<n>`, and write `CouponUsage`. Billing history shows "Coupon, ₹0" and no invoice link.
2. **Count the use at grant, atomically.** Point 6's accepted overshoot holds only where money was taken. A free grant must check and increment `uses` / per-user usage in one compare-and-set; a lost race returns `409 coupon_invalid`, with no grant.
3. **A 100% coupon must carry limits.** Admin creation rejects a coupon that can reach 100% unless both `maxUses` and `maxUsesPerUser` are set and non-zero. This bounds the giveaway.
4. **Sub-₹1 remainder:** if `0 < finalPaise < 100` (e.g. 99% off ₹65 = 65 paise), Razorpay refuses the order. Reduce the discount so `finalPaise = 100` (₹1) and show ₹1. Display still equals charge.
5. Log each free grant at info level with coupon code, SKU and list value in paise (no PII). I need the monthly total of list value given away for the marketing-spend line.

v2 note (not T-540): with Ink v2 lots (ADR-026), coupon Ink should be its own lot with an expiry, for example 90 days, so free Ink is not a liability with no end date. Ajay words it then.

Vikram, CFO
