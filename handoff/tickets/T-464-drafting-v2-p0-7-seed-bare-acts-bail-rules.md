# T-464: Drafting v2 phase 0 (P0-7): Seed: Bare Acts and bail-family rules

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-7, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

Bare Acts BNS, BNSS, BSA and the bail-family rules from official sources, loaded through the same upload path.

Services: content; drafting.

## Gate

Ajay sign-off (legal content)

## Acceptance criteria

See the Arjun section below.

## Branch (founder, 15 Oct 2026)

v2 work lives on `develop_staging_v2`, cut from `develop_staging` at bafe88d3. Cut this ticket's branch from `develop_staging_v2` and merge back into `develop_staging_v2`. Never into `develop_staging` or `develop`. Only the founder merges `develop_staging_v2` anywhere.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. Load, through T-461's upload path and T-462's worker, the Bharatiya Nyaya Sanhita 2023, Bharatiya Nagarik Suraksha Sanhita 2023 and Bharatiya Sakshya Adhiniyam 2023 from the official gazette text (India Code / eGazette), plus the bail-family rules the bail kinds cite today (`apps/drafting` court-rules fixtures tell the developer which). Class `statute` / `rules`, `displayPolicy: quote`, licence `government_open`.
2. Acceptance is Ajay's: he spot-checks ≥ 20 sections per Act against the gazette text (byte-exact), sets `asOfFrom` (1 Jul 2024 for the three Sanhitas) and approves each version. The ticket is done when all sources are `live` with his name on `approvedBy`.
3. `law_mappings` seeded for the IPC→BNS, CrPC→BNSS and IEA→BSA renumbering tables from the official comparative tables; Ajay signs the mapping file (committed under `apps/drafting/seeds/law-mappings/`, legal content path — add it to `.claude/docs/legal-content-paths.md`).
4. No model, no retrieval change, no drafting change in this ticket. Content only; the lead's crew runs the loads against the develop DB with the founder's read-write credentials in the environment, never in a ticket.
5. Tests: the mapping seed file validates (every row references an existing provision once the Acts are live) — a script, run by the tester, with output pasted in the report.
