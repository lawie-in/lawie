# T-583: billing — drop callback_url from razorpay subscriptions.create (PROD HOTFIX)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (live prod bug) |
| Owner  | Arjun (raised), Shashank (build) |
| Mode   | Full chain (billing). Reviewer pass is mandatory (money path) |
| Status | Merged into develop_staging (b42dbf51, CI 1024 green), 26 Oct 2026. Redeploy billing only, no env change. Follow-up T-592 (return path). Priya |
| Source | Arjun's prod smoke, 26 Oct 2026 |

## Problem
On prod (Razorpay LIVE) `POST /api/billing/subscribe` returns 500. Razorpay replies `400 BAD_REQUEST_ERROR "callback_url is/are not required and should not be sent"`. Test mode tolerated the field; live refuses it. No user can subscribe to Solo/Pro on lawie.in until this ships. The web redirects to the returned shortUrl and activation is webhook-driven; `/dashboard/payment/success` is not a page, so nothing depended on the callback.

## Acceptance criteria
1. The `razorpay.subscriptions.create` payload has no `callback_url` (apps/billing/src/services/subscription.service.ts ~line 1932). Nothing else changes in the payload.
2. apps/billing/src/__tests__/subscription.service.test.ts:80-95: flip the callback_url assertion to `expect(payload).not.toHaveProperty('callback_url')`; keep the total_count and notes assertions; rename the test title.
3. billing.routes.ts `Failed to create subscription` log carries `rzpStatus` (statusCode) and `rzpCode` (error.code) when the thrown value has them. Never the description or any other field (it can carry user data). Test for both shapes (Error and the SDK's non-Error rejection).
4. Billing tests and build green.

## Files
apps/billing/src/services/subscription.service.ts (the callback_url line only), apps/billing/src/routes/billing.routes.ts (the create-failure log only), apps/billing/src/__tests__/subscription.service.test.ts, a billing.routes test for the log fields. Nothing else.

## Merge note
Freeze on `develop_staging` is in force. Build and review on the branch, push the branch only, and send READY. No merge into `develop_staging` until Priya calls the slot (needs the founder's one named exception). Must be in the next release cut to `main`. The founder may apply a temporary patch on the prod box; this ticket is the real fix.
