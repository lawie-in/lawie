# T-146 — Magistrate bail comes out with its court and its applicant

| Field          | Value                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft. MUST FIX before go-live                                                         |
| Owner          | Vishal (build), Anushka (tests on develop before GTM)                                                   |
| Mode           | Fix, full chain                                                                                         |
| Status         | Ready for Vishal                                                                                        |
| Depends on     | None                                                                                                    |
| Branch         | fix/t-146-magistrate-bail-court-and-applicant                                                           |
| Legal sign-off | Not needed if the fix stays in code outside the legal-content paths. If it needs an edit to a rule pack (`config/document-rules/`), `intake-brief.ts` or another listed path: BLOCKED for Ajay, with the exact diff |
| Created        | 2026-10-07                                                                                              |
| Source         | Anushka's run 2, 7 Oct 2026, finding 1 (scenario 9)                                                     |

## Goal

A bail application before a Magistrate names the court and the client the advocate gave, everywhere the document needs them.

## What Anushka found

- Chose Bihar, Chief Judicial Magistrate, "CJM Court, Patna"; gave name, father, age and jail. Draft: "IN THE COURT OF _____", applicant blank in cause title, "TO, THE HON'BLE _____,", prayer, verification and "Place: _____". 19 blanks; the page said "5 blanks to fill".
- Checks said: Unfilled placeholder "{courtDesignation}" in section "cause_title". Please provide this field... There is no such field for the user.

## Likely cause (Priya, from a grep, not reproduced)

- `bail_before_magistrate.json` cause title uses `{courtDesignation}`, `{caseNomenclature}`, `{applicant}`, `{state}`. The engine fills snake_case keys (`court_designation`, `applicant_name`, `case_nomenclature`; see `template-engine.service.ts` ~line 550). `{court_designation}` is also blank, so the brief's court and applicant may not reach this template's context at all.
- Court data exists: `courts/indian-courts.json`, `bihar_cjm_patna`, designation "IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA". Confirm the cause before changing anything.

## Acceptance criteria (Priya, 7 Oct 2026)

1. Anushka's scenario (bail matter naming CJM Court, Patna; name, father, age, jail given), run with a stubbed model: heading reads "IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA" (once, not "IN THE COURT OF IN THE COURT OF"); the applicant's name is in the cause title, the prayer and the verification; the verification carries the father's name, age and jail given; "Place:" reads Patna.
2. Same result for JMFC Court, Patna.
3. No check message ever asks the user to provide a field that the user is never asked for. A system-owned placeholder left unfilled is a failed test, not a user message.
4. The "blanks to fill" count on the result page equals the number of blanks in the draft text.
5. A unit test renders every document rule's fixed parts (cause title, prayer, verification) with a full context and lists any placeholder the engine cannot fill. This ticket fixes the bail-before-Magistrate ones; any others go in the report, not fixed here.
6. One real-model run of the scenario at the end, if the session has a model key; otherwise say it was not run.

## Out of scope

- Facts added or dropped (T-147), case law (T-148), party labels for UP/Delhi (T-149).
- Rewording the checks panel in plain words generally (T-142).
- Raw court codes on screen (run 2, minor).
- The Ink charged for this document (T-137).
