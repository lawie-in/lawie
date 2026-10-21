# T-526: Billing subscribe follow-ups, second batch (from T-518 review)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design for item 2), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | Merged into develop_staging c27d2874 (21 Oct 2026); CI 859 green. Follow-ups: T-527 and T-529-billing hygiene (see below). Priya |

## Items (in order)
1. A `subscriptions.create` timeout returns 500 and the 500 body leaks `err.message` (billing.routes.ts). The body must be a fixed, safe message; the detail goes to the log only.
2. A stored different-plan row that Razorpay has lost gets 503 every time. A cancel "not found" should count as ended (needs Arjun's ruling).
3. Take the budget clock from the lock's `createdAt`.
4. Reword the `BILLING_TERMINAL_STATUSES` comment.
5. `isRazorpayNotFound` should require HTTP 400 for the description match.

## Acceptance criteria
1. No error response from the subscribe route contains a provider or internal error message; tests assert it.
2. A lost-at-Razorpay stale row no longer blocks a new checkout.
3. Items 3 to 5 fixed or recorded as accepted by Arjun; billing tests green, Razorpay mocked.

## Arjun (21 Oct 2026) — two calls before the developer starts (Shashank)

**Item 2 — row lost at Razorpay:** both paths, stale and lapsed (T-444c). In `cancelNowAtRazorpay`, a strict `isRazorpayNotFound` on the cancel *or* on the follow-up fetch means "already ended": guarded local cancel, then create, one `warn` with the sub id only. Strict means HTTP 404, or 400 whose description names the id as not existing (item 5); an auth or 5xx error is never "not found".

**Item 1 — create timeout with unknown outcome:** (a). `Promise.race` does not abort the HTTP call, so Razorpay may still create the sub.
- 503 with the fixed body `{ error: 'try_again' }`; `err.message` never reaches the client.
- Keep the lock row; let the TTL expire it. The user sees 409 in-progress for up to ~60 s, which is the price of not creating a second sub.
- `error` log with userId + marker `create_timeout_unknown_outcome`, Sentry warning, so ops can reconcile.
- Webhook side, same ticket: a `subscription.*` event whose sub id has no local row → `reportUnknownSub` (error log + Sentry, ids only), no silent drop. That is how a late create surfaces.
- **T-527 (Priya posts):** reconcile before create — look the customer's subscriptions up at Razorpay (by customer id / `notes.userId`), adopt a live one we have no row for instead of creating again. Bigger change, own ticket, after T-526.

**Items 3–5:** as the reviewer said — budget clock from the lock's `createdAt`, reworded comment, `isRazorpayNotFound` requires 400 for the description match. Billing only.

## Arjun (21 Oct 2026) — environments at Razorpay (ops question from the T-526 review)

Today there is one deployed box (develop, lawie.in) and no prod. It runs Razorpay **test mode** keys. Razorpay separates test and live completely: different key pairs (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`), different plan ids, and webhooks configured per mode — a test-mode webhook never fires for a live subscription and vice versa. So the two environments can never see each other's subscriptions as long as:

1. prod runs **live** keys, live plan ids (`RAZORPAY_PLAN_*`) and its own webhook with its own `RAZORPAY_WEBHOOK_SECRET`, registered in live mode at the prod host; develop keeps test keys and a webhook registered in test mode at the develop host. Two webhook URLs, two secrets, two modes. Never the same secret in both.
2. the webhook route verifies the signature with the environment's own secret before anything else (already the case); a foreign-mode event fails the signature and is rejected at the door, so `reportUnknownSub` cannot fire on it.
3. `reportUnknownSub` stays **report-only** — it never cancels, never writes. Wrong cancels are impossible from it by design.

Before `main` (founder's checklist, no code): live key pair and live plan ids in the prod environment's secrets; live-mode webhook registered for the prod URL with a fresh secret; test-mode webhook left pointing at develop. Secrets are added by the founder in the hosting environment, never in a ticket or chat. Add a startup guard in T-527: refuse to boot when `NODE_ENV=production` and `RAZORPAY_KEY_ID` starts with `rzp_test_`, and when not production and it starts with `rzp_live_`.
