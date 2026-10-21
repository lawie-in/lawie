# T-537: Scale-out readiness

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Arjun (design: `handoff/ops/prod-pipeline-and-secrets.md`, last section), a billing/auth lead (build) |
| Mode   | Full chain (auth, billing) |
| Status | To do, after T-534. BLOCKING before main, not the v1 batch. Priya |
| Source | Arjun, 21 Oct 2026; the founder's autoscaling ask is ruled "design now, buy on triggers" |

## Acceptance criteria
1. Single-runner locks for the four in-process sweeps: auth account-erase, auth unverified-sweep, billing invoice-sweep, billing T-527 reconcile sweep. A Redis `SET NX PX` or a Mongo lease, so two instances never run the same sweep twice. Tests for lock held, expiry and release.
2. Audit every rate limit in auth for per-process memory; move any that are to Redis. List the findings in the ticket.
3. Confirm no local-disk writes (none found today) and write the finding down.
4. No infrastructure is bought by this ticket.

## Files
apps/auth and apps/billing sweep and rate-limit code, a small shared lock helper (packages/shared: held by one lead at a time, coordinate with T-534), tests.
