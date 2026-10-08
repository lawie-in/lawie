# T-158(a) — No " / " in party labels: labour court, tribunal, DRT, NCLT, IBC application

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Vishal (build), Ajay (signs any string not given below, and the golden diff), Anushka (tests develop after merge) |
| Mode           | Fix, full chain (developer + tester + reviewer + Ajay). Legal content. Merge to develop per founder's 8 Oct rule |
| Status         | Merged to develop (PR #72), 8 Oct. Anushka tests on develop. |
| Size           | M (1–2 days; NCLT matter-type switch is the bulk) |
| Depends on     | T-157 (PR #64, merged). Cut from origin/develop (cb3bda5) |
| Branch         | fix/t-158-slash-labels |
| Legal sign-off | AJ-2026-10-08-T158-A1 (labour_court, tribunal_generic, family_court) and AJ-2026-10-08-T157-A2 (DRT, NCLT, ibc_application.json:17), both in `scratchpad/ajay-signoff-2026-10-08.md`. Any string not written out below, and any golden snapshot that changes: BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-08 |
| Source         | T-157 deferrals (AJ-2026-10-08-T157-A2), AJ-2026-10-08-T158-A1 |

## Problem

T-157 removed " / " either-or lines from state and court lines but left party labels that print both options: "Workman / Applicant", "Respondent / Counter-Party", "APPLICANT BANK / FINANCIAL INSTITUTION", "PETITIONER / APPLICANT", "Corporate Debtor / Respondent". The advocate must pick one by hand before filing. On NCLT, "Corporate Debtor" (IBC s.3(8)) is wrong on a Companies Act petition.

## User

Advocate drafting for a Labour Court, a tribunal, a DRT or an NCLT.

## Solution

Replace each slash label with one signed label. NCLT labels depend on matter type: IBC vs Companies Act.

## Acceptance criteria

1. `labour_court.json` `party_designation`, exactly: `petitioner` = `Applicant`, `respondent` = `Opposite Party`, `applicant` = `Applicant`, `complainant` = `Complainant`, `counter_party` = `Opposite Party`. `state` unchanged.
2. `tribunal_generic.json` `party_designation.counter_party` = `Respondent`.
3. `family_court.json` `party_designation.state` unchanged. New test: no renderer ever prints `family_court.state` (render a family-court draft and assert the string "Not applicable (civil / personal law proceedings)" is absent from the output).
4. `drt.json`: cause title `... APPLICANT` / `... DEFENDANT`; line 18 `applicant` = `Applicant`; line 40 verification text names the "Applicant" (no "Bank / Financial Institution") and signature line `APPLICANT`. The exact new line-40 string is not in A2: developer writes it, Ajay signs it before merge.
5. `nclt.json` (lines 14, 16, 17, 39): IBC matters `... APPLICANT` / `... CORPORATE DEBTOR`; Companies Act matters `... PETITIONER` / `... RESPONDENT`. Label chosen by matter type in code. Report how matter type is read, and what prints when it is unknown (propose a visible blank, not a guess; Ajay signs). The exact verification text is not in A2: developer writes it, Ajay signs.
6. `document-rules/ibc_application.json:17`: `... Corporate Debtor / Respondent` becomes `... Corporate Debtor`.
7. `t157-state-line-and-court-lines.test.ts:202-219` (and the DRT/NCLT entries just above): pinned strings updated to the new values; entries now slash-free are removed from the allow-list, not re-pinned. `up_district` / `delhi_district` entries untouched (T-149).
8. Not changed: `description` fields (line 3) and `notes` lines (drt.json 52, 55; nclt.json 49 and others). Internal text, Ajay ruled the slashes there are fine.
9. Golden snapshots: if any change, do not update: stop and send the diff to Ajay. Tester never auto-updates.
10. Full drafting suite green; report counts.

## Out of scope

- Labour s.33A complaint: body prints "Complainant" but `cause_title_format` hardcodes APPLICANT. Do not change the title here (T-173).
- T-158(b): labels for revisions, complaints, appeals and either-party applications. Waits for Ajay's label table.
- The default `'the above-named Applicant/Petitioner'` in `annexures.service.ts` ~L476.
- `up_district` / `delhi_district` civil/criminal pairs (resolved at render by T-149).

## What Ajay must sign

- Nothing for AC 1, 2, 3, 6 if built exactly as written.
- DRT line-40 verification string (AC 4).
- NCLT verification string(s) and the unknown-matter-type output (AC 5).
- Any golden diff (AC 9).
- PR body cites AJ-2026-10-08-T158-A1 and AJ-2026-10-08-T157-A2. Anushka's packet: one labour, one DRT, one NCLT IBC and one NCLT Companies Act draft, cause title visible.

## Files (expected)

`apps/drafting/src/config/court-rules/labour_court.json`, `tribunal_generic.json`, `drt.json`, `nclt.json`, `apps/drafting/src/config/document-rules/ibc_application.json`, the NCLT label switch (wherever party labels are resolved at render; developer names it), `apps/drafting/src/__tests__/t157-state-line-and-court-lines.test.ts`, one new test file. T-171 edits `high_court_generic.json` and `prompt-assembler.ts`; no expected overlap.
