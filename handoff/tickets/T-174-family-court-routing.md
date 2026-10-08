# T-174 — A family court draft uses the family court rule, not the district court rule

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal |
| Mode           | Fix, full chain (developer + tester + reviewer + Ajay). Changes printed legal text. Merge to develop per founder's 8 Oct rule |
| Status         | PR open to develop (PR #73), 8 Oct. Ajay approved with conditions (AJ-2026-10-08-T174). |
| Size           | S (half day) |
| Depends on     | None. Cut from origin/develop (fce5cc5) |
| Branch         | fix/t-174-family-court-routing |
| Legal sign-off | `prompt-assembler.ts` is not a legal-content path, but this change prints `family_court.json` text to launch-state users on this path for the first time. Ajay signs the before/after lines (AC 5) and any golden diff (AC 7) before merge. Any edit under a legal-content path (`config/court-rules/`, `config/courts/`, `config/document-rules/` ...): BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | T-171 out of scope ("`prompt-assembler.ts:163` sending `family_court` to `district_court_generic`") |

## Problem

`resolveCourtRule` in `apps/drafting/src/services/prompt-assembler.ts` (~L356, `typeMapping`) maps `family_court` to `district_court_generic`, although `config/court-rules/family_court.json` exists. The courts-list path already loads `family_court` (for example the Tis Hazari entry in `indian-courts.json`, `formattingRulesRef: family_court`). So the same court gets a different heading, case number and party labels depending on how the advocate chose the court.

## User

District court advocate in Bihar, Jharkhand, UP or Delhi drafting a family matter: maintenance (s.144 BNSS), divorce, custody.

## Solution

Map `family_court` to `family_court` in `resolveCourtRule`, ahead of the sessions/JMFC name checks so a word in the name does not pull a criminal rule. Pin it with tests.

## Acceptance criteria

1. `resolveCourtRule('family_court', <any name>)` returns `family_court` and never `district_court_generic`. Tested with "Family Court", "Family Court, Patna", "Principal Judge, Family Court, Lucknow", "Family Court, Ranchi" and an empty name.
2. If the name contains "sessions" or "JMFC", a family court still gets `family_court`, not a sessions or magistrate rule. Tested with "Family Court, Sessions Division Patna".
3. The `t171-high-court-fallback.test.ts` case "consumer and family still use district_court_generic" is split in two. Family now expects `family_court`. Consumer stays pinned to `district_court_generic`, unchanged.
4. No regression: district, sessions, JMFC, High Court and Supreme Court routing are unchanged. The existing `prompt-assembler.test.ts` and `t171-*` tests pass unedited, apart from the case in AC 3.
5. On a rendered family court draft, typed path, for Patna, Lucknow, Ranchi and Delhi:
   - The cause title shows `... PETITIONER` / `... RESPONDENT`.
   - The string "Not applicable (civil / personal law proceedings)" is absent. This is the same check as T-158 AC 3, applied to this path.
   - The PR body pastes the exact heading line and case-number line for each city, for Ajay.
6. Parity: for Tis Hazari Delhi, picked from the list and typed give the same rule. If the heading lines differ, report both. Do not reconcile them in this ticket.
7. Golden snapshots: run `court-rules-golden` and report pass or fail. If any snapshot changes, stop, do not update it, and send the diff to Ajay.
8. The full drafting suite is green, with counts reported. `@lawie/shared` is built first.

## Out of scope

- Consumer forum to `consumer_commission_generic`. It has the same kind of fault (that file exists too). Log it as a follow-up ticket.
- Any edit to `family_court.json` or `indian-courts.json`. If Ajay rejects a printed string, it becomes its own legal-content ticket.
- Bail templates being offered for family courts. That is the intake match path.
- T-155, T-173.

## What Ajay signs

The heading and case-number lines from AC 5, any golden diff, and whether "M.J. No." is right for Bihar, UP, Jharkhand and Delhi. It is in the rule today but has not been checked for these states.

## Files (expected)

`apps/drafting/src/services/prompt-assembler.ts` (`resolveCourtRule`, ~L334–363), `apps/drafting/src/__tests__/t171-high-court-fallback.test.ts` (the AC 3 case only), one new test file (`apps/drafting/src/__tests__/t174-*.test.ts`). Reads `config/court-rules/family_court.json` and `config/courts/indian-courts.json`; does not edit them.
