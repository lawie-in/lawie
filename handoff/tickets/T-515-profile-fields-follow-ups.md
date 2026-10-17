# T-515: Profile fields follow-ups (from T-507)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (design), a lead (build) |
| Mode   | Full chain (auth service) |
| Status | To do. V1.1 (Shashank's T-507 report, 17 Oct 2026). Priya |
| Source | T-507 merge body and review notes |

## Problem

T-507 shipped the profile fields API with these known gaps:

1. Three reviewer should-fix items (listed in the T-507 merge body; copy them here before starting).
2. Court ids are shape-checked but not checked against the drafting court list.
3. Profile and password changes write no AuditLog rows.
4. Users who typed a free-text bar council state before T-507 have values the new allowed list does not recognise.

## Acceptance criteria

1. The three reviewer should-fixes are done, each with a test.
2. `courtsPractisedIn` and `defaultCourt` ids are checked against the court list (a shared read, not a copy), with a clear 400 for unknown ids.
3. AuditLog rows are written for profile changes, password changes and session sign-outs: who, what field names changed, when; no field values, no personal data.
4. Old free-text bar council state values are mapped to the allowed list where unambiguous and left untouched, readable and editable, where not; no data is lost; one migration note in the ticket.
5. Tests for 2, 3 and 4; no personal data in logs.
