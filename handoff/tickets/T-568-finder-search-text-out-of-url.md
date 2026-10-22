# T-568: Section-finder search text must not travel in the URL

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (privacy; before main) |
| Owner  | Arjun (design), Ajay (rule), a lead (build; web + drafting) |
| Mode   | Full chain (web, drafting) |
| Status | To do. Found by Tanvi in T-565 (item 51 of Ajay's review), 22 Oct 2026. Priya |
| Source | `handoff/legal/pre-anushka-legal-review-22-oct.md` item 51; Tanvi's rule |

## Problem
Free text reaches `?q=` in the section finder (`components/sections/SectionFinderPanel.tsx` ~:929) and in the form (`components/form/DynamicFormRenderer.tsx` ~:1187) as a GET to the drafting service. A search term in a URL lands in access logs, browser history, and any referrer or analytics that sees the URL. Ajay's rule (item 51): it is fine only if the input is limited to section numbers and titles; free text must use POST or sessionStorage.

## Acceptance criteria
1. Arjun rules: limit the input client-side and server-side to section numbers and titles (reject longer or free text), or move the search to POST.
2. Whichever he picks, matter text never appears in a URL, and the server rejects an over-long or non-section-shaped `q` without logging its value.
3. Tests for both sides; Ajay confirms the rule.
