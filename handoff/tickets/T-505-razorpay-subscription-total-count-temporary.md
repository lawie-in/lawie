# T-505: Razorpay subscription create: send a total_count until perpetual subscriptions are enabled (TEMPORARY)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Vishal (build), Arjun (billing sign-off), Vikram (heads-up) |
| Mode   | Full chain (billing service) |
| Status | Merged into develop_staging 9175f500, CI green (run 813), 17 Oct. Anushka to test on develop. Priya |
| Source | Founder, testing Razorpay locally: Razorpay rejects a subscription with no total_count (perpetual subscriptions are not enabled on the account; ticket raised with Razorpay) |

## Problem

`apps/billing/src/services/subscription.service.ts` (the `razorpay.subscriptions.create` call, about line 361) sends no `total_count` ("subscriptions auto-renew until cancelled", per SCRUM-102). The Razorpay account does not allow perpetual subscriptions yet, so creating a subscription fails.

## What to build (the founder gave this exact change)

In that one call, send `total_count` and replace the "No total_count" comment with the one below. Razorpay's maximum is 100 years either way:

```ts
try {
  sub = await withRazorpayTimeout<any>(
    'create',
    (razorpay.subscriptions.create as any)({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      // TEMPORARY: perpetual subscriptions (no total_count, per SCRUM-102) are not enabled on
      // the Razorpay account yet (ticket raised). Until then, use Razorpay's max count, which
      // is 100 years either way. Remove once Razorpay enables perpetual subscriptions.
      total_count: planSku.cycle === 'yearly' ? 100 : 1200,
      notes: { userId, email, planId: planSku.id, tier: planSku.tier, cycle: planSku.cycle },
    }),
  );
} catch (err) {
  if (err instanceof RazorpayTimeoutError) {
    logger.warn({ userId }, 'billing.subscription.create_timeout');
  }
  throw err;
}
```

## Acceptance criteria

1. Monthly plans send `total_count: 1200`; yearly plans send `total_count: 100`.
2. The TEMPORARY comment is present exactly as above, so it is found and removed later.
3. The rest of the create call (timeout wrapper, notes, error handling) is unchanged.
4. A test in the billing suite asserts both values (monthly and yearly) on the `subscriptions.create` payload.
5. No other file changes. Nothing else in the subscribe flow changes (T-444 and T-444c behaviour untouched).

## Follow-up (post-v1, do not build now)

When Razorpay enables perpetual subscriptions, remove `total_count` and the TEMPORARY comment (add to the post-v1 cleanup list, T-435).

## Notes

- The founder asked for this change; it is not a design decision. Arjun confirms there is no side effect on renewals, lapse handling or the webhook (T-444) from a finite count.
- The Razorpay-side ticket is the founder's.
