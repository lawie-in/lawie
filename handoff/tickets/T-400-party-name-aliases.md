# T-400 — Cause titles and verifications print the party names already in the form

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) + Ajay (checks the printed text) |
| Mode   | Small fix, with a reviewer (legal content output) |
| Status | To do. Not assigned. Found by Kunal's T-395 scan, 13 Oct 2026. v1 packs first |
| Source | T-395 developer report (the full table is there) |

## Problem

About 40 cause-title and verification tokens have no alias, so they print `_____` even though the form already has the field. Some examples:
- party tokens next to an existing `<party>_name` field: `{petitioner}` (~15 packs), `{respondent}` (~15), `{plaintiff}`/`{defendant}` (6 plaint packs, hidden in v1), `{complainant}`, `{aggrievedPerson}`, `{petitioner1/2}`, `{client}`;
- verification fields: surrender_application `{address}` and `{occupation}`; interim_bail `{address}`; bail_cancellation `{petitioner}` and `{address}`; itat_appeal and rera/mact name tokens.

## Acceptance criteria

1. Each token reads its existing form field through one alias in the template engine, and on the legacy post-processor path too.
2. v1 packs (the four bail packs and their bail family, plus the s.138 notice and complaint) come first. Plaint packs can follow.
3. A test renders each changed pack and finds no `_____` where the form had a value.
4. Ajay sees the before and after for the cause titles that change.
