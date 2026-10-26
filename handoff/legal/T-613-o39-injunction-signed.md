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
