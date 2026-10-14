# Handoff spec: Ink cost before every charge (T-388)

Owner: Rajesh. For Kunal. No code here. Wording marked "Madhuri" is the exact string from Arjun's decision; do not reword. Based on `intake/BriefStep.tsx` (Confirm cost line, T-372), `intake/ui.ts` and AC 1 and 3 of T-388.

Decision (Arjun, 14 Oct 2026): when the cost cannot be known, **block**. There is no proceed path.

## 1. How Confirm shows the cost today (the pattern to copy)

- Component: a `<p id={INK_COST_ID}>` directly under the button, inside the same `flex flex-col gap-1` wrapper as the button.
- Text: `formatInkCost(n)` gives `Uses 1 Ink` / `Uses N Ink` (no "s"). Nothing renders when there is no positive cost.
- Style: `text-sm text-slate-600`. The button points at it with `aria-describedby`.
- Alignment: stretch on 375 px, right-aligned (`sm:items-end`) from 640 px up.

## 2. Placement on regenerate and add-section

Reuse `formatInkCost` and the same markup. Do not write a second formatter. The number comes from the same price function the charge uses (AC 2); never a literal in JSX.

| Item | Spec |
| --- | --- |
| Pattern | Cost line directly under the action button, same wrapper, same `text-sm` colour. Give each its own id (for example `regenerate-ink-cost`, `add-section-ink-cost`) and link it with `aria-describedby` |
| Text | `Uses N Ink`, same as Confirm. Button label unchanged (no cost inside the label) |
| 375 px | Button full width, 48 px high (`primaryButton`, or `secondaryButton` at 44 px if the action is secondary). Cost line under it, 4 px gap, left-aligned with the button edge. Never beside the button |
| 1280 px | Button at its natural width, cost line under it, right-aligned to the button (as Confirm). If the action sits in a row of actions, the cost line goes under its own button, not at the row's end |
| Add-section with a choice | If the user picks a section first, show the cost for the picked section only once it is chosen. Before that, no number and no guess |
| Contrast | `slate-600` on white is about 7:1, passes AA. Keep it. Do not use gold text on white |

## 3. "Cost unknown" notice (block)

String, exactly: `We could not work out the Ink cost for this. Try again in a moment.` (replaces the earlier BLOCK line; it shows before any click, beside the disabled button, so it says nothing about "started".)

| Item | Spec |
| --- | --- |
| Element | Inline `<p>` in the cost line's slot, under the button, in place of `Uses N Ink`. Not a toast: it must stay on screen next to the button and not time out |
| Role | `role="alert"` (assertive; the action did not start, so the user must hear it). Mounted when the state becomes unknown, so it is announced once |
| Style | `text-sm`, `text-brand-error` on white (about 5.5:1) with a lucide `alert-circle` icon, 16 px, `aria-hidden`. Colour is not the only signal: the icon and the words carry it. May wrap to 3 lines at 375 px; no truncation |
| Button | Disabled. Use `disabled` plus `aria-disabled="true"` and the existing disabled look (`opacity-40`). It stays 44 px or more high and in place; the layout does not jump |
| Retry | A `linkButton` labelled exactly `Try again` (44 px) after the notice re-fetches the cost. If it works, the notice clears and the button enables. The action button stays disabled until the cost is known; there is no "proceed anyway" |
| Same on all paths | Regenerate, add-section and generate (Confirm) all use this one notice and this one behaviour. Nothing starts, nothing is charged |
| Never | No "free" or "no charge" wording, no promise about the balance, no estimate in its place |

## 4. States: loading, known, blocked

| State | Cost label shows | Button | Screen-reader text |
| --- | --- | --- | --- |
| Loading (cost being worked out) | `Working out the Ink cost...` in the same slot, `text-sm text-slate-600`, small `Loader2` spinner (`aria-hidden`). Wording is Madhuri's | Disabled (`aria-disabled`), no spinner in the button | Slot is `role="status"` (polite): "Working out the Ink cost." Announced once, not repeated |
| Known | `Uses N Ink`, N from the price function | Enabled | Button name is unchanged; the cost is read as its description (`aria-describedby`) |
| Blocked (unknown) | The notice in section 3, in the same slot | Disabled | `role="alert"` reads the full notice once. The button is described by the notice id, so a screen reader that lands on it hears why it is off |

- Why the slot is shared: one place for the user to look, no layout shift between the three states.
- A button that is disabled must still be reachable with the screen reader's virtual cursor (`aria-disabled`, not removed from the tab order on Confirm; follow what Confirm does today).
- Focus: when the state changes to blocked, do not move focus. The alert announces it.

## 5. Tokens and reuse

- Existing: `ui.ts` `primaryButton`, `secondaryButton`, `linkButton`; `formatInkCost`; `brand-error`; `slate-600`. No new colours, no new components beyond a small shared `InkCostLine` (loading / known / blocked) if Kunal wants one.

## 6. Screenshots for Ajay (AC 4), at 375 px and 1280 px

1. Regenerate with `Uses N Ink` shown. 2. Add-section with `Uses N Ink` shown. 3. Each path in the blocked state: notice visible, button disabled. Fictional account; no real matter.

## Open questions

- Regenerate and add-section do not exist in `apps/web` yet (no match in the web source). The placements above assume a button on the draft screen; Priya's flow decides where.
- The loading line is my proposal; Madhuri to word. Notice and "Try again" are final (Arjun).
