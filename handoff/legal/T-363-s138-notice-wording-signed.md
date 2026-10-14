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

## Addendum 3, 13 Oct 2026

1. With the model-written Para 4 removed: `Generate 3 to 5 numbered paragraphs.`, with `min_paragraphs` 3, `max_paragraphs` 5 and `min_body_paragraphs` 3. This replaces the 4-to-6 line in Addendum 2. The "Do not state or suggest…" line stays.
2. Filing checklist (advocate-facing, not printed in the notice), exactly:
   - `Send the notice within 30 days of receiving the bank's return memo (Section 138, proviso (b)).`
   - `If payment is not made within 15 days of receipt of the notice, file the complaint within one month after those 15 days end (Section 142(1)(b)).`
   "Within next 30 days" goes: the Act says one month.

**Pack diff faeaafa: approved, 13 Oct 2026.** prayerTemplate is byte-exact: the demand line, then the AC3 line, with nothing after it. The memo-reason instruction and the no-offence line are in. The two proprietor fields are optional. The placeholder is "Quote only as the memo gives it". Also approved, to land with it: mandatoryClauses > dishonour_details description `Date of dishonour, reason for dishonour as the return memo gives it, bank memo reference`. No example reason may appear anywhere in this pack.

## Addendum 4 (13 Oct 2026): unanswered proprietor and drawer type

**Diff 321eb72 (`fix/t-363-proprietor-placeholder`): approved.** drawer_addressee and payee_client now treat the brief blank "[To be confirmed: …]" and the ledger blank "{{MISSING: …}}" as empty. This follows the standing rule from T-365 and T-392 that a placeholder is never a typed value. With no proprietor, the header is option (c): the firm, then its address, with no blank and no "Proprietor," line. A proprietor who is given prints as before. No signed wording changed.

Condition: the test must take the blank string from the same generator the brief and ledger paths use, not a literal copy. If a label changes, the test must go red and must not pass silently.

**ni_act_sections_ref guard: required.** Section 141 (offences by companies, including firms) applies only when the drawer is a company or firm. If respondent_type is empty or a placeholder, print `138 read with Section 142`. Never cite s.141 without knowing the drawer type. Leaving s.141 out of the notice does no harm, but citing it against an individual is wrong. Test: drawer type left as its placeholder gives no "141".

**Guard 7c441cc: approved.** An empty or placeholder drawer type prints `138 read with Section 142`.

| # | Question | Ruling |
|---|---|---|
| 1 | HUF keeps s.141? | No, not until it is verified. Whether an HUF counts as an "association of individuals" under the s.141 Explanation is **verify**. Until then, HUF prints `138 read with Section 142`. Leaving s.141 out of a notice does no harm; citing it wrongly is the risk. s.141 stays only for company and partnership firm. |
| 2 | s.141 in related_acts and relevantActs for every drawer type | Take it out unless the drawer is a company or partnership firm. Without that, the model may write vicarious-liability averments against an individual. Make it conditional on the same test as the guard. Test: individual, HUF and unknown prompts carry no "141". |
| 3 | respondent_type `"default": "individual"` | Remove the default. Drawer type is required and never guessed. "Not known" prints the blank and goes through the guard. A default silently picks the answer for the advocate. |

**Twin diff 273b703...7b8b13f: approved.**
- s.141 is cited only for the option ids `company` ("Company / LLP"; an LLP is a body corporate) and `partnership`. Individual, HUF, unknown and placeholder values print `138 read with Section 142`.
- A sole proprietorship has no option of its own and goes under Individual, which is correct: the proprietor is the drawer, and s.141 does not apply.
- The twin's "individual" default is removed.
- The proprietor blanks match Addendum 4, and the tests take the blanks from the generators.
- No signed wording changed.

Still open: the pack's default (with the founder) and the prompt-side s.141 (T-407).

**T-407 part 1, fe5df17 (ai.service.ts): approved (14 Oct 2026).** `s141Applies` is an allow-list of the option ids `company` and `partnership` only. For every other drawer type, `packForDrawer` drops NI Act s.141 from the pack before the Drafter, repair, ledger and verifier prompts read it. Other acts and sections are kept, the cached pack is not changed, and no wording changes.

Condition: a test on the brief path with the labels as the advocate sees them. "Company / LLP" and "Partnership Firm" keep s.141. "Individual", "HUF", the brief blank and the ledger blank drop it.

Part 2 (template-path related_acts and the twin) comes to me after T-404 part 2.

**T-407 delta 1b7aa27: approved.** `packForDrawer` now applies only to the s.138 notice pack, and `s141Applies` uses the guard's exact test, with no trim. discharge_application is left unchanged in T-407.

**discharge_application, separate ruling (new ticket).** Its relevantActs list NI Act s.138 and s.141 for every discharge. They matter only when the case charged is a cheque case. Otherwise the model may draft cheque or vicarious-liability grounds into an unrelated discharge. Rule: the NI Act entry reaches the model only when the charged sections include NI Act s.138. Test: a discharge on a BNS charge gets no NI Act entry.

Also on that pack, **verify** (no change until signed): the BNSS revision entries. The pack says "S.438 Revisional powers of HC" and "S.442 Revisional powers of Court of Session". I believe s.442 is the High Court's revision power and the Sessions power is elsewhere, but I have not checked the Gazette text.

**T-407 part 2, twin 1a933b6: approved (14 Oct 2026).**
- `ni_act_related_sections` uses the same allow-list as the guard: `company` or `partnership` give `138, 139, 141, 142`, and everything else gives `138, 139, 142`.
- `related_acts[0]` now reads `Negotiable Instruments Act 1881 — Sections {ni_act_related_sections}`.
- No other wording changed.

T-407 is closed from my side.
