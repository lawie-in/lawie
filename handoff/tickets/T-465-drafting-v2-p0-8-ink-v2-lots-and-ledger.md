# T-465: Drafting v2 phase 0 (P0-8): Ink v2: lots and ledger

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-8, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

ink_lots + ink_ledger, grant, spend, refund, expiry, spend order, two-lot migration, liability report.

Services: billing; packages/shared.

## Gate

Vikram prices (D7 still open); packages/shared is held by one lead at a time

## Acceptance criteria

See the Arjun section below.

## Branch (founder, 15 Oct 2026)

v2 work lives on `develop_staging_v2`, cut from `develop_staging` at bafe88d3. Cut this ticket's branch from `develop_staging_v2` and merge back into `develop_staging_v2`. Never into `develop_staging` or `develop`. Only the founder merges `develop_staging_v2` anywhere.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. In `packages/shared/src/billing/`: pure functions `applyGrant`, `spend`, `refund`, `expireLots` over `{lots: Lot[], ledger: LedgerRow[]}` with `Lot = {id, source: 'plan'|'topup'|'promo', ink, remaining, grantedAt, expiresAt}`; spend order = earliest `expiresAt` first, `topup` lots last regardless of date; `refund(draftRunId)` returns Ink to the same lots it was taken from and is a no-op if a refund row for that `draftRunId` already exists; `spend` is a no-op (returns `already_spent`) if a spend row for the same `draftRunId` exists.
2. In `apps/billing`: collections `ink_lots` and `ink_ledger` (one row per movement: `grant|spend|refund|expire`, `lotId`, `delta`, `draftRunId?`, `at`, `reason`); `InkService` wraps the shared functions in a Mongo transaction per call; balance = Σ `remaining` of unexpired lots, computed, never stored.
3. Routes replacing today's Ink calls one-for-one (same paths the drafting service calls today; same response shape plus `lots[]`): reserve, spend, refund, balance. Reserve = a `hold` row that `spend` converts or a failure releases; holds older than 30 min are released by a scheduled job.
4. Expiry: a daily job writes one `expire` row per lot past `expiresAt` with `remaining > 0`.
5. Migration (script under `apps/billing/scripts/`, idempotent, dry-run flag): each user's current balance becomes two lots — plan-derived Ink (expires at the current period end) and top-up Ink (expires 180 days from migration); ledger row `grant` with `reason: 'migration'` per lot. Dry-run output (counts, totals) is pasted in the tester's report; the founder runs the real migration.
6. Liability report: `GET /admin/ink/liability?asOf=` returns Σ unexpired `remaining` by lot source and by plan tier — Vikram's month-end number.
7. Prices per class (S/M/L Ink cost) come from AppSettings keys `ink.class.S|M|L` (Vikram's numbers once the founder sets them, D7); the ticket ships with today's per-draft cost as `M` so behaviour is unchanged until the settings are changed.
8. Tests: shared functions (spend order incl. topup-last, idempotent spend/refund, expiry); billing transaction paths; migration dry-run on a fixture of 5 users; liability sums. packages/shared claim rules apply.

### Addendum (Arjun, 15 Oct) — class values

Vikram's D7 proposal (`handoff/finance/ink-classes-proposal-vikram.md`, 33c30895): **S = 1, M = 2, L = 5** Ink. Seed `ink.class.S|M|L` with those; the founder's confirmation is the gate before any kind is assigned `L`. Every kind row (T-458) gets `inkClass`, default `M`, the 31 one-Ink kinds `S`; nothing is `L` until Meera and Ajay re-sign the copy (Vikram's condition 2).
