# T-613: O.39 temporary injunction pack and civil courts (Ajay, signed 26 Oct 2026)

For Shashank. Pack: `temporary_injunction_o39.json`; courts: `config/courts/indian-courts.json`. Text in code blocks goes in **byte for byte**. I byte-check at READY. Gender-neutral throughout: no "his".

## (a) Cause title

Keep the first two lines as they are (`IN THE COURT OF {courtDesignation}\nAT {courtPlace}`), because the engine already handles them for every pack. Replace the rest:

```
IN THE COURT OF {courtDesignation}\nAT {courtPlace}\n\nI.A. No. _____ of {current_year}\nin\n{suit_number}\n\nIN THE MATTER OF:\n{plaintiff_name} ... Plaintiff/Applicant\nVERSUS\n{defendant_name} ... Defendant/Non-Applicant
```

`causeTitle.caseNomenclature`: `I.A. No. _____ of {current_year}`

- `{suit_number}` is printed exactly as the user gives it ("Title Suit No. 245 of 2026"). If it is not given (the I.A. is filed with the plaint), print `Suit No. _____ of {current_year}`. Never guess the suit type.
- Party labels stay `Plaintiff/Applicant` and `Defendant/Non-Applicant`.

## (b) Prayer (a), with a new required field

New field, **signed**: id `restraint_sought`, type textarea, required. Label `Acts the defendant should be restrained from`. Question: `What should the defendant be stopped from doing from now on (for example: raising any construction, transferring or mortgaging the property, dispossessing the plaintiff)? Describe the acts, not past events.`

Prayer (a), replacing the current one:

```
a) Grant a temporary injunction under Order 39 Rules 1 and 2 read with Section 151 CPC restraining the Defendant/Non-Applicant, and all persons acting through or claiming under the Defendant/Non-Applicant, from {restraint_sought} in respect of the suit property described as {subject_matter}, pending final disposal of the suit;
```

- `{acts_complained_of}` stays in the body only, never in the prayer.
- A date before today in `{restraint_sought}` or anywhere in the prayer is a blocking finding (ADR v3 principle 5). The gate asks the user and does not deliver.
- Prayers (b) to (d) are unchanged.

## (c) R2 field

OK: id `main_suit_relief`, type textarea, required. The label and question are as signed in the T-611 file (R2).

## (d) Title-document date

Yes, add a typed field, **signed**: id `title_document_date`, type date, not required, `ask_when_empty: true`. Label `Date of the title document (sale deed, gift deed or other)`. Question: `What is the date of the document under which the plaintiff claims the suit property (sale deed, gift deed, will or other)? If the claim does not rest on a document, write "None".`

"None" counts as answered and absent (same rule as T-612 (4)), so nothing is rendered.

## (e) Courts

- Label `Civil Court (Junior Division)`, designation `IN THE COURT OF CIVIL JUDGE (JUNIOR DIVISION), PATNA`: **signed**. The existing Senior Division record stays.
- v1 records: Patna only, one Junior and one Senior record. The advocate chooses the court; we do not choose it on pecuniary jurisdiction.
- "Munsif": verify whether it is current usage in Bihar. Not signed and not added.

## (f) Body instructions: numbering dropped, order kept

Replace the eight `Para N:` lines (pack lines ~204–211) with these lines, in this order:

```
Set out the application in this order, each point in its own paragraph or paragraphs:
The main suit: its number as given, the parties and the cause of action.
A brief recap of the plaintiff's case in the main suit, including the relief the suit seeks as given in main_suit_relief.
The plaintiff's legal right, title or possession, with the title document and its date only as the brief gives them.
The specific acts of the defendant, threatened or actual, with dates and particulars only as the brief gives them.
Prima facie case: there is a serious question to be tried.
Balance of convenience: the plaintiff would suffer greater hardship if the relief is refused.
Irreparable injury: why damages would not be an adequate remedy.
The plaintiff's undertaking to compensate the defendant for any loss if the injunction is later found to have been wrongly obtained.
```

**Correction:** the old Para 8 cited "Order 25 R.1" for the undertaking. That is wrong: O.25 R.1 is security for costs. No rule is cited for the undertaking now.

## (g) Confirm blocked on empty required fields (R2-F1)

The `blocks_confirm` flag applies to `main_suit_relief` and `restraint_sought`. The confirmState hunk in intake-brief.ts gets my byte check at READY. Messages, **signed**:

| field | EN | HI |
| --- | --- | --- |
| main_suit_relief | `Add the relief sought in the main suit to continue.` | `आगे बढ़ने के लिए मुख्य वाद में माँगी गई राहत जोड़िए।` |
| restraint_sought | `Add the acts the defendant should be restrained from, to continue.` | `आगे बढ़ने के लिए वे कार्य जोड़िए जिनसे प्रतिवादी को रोका जाना है।` |

## (h) T-628 gate question, code `past_date_in_prayer` (signed, 26 Oct 2026)

- EN: `The prayer refers to <date>, which has already passed. An injunction can only restrain what happens from now on. What should the defendant be restrained from?`
- HI: `प्रार्थना में <date> का उल्लेख है, जो बीत चुकी है। निषेधाज्ञा केवल आगे होने वाले कार्यों पर रोक लगा सकती है। प्रतिवादी को किन कार्यों से रोका जाना है?`

`<date>` is shown to the user only, never logged. "Today" is the IST date. The answer replaces `restraint_sought`, not `acts_complained_of`. The draft is not delivered and no Ink is taken until the answer is in.

## (i) Build questions (Ajay, 26 Oct 2026)

| # | ruling |
| --- | --- |
| 1 | `suit_number`: make it **optional** and **delete** the validation line "suit_number must be filled". Add `ask_when_empty: true` with the question, signed: `What is the number of the main suit (for example, Title Suit No. 245 of 2026)? If the suit is filed with this application and has no number yet, leave it blank.` If it is blank, the (a) fallback prints. |
| 2 | `title_document_date` stays a **date** field. Question replaced, signed: `What is the date of the document under which the plaintiff claims the suit property (sale deed, gift deed, will or other)? If the claim does not rest on a document, leave it blank.` Rule: once asked, blank counts as answered (askedAt set), is never asked again and renders nothing. This replaces the "None" wording for this field. |
| 3 | O.39 court levels: `civil_court` (Junior and Senior Division), `district_court`, `commercial_court`, `high_court_original_side`, `commercial_division_high_court`. Remove the Supreme Court, NCLAT and every tribunal. "India" is not a State choice. Only records that exist in the data show; for v1 that is Patna civil. |
| 4 | Reading `main_suit_relief` and `restraint_sought` from the user's own description is OK. That is the user's source, not the model writing. Conditions: (a) the pre-filled value shows in the brief for the user to confirm or edit; (b) `restraint_sought` is filled only where the description says what the user wants stopped, never turned from past acts into a restraint; T-628 still blocks a past date. The draft never invents either field. |
| 5 | Confirm messages: the EN strings ship now. The HI strings (ff25b862) stay signed and go in with the Hindi mechanism in a later ticket; Priya routes it. No unsigned Hindi in the meantime. |
| 6 | `restraint_sought` belongs in the brief's **relief** part, not facts: it is what is asked for, and the T-628 past-date check reads it there. `acts_complained_of` stays in facts. T-629 (Confirm block) ships with T-613; noted. |
| 7 | (a) Keep `district_court` as signed, with all existing District Judge records. They are real courts an O.39 I.A. can lie before, they are already used by other packs, and the advocate chooses. My "Patna civil" note meant only that the civil-court records are Patna-only in v1. (b) `restraint_sought` reading hint **signed as written**: `Fill only from words in which the user says what the defendant should be stopped from doing from now on. Never turn acts the description says already happened into a restraint; if the description gives none, leave this empty.` It lands when the per-field hint mechanism exists (T-629 or Phase 1). Until then, quoting the user's own words, confirming in the brief and the T-628 block are enough. |

## (j) T-629 Confirm block (Ajay, 26 Oct 2026)

| # | ruling |
| --- | --- |
| 2 | Show **every** blocking message together, one per line, in this order: court, parties, `main_suit_relief`, `restraint_sought`. The court and parties make the cause title, so they come first. The field messages are the signed (g) strings; the court and parties keep their existing messages. |
| 3 | A non-answer still blocks. `Not known`, `unknown`, `NA`, `N/A`, `nil`, `none`, `-`, `?`, `नहीं पता` and `पता नहीं` (case-insensitive, trimmed, alone) count as empty for both fields. Both are facts the advocate must give; a prayer cannot rest on "not known". |
| 5 | Enough as built: the route gate (`brief_not_confirmed`) plus confirmState. Once Confirm passes, both fields are held, so any blank for them in the draft falls under P6 (repair, then ask) and T-628 covers past dates. No new in-draft check. |

## (k) T-628 build rulings (Ajay, 27 Oct 2026)

| # | ruling |
| --- | --- |
| 1 | Agreed: only a **clearly resolved** date before today (IST) blocks. An unresolved or ambiguous date does not block at the gate. The Phase 2 legal reviewer will flag it; until then the advocate reviews it. |
| 2 | Scope: `{restraint_sought}` plus **the prayer section, whoever wrote it**. That is the system-built prayer on the pack path, and the model's own prayer section if a path has no skeleton prayer. Body paragraphs are not scanned: past dates belong there. |
| 3 | Devanagari month names are **in scope now**, because Hindi input reaches `restraint_sought`. Read these, with their spelling variants: जनवरी, फ़रवरी/फरवरी, मार्च, अप्रैल, मई, जून, जुलाई, अगस्त, सितंबर/सितम्बर, अक्टूबर/अक्तूबर, नवंबर/नवम्बर, दिसंबर/दिसम्बर (nukta-insensitive). |
| 4 | Yes: `apps/drafting/src/services/prayer-date-gate.ts` is legal content. Priya adds it to legal-content-paths.md. Logs with `keys=restraint_sought` only, never `<date>`: OK. |
