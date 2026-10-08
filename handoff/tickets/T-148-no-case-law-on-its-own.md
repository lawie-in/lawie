# T-148 — No case law is added to a draft on its own

| Field          | Value                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Phase          | 1 — Describe and draft. MUST FIX before go-live                                                        |
| Owner          | Ajay (signs the text edits), Vishal (build), Anushka (tests on develop before GTM)                     |
| Mode           | Fix, full chain                                                                                        |
| Status         | Ready for Vishal, once Ajay signs criteria 1 and 2                                                     |
| Depends on     | Ajay's signed text for the rule-pack and prompt edits                                                  |
| Branch         | fix/t-148-no-case-law-on-its-own                                                                       |
| Legal sign-off | Needed: `config/document-rules/` and `services/drafter.prompts.ts` are legal content                   |
| Created        | 2026-10-07                                                                                             |
| Source         | Anushka's run 2, 7 Oct 2026, finding 3 (scenario 9)                                                    |

## What Anushka found

Magistrate bail para 5: "Applying the well-established triple-test laid down in Sushila Aggarwal ... (2020) 5 SCC 1 and P. Chidambaram ... (2019) 9 SCC 24". She gave no judgment. Both are, as she reads them, anticipatory-bail rulings and not the source of the triple test. Nothing on the page said a citation was added.

## Cause (Priya, from a grep)

The Drafter prompt allows a judgment "only if INSTRUCTIONS names it". The rule pack is part of INSTRUCTIONS, and it names them:
- `bail_before_magistrate.json` lines ~115, 176, 177 ("Cite Sushila Aggarwal ...", "Cite P. Chidambaram ...").
- `bail_anticipatory.json` line ~293 (Sushila Aggarwal).
- Also naming judgments: `plaint_injunction.json`, `temporary_injunction_o39.json`, `joint_development_agreement.json`.

## Acceptance criteria (Priya, 7 Oct 2026)

1. The two bail packs no longer tell the model to cite any judgment. The grounds (flight risk, tampering, witnesses) stay as reasoning, with "[Authority — add if relied upon]" where a citation would go. Wording per Ajay's signed note.
2. Drafter rule: a judgment may be cited only if the advocate named it in the description or the brief. Rule-pack text is never a source of a citation. Wording per Ajay's signed note.
3. After drafting, any case citation in the draft (a "v." party name with SCC, AIR, SCR, SCC OnLine, Cri LJ or a year-volume-page) that the advocate did not give is replaced by "[Authority — add if relied upon]", and the result page says in plain words: "We removed a case citation you did not give. Add your own authority if you rely on one."
4. A citation the advocate did give is kept exactly as given.
5. Unit tests with a stubbed model cover criteria 3 and 4. One real-model run of Anushka's CJM Patna bail scenario at the end, if the session has a model key: no judgment named. Otherwise say it was not run.
6. The three non-bail packs in "Cause": edited only if Ajay signs them in the same note; otherwise listed in the report. Criterion 3 protects them either way.

## Out of scope

- Adding a verified case-law library or citation helper.
- Facts added or dropped (T-147). Section numbers (T-135).
