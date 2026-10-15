# T-467: Drafting v2 phase 0 (P0-10): FactSource 'lookup' and CaseLookupProvider spike

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-10, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

FactSource 'lookup' + CaseLookupProvider interface + eCourtsIndia adapter spike, bail kind only, confirm-gated.

Services: packages/shared; web; drafting.

## Gate

The founder's eCourtsIndia account and API key as an environment secret; Ajay reads the vendor terms first

## Acceptance criteria

See the Arjun section below.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. `packages/shared/src/types/fact-ledger.ts`: `FactSource` gains `'lookup'`; a fact with that source carries `lookup: {provider: string, ref: string, fetchedAt: string, fieldPath: string}`. Web mirror in `apps/web/src/components/intake/briefTypes.ts` updated identically.
2. `apps/drafting/src/services/case-lookup/`: interface `CaseLookupProvider { lookupByCnr(cnr: string): Promise<CaseParticulars | null> }` with `CaseParticulars` = `{cnr, court, caseNumber, caseType, filingDate, parties: {petitioners[], respondents[]}, advocates[], stage, nextHearing, judge}`; one adapter `ecourtsindia` (Bearer token from env `ECOURTSINDIA_API_KEY`, 10 s timeout, one retry on 5xx, no retry on 4xx), one `mock` adapter for tests. Provider chosen by env `CASE_LOOKUP_PROVIDER=mock|ecourtsindia|off` (default `off`).
3. Intake: in round 1 of the brief flow, for the bail kinds only, an optional CNR field; on submit the server calls the provider and returns the particulars as `suggested` facts (`source: 'lookup'`, `confirmed: false`). Nothing enters the ledger until the advocate confirms each (same confirm gate as "Read from page n"); the drafter never sees unconfirmed facts.
4. Guards: ≤ 2 lookups per draft, ≤ 20 per user per day; provider failure or timeout → the brief continues without suggestions (fail open, a note in the UI); the raw provider response is not stored — only the mapped fields; logs carry a lookup id and status, never the CNR or names.
5. Spike report (the deliverable, in the ticket): 10 real CNRs the founder supplies, match rate per field against what the advocate typed, latency, credits used, and the vendor terms summary from Ajay. The feature stays behind `off` until the founder reads the report.
6. Tests: adapter against recorded fixtures (no live calls in CI); confirm gate; caps; provider `off` path unchanged for non-bail kinds.
7. Gate recorded by Priya stands: the key as an environment secret, Ajay's read of the terms before the spike runs live.
