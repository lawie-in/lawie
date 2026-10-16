# Quality re-run: regular bail with the fact ledger on (Anushka, 16 Oct 2026, 21:22-21:27 IST)

Verdict: FAIL (bail flow only; run 4's other results stand). One tab, one draft, Ink 31 to 29, document 6ad24921f6dbe58fccc23311, 0 revisions. All names and facts are made up. Artifact: https://claude.ai/artifact/CkeJQk5i8FCgCsn2zW1cY8 (summarised by Priya).

## The three questions

- Confirm on the first click: YES.
- Bail-bonds "No" stays selected: NOT TESTABLE. The regular bail flow never asks it (it is in the default bail flow). Needs a default bail run.
- Ledger on/off on the generation record: NOT VISIBLE to her (the draft page shows Type, Court, Status, Version, Created only). From behaviour it looks ON: the brief filled fields from the description and marked them "Please check". To confirm: read the generation row for the document id above (Vishal).

## What she entered (exact, for the repro)

Description, word for word:

> Regular bail before the Sessions Court, Patna. My client Ramesh Kumar Yadav (34, son of Suresh Yadav, resident of Mohalla Kadamkuan, Patna) was arrested on 20 September 2026 in FIR No. 412/2026 of Kadamkuan Police Station under BNS 318(4) and BNS 316(2), and BNS 318(4) again. He is in judicial custody at Beur Central Jail since 21 September 2026. Complainant Manoj Sinha alleges Ramesh took Rs. 4,50,000 for a land deal and did not return it. Grounds for bail: (1) the dispute is purely civil, a failed land sale agreement dated 2 March 2025; (2) the entire evidence is documentary and already seized by police, so no tampering is possible; (3) he has an elderly mother aged 72 who depends on him. Earlier bail applications: None. The applicant has never been accused in any other case.

Answers: Round 1: Full Name Ramesh Kumar Yadav; Earlier bail applications None; In custody since 21/09/2026; FIR Number 412/2026; Sections BNS 318(4), BNS 316(2), BNS 318(4) (one per line). Round 2: Police Station "Kadamkuan Police Station, Patna"; In custody Yes (judicial custody); Father Suresh Yadav; Brief facts and Grounds left empty. "Answer 2 more questions" (Brief facts, Grounds): skipped. Brief: State Bihar; Court type Sessions Court; Court "District & Sessions Court, Patna"; law choice BNSS and BSA (nothing pre-selected); other fields as read.

## Pass

Title, para 1 and prayer cite Section 483 BNSS 2023. Address, age, antecedents, dependants and brief facts are read into the brief. Duplicate 318(4) gone. No invented facts. Check finding "Missing part: date of FIR" is true.

## Fail (tickets)

1. Seven facts asked again in the rounds (name, in custody since, FIR number, sections, police station, custody status, father's name): same as run 4 although the brief reads them. T-480 was closed as config on a golden fixture that does not model the question rounds. See T-498. The brief's "Still unknown" list still names Age, Address, Brief Facts, Grounds though filled (T-498).
2. Raw `{{MISSING: date of FIR}}` printed in para 2 and prayer (a); expected "[To be confirmed: date of FIR]" and highlighted. T-499.
3. Para 10 garbled: "elderly mother aged 72 who depends on him depend on the applicant." Para 8 lists one ground only; the civil-dispute point sits alone as para 9; the mother is not argued as a ground; para 6 fragment "The criminal antecedents of the applicant are: never been accused in any other case."; "Police Station Kadamkuan Police Station" repeats. T-500.
4. Blank count says 6, she sees 3: fixed by T-483 (200af48e); re-check after deploy.

Which build did she test? Unknown: ask the founder what develop was at (T-480 merged 558123f8 and T-483 200af48e are on develop_staging only until he merges).
