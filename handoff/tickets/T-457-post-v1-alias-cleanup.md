# T-457: post-v1 cleanup: remove the T-451 and T-382 read-time aliases

| Field  | Value |
| ------ | ----- |
| Status | Parked for after v1. Not started. Priya, 15 Oct 2026 |
| Owner  | Lead (build), Arjun (rules) |
| Mode   | Small fix |

## Source

Arjun, 15 Oct 2026, T-451 ruling: old names are read through a time-limited alias, never migrated, and each alias carries the comment `// T-451 alias, remove in the post-v1 cleanup`. This ticket is that cleanup list. Kunal listed the aliases on 15 Oct.

## What goes (T-451, Kunal)

- `FIELD_ALIASES`, `REPLACED_FIELD_ALIAS_KEYS`, `OPTION_VALUE_ALIASES` (for quashing_528_bnss, gpa and joint_development_agreement), and the `applyFieldAliases` packId handling in apps/drafting/src/services/rule-pack.service.ts.
- The two `applyFieldAliases` calls in apps/drafting/src/routes/documents.routes.ts (preflight and generate).
- The t451 alias tests.
- Aliased old names: `bhajan_lal_categories_invoked`, `*_bhajan_lal_cat_N`, `yes_flag_suraj_lamp_warning`, `suraj_lamp_disclaimer`, `yes_general_gpa_with_suraj_lamp_flag`.
- T-382's alias (find it by the same comment; confirm with Arjun).

## When

After v1 is live and a week of drafts has passed with no old-name hits. Arjun picks the date. Before removal, check saved drafts for any old name left.

## Acceptance criteria

1. No alias code or alias test remains; grep for the old names finds nothing outside handoff/ and legal records.
2. Drafting tests and golden set green.

## Arjun (15 Oct 2026, 12:40 UTC)

- T-382's alias is in scope: `advocate_enrolment` → `advocate_enrollment`, in the shared alias map in `rule-pack.service.ts`, applied in `readFormInputs`. It predates the `// T-451 alias` comment; find it by the map.
- Date: **14 days after the T-403 release to `main`**, on condition that the last 7 of those days show zero old-name hits in saved drafts (one aggregate over `Document.formInputs` for the old names — counts only, no content in messages). A hit pushes the date by a week; look again.

## Added 16 Oct 2026: T-478 clause-id alias

T-478 (Tanvi) renames the certiorari clause id to jurisdiction_clause and keeps the old id as an alias in rule-pack.service.ts, marked "// T-478 alias, remove in the post-v1 cleanup". Remove it in this cleanup on the same date rule (14 days after T-403 release, last 7 days zero old-name hits).

## Added 16 Oct 2026 (Priya)

T-489's read-time alias `statutory_duty` to `statute_invoked` in mandamus.json (Ajay f68d5592) is also removed in this cleanup, with a comment `// T-489 alias, remove in the post-v1 cleanup`.
