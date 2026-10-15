# T-466: Drafting v2 phase 0 (P0-9): Yearly plan as 12 scheduled grants

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-9, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

Yearly plan becomes 12 scheduled grants; remove drip and carry (yearly-drip.ts) after the migration.

Services: billing; packages/shared.

## Gate

After P0-8; packages/shared is held by one lead at a time

## Acceptance criteria

See the Arjun section below.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. Depends on T-465 being merged. A yearly subscription creates 12 scheduled grants (`scheduled_grants` collection: `subscriptionId`, `dueAt`, `ink`, `grantedAt?`, `lotId?`), one per month from `paidThrough` backwards to the start; a daily job grants each due one as a lot expiring at the next due date. Monthly plans create one grant per cycle on payment.
2. Cancel: no new scheduled grants are created and ungranted ones past `paidThrough` are deleted; already granted lots keep their expiry (Vikram's rule: cancel keeps Ink to `paidThrough`).
3. `packages/shared/src/billing/yearly-drip.ts` and every caller are removed; the T-444 status guards it contained move to the subscription service unchanged, with their tests carried over (T-444 rulings 1–8 remain in force).
4. Migration for existing yearly subscribers: create the remaining scheduled grants from today to `paidThrough`; past months are not back-granted (they were dripped already). Script idempotent with dry-run; founder runs it.
5. Tests: 12 grants on create; daily job grants exactly the due ones once; cancel behaviour; T-444 regression suite still green; drip code gone (grep test).
