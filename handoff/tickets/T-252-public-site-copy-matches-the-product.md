# T-252 — Public site copy says only what the product does

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Meera (copy, signs). Ajay (every claim). Lead (build). Anushka (verdict) |
| Mode           | Small fixes, web. Copy is signed first |
| Status         | To do. Unassigned. Raised by Meera, 12 Oct 2026. Blocks paid marketing at go-live |
| Depends on     | T-238 (pricing page) |

## Problem

Meera's copy review found claims beyond T-238:
- the FAQ's Pro price, plus "court formatting" and "BNS validation";
- the FAQ line "rolling out template by template", which implies Hindi is partly live;
- the about page's court-formatting, section-mapping and "in minutes" lines (check against T-141a's table);
- the footer disclaimer, which isn't Ajay's line;
- `components/landing/PainSolution.tsx` ("in 5 minutes"), which is unused and should be deleted;
- rows 7–14 of `handoff/marketing/copy/pricing.md` and its grep list.

## Acceptance criteria

1. Each line is replaced with Meera's signed text after Ajay's ok, word for word.
2. The footer carries Ajay's disclaimer line.
3. `PainSolution.tsx` is deleted, and nothing imports it.
4. A grep for "court-ready", "validated", "in minutes", "guaranteed" and "AI lawyer" on public pages finds nothing.
