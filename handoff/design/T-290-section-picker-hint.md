# T-290 — Section picker: hint and "Read as" line (design)

| Field   | Value |
| ------- | ----- |
| Ticket  | `handoff/tickets/T-290-section-picker-hint-type-the-code.md` |
| Owner   | Rajesh (words, layout). Ajay signs the words. Lead builds (web) after T-277 |
| Where   | "Sections Charged" picker: `MultiSelectSearchField` in `apps/web/src/components/form/DynamicFormRenderer.tsx`, only when `field.source === 'bns_mapping'` |
| Rule    | No change to how values are stored or read. The "Read as" line only shows what T-277's reader (`readSectionsCharged`, `defaultCode: 'BNS'` for this field) already returns |
| Colours | None new. Only classes already in the file |

## 1. Exact strings (for Ajay to sign)

| # | Where | String |
| - | ----- | ------ |
| S1 | Hint under the picker (always shown) | `A number without the Act is read as a BNS section. For IPC, type the Act, for example IPC 302.` |
| S2 | Read as, BNS, title known | `Read as BNS {number}: {title}` |
| S3 | Read as, BNS, title not known | `Read as BNS {number}` |
| S4 | Read as, any other code (IPC, CRPC, IEA, BNSS, BSA) | `Read as {CODE} {number}` |
| S5 | Read as, other Act (reader code `OTHER`) | `Read as a section of another Act (not checked)` |
| S6 | Entry gives no section (reader returns an empty list) | `Not read as a section` |

Rules for the strings:
- `{title}` comes only from the signed BNS table (T-277). A sub-section (`303(2)`) shows its parent's title, as T-277 resolves it. No title is ever shown for IPC, CRPC, IEA, BNSS, BSA or other Acts. No title from the search result label, the AI, or any other source.
- `{number}` is the number as the reader returns it, with brackets: `303(2)`, `64(2)(a)`, `376A`.
- No full stop at the end of S2 to S6. No ellipsis, no truncation of the title.
- S3 has no colon and no placeholder ("Unknown", "—"). Nothing after the number.

## 2. Placement (top to bottom)

```
Sections Charged *                         <- FieldLabel (unchanged)
[ 302  x ]                                 <- entered value, chip (unchanged look)
Read as BNS 302: {title}                   <- NEW: one line per section read
[ IPC 379  x ]
Read as IPC 379
[ (search) Search and select...   [Add] ]  <- input (unchanged)
A number without the Act is read as a BNS  <- NEW hint (S1), under the input
section. For IPC, type the Act, for
example IPC 302.
```

- The hint (S1) sits **under the search input**, outside the dropdown's `relative` wrapper, so the dropdown still opens over it.
- S1 **replaces** the current line `Type a section and press Enter to add` (l.~422, above the chips). One hint line in total, not two. The visible "Add" button already shows how to add free text.
- Each entered value becomes a small block: the chip, then its "Read as" line directly under it. Blocks stack in a column (today the chips wrap in a row). This is the only layout change; it is needed so each "Read as" line sits next to the value it explains.
- If one entry reads as more than one section (for example `302, 34 IPC`), show one "Read as" line per section under that chip, in reader order: `Read as IPC 302`, `Read as IPC 34`.
- The "Read as" line shows as soon as the value is added, before the draft is generated. It updates if the value is removed (block goes with the chip).

## 3. Styles (existing classes only)

| Element | Classes | Why |
| ------- | ------- | --- |
| Hint S1 `<p>` | `mt-1 text-xs text-slate-500` | `text-slate-500` (used at l.~565) passes WCAG AA on white (about 4.8:1). The current hint colour `text-slate-400` (about 2.6:1) fails AA; a legal warning must be readable in sun on a mid-range phone |
| Entered-values list | `mt-1 space-y-1` (replaces `mt-1 flex flex-wrap gap-1`) | One block per value, stacked |
| Chip | unchanged: `inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800` | No new look for the value itself |
| "Read as" line `<p>` | `mt-0.5 text-xs text-slate-600 break-words` | Same size as other helper text; one step darker than the hint because it is the check the advocate must read |
| `{CODE} {number}` inside S2 to S4 | `<span className="font-medium">` | The code is the part that can be wrong; it should stand out without a new colour |
| S6 `Not read as a section` | `mt-0.5 text-xs text-red-500` | Same as `FieldFooter` error text (l.~648). Nothing usable was read |

Accessibility: wrap each "Read as" line in an element with `aria-live="polite"` so a screen reader hears what was read when a value is added.

## 4. States

| State | User enters | Chip shows | "Read as" line |
| ----- | ----------- | ---------- | -------------- |
| A. Typed with the Act (old law) | `IPC 302` or `302 IPC` | `IPC 302` / `302 IPC` (as typed) | `Read as IPC 302` (no title) |
| B. Typed with the Act (BNS, sub-section) | `BNS 303(2)` | `BNS 303(2)` | `Read as BNS 303(2): {title of 303}` |
| C. Bare number, typed or picked from the list | `302` | `302` | `Read as BNS 302: {title}` |
| D. Bare number, title not in the signed table | `999` | `999` | `Read as BNS 999` (no colon, no title, no guess) |
| E. Title still loading or fetch failed (patchy 4G) | `302` | `302` | `Read as BNS 302` until the signed title arrives; if it never arrives, stays as is. No spinner, no placeholder text |
| F. New-law procedure / evidence codes | `BNSS 480`, `BSA 63` | as typed | `Read as BNSS 480`, `Read as BSA 63` |
| G. Other Act | `NDPS Act 20` | as typed | `Read as a section of another Act (not checked)` |
| H. Nothing readable | `abc`, `2023` | as typed | `Not read as a section` (red, S6) |
| I. Mobile, 375 px | any | chip wraps inside its own block | Line wraps under the chip; long titles wrap, never truncate. Hint S1 wraps to 2-3 lines at `text-xs`; that is expected |

Note on state C: a value picked from the dropdown is stored as a bare number today (T-277 correction, `id = r.section`), so it shows the same "Read as BNS" line as a typed bare number. That is correct: it is BNS. No special colour for bare numbers, because picked values would also get it and the warning would become noise.

## 5. Mobile (375 px) check

- Usable width inside the form card is about 311 px. At `text-xs` (12 px / 16 px line) a line holds about 45-50 characters.
- `Read as BNS 105: Punishment for culpable homicide not amounting to murder` wraps to two lines. Allowed; `break-words` keeps it inside the card. No horizontal scroll.
- Vertical cost: one 16 px line per section plus the hint (up to 48 px). For a typical 2-3 sections, about 100 px more than today.
- Do not put the "Read as" text inside the chip: a long title in a pill wraps badly and hides the remove "x".

## 6. Risks flagged (not in scope, for Priya)

- The chip's remove "x" is a 12 px icon, well under the 44 px tap-target rule. Worth a separate small ticket.
- If the title source is the search API rather than the signed table T-277 ships, titles could differ from what Ajay signed. The lead must read titles from the same signed source T-277 uses.
- S5 wording ("another Act") is new; Ajay to confirm or strike.

## 7. For Ajay to sign

1. S1 contains, word for word: "A number without the Act is read as a BNS section." plus an example of typing the Act ("IPC 302").
2. Every entered section shows what was read before the draft uses it (S2 to S6), and an unknown title shows `Read as BNS {number}` with no title and no guess (S3).
