# T-142 — Small faults from Anushka's first run

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Phase      | 4 — Polish                                                                                                    |
| Owner      | Priya (sort), Vishal (build), Anushka (verdict)                                                               |
| Mode       | Full chain, then the quality gate                                                                             |
| Status     | Needs scoping. Not started. Cause not traced yet                                                              |
| Depends on | None                                                                                                          |
| Branch     | fix/t-142-small-faults-from-run-1                                                                             |
| Created    | 2026-10-06                                                                                                    |
| Source     | Anushka's run 1, 6 Oct 2026, verdict FAIL. Her words are in `handoff/quality/2026-10-06-baseline-run-FAIL.md` |

## Goal

The minor findings from run 1 are each fixed or closed with a reason.

## What Anushka found

All Minor in her report:

- "You have 5free documents this month."
- The version number rises each time a draft is opened without editing (v2 to v5).
- Advocate details handled three ways: printed "Abhi" unasked, asked "What is your name?" though Settings holds it, left "[To be confirmed: advocate name]".
- Leaving the page drops an unconfirmed brief with no warning. Once the description box came back empty after Continue; she could not repeat it.
- The Section finder panel stays open across pages and covers the Ink balance. My documents shows no client name and has no search. The Templates page files most documents under "Other".
- Catalogue text on screen: "Distinct from rent_agreement.json", "Cites State of Haryana v. Bhajan Lal seven categories verbatim".
- Notice: "By Registered Post A.D. / Speed Post / UPC"; "Rs. 240000/-" where she wrote Rs 2,40,000; "together with interest, if any" added to the demand. Rent agreement card: "registration-exempt tenure". Rent agreement marks PAN and annual escalation as Required.
- For a practising advocate: "State of Jharkhand through the District Magistrate / S.P., Dhanbad" as opposite party; "Criminal Miscellaneous Case No." for a Sessions bail petition in Jharkhand; whether a jail verification or a pairokar's affidavit is the local practice.

## Acceptance criteria (draft, Priya to confirm)

- Each line above is marked fixed, or closed with the reason, in this ticket.
- Anushka tests again from the start and her verdict is PASS.
