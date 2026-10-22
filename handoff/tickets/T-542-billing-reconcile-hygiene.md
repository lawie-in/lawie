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

## Arjun (22 Oct 2026, before the tester) — four points

A. **OK.** An orphan that turns live after `liveOrphans` was processed is never cancelled: report `reconcile_live_orphan_not_adopted` (ids only), the existing row stays the answer, the sweep or ops picks it up. Rule: a paid sub is cancelled only on an explicit decision, never as a side effect of ordering.
B. **Yes.** Strict not-found on the pre-cancel fetch = already ended: skip the cancel, carry on. 503 stays for timeout/5xx/auth.
C. **Yes.** Delete filter matches `_id`, `lockCreatedAt` and `lastLockCreatedAt ≤ this scan's bound`; a marker bumped mid-scan survives for the next scan.
D. **Leave it, report it.** Do not cancel `adoptTarget` off a stale decision; log `reconcile_adopt_target_superseded` (ids only). Same rule as A.

FYI accepted: per-process busy count; the over-budget path's 2 s link fetch (57 s worst case inside the 60 s TTL).

## Arjun (22 Oct 2026, after the tester) — adopt target

**(b).** Fetch before adopting the same-plan target too, same helper, same budget. Live now → adopt as a live orphan, 409 `subscription_exists`. Strict not-found → skip. Other failure → 503, marker kept. "Razorpay's live status wins" holds for the adopt path as much as the cancel path; one more call on a path that already made several is cheap, and a paid user getting a checkout link is the kind of thing Anushka would file. Tests: paid-between-list-and-adopt → 409, no row with `created`. Fresh tester run on the diff, then the reviewer.

## Arjun (22 Oct 2026, after the reviewer's PASS) — paid orphan vs checkout row

**(a).** Reconcile carries a flag on the `'live'` outcome when a paid orphan was reported-not-adopted; `createSubscriptionLocked` then answers **409 `subscription_exists`** instead of re-running `runLocalChecks`. AC10 stays for the plain checkout conflict. Plus the `/subscribe`-level test. A paid sub sitting unadopted while we hand out a new checkout link is a double-charge path, and closing those is the entire reason T-536 and T-558 exist; "rare" is not a reason to leave one open. The right long-term answer — cancel the unpaid local checkout and adopt the paid orphan — is more than ten lines and goes on the T-542 follow-up list for the sweep; the 409 plus the Sentry event is enough for ops today. developer → tester → fresh reviewer; this is a should-fix on a pass, not a failed round.
