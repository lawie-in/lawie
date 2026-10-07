# T-139 — Do not ask again for what I already gave

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                                        |
| Owner      | Priya (scope), Ajay (the questions), Vishal (build), Anushka (verdict)                                        |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-139-do-not-ask-for-what-was-given                                                                       |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

The questions cover only what the description did not say.

## What Anushka found

- **Major.** "Please give: Police Station." in all four criminal matters, though she wrote "Saraidhela PS", "PS Kaiserbagh", "Civil Lines thana Gaya", "Kankarbagh PS". The brief then showed the police station under "Still unknown" until she retyped it.
- "Please give: Sections Charged in FIR." after "under sections 303(2) and 317(2) BNS". "Please give: Date of dishonour." after "came back unpaid on 15 September 2026". "Please give: Date of FIR." after "dated 30 Sept 2026".
- "Please give: Amount in Words." for Rs 2,40,000, then left blank three times in the draft.
- "379 IPC" on a 2026 FIR was carried with "Please check" and no note that the IPC cannot apply.
- Minor: "Round 1 of 2" on both rounds; "Answer 9 more questions" after a round that said 5; "Required" on fields that can be left blank.

## Acceptance criteria (draft, Priya to confirm)

- Her five descriptions are run again and none of the facts she gave is asked for.
- An amount in figures is never asked for again in words.
- An old-code section on a matter dated after 1 July 2024 gets a plain note.
- Anushka tests again from the start and her verdict is PASS.

## Notes

- Touches the Reception prompt and the brief rules (legal-content paths). Ajay's sign-off is needed.
