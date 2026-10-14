# Handoff spec: "Not known" on a date row (T-384)

Owner: Rajesh. For the lead on T-384 (after T-372). No code here. The ticket names no signed wording in `handoff/legal/`, so no string below is Ajay's. Short UI strings marked "Madhuri to word". Based on `ValueInput.tsx` (date branch, `chip()`), `BriefStep.tsx` (`askedEmptyValue`, `notKnown`) and `intake/ui.ts`.

## 1. Decision (AC1): option (b), chip in place of the input, plus a "Change" link

- Why not (a): a native date input cannot show words, so a chip beside an empty box still reads as an unanswered row. That is the bug in T-365 AC2.
- Why (b): choice rows already show "Not known" as a filled navy chip. A date row then looks the same as every other answered row. One control on the row, so nothing to misread on a phone.
- Reuse: the `chip(true)` look from `ValueInput`, and `linkButton` from `ui.ts`. No new colour or component.

## 2. Layout

| Item | 375 px | 1280 px |
| --- | --- | --- |
| Row | Label, then one line: chip + `Change` link, `flex flex-wrap items-center gap-3` | Same line, same order, left-aligned in the field column |
| Chip | Static, `chip(true)` look (navy fill, white text), shape of a chip, not a button. Height 40 px to match other chips | Same |
| `Change` | `linkButton`, 44 px high, `Change` (Madhuri to word) | Same |
| Date input | Not shown | Not shown |

## 3. Strings

| Where | Text |
| --- | --- |
| Chip | `Not known` (same literal as the option label in the templates and `NOT_KNOWN_ANSWERS`; Madhuri to confirm) |
| Link | `Change` (Madhuri to word) |
| Link `aria-label` | `Change {row label}, now Not known` (Madhuri to word) |
| Printed draft | [Ajay] The ticket leaves open how an unknown date prints. Nothing here decides it. |

## 4. States

| State | What shows |
| --- | --- |
| Empty (never answered) | Today's date input, unchanged. No chip |
| Not known | Chip + `Change`. No date input in the DOM |
| After `Change` | Chip and link go; the normal date input shows, empty, focused. The advocate picks a date (AC2). `onCommit` clears the Not known answer as usual |
| Date entered | Date input with the date in words below (existing `dateInWords`), unchanged |
| Error | Existing `invalid` / `aria-invalid` and the row's error text, on the input. A chip row has no error state; if the service rejects the later date, the row returns to the input with its message |

## 5. Keyboard and screen reader

- Tab order in the row: `Change` is the only stop. The chip is static text and takes no focus.
- Why not a toggle chip with `aria-pressed`: the row must not toggle back to Not known by accident, and the other chips on the brief are choices, not status. `Change` is the one action.
- Screen reader on the row: label, then `Not known`, then link `Change {label}, now Not known`.
- Focus after `Change`: moves to the date input (`id` from `fieldId`), so the keyboard user can type at once. Use `useEffect` after the swap, not `autoFocus`.
- Date picker opens only on the user's own tap or Enter, not on the focus move.
- Give the chip `role="status"`? No. It is not announced as news; it is the row's value.
- Targets: `Change` 44 px high; chip is not a target.

## 6. Open questions for the lead

- `askedEmptyValue` returns nothing for a date, so the lead must add a flag from `BriefStep` (for example `notKnownDate`) into `ValueInput` for date rows. This is a data change, not a design one.
- Can the advocate pick "Not known" for a date on the brief itself, or only in the chat step? Out of scope; this spec shows only the answered state. Priya to say if the brief needs a "Not known" action on a date input.
- How an unknown date prints on the draft: [Ajay]. If the print rule changes the chip text, Madhuri and Ajay should agree the word first.
