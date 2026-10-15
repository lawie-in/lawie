# T-458: Drafting v2 phase 0 (P0-1): Grammar registry: part types and kinds

| Field  | Value |
| ------ | ----- |
| Status | Blocked: after T-403. Nobody starts before v1 is on main. Priya, 15 Oct 2026 |
| Owner  | Lead to be assigned after T-403; Arjun (architecture and acceptance criteria) |
| Mode   | Full chain |

## Source

ADR-026 "Drafting v2: the Law Library and the Document Compiler", approved by the founder 15 Oct 2026 (D1 to D10). Phase 0 ticket P0-1, section 11 of handoff/design/drafting-v2/00-adr-026-drafting-v2.md.

## Scope

part_types and kinds collections + boot sync; the 92 templates become kind rows with engine: legacy; no behaviour change.

Services: drafting.

## Gate

none

## Acceptance criteria

See the Arjun section below.

## Architecture reference

handoff/design/drafting-v2/ (ADR-026, HLD, system design, DB design, LLD).

## Arjun (15 Oct 2026) — acceptance criteria

1. Two new Mongoose models in `apps/drafting`: `PartType` (`key`, `name`, `schema` (JSON schema of the part's inputs), `verifierRules[]`, `signedBy`, `signedAt`) and `Kind` (`key`, `family`, `title`, `partTypeKeys[]`, `forumFormatKey`, `engine: 'legacy'|'compiler'`, `signOff: 'approved'|'banner'`, `legacyTemplateId`). Unique indexes on `key`.
2. A boot sync (same pattern as `runBootSync`/`syncTemplateRegistry`) upserts one `Kind` row per existing template (92 today), `engine: 'legacy'`, `signOff: 'approved'`, `legacyTemplateId` = the template's id, `partTypeKeys` = []. Idempotent: a second boot changes nothing; a hash on the source row decides whether to `$set`.
3. No behaviour change: every existing drafting route reads templates exactly as before; the golden set and all drafting tests pass unchanged. `Kind` is read-only data in this ticket — nothing in the request path depends on it yet.
4. `GET /admin/kinds` (admin auth, same guard as the other admin routes) lists kinds with `engine` and `signOff`; no write route in this ticket.
5. `part_types` is seeded with the first batch from `01-hld.md` (the ~40 signed names) as rows with `signedBy: null` — unsigned placeholders; signing is T-459's concern.
6. Tests: boot sync idempotence; 92 rows after sync on a seeded template set; admin list route auth. Coverage thresholds unchanged.
7. Out of scope: engine switch (T-459), any compiler code, template file changes.
