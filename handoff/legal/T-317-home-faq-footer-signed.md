# T-317: home page, FAQ and footers (signed, 12 Oct 2026 IST)

Ajay (CLO). Reuses the signed T-238 and T-252 lines. Apply byte for byte; nothing else on these pages changes.

| File, line (develop_staging today) | Now | Replace with |
|---|---|---|
| `apps/web/src/app/(marketing)/page.tsx` ~25 (meta description) | "Legal drafting for Indian advocates, built around the current criminal codes — BNS, BNSS, and BSA." | `Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers.` |
| `apps/web/src/app/(marketing)/page.tsx` ~165 (hero subline) | "Built around the current criminal codes — BNS, BNSS and BSA." | `Criminal drafts use BNS, BNSS and BSA section numbers.` |
| `apps/web/src/app/(marketing)/faq/page.tsx` ~76 (answer) | "No. Lawie is an AI-assisted drafting tool — not a substitute for legal advice. You remain responsible …" | `No. Lawie is a drafting assistant. You are responsible for legal accuracy, and for reviewing and finalising every document before it is used or filed.` |
| `apps/web/src/components/landing/Footer.tsx` ~35, `landing/TrustBar.tsx` ~17, `marketing/SiteFooter.tsx` ~16 and ~70 | "AI-assisted drafting tool — not a substitute for legal advice." | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` |

Notes
1. The four footer/trust-bar lines were missed by T-252 (signed site-wide); they belong in this ticket.
2. `terms/page.tsx` lines ~110 and ~119 are already covered by T-268 (Mahak); do not touch them here.
3. After this ticket, a search of `apps/web/src` for "current criminal codes" and "not a substitute for legal advice" must return nothing outside T-268's file. The lead adds that check to the report.

## Addendum 1 (12 Oct 2026 IST): site meta in `apps/web/src/app/layout.tsx` (Kunal holds the file)

Description, exact: `Stop Googling legal formats. Lawie is a drafting assistant for Indian advocates. Draft bail applications, legal notices, and more, then review before you file.`

The title ("Lawie — AI Legal Drafting for Indian Advocates") and keywords are marketing, not a legal claim: Meera's call, not part of this sign-off.
