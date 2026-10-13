# T-363: s.138 notice wording and the 30-day warning (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST. Builds on T-192 (signed lines A1–B5).

| AC | Ruling and exact text |
|---|---|
| 1 | When the T-192 check gives B2, the brief shows B2 (as signed) and asks the advocate to confirm before drafting, with a button `Continue with these dates`. The entry stays banned (T-192). |
| 2 | Dates written in words ("fifteenth September 2026", "15th Sept") may fill L4 and L5 under the T-342 rules. A date with no year is left unread and asked. |
| 3 | The notice never says the offence is complete when the cheque is issued or dishonoured. The only allowed line on liability is: `If you fail to pay the said amount within fifteen days of receipt of this notice, an offence punishable under Section 138 of the Negotiable Instruments Act, 1881 will be complete, and my client will initiate proceedings against you.` |
| 4 | The return reason is quoted only as the memo gives it (T-147c, `return_memo_reason`). "Account closed" or "account does not exist" appears only if the memo or brief says so. The payee's proprietor and address print when given, and otherwise as blanks. |

Do not add the 15-day computation or any date difference to the notice (T-192).

## Addendum 1: Shashank's four questions, 13 Oct 2026

1. **Proprietor.** I correct AC4: the proprietor who matters is the **drawer's**. A proprietorship firm is not a separate person, so the notice goes to its proprietor. The payee side is optional.
   - Drawer field: label `Name of the proprietor (if the drawer is a proprietorship firm)`. Header: `To, {drawer_proprietor}, Proprietor, {drawer_firm}, {drawer_address}`. If the firm is given and the proprietor is not, `{drawer_proprietor}` prints as a `{{MISSING: Name of the drawer's proprietor}}` blank.
   - Payee field: label `Name of the proprietor (if your client is a proprietorship firm)`. Opening: `my client, {payee_firm}, through its proprietor {payee_proprietor}`. If it is not given, the clause is left out.
2. **Demand sentence** (twin `demand_clause`), exactly, followed by the AC3 liability line: `I therefore call upon you to pay my client the said amount of Rs. {cheque_amount}, being the amount of the said cheque, within fifteen days of receipt of this notice.` Remove every other liability or "upon conviction" sentence. Add no interest, costs or fee claim unless the advocate gives it.
3. **memo_remark_other_words.** Yes, add `account does not exist`, `account did not exist` and `no such account`. The `_averments/legal_notice_s138.json` change and its new SHA land in the same commit as the T-192 pin update. I re-sign with the new SHA when I see the diff. It flows into ni_complaint_s138, which is intended.
4. **B2 confirm.** Show the signed B2 text, then two buttons: `Continue with these dates` and `Change the dates`. Nothing else above them.

## Addendum 2: round 1 points, 13 Oct 2026

1. **Proprietor header.** Option (c) for this release. Print `{drawer_proprietor}, Proprietor, {drawer_firm},` only when a proprietor is given; otherwise the plain name and address. The MISSING case in Addendum 1 waits for a "proprietorship" respondent type, which needs its own ticket and its own s.141 text from me.
2. **Paragraph count.** Change it to `Generate 4 to 6 numbered paragraphs.` and add this line to the notice body instructions, exactly: `Do not state or suggest that any offence is complete when the cheque is issued, presented or dishonoured. On liability, use only the sentence given.`
3. **_averments/legal_notice_s138.json.** I re-sign once the pushed diff shows only the three phrasings added after "account closed" and a file SHA of `f85eb9a1…64bd`.
4. **Layout.** OK: header lines end with commas, the demand and liability sentences form one paragraph, and the payee's address goes under the payee's name in "From,".

**16d3b44: approved, 13 Oct 2026.** The averments are re-signed at `f85eb9a1…64bd` (see the T-192 file). The header is option (c). The demand and liability sentences are byte-exact, with nothing after them. The paragraph limits are 4 to 6 (min_paragraphs 4, max_paragraphs 6, min_body_paragraphs 4). Dropping "for a Section 138 NI Act cheque bounce notice" from the instruction is OK, because the template already states the section. The memo placeholder is "Quote only as the memo gives it". Approved to merge once the tester is green.
