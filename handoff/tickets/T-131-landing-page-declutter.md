# T-131 — The landing page is cluttered

| Field      | Value                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 0 — Prep                                                                                                                                                         |
| Owner      | Vishal (build), Meera (what stays), Madhuri (words), Rajesh (layout)                                                                                             |
| Mode       | Direct, from the war-room chat                                                                                                                                   |
| Status     | Done. PR #46 merged 6 Oct 2026, 16:07 and PR #47 (hero side padding) merged 16:12, both by the founder. The points under "Left open" are not part of this ticket |
| Depends on | None                                                                                                                                                             |
| Branch     | fix/t-131-landing-page-declutter                                                                                                                                 |
| Created    | 2026-10-06                                                                                                                                                       |

## Goal

A visitor can read the landing page in one pass: what Lawie is, why, how, what it drafts, what it costs.

## Context

- Founder, 6 Oct 2026, 15:35: "home page needs fix, it is very cluttery."
- "Home page" was read as the public landing page (`/`), because that was the page open in the founder's browser pane. The first reading, the dashboard, was wrong and was corrected in chat.
- The page had nine sections. Three of them said the same thing (the scenario cards, the comparison table, the statistics band). Two listed documents (sample cards, template list).

## Acceptance criteria

- Fewer sections, and no section repeats another.
- Nothing on the page is known to be untrue.
- The phone menu, the FAQ and the buttons work.
- No sideways scroll at 360 px.

## What was done (Vishal, 6 Oct 2026)

|                   | Before    | After    |
| ----------------- | --------- | -------- |
| Sections          | 9         | 6        |
| Height at 1280 px | 7,746 px  | 4,015 px |
| Height at 360 px  | 13,007 px | 6,354 px |

Order now: hero, three reasons, three steps, what you can draft (with sample links), pricing, FAQ, closing line.

Removed: comparison table; four large sample cards; statistics band; plan feature lists and plan buttons; mock form panels under "How it works"; from the hero the "Generated in 4 min 38s" badge, the gold seal and "Validated against Indian filing requirements"; "Most Popular"; "More templates added weekly".

Faults fixed on the way, all marketing pages:

1. Phone menu, FAQ rows and floating button lost their styles when opened. The class became `nav-draweris-open`, `acc-itemis-open`, `float-ctais-visible`. Cause: `prettier-plugin-tailwindcss` trims spaces inside a template literal in `className`; the commit hook runs it. Class names are now whole strings.
2. Tapping outside the phone menu did not close it.
3. `btn-lg`, `btn-sm`, `btn-block` did nothing; the stylesheet only had `btn--lg` and so on.
4. Sample PDF links pointed at the web host, which has no such route. They now use the API host.

The floating button now shows only at 900 px and below.

### What was run

- `eslint` and `tsc --noEmit` on `apps/web`: pass.
- A headless browser against a local `next dev` at 1280 and 360: no page errors, no sideways scroll, menu opens and closes on an outside tap, a FAQ row opens, the floating button shows on phone and not on desktop, the active nav link is marked on /pricing.

### What was not run

- The sample PDF links were not followed to a file. No backend was running.
- No real phone.
- The other marketing pages were not looked at beyond the nav.
- The words were written and cleared by one agent speaking as Meera, Madhuri and Ajay. That is not an independent review.

## Follow-up (Vishal, 6 Oct 2026, 16:1x)

After the merge the page was reloaded in the founder's browser pane at 688 px: six sections, no sideways scroll. One fault showed: the hero headline touched the left edge. The hero set its padding with the shorthand and zeroed the container's side padding; the old page did the same. PR #47 sets top and bottom only. Measured in a headless browser: headline left offset 20 px at 360 and 688, 32 px at 1024, 72 px at 1280.

## Left open

- /pricing, /faq and the editor say free exports carry a watermark. The export code adds none. Decide: build it or drop the claim (Vikram, Meera, founder).
- "Court-ready" and "under 5 minutes" are not measured (Ajay).
- `marketing.css` does not pass the Prettier check and never has. The commit hook does not run on CSS, so it was left alone.
