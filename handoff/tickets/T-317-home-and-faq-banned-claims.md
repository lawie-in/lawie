# T-317 — Home page and FAQ still carry old claim lines

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release. Before go-live |
| Owner  | Ajay (signs replacement text). Lead (build, web). Anushka (verdict) |
| Mode   | Small fix (web, legal text) |
| Status | To do. Text signed by Ajay (handoff/legal/T-317-home-faq-footer-signed.md, 8bac42c). Mahak after T-268. Found by Mahak in T-268, 12 Oct 2026 |

## What's wrong

1. `apps/web/src/app/(marketing)/page.tsx`, line ~25 (meta description) and ~165 (hero), still says "built around the current criminal codes". The signed terms edits ban that claim (T-268, section C).
2. `apps/web/src/app/(marketing)/faq/page.tsx`, line ~76, repeats the old §3 sentence "Lawie is an AI-assisted drafting tool — not a substitute for legal advice". The signed §3 replaces it.

3. Ajay found four more lines that T-252 missed, all still saying "AI-assisted drafting tool — not a substitute…": `apps/web/src/components/landing/Footer.tsx`, `apps/web/src/components/landing/TrustBar.tsx`, `apps/web/src/components/marketing/SiteFooter.tsx` (twice). They take the T-252 line.
4. `apps/web/src/app/layout.tsx` also carries the phrase. Ajay signed the new description (Addendum 1, 6cbe863). Kunal holds that file (T-306), so he applies it. The title and keywords are Meera's call, not legal.

## Acceptance criteria

1. Every listed place uses Ajay's signed text (8bac42c), word for word.
2. No other change. Check at 375 and 1280 px.
