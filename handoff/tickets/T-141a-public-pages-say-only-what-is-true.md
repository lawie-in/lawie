# T-141a — Public pages say only what is true (wording only)

| Field          | Value                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Phase          | 0 — Prep. MUST FIX before go-live (part of T-141)                                                       |
| Owner          | Madhuri (words), Ajay (claims), Vishal (apply), Anushka (tests on develop before GTM)                   |
| Mode           | Copy only, plus deleting three unused files. Developer applies the signed table; tester greps          |
| Status         | Ready for Vishal once Madhuri's table is signed by Ajay                                                 |
| Depends on     | None. Split from T-141; the Ink and plan lines stay in T-141 for the founder (morning list)            |
| Branch         | fix/t-141-public-pages-say-only-what-is-true                                                            |
| Legal sign-off | NEEDED, on claims, not a legal-content path. Ajay signs Madhuri's before/after table, every row        |
| Created        | 2026-10-07                                                                                              |
| Source         | Anushka's run 2, 7 Oct 2026, finding 8; run 1 T-141 list                                                |

## Goal

Nothing on home, pricing, FAQ, footer or the New document page promises what the product does not do today.

## Scope

- Source of truth: Madhuri's table `scratchpad/T-141a-copy-table.md` ("Priya's scope decisions" at the top). Only rows Ajay signs are applied.
- Claims in scope: court-ready and the time promise (including "under five minutes"), cheque bounce complaints, the section-validation claim, mobile, courts coverage and "your court", "ask only for what is missing" and "only what this document needs", and "added regularly".
- Files in scope: `app/layout.tsx`, `(marketing)/layout.tsx`, `(marketing)/page.tsx`, `faq`, `about`, `tools`, `dashboard/page.tsx` empty state, `marketing/SiteFooter.tsx`, `intake/DescribeStep.tsx`, `intake/BrowseTypesStep.tsx`.
- Delete the unused `components/landing/Hero.tsx`, `HowItWorks.tsx` and `DraftTypes.tsx`. They are imported nowhere.

## What Ajay must sign

- Every row of Madhuri's table, plus the six rows added under decision 4, each as "true today". Vishal applies them word for word.

## Acceptance criteria

1. Every signed row is applied exactly. No other text changes.
2. `grep -ri` across `apps/web/src` for "court-ready", "under 5 minutes", "under five minutes", "cheque bounce complaint", "validated against", "work on mobile", "ask only for what is missing" and "added regularly" returns nothing.
3. Page metadata (title, description, keywords) carries none of these claims.
4. Code changes are limited to these: the three dead files are deleted, and the `Receipt` import is removed if it is unused. Everything else is string literals or JSX text in `apps/web`.
5. Before deleting, a grep shows no import of the three files. After the change, `yarn workspace @lawie/web build` (or `tsc --noEmit`) and lint-staged pass.
6. The report lists each file and each row applied, and any row left unsigned.

## Out of scope

- "1 Ink per document", "Less than ₹16 per document", "5 Ink (lifetime)" vs "this month", "Upgrade to Pro — ₹799": T-137, founder + Vikram.
- Pro's "Everything in Solo, plus" list and the watermark lines ("Upgrade to Pro for clean exports"): plan content, founder + Vikram.
- Making any statement true by building (mobile, courts, section validation).
- Pricing Free list "BNS validation" (plan content, founder + Vikram).
- Template descriptions citing provisions (Ajay, separate).
- Other files in `components/landing/`.
