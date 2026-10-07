# T-005 hand-off spec: describe-first New document flow

| Field    | Value                                                 |
| -------- | ----------------------------------------------------- |
| Author   | Rajesh (designer)                                     |
| Approver | Meera (brand tokens)                                  |
| Figma    | https://www.figma.com/design/6FV11738gZut87KECjtFBn   |
| Ticket   | `handoff/tickets/T-005-design-describe-first-flow.md` |
| Date     | 2026-10-04                                            |
| Feeds    | T-103, T-104, T-203, T-205, T-301                     |

## 1. Flow

```
01 Describe ──> 02 Follow-up (max 2 rounds) ──> 03 Review details ──> 04 Length + estimate ──> 05 Generating ──> 06 Draft ready
     │                                                                        │                                        │
     └─> 08 No template match                                       07 Low balance (modal)                   06b Regenerate confirm (modal)
     └─> "Browse templates" (existing gallery, unchanged)
```

- 02 is skipped when nothing is missing. After 2 rounds the flow goes to 03 with gaps highlighted.
- "Fill in the details myself" (02) opens 03 with whatever is known so far.
- Nothing on any screen says which mode or route was chosen.
- The gallery page is not redesigned here. It is reached from the secondary "Browse templates" link on 01 and 08.

## 2. Figma frames

Every screen has a Desktop 1280 frame (top row) and a 360 frame (bottom row, same column).

| #   | Screen                                           | Desktop | 360     | Ticket       |
| --- | ------------------------------------------------ | ------- | ------- | ------------ |
| 00  | Tokens in use                                    | `3:2`   | n/a     | all          |
| 01  | Describe box with image attach                   | `3:42`  | `3:94`  | T-103, T-301 |
| 02  | Follow-up questions                              | `3:143` | `3:204` | T-103        |
| 03  | Review details                                   | `4:2`   | `4:161` | T-104, T-301 |
| 04  | Length picker with drops estimate                | `4:311` | `4:377` | T-203        |
| 05  | Generating                                       | `8:2`   | `8:46`  | T-103        |
| 06  | Draft ready, drops charged                       | `8:87`  | `8:145` | T-203, T-205 |
| 06b | Regenerate confirm (dialog, bottom sheet at 360) | `8:200` | `8:276` | T-205        |
| 07  | Low balance (dialog, bottom sheet at 360)        | `9:2`   | `9:54`  | T-203        |
| 08  | No template match                                | `9:103` | `9:151` | T-103        |

Open a node with `?node-id=<id with : replaced by ->`, for example `4:2` becomes `node-id=4-2`.

## 3. Tokens

Brand tokens as approved: navy `#0D1F3C`, gold `#C8850E`, teal `#0D9488`, Lora headings, Inter body, illustrations only.

Additions needed to make text readable (gold and teal fail contrast as small text on white):

| Token               | Value                             | Use                                            |
| ------------------- | --------------------------------- | ---------------------------------------------- |
| teal-dark           | `#0A6F66`                         | link and ghost-button text                     |
| gold-dark           | `#7A4E00`                         | text on gold-light                             |
| gold-light          | `#FBF1DC`                         | drops pill fill, "read from image" fill, notes |
| teal-light          | `#DDF3F0`                         | success and confirmed fills                    |
| error / error-light | `#B3261E` / `#FCE9E7`             | missing fields, low balance                    |
| page / line / muted | `#FAF8F3` / `#DCD6C8` / `#566580` | background, borders, secondary text            |

Rules: gold is for fills, borders and dots only, never small text. Teal `#0D9488` is for focus rings and filled success chips. Primary buttons are navy with white text.

Type: Lora SemiBold headings (34/42 desktop, 26/32 at 360). Inter Regular 16/24 body. Inter Medium 14 labels. Inter 12 to 13 for hints and tags. Inputs are 16 px so mobile browsers do not zoom.

Layout: content column 720 px wide and centred on desktop. At 360 it is full width with 16 px gutters. Header 68 px desktop, 56 px at 360. Minimum touch target 44 px. Inputs 48 px high.

## 4. Components and where they live

| Design element       | Existing code                         | Note                                                                                                                      |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Drops pill in header | `components/credits/HeaderCreditPill` | Shows "N drops". Drop the "Ink" and "FREE" wording. Turns red-tinted when balance is below the open estimate (screen 07). |
| Low balance dialog   | `components/credits/LowBalanceModal`  | Opens when estimate is above balance. Bottom sheet at 360.                                                                |
| Draft ready          | `components/credits/DraftReadyModal`  | Becomes a full screen in this flow (06).                                                                                  |
| Add drops            | `components/credits/TopUpModal`       | Reused as is. Packs and prices are not designed here.                                                                     |
| Review form          | `components/form/DynamicFormRenderer` | Prefilled, grouped as in `form_schema`. No second form.                                                                   |

New: describe box, attach strip with thumbnails, group accordion with status tags, summary bar, length slider with stepper, estimate card, generating steps, regenerate dialog.

## 5. Screen notes

### 01 Describe

- One textarea (min 190 px desktop, 150 px at 360) with a teal 2 px focus ring. Placeholder is empty text in the design, so dev picks one example sentence.
- Continue is disabled until there is text. An image alone is not enough.
- Attach images: JPG and PNG, up to 5. Each thumbnail shows the file name and a 44 px remove button. Counter shows when 5 are attached and Attach disables.
- The consent line from T-302 sits above the actions before the first upload. The dashed box in the design is a placeholder. Copy is pending Ajay.
- "Browse templates" is a text link under the card, not a button.

### 02 Follow-up

- Max 5 questions per round. Labels come from `form_schema`. Header says "Round 1 of 2".
- Court, parties, FIR number, sections and dates are asked, never guessed. The line saying so stays.
- "Your description" collapses to one line with an Edit link.

### 03 Review details (the 10+ gaps screen)

- Groups follow `form_schema`. A group with every field ready is collapsed to one row with an "All N ready" tag. Groups with gaps start open.
- Summary bar at the top, sticky while scrolling: counts for needs input, to confirm and ready, a progress bar, "Next gap" (scrolls to and focuses the next missing or unconfirmed field) and "Show only gaps" (hides ready fields). These two controls are what make 10 or 38 gaps workable.
- Field states: filled, missing (red 2 px border, "Needs your input" tag, hint line), read from image (gold-light fill, "Read from image" tag, "Confirm this value" button), confirmed (teal "Confirmed" tag, normal input).
- Editing a read-from-image value counts as confirming it.
- Continue is disabled until every required field is filled and every image value is confirmed. The reason is written next to the button.
- Desktop shows fields in two columns inside a group. At 360 it is one column.

### 04 Length and estimate

- Slider 10 to 30 with a default tick at 14, a stepper with minus and plus, and a number. Numbers in the design are examples. Real min, default and max come from T-206 and the document type.
- The slider cannot go below the minimum. The note under it appears only for court-critical types.
- Estimate card: base 50, paragraphs times 2, total, "never charged more than this", balance before and after.
- Primary button carries the cost: "Generate draft · 78 drops". It is also the confirmation. No second confirm step.
- If the estimate is above the balance, the button still shows and opens screen 07.

### 05 Generating

- Three steps with done, in progress and waiting states. The step names are cosmetic. If the service cannot report real progress, show only the indeterminate bar and drop the steps.
- No cancel button is designed.

### 06 Draft ready

- Shows drops charged, the estimate, and the balance now. The header pill already shows the new balance.
- The label "starting draft — review before use" appears only for open-draft documents. Template documents do not show it.
- Regenerate shows its cost on the button (half of the original charge, rounded up) and opens 06b. It is secondary to Open in editor.

### 06b Regenerate confirm

- States the cost, the balance after, that the current version is kept, and that a failed run is not charged.
- If the balance is below the cost, open screen 07 instead, with the numbers replaced.

### 07 Low balance

- Nothing has been charged. Shows estimate, balance, shortfall.
- The gold note about the shortest allowed length appears only when the minimum-length estimate is also above the balance.
- Add drops opens the existing top-up flow. Back to length returns to 04 with values kept.

### 08 No template match

- Friendly wording, no error colour, no blame. The user's text is echoed and kept.
- Edit my description returns to 01 with the text and images still there. Browse templates opens the gallery.

## 6. Header

- Balance is a pill: gold dot plus "N drops". Never shows Ink or FREE.
- Low state (balance below the estimate on screen) uses the red-tinted pill, as in 07.
- Desktop nav: Dashboard, My documents, New document, pill, avatar. At 360: logo, pill, avatar only.

## 7. Accessibility

- Whole flow works with keyboard only. Tab order follows reading order. Focus ring is teal 2 px.
- "Next gap" moves focus to the field, not just the scroll position.
- Dialogs (06b, 07) trap focus, close on Escape, and return focus to the button that opened them.
- Status is never colour alone: every state has a text tag.
- Slider is a native range input with the stepper as an alternative. Value announced as "14 paragraphs, minimum 10".
- Text contrast checked at 4.5:1 or better for the colours listed in section 3.
- Respect reduced motion: the generating bar becomes a static bar with the step list.

## 8. Manual checks (apps/web has no tests and is not in CI)

Check at 360 px and at 1280 px. Attach screenshots to the PR.

1. Describe: Continue disabled when empty, enabled with text. Focus ring visible.
2. Attach: add 1, 3 and 5 images. A sixth is blocked with a message. A wrong file type is rejected. Remove works.
3. No screen mentions a mode, route or template name chosen by the system.
4. Follow-up: 5 questions maximum. Answered fields never come back. "Fill in the details myself" opens review.
5. Review with 3 gaps and with 12 or more gaps: summary counts are right, Next gap lands on each gap in turn, Show only gaps hides ready fields, ready groups fold.
6. Image-read fields: marked, unconfirmed ones block Continue, Confirm clears the block, editing a value confirms it.
7. Length: slider and stepper stay in sync, cannot go below the minimum, estimate updates as it moves.
8. Estimate above balance opens the low balance dialog. Add drops opens top-up. Back keeps the chosen length.
9. Header pill says drops everywhere. No Ink or FREE text remains on these pages.
10. Draft ready: charged amount matches the estimate or is lower. Balance and pill agree. Label shows only for open drafts.
11. Regenerate: cost is half, rounded up. Cancel changes nothing. A failed run charges nothing and keeps the earlier version.
12. No match: text and images are kept. Browse templates opens the gallery.
13. Keyboard only, from Describe to Draft ready. Dialogs trap focus and close with Escape.
14. 360 px: no horizontal scroll on any screen, every button at least 44 px tall.

## 9. Open items for the lead and founder

- Failed first generation: the design assumes no charge. Priya or Arjun to confirm. T-205 only covers regenerate.
- Regenerate in v1 or after: still the founder's call (T-205). The screens are ready either way.
- Consent line copy for the attach step: pending Ajay (T-302).
- Paragraph definition and per-type min, default and max: pending T-206. The helper text under the slider is proposed wording.
- Add drops: packs and prices are not designed here. Reuses the current top-up modal until T-204 says otherwise.
- Real progress steps for screen 05: depends on what the drafting service can stream. Fall back to the bar alone.
- The gallery page keeps its current look. A later ticket may thin it, since it is now a secondary path.
