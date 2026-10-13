# Handoff spec: consumer-complaint court picker (T-411)

Owner: Rajesh. For the lead building T-411. No code here. Wording marked "Ajay to sign" is a proposal; Madhuri words any help text, Ajay signs the legal names. Based on `intake/CourtPicker.tsx` (State, Court type, Court, all native selects) and the T-411 acceptance criteria.

## 1. The problem in the current picker

- Flow is State, then Court type, then Court. NCDRC has no state (type "tribunal", India), so a user who picks a state first can never reach it. A search box does not fix this: the user has to know the name and to pick a state they do not need.
- So for a consumer complaint the first choice is the **level**, not the state.

## 2. Structure (consumer complaint only; other templates keep today's picker, AC 4)

Step A, **Level** (new, first): a group of three large choice chips, one selected at a time (radio behaviour). Chips follow the `chip()` look in `ValueInput.tsx`, but the minimum height is 44 px and the label may wrap to two lines.

| Chip (proposed) | Then shows | Notes |
| --- | --- | --- |
| District Commission | State select, then the District Commission select | same as today's State then Court |
| State Commission | State select, then the State Commission (one per state) | the court select still shows, so the user picks it; it is not auto-filled |
| National Commission (NCDRC) | No state select. A single option to pick: `National Consumer Disputes Redressal Commission (NCDRC), New Delhi` | **Ajay to sign** the level names and the NCDRC wording |

- The "Court type" select is not shown in this mode (the level replaces it). The API returns only Consumer Commissions, filtered by the template's `court_levels` (AC 1), so no other court type can appear.
- **Never auto-select a court** (ADR-021 rule 3). For National the single option is shown unselected under "Choose", or as one radio-card the user must tap. It is never pre-filled, even though only one exists.
- Changing the level clears the state and court below it, as the existing `onChange` already does for a state change.

## 3. How a user finds NCDRC

- It is a visible, labelled chip at the same level as District and State, always on screen. Not behind search, not at the bottom of a list, not in an "Other" group.
- **375 px:** the three chips stack, each full width, 44 px minimum, 8 px gap, in the order District, State, National (small to large court, matches how a complaint climbs). The chips are in one group so the whole group fits above the fold with the page title.
- **1280 px:** the three chips sit in one row inside the 720 px column; under them the State select and the Court select side by side (`sm:grid-cols-2`); National mode shows the Court select alone at full column width.
- The option text is long (about 65 characters). Native `<select>` options wrap on Android and desktop, so no truncation. Do not use `truncate` or `text-ellipsis` on the selected value area; if the closed select clips it, show the full name as a plain line under the select as well.

## 4. States

| State | Behaviour |
| --- | --- |
| Nothing chosen | Level chips unselected; no selects shown. Brief's "Needed to continue" tag (existing `tagError`) appears when Confirm is off |
| Level chosen, state needed | State select shown, "Choose", error border (existing `gap` class) when `missing` |
| No match | Keep the existing line (small, muted): "No court of this type is listed for this state yet." For National it never applies. Wording is Madhuri's, Ajay to sign for the legal naming |
| Courts list over 8 | Existing "Type to narrow the list" box, unchanged |
| Load error | Existing `role="alert"` error row with Retry, unchanged |

## 5. Keyboard and aria

- Level group: `role="radiogroup"` with `aria-labelledby` its visible label (proposed label "Which Commission?", Madhuri to word). Each chip: `role="radio"`, `aria-checked`, roving tabindex, arrow keys move and select, Space selects. (The existing choice chips use `aria-pressed` buttons; for a single choice use radios here.)
- Selects stay native (`<select>`), which is the most reliable on mid-range Android and with screen readers. No custom listbox or combobox, so no extra roles. The narrow box keeps its `aria-label`.
- Every select keeps a visible `<label htmlFor>`. When the level changes, move focus to the first new control and announce it in a polite live region ("State select shown"); wording is Madhuri's.
- The NCDRC option's accessible name is its full text.

## 6. Targets and contrast

- All chips and selects 44 px or more high (selects already 48 px via `input`); 8 px between targets.
- Selected chip: navy ground, white text (15:1 or more). Unselected: white, navy text, `brand-line` border. Focus ring: 2 px teal, 2 px offset (as `ui.ts`). Error border: `brand-error` (about 5.5:1 on the error-light tag). Colour is never the only signal: the selected chip also gets a check icon (lucide `check`, 16 px).
- Muted help text `brand-muted` on white is about 5.6:1.

## 7. Reuse

- `ui.ts`: `input`, `label`, `small`, `linkButton`, `tagError`. Chip look from `ValueInput.tsx` (`chip()`), with min height raised to 44 px.
- `CourtPicker.tsx` fetches and clear-on-change logic, unchanged; the new part is the level group plus passing the template's filter to `/api/courts`. `DynamicFormRenderer` must use the same consumer mode (AC 2).
- Tokens: `brand-navy`, `brand-line`, `brand-teal` (focus), `brand-error`, `brand-muted`. No new colours.

## 8. Screenshots the lead must take for the report

Use a fictional account; no real matter. Each at 375 px and 1280 px.

1. Consumer complaint, level group with nothing chosen.
2. National Commission chosen: the NCDRC option visible in full, and the same screen after it is picked.
3. District Commission chosen: State and Court selects, with the "Needed to continue" error state on one.
4. Another template (for example a bail application) with its picker unchanged, to show AC 4.


## Strings (Madhuri)

13 Oct 2026. English only, plain, no legal advice and no time or accuracy claim. The legal names (level names and the NCDRC label) are Ajay's to sign; the live-region lines carry no legal name.

| Key | String | Chars | Where | Status |
| --- | --- | --- | --- | --- |
| `level.group_label` | Which Commission? | 17 | Visible group label (Rajesh's proposal, kept) | Ajay to sign (names the forum) |
| `level.district` | District Commission | 19 | Level chip | Ajay to sign |
| `level.state` | State Commission | 16 | Level chip | Ajay to sign |
| `level.national` | National Commission (NCDRC) | 27 | Level chip | Ajay to sign |
| `court.ncdrc_option` | National Consumer Disputes Redressal Commission (NCDRC), New Delhi | 66 | The single National option; also its accessible name | Ajay to sign |
| `court.no_match` | No Commission is listed for this state yet. | 43 | Consumer mode, District or State level. The existing line for other templates stays as it is | Wording is Madhuri's; Ajay to sign for the legal naming |
| `live.state_shown` | State select shown. | 19 | Polite live region, after District or State is chosen | No legal name; no sign-off needed |
| `live.court_shown` | Commission select shown. | 24 | Polite live region, when the Commission select appears or changes | No legal name; no sign-off needed |
| `live.national_shown` | No state needed. Commission select shown. | 41 | Polite live region, after National is chosen | No legal name; no sign-off needed |
| `live.cleared` | State and Commission cleared. | 29 | Polite live region, when changing the level clears the choices below it | No legal name; no sign-off needed |

Notes:
- The three level names and the NCDRC label are exactly Rajesh's proposals, unchanged. "Commission" is used on its own in the select and live-region lines, so a short string never has to repeat the full name.
- Live regions are polite, one short sentence each, and name only the control that appeared. None says anything about the result or the court being right.
- The spec says "State select shown" for the first announcement; the others follow the same pattern. The spec lists no announcement for a selection being made; none is added, because the native select already announces its chosen option.
