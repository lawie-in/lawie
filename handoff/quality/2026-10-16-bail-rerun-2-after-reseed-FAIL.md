# Quality re-run 2: regular bail after update and reseed (Anushka, 16 Oct 2026, 22:32-22:36 IST)

Verdict: FAIL (bail flow only; run 4's other results stand). Document 6ad25932c259f66ad3049271, started 22:32:28 IST, finished 22:35:31 IST, 0 revisions, Ink 29 to 27. Same description and answers as handoff/quality/2026-10-16-bail-rerun-ledger-on-FAIL.md. Artifact: https://claude.ai/artifact/CkeJQk5i8FCgCsn2zW1cY8 (summarised by Priya). Ledger on/off is not visible to her; behaviour looks like ledger ON.

## Fixed since the first re-run (21:22, older build)

- Facts asked again: 7 down to 2. Name, FIR number, police station, custody status and father's name are no longer asked; the brief fills them "Please check". Still asked: "In custody since" and "Sections Charged in FIR". New questions (FIR date, investigation stage; sex, medical, named in FIR, recovery, cooperation) are fair.
- "Still unknown" list: gone.
- Blank count: page 3, hers 3 (was 6 / 3).
- Confirm on the first click: yes.
- Law, name, father, age, address, custody, dates, sections (318(4) once) correct; no invented facts.

## Still failing

1. Raw `{{MISSING: date of FIR}}` in para 2 and prayer (a) (T-499).
2. Grounds: 1 of 3 argued; civil dispute alone as para 9; mother not argued (T-500).
3. Para 10: "elderly mother aged 72 who depends on him depend on the applicant." (T-500).
4. Para 6: "The criminal antecedents of the applicant are: never been accused in any other case." (T-500).
5. Para 2: "registered at Police Station Kadamkuan Police Station"; the prayer now reads "PS Kadamkuan" (T-500, para 2 only).
6. Two facts still asked: "In custody since" (21/09/2026 in the description) and "Sections Charged in FIR" (T-498, narrowed).

Not testable: bail-bonds "No" (the regular bail flow never asks it; default bail does).
