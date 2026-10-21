# T-517: Landing page, sign-up and login in Night Library

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Rajesh (design), Meera/Madhuri (copy), Ajay (signs claims), a web lead (build) |
| Mode   | Full chain (web, legal copy) |
| Status | READY dcbd8a92, Ajay byte check AJ-517-BC approved, Rajesh reviewed (must-fix in T-528). Merge queue: next. Priya |
| Source | Founder, 17 Oct 2026 ("whole UI including the landing page") |

## Scope
Landing page, pricing page, sign-up, login, in the Night Library theme (T-511a components). Copy from `handoff/copy/T-511-copy-v1.md` with Ajay's rulings; Hindi FAQ once signed.

## Acceptance criteria
1. Pages match Rajesh's design and handoff spec (Figma link in the ticket when it exists).
2. Every claim line is the Ajay-signed text; Pro appears on the pricing page and logged-in chooser only; copy says "Ink a month", never a draft count or "unlimited".
3. Night/Daylight/System toggle works on all four pages; reduced-motion stops all effects; loops pause when the tab is hidden.
4. Sign-up and login keep working with Google and email, errors shown with the signed error text.
5. Mobile first: no horizontal scroll at 360px; Hindi headings at 20px or larger.
6. Tests for the pages; a browser check written in the ticket before Anushka tests.

## Out of scope
Backend changes, new pricing, CRM claims (not sold until shipped).

## Browser check (Vishal, 21 Oct 2026)
CDP/headless at 1280 and 390: before hydration, typing, done, reduced motion. Demo folio 319px and CTA 912px stable, no flash. Taste inspect run at 1280, 390 and 360. No real-phone check done.
