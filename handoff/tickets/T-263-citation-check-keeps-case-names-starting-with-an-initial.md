# T-263 — citation-check keeps a case name that starts with an initial

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (writes the rule, signs). Lead (build). Anushka (verdict) |
| Mode           | Rule first, then build. Legal content (`citation-check.ts`, T-148) |
| Status         | Merged to `develop_staging` (4a51d23, 12 Oct 2026). Waiting for Anushka on develop |

## Problem

`citation-check.ts` removes a case citation the advocate didn't give. But a case name that starts with an initial survives:

"M. Ravindran v. Intelligence Officer … (2021) 2 SCC 485" becomes "M. Ravindran v. Intelligence Officer … [Authority — add if relied upon]".

Only the reporter reference is removed and the case name stays. Names like Uday Mohanlal Acharya or Sanjay Dutt are blanked in full. The Drafter is told not to name any judgment, and the averments ban lists M. Ravindran, so this is defence in depth. It breaks the T-148 rule all the same.

## Acceptance criteria

1. Ajay rules how a name with an initial is matched.
2. A citation like the one above is blanked in full, name and reporter.
3. Tests for names starting with an initial, with and without a full stop, and for "v." and "vs." variants.
4. Golden snapshots that move are listed for Ajay. CI green on drafting.

## Ajay's rule is signed; the diagnosis above was wrong (12 Oct 2026)

Ajay ran the current code: names starting with an initial ARE blanked. The real fault: a party name cannot contain a comma, "&", "@", "alias" or a line break, so the whole name fails to match and only the reporter is removed (for example "X v. Union of India, Ministry of Law and Justice (2016) 7 SCC 221" keeps the name).

Build exactly `handoff/legal/T-263-citation-name-match-signed.md` (commit 108a57a): the 9 failing shapes (invented names), the 7 rules (anchor on v./vs./versus; second party is everything up to the reporter; walk back for party 1; initials and titles never end a sentence; cut back wide when unsure; T-148 (b) unchanged), and the test list. Golden snapshots that move are listed for Ajay.

Acceptance criteria 1 and 2 above are replaced by this. AC3: the tests in his file. AC4 stands.

## From Vishal's Explore (12 Oct 2026), for after the usage reset

1. **Question for Ajay on rule 4.** Rule 4 says a full stop after a word of 3+ letters ends a sentence. But his own failing rows and sentence test have "Ltd.,", "Dept.,", "& Ors. (2019)" and "Home Dept. (2016) 7 SCC 221" inside the name. Read literally, the search for the versus word would stop at "Dept." and leave the name beside the blank. Vishal's proposal: inside a citation, a full stop does NOT end the sentence when (a) the word is a common abbreviation (Ltd, Pvt, Ors, Anr, Dept, Govt, Co, Corpn, Bros, etc, Hon'ble, No), or (b) the next character is "(", a digit or a comma. Otherwise rule 4 applies as written. Ajay: approve, or a different list?
2. **Claim extension (Priya: yes).** `t251-default-bail.test.ts` L633-645 is an `it.failing` "GAP: M. Ravindran v. Intelligence Officer, Directorate…" test. It fails today because of the comma, so the fix will break it; it becomes a plain `it`, and its comment (which repeats the old "initial" diagnosis) is corrected. `t148-no-case-law.test.ts` is citation-check's own test file, covered by "its tests".
3. No golden snapshot or golden-set fixture should move. `citation-check.ts` is not listed in `.claude/docs/legal-content-paths.md`, though the ticket treats it as legal: add it (Priya, below).
