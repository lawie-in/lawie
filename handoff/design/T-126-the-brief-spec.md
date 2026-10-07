# T-126 hand-off spec: the brief, for every document

| Field            | Value                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Author           | Rajesh (designer)                                                                                                                                                                         |
| Approver         | Meera (brand tokens). Not approved yet                                                                                                                                                    |
| Design reference | https://claude.ai/artifact/C8sMcrGqa6vtA8HqU8hXcF                                                                                                                                         |
| Figma            | Not available. As with T-109, the reference page is the design source until frames exist                                                                                                  |
| Extends          | `handoff/design/T-005-describe-first-flow-spec.md` and `handoff/design/T-109-guided-draft-additions-spec.md`. Their tokens, components, accessibility rules and manual checks still apply |
| Ticket           | `handoff/tickets/T-126-design-the-brief.md`                                                                                                                                               |
| Date             | 2026-10-06                                                                                                                                                                                |
| Feeds            | T-125                                                                                                                                                                                     |

The reference page shows each screen at 1280 and at 360, with behaviour notes beside it. No new colour or type token is added.

## 1. Flow

```
01 Describe
 ├─ sure of the document ───────────────┐
 ├─ not sure ─> 02a Which document? ────┤
 └─ nothing fits ─> 02b Questions ──────┤
                                        ▼
        B1 Check your brief  (B2 change the document, B3 court, B4 dates,
                              B5 confirm is off, B6 nothing fits)
                                        │
          04 Length and estimate ─> 05 Generating
                                        │
        D1 Draft ready      D2 with the label      D3 no rule pack

G1 Browse document types ─> 01 with the document set ─> B1
```

Screen 03 (Review details) of T-005 and 03a of T-109 are gone. B1 replaces them and 02c.

## 2. Screens

| #   | Screen                                  | Replaces or adds                        |
| --- | --------------------------------------- | --------------------------------------- |
| B1  | Check your brief                        | Replaces T-109 02c, T-005 03, T-109 03a |
| B2  | Change the document                     | New dialog (bottom sheet at 360)        |
| B3  | Choose the court                        | New part of B1                          |
| B4  | Dates and what they are the date of     | New part of B1                          |
| B5  | Confirm is off                          | State of B1                             |
| B6  | Brief when nothing fits                 | Variant of B1                           |
| D1  | Draft ready, with rules, no label       | Changes T-005 06                        |
| D2  | Draft ready, with rules, with the label | New state                               |
| D3  | Draft ready, no rule pack               | Replaces T-109 06a's top half           |
| G1  | Browse document types                   | Changes the gallery                     |

Not redrawn: 01, 02, 02a, 02b, 04, 04a, 05, 05a, 06c to 06e, 07, 08.

## 3. Screen notes

### B1 Check your brief

- Parts in this order: document, court, parties, facts, dates, numbers, what is asked for, still unknown. A part with no item is not shown.
- The document sits in a bordered bar at the top with its name, the tag "Court document" or "Not for a court", and a "Change" button (B2).
- Each item is an editable field. Field type by the item's kind: `text` one line, `narrative` long text, `date` date field, `number` and `amount` numeric, `choice` single-select chips, `choices` multi-select chips, `list` one line per entry.
- A value read from the description has a gold-light fill and the tag "Please check". Editing it removes both. One note above the card explains the mark.
- A required item with no value is a dashed field reading "Not given", with the blank the draft will use under it. It never blocks Confirm.
- "Still unknown. These will be blanks in the draft." lists every blank at the end. "Add it" moves focus to that field.
- Buttons: "Edit my description" (ghost) and "Confirm brief and continue" (primary). When questions are left, a link "Answer N more questions" sits beside the ghost button.
- Desktop: items sit two to a row inside a part. At 360: one column.

### B2 Change the document

- Search box over the 92 documents by name. Before typing: the closest ones first, then by category.
- Rows: plain name, category on the right, "Current" tag on the one in use. "Something else" is always the last row, also when nothing matches. It leads to B6.
- Choosing a row rebuilds the brief. Every value is kept. A value with no place in the new document shows under "Other things you gave" at the end of the brief.
- Listbox behaviour: arrow keys move, Enter chooses, Escape closes, focus returns to "Change".

### B3 Choose the court

- Three pickers: state, court type, court. Each is disabled until the one before it has a value. Changing one clears those after it.
- The court picker has a search box when it holds more than 8 courts.
- Never free text, never filled for the advocate. A line under the pickers may quote what the advocate wrote.
- Not shown on a document that is not for a court.
- If the list fails to load: "We could not load the courts. Try again." with Retry. Confirm stays off on a court document.

### B4 Dates

- Placed date: label is its meaning ("Date of arrest"), with "Please check".
- Date with no stated meaning: a gold note "You wrote 12 August 2026. What is it the date of?" with a picker of meanings and "Not needed".
- "+ Add another date": a meaning picker and a date field. Only meanings not already used are offered.
- Date field: typing or calendar. Shows the date in words once valid.

### B5 Confirm is off

- Only on a court document, only when the court or a party name is missing.
- Missing fields: red border and the tag "Needed to continue". The line from the service shows above the buttons in the error note. Confirm is the disabled style.
- Pressing the disabled button or the line moves focus to the first missing field.

### B6 Brief when nothing fits

- The document name is an editable line. Tag "No Lawie rules for this one".
- Four fixed items: who it is for, who it is addressed to or against, what happened, what is asked for. Dates as in B4.
- If the advocate's words carry a court word, the service makes it a court document: the court part appears and B5 applies. The screen has no switch for this.
- A Supreme Court request gets the no-match screen (T-005 08).

### D1, D2, D3 Draft ready

- All three: the "ready" banner, the preview card, drops charged, "Checks run for you" (always shown, "No problems found." when empty), a line with the number of blanks, then "Start another document" and "Open in editor".
- D1: no label.
- D2: the label, and one line under it sent by the service. A missing part is the first finding, in red.
- D3: the label, with no line under it.
- The label cannot be dismissed. It also prints in the PDF and DOCX footer.
- The Review by agent card (T-109 06a) sits under the checks on D2 and D3 once T-111 exists.
- 05 Generating gains a third step, "Adding a part that was missing", shown only when the service reports a repair.

### G1 Browse document types

- Search by name, category chips, cards with plain name, one line and the category. Three columns at 1280, one at 360.
- A card opens 01 Describe with the document set. No card opens a form.
- "I do not see my document" opens 01 with nothing set.
- The word "template" is not used anywhere in the flow.

## 4. What each screen reads from the service

| Screen element                  | Call and field                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The brief                       | `POST /api/drafting/intake/brief`, then `POST /api/drafting/intake/brief/update` after each change                  |
| Document bar                    | `brief.kind.name`, `brief.kind.court_document`. `brief.kind.id` is null when nothing fits                           |
| Items                           | `brief.items[]`: `part`, `label`, `kind`, `required`, `options`, `value`, `placeholder`                             |
| "Please check"                  | `item.please_check`                                                                                                 |
| Date label                      | `item.meaning`, else `item.label`                                                                                   |
| Dates with no meaning           | `brief.loose_dates[]`                                                                                               |
| "Other things you gave"         | `brief.unplaced[]`                                                                                                  |
| Still unknown                   | `brief.still_unknown[]`: `label`, `placeholder`                                                                     |
| Confirm on or off, and the line | `brief.can_confirm`, `brief.confirm_message`, `brief.confirm_blockers`                                              |
| Questions left                  | `questions[]` in the same answer, and `next_round` when nothing fits                                                |
| Choices on 02a                  | `outcome: needs_choice`, `choices[]`                                                                                |
| The draft                       | `POST /api/drafting/documents/generate-from-brief`. For nothing fits: `kind: "none"`, `kind_name`, `court_document` |
| Label and its line              | `done.startingDraft`, `done.startingDraftLabel`, `done.labelReason`                                                 |
| Missing parts                   | `done.missingClauses[]`                                                                                             |
| Findings                        | the `warning` event: `warnings[]` with `type` and `message`                                                         |
| Repair step on 05               | the `repair` event                                                                                                  |
| D1 or D2 versus D3              | `done.rulePack`                                                                                                     |
| Reopened document               | `GET /documents/:id`: `startingDraft`, `startingDraftLabel`                                                         |

Errors the screens must handle: `brief_not_confirmed` (show B5 with the message), `court_not_found` (B3 with "Choose the court from the list to continue."), `no_match` (T-005 08), `not_enabled` (the old flow), 402 (T-005 07).

## 5. Fixed wording

Ajay's text, from T-127 section 7 and T-107 section 4. The service sends it. The screens print it and never build it.

| Where                 | Text                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mark                  | Please check                                                                                                                       |
| Help text             | We read this from your description. Check it before you confirm.                                                                   |
| Missing required fact | Not given. The draft will show [To be confirmed: date of FIR].                                                                     |
| Date with no meaning  | You wrote 25 August 2026. What is it the date of?                                                                                  |
| Last part             | Still unknown. These will be blanks in the draft.                                                                                  |
| Confirm off           | Choose the court to continue. / Add the name of the {party label} to continue. / Choose the court and add the parties to continue. |
| Label                 | Starting draft — review before use · not court-verified                                                                            |
| Under the label       | This draft does not cover: {clause titles}. Add them before use. / {n} checks did not pass. See the findings.                      |

Wording that is Rajesh's and needs Ajay's read: "No Lawie rules for this one", "Needed to continue", "Not for a court", "Court document", "You choose this. We never fill it in.", "Other things you gave", "Adding a part that was missing".

## 6. Manual checks to add

At 1280 and at 360.

1. Every part of the brief shows in order, and an empty part is absent.
2. A value read from the description carries the mark. Editing it removes the mark.
3. Change the document to another and back: nothing typed is lost. A value with no place shows under "Other things you gave".
4. "Something else" is reachable when the search finds nothing.
5. Court pickers: each waits for the one before. The court cannot be typed.
6. The founder's sentence of 5 Oct: the date is under "Date of arrest". Nothing is under "Date of FIR".
7. A date with no meaning is asked, not placed. "Not needed" removes it.
8. Court document with no court: Confirm is off with the right line. With no party: the other line. With both: the third.
9. A document that is not for a court confirms with nothing given.
10. Nothing fits: the four fixed items show. Typing "appeal" into the facts brings up the court part.
11. Draft ready shows D1, D2 or D3 as the service says. The label cannot be closed.
12. Browse document types opens 01 with the document set, and no form anywhere.
13. Keyboard only through B1 and B2. No horizontal scroll at 360.

## 7. Open items

- Meera's approval.
- Ajay's read of the seven lines of new wording in section 5.
- Whether the dev lead's gate accepts this page in place of a Figma link. The founder has not said so in those words.
- The header says drops. The build charges Ink until T-201.
