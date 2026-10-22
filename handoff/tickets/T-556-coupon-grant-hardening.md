# T-556: Coupon free-grant hardening (from the T-540 review)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Full chain (billing, auth for item 4) |
| Status | To do. Item 1 BEFORE the switch `feature.coupon_free_grant` goes on. Priya, 22 Oct 2026 |
| Source | T-540 reviewer; Shashank's report |

1. **Before the switch goes on:** the free-grant path re-checks the "100% needs maxUses + maxUsesPerUser" rule, so an existing unlimited 100% coupon cannot be given away.
2. Thread the `claimToken` through grant steps 3 and 4 (theoretical double grant if one attempt stalls more than 120 s).
3. `validate-coupon` has no try/catch: a DB error hangs the request. Add error handling that returns a clean error.
4. Account erase: add the `coupon_grant` reason to its table (rows are kept today).

Acceptance: tests for each; item 1 test proves an unlimited 100% coupon is refused.
