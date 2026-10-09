# T-177 — Family court case numbers use one placeholder from family_court.json

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal, on Ajay's ruling (AJ-2026-10-09-T177) |
| Mode           | Fix, full chain (developer + tester + reviewer + Ajay). Edits legal-content paths (`config/court-rules/`, `config/courts/`, `config/document-rules/`). Must land before v1 GTM (AJ-2026-10-08-T174, FU-2) |
| Status         | Merged to develop (PR #79), 9 Oct. Anushka tests on develop. DB reseed needed (Arjun). |
| Size           | S (about a day) |
| Depends on     | T-178 (merged, PR #77). Cut from develop (03c38bb) |
| Branch         | fix/t-177-family-court-case-numbers |
| Legal sign-off | Ajay ruled the strings in AJ-2026-10-09-T177 and signs any golden diff (AC 8) before merge. The placeholder string is his, verbatim. If anything else needs a new string: BLOCKED for Ajay |
| Created        | 2026-10-09 |
| Source         | FU-2 of Ajay's ruling AJ-2026-10-08-T174; ruled in AJ-2026-10-09-T177 |

## Problem

Family court drafts print a case-number line that nobody has verified.

- **Wrong labels.** `family_court.json` `case_nomenclature` has "M.J." and "H.M.O.P." H.M.O.P. is a Tamil Nadu/Kerala label. 21 of the 22 family entries in `indian-courts.json` print "M.J. No."; one prints "H.M.O.P. No.".
- **Three sources, none right.** The value lives in the rule file, in each list entry, and in each family template's `cause_title.caseNomenclature`. The rule file is never read for family templates: the template-id to key map in `template-engine.service.ts` (now around lines 961–975; Ajay cited 693–701 on an older file) only knows bail, quashing and writ. So the list entry's string is what prints.
- **No verified values exist.** Ajay could not verify any of the 28 cells (4 states x 7 matter types) against eCourts CIS. All get the placeholder.

## User

District court advocate in Bihar, Jharkhand, UP or Delhi filing a family matter. A wrong case-type label in the cause title looks authoritative and is wrong. A clear "[To be confirmed]" line is safer: the advocate fills it in.

## Solution

- One source: `family_court.json` `case_nomenclature`, keyed by state then matter type, with a `default`. Every value is Ajay's placeholder.
- The list entries and the templates hold the same placeholder, so nothing else can print a stale label.
- The code maps the 7 family template ids to their rule keys. The rule file wins; the placeholder is the fallback.
- No state lookup yet. Every cell is the same, so the state found makes no difference to output.

The placeholder, verbatim from AJ-2026-10-09-T177:

`[To be confirmed: case type] No. _____ of {year}`

## Acceptance criteria

1. **Rule file shape.** `family_court.json` `case_nomenclature` is keyed by state, then matter type, with a `default`. Every value is `[To be confirmed: case type] No. _____ of {year}`. Keys cover all 7 family templates, including the new `divorce_mutual_consent`, `divorce_sma` and `judicial_separation`. Tested.
2. **Old labels gone.** "M.J." and "H.M.O.P." no longer appear in `family_court.json` or `indian-courts.json`. Tested.
3. **List entries.** All 22 `family_court_*` entries in `indian-courts.json` have `caseNomenclature` set to `[To be confirmed: case type] No. _____ of {current_year}`. Tested (count is 22).
4. **Templates.** The `cause_title.caseNomenclature` value in each of the 7 family templates (`divorce_hma`, `divorce_mutual_consent`, `divorce_sma`, `judicial_separation`, `rcr_petition`, `guardianship_petition`, `maintenance_bnss_144`) is the placeholder. Tested.
5. **Wiring.** `template-engine` maps each of the 7 family template ids to its `case_nomenclature` key. The rule file wins; the placeholder is the fallback. Bail, quashing and writ mapping is unchanged. Tested.
6. **No profile state.** The user's profile state is never used to pick a case-number value. Tested (a profile state that differs from the court's state does not change the line).
7. **Rendered output, list path only.** A family draft rendered from a court picked from the list shows `[To be confirmed: case type] No. _____ of <current year>`. No raw `{year}`, `{current_year}` or `[YEAR]` is left. Tested.
   - **Typed-court path: deferred, not tested here.** On that path the AI writes the case-number line, and the prompt does not carry the case nomenclature. Passing it to the prompt is out of scope for T-177 and moves to follow-up T-180.
8. **Golden snapshots.** Run `court-rules-golden` and report pass or fail. If any snapshot changes, stop, do not update it, and send the diff to Ajay. Read `.claude/docs/golden-snapshots.md` first.
9. **Suite green.** The full drafting suite passes, with counts reported. `@lawie/shared` is built first.

## Out of scope

- Verifying the real case types per state and matter type. That is FU-T177-1: a person checks the eCourts CIS case-type dropdown (or a recent cause list) for each family court, then Ajay re-rules each cell. Ajay's leads from reported orders are a checklist for that check, not values to ship.
- State lookup (from the list entry's `state` or the typed court name). It waits until the first cell is verified.
- `courtType` of the `family_court_*` entries in `indian-courts.json` (still "tribunal") and the `Court.model.ts` enum.

## Notes

- **Reseed needed. Flag to Arjun.** Changing `indian-courts.json` changes the DB seed (`scripts/seed-courts.ts`). Courts already in the DB keep "M.J. No." until a reseed. Arjun decides when and how.
- **Testing kept short.** Founder wants one test pass, about 15 minutes.

## What Ajay signs

The placeholder string is already ruled (AJ-2026-10-09-T177). He signs any golden diff (AC 8). Anushka's verdict is still required before merge.

## Files (expected)

`apps/drafting/src/config/court-rules/family_court.json`, `apps/drafting/src/config/courts/indian-courts.json` (22 entries), the 7 family templates in `apps/drafting/src/config/document-rules/`, `apps/drafting/src/services/template-engine.service.ts`, one new test file (`apps/drafting/src/__tests__/t177-*.test.ts`).
