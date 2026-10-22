# T-516: Retry a failed payment, and stop choosing Pro landing on a Solo checkout

| Field  | Value                                   |
| ------ | --------------------------------------- |
| Phase  | 4 — Polish and release                  |
| Owner  | Arjun (design), a billing lead (build)  |
| Mode   | Full chain (billing service, billing)   |
| Status | Merged into develop_staging 928cd933 (17 Oct 2026); sandbox check pending (founder or Vikram, Razorpay test mode). Follow-ups: T-518. Priya |
| Source | T-509 known gaps                        |

## Problem

1. A user whose plan is past_due (payment failed) sees the signed payment-failed banner but no Retry button, because `/subscribe` answers 409 `subscription_exists` and returns no link.
2. With an unfinished checkout, `/subscribe` returns that checkout's link and plan. Choosing Pro can therefore open a Solo checkout. This predates T-509.

## Acceptance criteria

1. For a past_due subscription, billing returns the live subscription's Razorpay payment link (short_url) in a defined response, for the signed-in owner only.
2. Choosing a plan while an unfinished checkout exists for a different plan never opens the other plan's checkout: the stale checkout is cancelled or replaced, and the link returned matches the plan asked for.
3. Choosing the same plan again returns the same unfinished checkout (no duplicate subscriptions).
4. No new Razorpay subscription is created while a live one exists for the user.
5. Tests for 1 to 4, Razorpay mocked. Sandbox check written in the ticket.
6. Web: once AC1 ships, a small follow-up adds the Retry button to the payment-failed banner (separate web ticket; not part of this one).

## Out of scope

Proration, plan switching rules (cancel at cycle end, then buy), refunds.

## Arjun (17 Oct 2026, evening) — two calls from Shashank before the tester runs

1. **Legacy `created` checkout with no stored planId and no plan_id/notes on the Razorpay fetch → cancel, not reuse.** AC2 says the link must match the plan asked for; a checkout whose plan we cannot prove is one we cannot hand back. Reuse would also return `planId: ''` to the client, which is a lie. Cancel inside the create lock, then create new, same path as a plan mismatch.

2. **Guard for the webhook race — keep it.** When the guarded local cancel matches nothing (a webhook moved the checkout first), re-read the live subscription before creating. If one exists: 409, and `reportCancelledPaidSub` if the checkout we cancelled turns out to have been paid. This is the one case my earlier ruling left open and it is exactly what AC4 (never a second live sub) needs. Keep it, and give it a test: webhook activates the sub between the lock and the cancel.

Still holds: never `update(plan_id)`; the two Razorpay test-mode checks stay a founder/Vikram action and READY waits on them.

## Sandbox check

**NOT RUN — no sandbox access in the dev crew. Founder/Vikram action in Razorpay test mode. Release to prod waits on both answers being recorded here.**

### Check (i): does a halted/pending sub's short_url still let the user retry payment?

1. In Razorpay test mode, create a subscription for a test plan and authenticate it with a test card that fails recurring charges. Alternatively, use the dashboard to move a test subscription to `halted` or `pending`.
2. Open that subscription's `short_url` in a browser.
3. Try to pay with a working test card.
4. Record: did the page allow payment, and did the subscription return to `active`?

What each outcome means for the code:

- YES (payment allowed, sub back to active): the 409 `shortUrl` is useful as built. Nothing to change.
- NO (page refuses payment, or the sub stays halted/pending): billing still behaves as designed, but it returns a link that will not help. The follow-up web ticket must not show Retry when payment cannot proceed. Arjun's ruling says `shortUrl` stays null and the web copy covers it. If the answer is NO, that needs a small code change to suppress the link for those states.

Result:
Date:
By:

### Check (ii): does `subscriptions.cancel(id, false)` succeed on `created` and `authenticated` subs?

1. In test mode, create a subscription through the API and do not pay it (status `created`).
2. Call `cancel(id, false)` (via the API or the dashboard).
3. Record the response and the final status of the subscription.
4. Repeat with a subscription that has been authenticated (status `authenticated`).

What each outcome means for the code:

- Both succeed: the stale-checkout path works as built.
- `created` is rejected: billing returns 503 `try_again` to a user switching plans from a fresh checkout, every time. Per Arjun, this maps to the 503 path and needs a dashboard note plus a follow-up fix.
- `authenticated` is rejected: same effect for that state. Record the exact error text.

Result:
Date:
By:
