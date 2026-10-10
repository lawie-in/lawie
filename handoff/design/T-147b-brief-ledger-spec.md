# T-147b hand-off spec: the brief, rendered from the fact ledger

| Field     | Value                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Author    | Rajesh (designer)                                                                                                                                                                      |
| Approver  | Meera (brand). Not approved yet. No new token, so nothing new for her to approve on colour or type                                                                                     |
| Figma     | None. No frame was made in the time box. This page is the design reference, as for T-109 and T-126                                                                                     |
| Extends   | `handoff/design/T-126-the-brief-spec.md` (B1) and `T-005-describe-first-flow-spec.md`. Their tokens, layout, accessibility rules and manual checks still apply. Anything not here is unchanged |
| Ticket    | `handoff/tickets/T-147b-reception-to-ledger-and-brief.md`, Solution 2 to 4, AC 5 to 7                                                                                                   |
| Files     | `apps/web/src/components/intake/BriefStep.tsx`, `ValueInput.tsx`, `briefTypes.ts`. Class names from `ui.ts`                                                                            |
| Date      | 2026-10-10                                                                                                                                                                             |

## 0. What changes, in one table

| Element                    | Today (T-126)                                   | T-147b                                                                                  |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Value in a field           | `item.value`                                    | The fact's `display` ("Rs 3,00,000", "12 March 2026", "PS Kotwali")                      |
| Advocate's own words       | `item.quote`, not shown                         | `raw_span`, shown on tap ("You wrote" / "Your answer")                                   |
| Required marker            | Muted "Required" text, only on Confirm blockers | "Required" tag on every `required_in_draft` fact and every Confirm blocker              |
| Value we could not read    | Not shown (guessed or dropped)                  | "To be asked" in its row, plus an outstanding block that opens the questions step        |
| Edit                       | Value replaced                                  | Value replaced, then "Saved as {display}". Earlier value shown inside the reveal only    |

Part order, the document bar, the court part, dates (B4), Confirm off (B5), nothing fits (B6), "Still unknown" and the buttons do not change.

## 1. Fact row

Layout, top to bottom. Same grid as today: two to a row at `sm` and up, one column at 360. Wide kinds (`narrative`, `list`, `choice`, `choices`) span both columns.

```
┌──────────────────────────────────────────────────────────┐
│ Amount of surety  [Required] [Please check]   You wrote ▾│  1 label line
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Rs 3,00,000                                          │ │  2 field (ValueInput)
│ └──────────────────────────────────────────────────────┘ │
│ ┃ You wrote: "3 lakh ka surety de sakta hai"             │  3 reveal (when open)
│ Saved as Rs 3,00,000.                                    │  4 status line (when set)
│ The draft will show [To be confirmed: ...]               │  5 blank line (as today)
└──────────────────────────────────────────────────────────┘
```

| Part            | Spec                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Label line    | `flex items-start gap-2`. Left: `<label>` (`label` class) and tags, `flex flex-wrap items-center gap-2 min-w-0 flex-1`. Right: reveal button, `flex-none`. Tag order: Required, Please check, To be asked, Needed to continue |
| 2 Field         | `ValueInput`, unchanged look rules: gold-light fill for Please check, dashed for a blank, red 2 px for Needed to continue. The field holds `display`                       |
| 3 Reveal        | `mt-1.5 border-l-2 border-brand-line bg-brand-page rounded-r-lg py-2 pl-3 pr-2 text-sm text-brand-navy whitespace-pre-wrap break-words`. Hidden until the button is pressed |
| 4 Status line   | `small` class, `mt-1`. One line at most at a time: saving, saved-as, or the edit error (section 4)                                                                          |
| 5 Blank line    | As today: "The draft will show" + placeholder in `font-mono text-xs text-brand-gold-dark`                                                                                    |

Why: the label line carries every status as text, so nothing depends on colour, and the reveal sits under the field it explains rather than in a popover that a thumb covers.

## 2. Required marker

- Shown on a fact with `required_in_draft: true`, and on a party name that blocks Confirm (today's `blocksConfirm`). One marker for both: a fact the draft needs.
- Look: `tagPlain` ("Required", navy on slate-100). Replaces today's muted `text-xs` "Required", which read as a hint, not a status.
- It never blocks Confirm on its own. Blocking stays B5 only (court, party name on a court document), which adds "Needed to continue" in red beside it.
- Required and empty: dashed field reading "Not given" and the blank line, as T-126 B1.
- No asterisk. A lone `*` is missed on a small screen and read as "star" by TalkBack.

## 3. The raw_span reveal

- **Trigger:** a button at the right of the label line. Not the field itself, because a tap on the field must start an edit. Hover is never used.
- **Button:** `linkButton` class (teal-dark, underlined, `min-h-[44px]`), lucide `ChevronDown` 16 px after the text, rotates 180 degrees when open. No rotation animation under `prefers-reduced-motion`.
- **Label of the button:** "You wrote" when `source` is the description, "Your answer" when it came from a question.
- **Default:** closed. Each row opens and closes on its own; opening one does not close others. Open state is not kept across reloads.
- **Hide the button** when `raw_span` is the same text as `display` (after trimming) and the fact has no earlier version. There is nothing to show.
- **Panel content:**
  - Line 1: "You wrote: "{raw_span}"" or "Your answer: "{raw_span}"". Curly quotes. The span is printed exactly as stored, including Hinglish and Devanagari. Never translated, never tidied.
  - Line 2, only after an edit: "You changed this. Before: {previous display}." This is the only place the old value appears (Solution 4 is an audit record, not a screen feature).
- **Long spans:** wrap, no truncation. The span is the evidence; cutting it defeats the point.
- **Devanagari:** no Indic font is loaded in `tailwind.config.js` (Inter, then system-ui). Android falls back to Noto Sans Devanagari, which renders correctly. No change needed for this ticket; noting it for the Mukta decision.

## 4. Edit state

`ValueInput` keeps its commit rules: text commits on blur or Enter, chips and dates at once.

| Moment                         | Field                                       | Status line (4)                                                                       | Marks                               |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| Typing                         | What they type                              | none                                                                                  | unchanged                           |
| After commit, waiting          | What they typed, still editable             | "Saving…"                                                                             | unchanged                           |
| Saved, display same as typed   | `display`                                   | none                                                                                  | Please check removed                |
| Saved, display differs         | `display` ("3 lakh" becomes "Rs 3,00,000") | "Saved as Rs 3,00,000."                                                               | Please check removed                |
| Normalizer could not read it   | What they typed, kept, red border, `aria-invalid` | "We could not read this for certain. {detail} Your earlier value is kept."       | unchanged. Old value stays in the ledger |
| Save failed (network, 5xx)     | What they typed, kept                       | "Could not save this change." + `linkButton` "Try again"                             | unchanged                           |

- "Saved as" stays until the next edit of that field. It is not a toast: a toast on a slow phone is gone before it is read.
- Emptying a field is a valid edit. A required fact then shows "Not given" and its blank.
- After an edit the reveal button reads "You wrote" with the newly typed text as line 1 and "Before:" as line 2.
- `ValueInput` change: for `amount` drop `inputMode="decimal"` (keep it for `number`). The numeric keypad blocks typing "3 lakh", which AC 7 says must work. Plain keyboard costs one switch for digits; the normalizer accepts both.

## 5. Outstanding (unresolved) items

Two places, same items.

**a. In the row.** When an unresolved item belongs to a brief field:
- Field empty, dashed, placeholder "Not given".
- Tag `tagGold` "To be asked".
- Reveal open by default and not closable for this row, showing "You wrote: "{raw_span}"" and, as line 2, `{detail}`. The advocate must see what we could not read.
- The field stays editable. Typing a value goes through the normalizer like any edit, and resolves the item if it reads.

**b. Outstanding block.** Above the brief card, under the "Please check" note. Shown when `unresolved` has at least one item.

```
┌ bg-brand-gold-light, rounded-xl, p-4 sm:p-5 ──────────────┐
│ We could not read these for certain          (h2, navy)   │
│ We do not guess. Answer them, or they will be blanks      │
│ in the draft.                                (small)      │
│ ┌ white row ─────────────────────────────────────────────┐│
│ │ Date of memo                                           ││
│ │ You wrote: "12/3"                                      ││
│ │ The year is missing.                       (detail)    ││
│ └────────────────────────────────────────────────────────┘│
│ [ Answer 2 questions ]   (secondaryButton)                │
└───────────────────────────────────────────────────────────┘
```

- Rows: `border-brand-line rounded-lg border bg-white p-3`, label `text-sm font-medium text-brand-navy`, span and detail `small` but in `text-brand-navy` for the span.
- Button opens the existing ask-only-what-is-missing step (`onMoreQuestions`). Count is the number of unresolved items still open.
- An unresolved item with no brief field (no place in this document) shows only here. Its row has no field link.
- Does not block Confirm (T-126: blanks never block). Answering clears the row; when the last one clears, the block goes.
- `detail` is printed as the service sends it. The reason code (`two_digit_year_ambiguous` etc.) is never shown.

## 6. Empty, loading, error

| State                                   | What shows                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading the brief (first time)          | Heading and sub as today. Card with 3 grey skeleton rows (`bg-slate-100`, 14 px label bar, 48 px field bar), no shimmer. Line "Reading your description…" with `Loader2`, `aria-live="polite"`. Confirm not shown |
| Re-working the brief after an edit      | As today: Confirm disabled with spinner. Plus "Saving…" on the edited row only                                                                   |
| Ledger has no facts                     | Note in `bg-brand-page` above the card: "We did not find any details in your description. Add them below, or edit your description." Parts with required items still show, empty, with their blanks |
| No facts and no required items          | The note above, then the card with only the court part (court document) or nothing. Confirm works as today                                       |
| Brief failed to load                    | Error note (`bg-brand-error-light text-brand-error`, `role="alert"`): "We could not load your brief." + `secondaryButton` "Try again". "Edit my description" stays |
| One edit failed to save                 | Row-level, section 4. Rest of the brief untouched                                                                                                |

Skeletons are static boxes, not images, so they cost nothing on 4G.

## 7. Copy strings

New strings are mine and need Madhuri's pass on tone and Ajay's on legal wording before merge. Existing fixed wording from T-126 section 5 is unchanged and still comes from the service.

| Key                      | Text                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `reveal.description`     | You wrote                                                                                             |
| `reveal.answer`          | Your answer                                                                                           |
| `reveal.line.description`| You wrote: "{raw_span}"                                                                               |
| `reveal.line.answer`     | Your answer: "{raw_span}"                                                                             |
| `reveal.before`          | You changed this. Before: {previous_display}.                                                         |
| `tag.required`           | Required                                                                                              |
| `tag.to_be_asked`        | To be asked                                                                                           |
| `status.saving`          | Saving…                                                                                               |
| `status.saved_as`        | Saved as {display}.                                                                                   |
| `status.unreadable`      | We could not read this for certain. {detail} Your earlier value is kept.                              |
| `status.save_failed`     | Could not save this change.                                                                           |
| `action.try_again`       | Try again                                                                                             |
| `outstanding.title`      | We could not read these for certain                                                                   |
| `outstanding.body`       | We do not guess. Answer them, or they will be blanks in the draft.                                    |
| `outstanding.button`     | Answer 1 question / Answer {n} questions                                                              |
| `loading`                | Reading your description…                                                                             |
| `empty`                  | We did not find any details in your description. Add them below, or edit your description.           |
| `error.load`             | We could not load your brief.                                                                         |

`{detail}` is the normalizer's sentence from `UnresolvedFact.detail`. Those sentences are now user-facing, so they need the same read. They must be one plain sentence ending in a full stop.

## 8. What the screen reads

The screen needs these per brief field. The exact shape is Vishal's call; this is the list.

| Screen element             | Needs                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Field value                | fact `display`                                                                            |
| Reveal line 1 and its label| fact `raw_span`, fact `source` (description or answer)                                    |
| Reveal "Before"            | previous version's `display`, if any                                                      |
| Required tag               | fact `required_in_draft`, plus today's party-name rule                                    |
| Row link to a fact         | which brief item a fact or unresolved item belongs to (item key or fact id on the item)   |
| To be asked, outstanding   | `unresolved[]`: `label`, `raw_span`, `detail`, and its item key if any                    |
| Facts with no field        | "Other things you gave", as today, with `display` and the reveal                          |

## 9. Accessibility

- Reveal button: `<button type="button" aria-expanded aria-controls="{fieldId}-span">`. Its accessible name includes the field: visible text "You wrote", `aria-label="You wrote, {label}"`, so a list of buttons is not ten identical "You wrote".
- Panel `id="{fieldId}-span"`, plain region, no `role`. Not added to the field's `aria-describedby` while closed.
- Field `aria-describedby` includes, in order: Required tag id, note, status line, blank line. "Required" is read with the field. Do not set `aria-required`: it implies the form will refuse to submit, and it will not.
- Status line: `aria-live="polite"` for "Saving…" and "Saved as"; the edit error and save failure use `role="alert"`. "Saved as Rs 3,00,000" is the one line that tells a screen-reader user the value changed under them.
- Outstanding block: `<section aria-labelledby>` with an `h2`, same as "Still unknown". Rows are a `<ul>`.
- Tap targets: reveal button and "Try again" at `min-h-[44px]`. On a 360 row the reveal button keeps its own line height; tags wrap, the button does not.
- Contrast (T-005 tokens): navy on white and on page, gold-dark on gold-light, teal-dark link, error on error-light all pass 4.5:1. Muted `small` on white passes. Gold `#C8850E` is never text.
- Every state has text: Required, Please check, To be asked, Needed to continue, Saving, Saved as. Colour is backup only.
- Focus: "Answer N questions" returns focus to the outstanding block heading when the advocate comes back. After an edit, focus stays in the field.

## 10. Manual checks to add

At 360 and 1280, keyboard and touch.

1. "3 lakh", "PS Kotwali", "12/3/26" in the description: three fields show "Rs 3,00,000", "PS Kotwali", "12 March 2026". Each "You wrote" opens to the advocate's exact words.
2. A fact whose span equals its display has no reveal button.
3. Every `required_in_draft` fact carries "Required". Confirm is still enabled with one empty (non-court-blocker).
4. Type "3 lakh" into the amount field on an Android phone: plain keyboard opens, field becomes "Rs 3,00,000", line reads "Saved as Rs 3,00,000."
5. Type "12/3" into a date-like text field: red border, the unreadable line, earlier value kept.
6. After an edit, the reveal shows the new words and "Before: {old}".
7. "12/3" in the description with no year: row shows "To be asked", the outstanding block lists it, "Answer 1 question" opens the questions step, answering clears both.
8. Throttle to Slow 3G: skeleton and "Reading your description…" show; an edit shows "Saving…"; offline save shows "Could not save this change." and "Try again" works.
9. TalkBack: reveal button reads "You wrote, Amount of surety, collapsed"; field reads its label and "Required".
10. No horizontal scroll at 360 with a 200-character Hinglish span open.

## 11. Open items

- `source` values: the ticket and Vishal's note say `"user"` and `"asked"`; `packages/shared/src/types/fact-ledger.ts` has `'description' | 'answer' | 'fixture'`. This spec keys on the meaning (description vs answer). The build picks one.
- How a ledger fact maps to a brief field (section 8, row link). Needed before rows can show `display`, the reveal and To be asked.
- Unresolved does not block Confirm in this design. If Priya wants it to, that is a B5 change.
- Madhuri and Ajay read of section 7, and of the normalizer `detail` sentences.
- Meera's approval. No new token.
