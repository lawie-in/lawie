# T-592: Return path after paying for a subscription (no callback_url)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (follow-up to T-583; UI-visible, Rajesh gate if the screen changes) |
| Owner  | Arjun (design), a lead (build; web, maybe billing) |
| Mode   | Full chain (web; billing if the status route changes) |
| Status | To do. Raised by Priya from Shashank's T-583 finding, 26 Oct 2026. Priya |
| Source | Shashank's report on T-583 |

## Problem
T-583 removes `callback_url` from `razorpay.subscriptions.create` because live Razorpay refuses it. The ticket said `/dashboard/payment/success` is not a page. That was wrong: it is a page (apps/web/src/app/dashboard/payment/success/page.tsx, T-509/T-525). Razorpay's callback sent the payer there. The page polls `/status` for up to 2 minutes, refreshes the session so the JWT carries the paid plan, fires `notifyCreditsChanged`, shows "Welcome to Lawie {tier}", then goes to `/dashboard`. Without the callback, a payer stays on Razorpay's hosted page and the app shows the paid plan only after their next normal token refresh. Money and plan state are correct (activation is webhook-driven); the experience is not.

## Acceptance criteria
1. Arjun decides: a redirect configured on the Razorpay side (if the dashboard allows it for subscription links), or web polling `/status` after it opens `shortUrl` (for example, a "Waiting for your payment" screen the user returns to).
2. After paying, the user lands in the app with the paid plan visible without logging out or waiting for a token refresh.
3. The success page and its comment are reused, reworded or retired to match the chosen path. Any wording change is signed by Ajay.
4. Tests; web (and billing if touched) tests and build green.

## Files
Claimed by Priya when a lead takes it, after Arjun's decision.
