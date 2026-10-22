# T-560: Sweep: cancel the unpaid checkout and adopt the paid orphan

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Full chain (billing) |
| Status | To do. After T-542/T-558. Not blocking main unless Arjun says so. Priya, 22 Oct 2026 |
| Source | T-542/T-558 reviewer should-fix; Arjun ruled the stop-gap (409 plus a /subscribe-level test) goes in T-542, the fuller fix here |

A rare path where a user could pay twice while a paid subscription sits unadopted: T-542 answers 409 as the stop-gap. The full fix: the reconcile sweep cancels the unpaid checkout and adopts the paid orphan, so the user ends with exactly one live subscription and one charge. Razorpay mocked; tests for the paid-orphan and the unpaid-checkout cases; refunds, if any, are Vikram's call.

## Added from T-542/T-558 round 2 (Shashank, 22 Oct 2026)
1. `subscription-reconcile-sweep.service.ts:90` counts `{kind:'live', paidOrphanNotAdopted:true}` under `adoptedLive`, so a scan that left a paid orphan unadopted shows as "adopted live" in the sweep counts. Only the log count is wrong; count it separately.
2. When the blocking checkout is not in the Razorpay scan list, it stays payable at Razorpay while the paid orphan is blocked. Subscribe never hands out its link, but a user with the old checkout page still open could pay it. The fuller fix (cancel the unpaid checkout, adopt the paid orphan) closes this; T-560 must cover it explicitly with a test.
