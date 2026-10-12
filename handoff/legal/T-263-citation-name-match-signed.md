# T-263: how a case name is matched and removed (signed rule)

Ajay (CLO), 12 Oct 2026 IST. Rule for `apps/drafting/src/services/citation-check.ts`. Builds on T-148 (AJ-2026-10-07-T148 and (b)); everything in T-148 not named here is unchanged.

## What is wrong, and what is not

**The initial is not the cause.** I ran the current code on names that begin with an initial, with and without full stops, with `v.`, `vs.` and `versus`: all are blanked in full when the party names are plain ("M. Ravindran v. Intelligence Officer (2021) 2 SCC 485" is gone, name and reporter). The ticket's diagnosis is wrong; tests for initials stay, but the fix is not about initials.

**The real fault:** a party name may not contain a comma, an ampersand, an `@`, a lower-case word such as "alias", or a line break, so the whole name fails to match and only the reporter is removed. The name then stays in the draft beside the blank. Failing shapes (invented names, run on the current code; output is what the draft keeps):

| Input | Kept in the draft (wrong) |
|---|---|
| Mohan Rao v. Union of India, Ministry of Law and Justice (2016) 7 SCC 221 | the whole name |
| Mohan Rao v. State of Bihar & Ors. (2019) 4 SCC 12 | the whole name |
| Ravi Nair alias Ravindran @ Ravi v. State of Kerala (2019) 4 SCC 12 | "Ravi Nair alias Ravindran @" |
| Latha Devi (I) v. Home Secretary, State of Kerala, (1980) 1 SCC 81 | the whole name |
| R. Mohan v. Tata Steel Ltd., Jamshedpur, 2010 SCC OnLine SC 1 | the whole name |
| K.M. Rao v. State of Kerala, Home Dept., (2019) 4 SCC 12 | the whole name |
| Dr. S. Rao vs. Smt. P. Devi, Collector (2019) 4 SCC 12 | the whole name |
| Mohan Rao v. Union of India, Ministry of Law and Justice⏎(2016) 7 SCC 221 | the whole name |
| M. Ravindran versus Intelligence Officer, DRI, 2021 SCC OnLine SC 1 | the whole name |

## The rule (AJ-2026-10-12-T263)

1. **Anchor on the versus word.** When a reporter has `v.`, `v`, `vs.` or `versus` before it in the same sentence, the citation is the case name plus the reporter. The case name runs from the start of the first party to the start of the reporter. Nothing in between is treated as outside the name.
2. **The second party is everything between the versus word and the reporter**: commas, ampersands, `@`, brackets, digits, "alias", "and Anr.", "and Ors.", "Others", "etc.", titles, a line break. A comma or space just before the reporter is removed with it. Text after the reporter stays.
3. **The first party is found by walking back from the versus word** over name tokens: capitalised words, initials, titles (`Dr.`, `Smt.`, `Shri`, `Sri`, `Md.`, `Mr.`, `Mrs.`, `Ms.`, `Kum.`), brackets such as "(I)" or "(NCT of Delhi)", and the joining words "of", "and", "the", "for", "through", "alias", "@", "&", "Anr.", "Ors.". It stops at the first of: the end of the previous sentence, a semicolon, a colon, an opening quotation mark, a line start, a lead word from the existing LEAD_WORD list ("See", "In", "Accordingly" and the rest), or ten tokens.
4. **An initial or a title is part of the name, never a sentence end.** A full stop after one or two capital letters ("M.", "K.M.", "K. M.", "A.K.") or after a title above does not end the sentence. A full stop after a word of three or more letters does.
5. **Cannot tell where party 1 begins: cut back.** Take the nearest of the previous sentence end or ten tokens before the versus word. A blank that is too wide is a safe failure; a name left beside a blank is not.
6. **What the advocate gave is untouched.** T-148 (b) stays: the whole "A v. B" stays only if the advocate wrote it (compared after the same lower-casing and punctuation removal as today); otherwise only a party the advocate named is kept and the rest is blanked. A reporter the advocate gave is kept exactly as written.
7. **No versus word, reporter present**: unchanged. **Versus word, no reporter**: unchanged (the Drafter's rule 7 covers it). I am not widening either in this ticket.

## Tests the lead adds (invented names only)

- Every row of the table above: the name and the reporter are both gone and exactly one blank stands in their place.
- Initials: "M. Rao", "M Rao", "K.M. Rao", "K. M. Rao", "A.K. Rao", each with `v.`, `vs.`, `vs`, `versus`.
- Titles: "Dr.", "Smt.", "Md." on either side.
- A sentence ending before the name: "The Court held so. Mohan Rao v. Union of India, Home Dept. (2016) 7 SCC 221 is cited." keeps "The Court held so." and "is cited."
- A lead word: "See Mohan Rao v. ... " keeps "See".
- The advocate gave the name, not the reporter: the name stays, the reporter is blanked (T-148 (b)).
- The advocate gave both: kept exactly as written.
- Property check on every test: no `v.`, `vs.` or `versus` stands within the same sentence directly before a blank unless the advocate wrote that name.

## Marks

| Item | Mark |
|---|---|
| Rule points 1 to 7 | Approved |
| Ticket diagnosis ("initial") | Corrected above; update the ticket |
| Golden snapshots that move | List them for me before merge |
| Quality | Anushka tests on develop before prod |
