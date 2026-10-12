# T-317 — Home page and FAQ still carry old claim lines

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. Before go-live |
| Owner  | Ajay (signs replacement text). Lead (build, web). Anushka (verdict) |
| Mode   | Small fix (web, legal text) |
| Status | To do. Unassigned. Waits on Ajay's signed replacements. Found by Mahak in T-268, 12 Oct 2026 |

## What's wrong

1. `apps/web/src/app/(marketing)/page.tsx`, line ~25 (meta description) and ~165 (hero), still says "built around the current criminal codes". The signed terms edits ban that claim (T-268, section C).
2. `apps/web/src/app/(marketing)/faq/page.tsx`, line ~76, repeats the old §3 sentence "Lawie is an AI-assisted drafting tool — not a substitute for legal advice". The signed §3 replaces it.

## Acceptance criteria

1. Both places use Ajay's signed replacement text, word for word.
2. No other change to either page. Check at 375 and 1280 px.
