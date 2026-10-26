# T-592: Return path after paying for a subscription (no callback_url)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (follow-up to T-583; UI-visible, flow change, not visual: one line from Rajesh is enough, no Figma) |
| Owner  | Arjun (design), a lead (build; web, maybe billing) |
| Mode   | Full chain (web; billing only if the subscribe response lacks the subscription id) |
| Status | To do (tomorrow, not tonight; decided by Arjun). Raised by Priya from Shashank's T-583 finding, 26 Oct 2026. Priya |
| Source | Shashank's report on T-583 |

## Problem
T-583 removes `callback_url` from `razorpay.subscriptions.create` because live Razorpay refuses it. The ticket said `/dashboard/payment/success` is not a page. That was wrong: it is a page (apps/web/src/app/dashboard/payment/success/page.tsx, T-509/T-525). Razorpay's callback sent the payer there. The page polls `/status` for up to 2 minutes, refreshes the session so the JWT carries the paid plan, fires `notifyCreditsChanged`, shows "Welcome to Lawie {tier}", then goes to `/dashboard`. Without the callback, a payer stays on Razorpay's hosted page and the app shows the paid plan only after their next normal token refresh. Money and plan state are correct (activation is webhook-driven); the experience is not.

## Acceptance criteria
1. DECIDED by Arjun, 26 Oct 2026: no Razorpay-side redirect (hosted subscription pages take none). Do it the way top-up already works: web opens Checkout.js with `subscription_id` instead of `window.location = shortUrl`; `handler` calls `router.push('/dashboard/payment/success')` so the existing poll and JWT refresh run unchanged; `ondismiss` stays on the plan page with no error. Keep `shortUrl` as the fallback if Checkout.js fails to load. Verify billing already returns the subscription id with `shortUrl`; if not, add it to the response.
2. After paying, the user lands in the app with the paid plan visible without logging out or waiting for a token refresh.
3. The success page and its comment are reused, reworded or retired to match the chosen path. Any wording change is signed by Ajay.
4. Tests; web (and billing if touched) tests and build green.

## Files
Claimed by Priya when a lead takes it, after Arjun's decision.
