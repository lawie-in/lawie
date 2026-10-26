# T-599: Bring the remaining marketing pages into Night Library; decide the Lawie logo splash

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Growth (UI; Rajesh gate; part of the T-584 landing work) |
| Owner  | Rajesh (design), Madhuri (copy where words change), Ajay (legal pages), a lead (build; web only) |
| Mode   | Full chain (UI ticket: Figma and handoff spec required first) |
| Status | To do. Raised 26 Oct 2026 from the founder's observation. Design first, no lead touches (marketing) before Rajesh's spec. Priya |
| Source | Founder: "privacy and free tools on the landing page are in older style. Also why have we missed the loading animation of Lawie that we used to have." |

## Findings (Priya, from the code, 26 Oct 2026)
Only `/` (landing) and `/pricing` were moved to Night Library in T-517. The rest of the marketing group (about, faq, terms, privacy, refunds, tools incl. bail-checker, section-converter, timeline-tracker, contact) still use the old look: `.mk` styles and the old Inter/Lora/Fraunces fonts. That is why privacy and the free tools look old next to the landing page.

The animated Lawie logo splash (LogoSplash.tsx, once per browser tab session) was removed from the landing page on purpose in T-517: Rajesh's spec 01 allows two font files and CSS effects only, and the splash has no reduced-motion or tab-hidden handling. It still plays on the old pages, once per tab session, so someone opening /privacy first sees it and someone opening the landing page does not.

## Acceptance criteria
1. Rajesh decides and specs: (a) the old pages' Night Library design, starting with privacy and the free tools (the founder's two); (b) whether the Lawie logo animation returns, and where (landing first load, app loading screen, or only inside the hero), in a form that respects prefers-reduced-motion, pauses when the tab is hidden and stays inside the mobile budget in ui-quality.md.
2. Legal pages (privacy, terms, refunds): restyle only; wording unchanged and Ajay checks nothing changed (privacy version not bumped by a style change).
3. Free tools: same functions and tests; restyle only.
4. Build by one lead after the spec: add the paths to NIGHT_LIBRARY_MARKETING_PATHS in a controlled order, retire `.mk` and the old font variables when the last old page is done.
5. Folds into the T-584 landing epic sequence (Rajesh and Madhuri first).

## Files
Claimed by Priya when a lead takes it, after Rajesh's spec.
