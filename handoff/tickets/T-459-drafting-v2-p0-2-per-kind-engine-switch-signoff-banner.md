# T-459: Drafting v2 phase 0 (P0-2): Per-kind engine switch and signOff banner (D10)

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-2, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

An unsigned kind renders with a banner, not blocked (D10). Per-kind switch between the legacy and the new engine.

Services: drafting; web (banner).

## Gate

Rajesh design for the banner

## Acceptance criteria

See the Arjun section below.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. `Kind.engine` is honoured in the drafting request path: `legacy` → today's code path untouched; `compiler` → returns 501 `engine_not_available` until phase 1 lands (no stub drafting). Default and all seeded rows stay `legacy`.
2. `PATCH /admin/kinds/:key` (admin auth) may set `engine` and `signOff` only; every change writes an ops log line with admin user id, old and new value. No other field is writable.
3. `signOff: 'banner'` → every draft of that kind carries a banner, in the draft response payload (`warnings[]` entry `kind_unsigned`) and rendered in the web draft view per Rajesh's design. Banner text is fixed in the ticket by Ajay (legal wording is his); the design decides placement.
4. `signOff: 'approved'` → no banner. Switching a kind to `banner` takes effect on the next draft request (60 s settings cache is acceptable).
5. Tests: engine dispatch for both values; 501 for `compiler`; banner present/absent in the payload; PATCH rejects other fields; web test for the banner rendering.
6. Out of scope: any compiler stage, part-type signing UI.
