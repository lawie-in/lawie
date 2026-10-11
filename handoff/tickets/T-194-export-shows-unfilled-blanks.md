# T-194 — Exports show every blank still to be confirmed

| Field          | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Phase          | 1 — Describe and draft                                                                                                        |
| Owner          | Rajesh (design of the warning). Vishal (build). Ajay (signs the header text and the blank style). Anushka (verdict)           |
| Mode           | Design first (Rajesh), then build, full chain. Merge to develop                                                               |
| Status         | Assigned to mahak, 11 Oct 2026. Not started. Gates met: Rajesh's design (artifact v2), Ajay's AC8 sign-off, Priya's calls |
| Assigned lead  | mahak |
| Size           | Design S (0.5 day). Build M (1 day)                                                                                           |
| Depends on     | T-147c (already writes `[To be confirmed: label]` in plain text)                                                              |
| Gate           | Go-live blocker (Ajay): blocks v1 go-live (T-403). Priya reads it as also blocking `feature.fact_ledger` for real users; Ajay to confirm |
| Branch         | feature/t-194-export-shows-blanks                                                                                             |
| Legal sign-off | Needed. Ajay calls the visible blank a legal requirement                                                                      |
| Created        | 2026-10-10                                                                                                                    |
| Source         | Vishal and Ajay, T-147c follow-up, 10 Oct 2026                                                                                |

## Problem

T-147c puts `[To be confirmed: label]` in the draft as plain text. In an exported DOCX or PDF it looks like any other text, so an advocate can file a document with a blank in it without noticing.

## User

District court advocate who exports a draft to file it and must not file one with unconfirmed facts in it.

## Solution

- Every `[To be confirmed: label]` in an exported DOCX or PDF is bold and highlighted.
- Exporting a draft with blanks shows a warning with the count before the file is made.
- Such an export prints "DRAFT — N items to be confirmed" in the header.

## Acceptance criteria

1. Rajesh designs the warning before export (where it shows, its wording, the buttons). The design is a claude.ai artifact, as with T-109.
2. In the DOCX, each blank is bold and highlighted.
3. In the PDF, each blank is bold and highlighted.
4. A draft with N blanks shows the warning with N before export. The advocate can go back and fill them or export anyway.
5. A draft with N blanks prints "DRAFT — N items to be confirmed" in the header of every page of both formats.
6. A draft with no blanks exports with no warning and no header, as today.
7. N counts every blank in the document, including the cause title, prayer and verification.
8. Ajay signs the header text and the blank style in this file.
9. Tests: 0, 1 and several blanks, in both formats. `apps/web` has no tests, so the web warning carries a manual check.

## Out of scope

- The plain-text substitution (done in T-147c)
- Blocking export altogether
- The watermark question (separate, open with Vikram and Meera)

## References

- T-147c, T-188, T-109

## Design (Rajesh, 11 Oct 2026)

- AC1 design and hand-off spec (claude.ai artifact; header text and blank style pending Ajay, AC8): https://claude.ai/artifact/6T24aZ5ihZY2R1G7MgZGtA

## Priya decisions (11 Oct 2026)

1. Which blanks count: open. Ajay decides it together with AC8. Until he does, the build counts only `[To be confirmed: …]`.
2. AC note (build requirement): save first, then count from the saved draft the file is built from.
3. "Go back and fill" puts the cursor on the first blank: in scope. Tracking "warning shown / export anyway": out of v1 scope; if it comes back later it needs a PII review.

Follow-ups (Priya to ticket):

- The editor shows a blank as `{{MISSING: label}}`, while the file and the warning say `[To be confirmed: label]`.
- The PDF and DOCX export buttons are about 28px tall, under the 44px minimum tap target.

## Ajay sign-off (11 Oct 2026)

Read: this ticket; Rajesh's artifact (opened, version of 11 Oct 2026); `apps/web/src/components/intake/briefTypes.ts` (`BLANK`, `countBlanks`); `apps/drafting/src/services/fact-verifier.ts` (blank regex); `citation-check.ts` (`AUTHORITY_BLANK`); `brief-drafter.ts` (`SECTION_BLANK`); `bail_regular.json` (`caseNomenclature`). Nothing in code changed.

**(a) Header text: Approved.**
- N > 1: `DRAFT — N items to be confirmed`. N = 1: `DRAFT — 1 item to be confirmed`. N is written in digits, with an em dash, exactly as shown.
- It prints on every page of both formats, top of the page, as in Rajesh's spec. In the DOCX it is an ordinary section header the advocate can delete. That is intended.
- N is the count under (d), from the saved draft the file is built from (Priya decision 2).

**(b) Blank style: Approved, with one condition.**
- Bold, yellow highlight (`#FFFF00` / Word `yellow`), black text. The marker text, square brackets included, prints unchanged.
- I accept the black-and-white printer trade-off. On a mono print the bold, the brackets, the words "To be confirmed" and the page header still show. Grey is not wanted.
- Condition: the brackets and the marker words must never be removed or restyled to rely on colour alone. In the PDF, `print-color-adjust: exact` (with the `-webkit-` prefix) is required, as in the spec.

**(c) "Do not file" line: Yes.** Add it as the last sentence of the dialog body, word for word:
> Do not file this document until each item is filled in or removed. You are responsible for what is filed.
- It speaks to the advocate about our tool's output, not about the merits of the matter, so it is not legal advice. It matches the mandatory disclaimer ("The advocate is responsible for legal accuracy and filing").
- Madhuri may polish the rest of the dialog. This sentence changes only with my sign-off. It is not printed in the file.

**(d) Which markers count as blanks: one set, for the header count, the dialog count, the dialog list and the highlighting (this settles AC7).**

| Marker | Counts and is highlighted | Why |
|---|---|---|
| `[To be confirmed: …]` | Yes | A fact still missing |
| `{{MISSING: …}}` | Yes, and it prints as `[To be confirmed: …]` (T-147c). It should never reach the file raw; if it does, it still counts | Same blank in another form |
| `[Section — verify before filing]` | Yes | A provision not given. Filing it as is, is the worst defect |
| `[Authority — add if relied upon]` | Yes | The advocate must add the authority or delete the marker. Either way, the marker text must not be filed |
| Underscore runs of 3 or more inside a line (`Case No. _____`, a date) | Yes, except the three below | A value left for the advocate |
| Except: a line of underscores only (the signature line) | No | A place to sign, not a gap |
| Except: the verification's signing date (`___ day of ______, 20___`) | No | Filled by hand at signing, as is normal practice |
| Except: the registry's case number in the cause title, an underscore run between `No.` and `of` (e.g. `BAIL APPLICATION No. _____ of 2026`) | No | The registry fills it on filing. Counting it would put the header on every bail export forever and teach advocates to ignore it |

- One function, used by web and server, implements this set. A test covers each row, including the three exceptions.
- The dialog lists the label for `[To be confirmed: label]` and `{{MISSING: label}}`, and the marker words themselves for the other markers (e.g. "Section — verify before filing").
- Note for Priya: `countBlanks` in `briefTypes.ts` counts the signing date and the registry number today. I prefer one set across the product; where else it is used is your call.

**Gate: confirmed.** T-147c is what writes these markers on the ledger path, so T-194 also blocks `feature.fact_ledger` for real users, as well as v1 go-live.

Signed: Ajay (CLO), 11 Oct 2026. (a), (b) on its condition, the sentence in (c), and the set in (d). Any change to these strings or to the set needs a fresh sign-off.

## Ajay's rulings on Mahak's phase 2 questions (11 Oct 2026, night)

These narrow two rows of set (d). The signed strings are unchanged. Signed: Ajay (CLO), 11 Oct 2026, with the changes below.

1. **Dialog labels.** These appear only in the dialog, never in the file; the file keeps the marker or underscores as they are.
   - Underscore blank: "Blank to fill in". Approved by Ajay; Madhuri: keep.
   - Empty `[To be confirmed: ]`: **"To be confirmed — add the detail"**. Ajay approved the label; Madhuri's wording adds the action. Priya's call on the founder's delegation, in place of Meera's copy sign-off overnight.
   - Priya's call: each row in the list also shows a few words of the draft around the blank (e.g. "Case No. _____"), so the advocate can find it.
2. **Signing-date exception.**
   - Approved: a printed year (`_____ day of _________, 2026`) is exempt, the same as `20___`.
   - Not anywhere in the document. Exempt a day-of date only when it is (i) inside the verification, affidavit or jurat block, or (ii) directly preceded by `this` on the same line ("on this ___ day of", "Dated this ___ day of"). Every other day-of date counts.
   - Tests:
     - "Verified at Patna on this ___ day of ___, 2026": not counted.
     - "arrested on the ___ day of ___, 2026" in a body paragraph: counted.
3. **Registry-number exception.** The first version was a blocker. Changed to:
   - Exempt only the **first** `No. ___ of` in the cause title, and only when the whole words `in` or `arising out of` (any case) do not appear before it on the same line. Every other `No. ___ of` counts.
   - The cause title ends at whichever comes first:
     - a line that is only `VERSUS` / `VS` / `V/S` (any case, dots allowed);
     - paragraph 1.
   - An inline "v." or "vs." in a citation never ends it.
   - If neither is found, the blank counts.
   - Tests:
     - bail_regular: 0 counted.
     - discharge_application: 1.
     - bail_cancellation: 2.
     - I.A. in a civil suit: 1.
