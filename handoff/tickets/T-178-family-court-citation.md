# T-178 — family_court.json cites Rule 16 for scandalous pleadings and has the right courtType

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal, after Ajay's wording (AJ-2026-10-08-T178) |
| Mode           | Fix, full chain (developer + tester + reviewer + Ajay). Edits a legal-content path (`config/court-rules/`). Must land before v1 GTM (AJ-2026-10-08-T174, FU-3) |
| Status         | Building, 8 Oct. |
| Size           | XS (under half a day, once Ajay's strings are in) |
| Depends on     | T-176 (merged, PR #76). Cut from origin/develop (e8e3730) |
| Branch         | fix/t-178-family-court-citation |
| Legal sign-off | Ajay supplies and signs every string this ticket writes (AJ-2026-10-08-T178), and any golden diff (AC 5), before merge. No string is written until his ruling is in the handoff packet. If it is missing: BLOCKED for Ajay |
| Created        | 2026-10-08 |
| Source         | FU-3 of Ajay's ruling AJ-2026-10-08-T174 ("Extra" line) |

## Problem

`apps/drafting/src/config/court-rules/family_court.json` has two errors Ajay found during T-174.

- **Wrong rule cited.** `localRules` (line 56) says to avoid scandalous allegations "(Order VI Rule 17 CPC principles)". Order VI Rule 17 is amendment of pleadings. Striking out scandalous matter is Order VI Rule 16. This line feeds the drafting prompt, so a wrong citation can reach a draft.
- **Wrong court type.** `courtType` (line 11) is "tribunal". A family court is not a tribunal. `_meta.applies_to_court_type` (line 7) also says "tribunal".

## User

District court advocate in Bihar, Jharkhand, UP or Delhi filing a family matter. A wrong CPC citation in a pleading is an error the opposite side or the court can point to.

## Solution

- Replace six lines with Ajay's strings, verbatim, per AJ-2026-10-08-T178 section B (all must-fix-now):
  - line 6: `_meta.last_updated`
  - line 7: `_meta.applies_to_court_type`
  - line 11: `courtType`
  - line 53: `localRules` matrimonial territorial jurisdiction line (s.19 HMA)
  - line 54: `localRules` religion / personal law line (no caste)
  - line 56: `localRules` scandalous pleadings line (Order VI Rule 16)
- Nothing else in the file changes.

## Acceptance criteria

1. **localRules lines 53, 54, 56.** Each line is Ajay's string per AJ-2026-10-08-T178 section B, applied character for character, at its current position in `localRules`:
   - line 53: the s.19 HMA territorial jurisdiction line.
   - line 54: the religion / personal law line, which asks for no caste statement.
   - line 56: the scandalous pleadings line, citing Order VI Rule 16 CPC. "Order VI Rule 17" no longer appears in the file.
   Tested: a test reads the loaded rule and checks each of the three exact signed lines.
2. **courtType and `_meta` (lines 6, 7, 11).** `courtType` is `"family_court"`, `_meta.applies_to_court_type` is `"family_court"` and `_meta.last_updated` is `"2026-10-08"`, each applied verbatim per AJ-2026-10-08-T178 section B. "tribunal" no longer appears as `courtType` or `_meta.applies_to_court_type`. Tested.
3. **Strings come from Ajay.** No string in AC 1–2 is written, reworded or re-punctuated by the developer. The PR body pastes the before and after of each changed line next to the AJ-2026-10-08-T178 text, so Ajay can check them.
4. **No other routing or output changes.** The diff to `family_court.json` is only the lines in AC 1–2. Family court routing (`resolveCourtRule`, T-174) and headings (T-176, both paths) are unchanged. The developer lists every reader of `courtType` (for example `annexures.service.ts` Annexure F, `court-rules.test.ts` type list) and confirms each still behaves the same; any that would change output is BLOCKED for Ajay with the exact change. Existing `t174-*`, `t176-*`, `court-rules`, `post-processor`, `template-engine` and `prompt-assembler` tests pass unedited.
5. **Golden snapshots.** Run `court-rules-golden` and report pass or fail. If any snapshot changes, stop, do not update it, and send the diff to Ajay. Read `.claude/docs/golden-snapshots.md` first.
6. **Full suite green.** The full drafting suite passes, with counts reported. `@lawie/shared` is built first.

## Out of scope

- Family court case numbering per state, "M.J. No." (T-177, FU-2).
- Delhi family court seat and complex names (T-179, FU-T176-1).
- Any other `localRules` line, citation or key in `family_court.json` beyond lines 6, 7, 11, 53, 54 and 56, including `_meta.validated_by`. In particular, the AJ-2026-10-08-T178 section C items (lines 13, 49, 50 follow-ups; 24–27 already FU-2) are not touched here.
- Any other court-rules file.
- `courtType` of the `family_court_*` entries in `indian-courts.json` and the `Court.model.ts` enum (Ajay's ruling section A: separate ticket for Arjun/Priya).

## What Ajay signs

The citation line (AC 1), the `courtType` value and any `_meta` change (AC 2), and any golden diff (AC 5). Anushka's verdict is still required before merge.

## Files (expected)

`apps/drafting/src/config/court-rules/family_court.json` (lines 6, 7, 11, 53, 54, 56, per AJ-2026-10-08-T178 section B), one new test file (`apps/drafting/src/__tests__/t178-*.test.ts`).
