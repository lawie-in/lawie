# T-668b — "Not known (…)" counts as a non-answer; doubled "the" fixed

Status: merged b1cd4f64, released v1.2.4 (main bcb5771). Anushka 5c FAIL on the declaration plaint → T-668c, strike 2: Arjun writes the exact fix (two-strike rule).

## Acceptance criteria
1. Ajay AJ-668-M5/M5b/M5d/M5e: a party-name value that equals a non-answer, or begins with one as a whole word followed by a boundary, is a non-answer. This applies in every pack, including the O.39 party checks. Relief and restraint stay exact. It never matches inside a word or a real name ("Nilesh", "Nagendra", "Not Known Traders", "Na. Muthukumar").
2. A declaration plaint with "Defendant: Not known (a person claiming…)" blocks Confirm on the brief and form, before any Ink.
3. M5a: partyLabel drops one leading "the". The signed override is "Add the name of the person or authority this is against or addressed to, to continue."
4. If the ledger-given check is exact-match, it uses the same predicate.
5. Ajay byte-checks before merge.

## Mode
Small fix (drafting + web mirror), legal content.
