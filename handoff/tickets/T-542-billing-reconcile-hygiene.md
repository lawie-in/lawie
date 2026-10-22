# T-542: Billing reconcile hygiene (from T-527's review)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design), a billing lead (build) |
| Mode   | Small fix (billing); after T-536; NOT blocking main |
| Status | To do. Priya |
| Source | The five optional findings in T-527's last section (Arjun, 21 Oct 2026) |

## Acceptance criteria
Fix or record as accepted (Arjun) each of the five optional findings listed in the last section of `handoff/tickets/T-527-reconcile-before-create-at-razorpay.md`. Billing tests green, Razorpay mocked.

## Added from T-527's delta review (21 Oct 2026)
- `RAZORPAY_KEY_GUARD` fails open on a typo; validate with `z.enum` (T-533 loader).
- Remove the unused `razorpayKeyModeWarning` export.
- `.env.example` wording omits the ALLOW warn case.

## Arjun (22 Oct 2026) — rulings per item (Shashank, after Explore; refs subscription.service.ts @ 20a5f1f4)

1. **Approve.** Before cancelling a row-less orphan checkout (≈:852 and ≈:918): `checkReconcileBudget`, then `subscriptions.fetch`; live now → into `liveOrphans`; fetch fails → 503, marker kept. Never cancel a paid sub off a stale list snapshot.
2. **Approve.** Extract `applySubscriptionEvent()`; run it inside the lock on the adopted path; known subs unchanged.
3. **(a).** Add `lastLockCreatedAt` (`$max`) to `SubscriptionReconcile`; `to = min(now, lastLockCreatedAt + 24 h)`. Past the bound: `logger.error` + Sentry `billing.subscription.reconcile_marker_stale` (user id only). The model file joins the claim.
4. **Approve.** Pass `lockedAt` into `resolvePostCreateDuplicate`; past `CREATE_LOCK_BUDGET_MS` skip the cancel (report + marker), skip the link fetch, return 409 `existsError`. No 503: the new sub exists at Razorpay.
5. **(a).** `SubscriptionAdoptBusyError` like `GrantClaimBusyError`: warn, 500, no Sentry; Razorpay's retry and the sweep cover it. One Sentry event only if the same sub id is busy on 5 consecutive retries (count in the warn log, ids only).
6. **Same treatment.** `RAZORPAY_KEY_GUARD: z.enum(['strict','']).optional()` and `RAZORPAY_ALLOW_TEST_KEYS: z.enum(['true','']).optional()`; any other value refuses to boot in every env. Develop sets neither.
7. **Approve.** Remove the unused export; delete the test that only referenced it.
8. **Approve** the example-file wording as stated.

## T-558 (recorded here; mirrored in T-558)
9. **Approve both.** Second-insert failure (≈:1551) and any non-live-conflict insert error (≈:1521): `writeReconcileMarker`, rethrow.
10. **(b).** On a live-index refusal where the conflicting row is a checkout, re-run `runLocalChecks()` (≈:1451): same-plan reuse with link, different-plan cancel. Least new code, same behaviour as the normal path.

Mode: full chain, Razorpay mocked, no new env vars. Go.
