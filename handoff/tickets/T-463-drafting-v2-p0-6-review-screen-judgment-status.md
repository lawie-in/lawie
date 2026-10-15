# T-463: Drafting v2 phase 0 (P0-6): Review screen: judgment status per paragraph

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-6, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

Ajay sets judgment status per paragraph and as-of dates; approve creates a new version.

Services: web admin; drafting.

## Gate

Rajesh design for the review screen

## Acceptance criteria

See the Arjun section below.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. Admin review screen per Rajesh's design: for a source in `review`, list its passages (paged), and for a judgment source let the reviewer set `status` (`good_law|distinguished|overruled|referred|unknown`) per paragraph range with `verifiedBy` (the admin user) and `verifiedAt`; for a statute source set `asOfFrom` (required) and `asOfTo` (optional) on the version.
2. Routes: `GET /admin/library/sources/:id/passages?page=`, `PATCH /admin/library/judgments/:id/status` (body: `{paraFrom, paraTo, status, note}`), `PATCH /admin/library/source-versions/:id/dates`. Admin auth; every write logged with user id.
3. `approve` (T-461) refuses with 409 `review_incomplete` unless: every judgment in the version has a status other than `unknown` on at least one paragraph range, and every statute version has `asOfFrom`. Unknown is allowed to remain on individual paragraphs — those paragraphs are simply never retrievable (T-460 filter).
4. Overruling is an edge too: setting `overruled` with a `byJudgmentId` writes an `authority_edges` row `kind: 'overrules'` from that judgment; the reviewer may leave `byJudgmentId` empty.
5. Role: only users with the admin role may review; the ticket records Ajay (or who he names) as the reviewer in practice — D8.
6. Tests: approve gate matrix; status write creates the edge; dates validation (`asOfTo ≥ asOfFrom`); page bounds.
7. Out of scope: bulk status import (citator feed — later, D5).
